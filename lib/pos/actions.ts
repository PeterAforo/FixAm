"use server"
import { createHash, randomBytes } from "crypto"
import { z } from "zod"
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  creditNotes,
  garageSettings,
  invoiceLines,
  invoices,
  parts,
  payments,
  posSales,
  stockLevels,
} from "@/lib/db/schema"
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { computeTaxTotals } from "@/lib/domain/tax"
import { garageTaxContext } from "@/lib/money/tax-context"
import { nextDocNumber } from "@/lib/money/sequence"
import { applyPaymentToInvoice } from "@/lib/money/payments-core"
import { sendPaymentReceipt } from "@/lib/money/payments"
import { applyStockMovement } from "@/lib/parts/stock"
import { uuidv7 } from "@/lib/id"

const staffPrincipal = (role: StaffRole, garageId: string, branchId: string | null) =>
  ({ kind: "staff" as const, role, garageId, branchId })

async function requireMembership(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return { membership: m, principal: staffPrincipal(m.role, garageId, m.branchId) }
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function posSearch(rawInput: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const }
  const parsed = z.object({
    garageId: z.string().uuid(),
    branchId: z.string().uuid(),
    q: z.string().optional(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx || !can(ctx.principal, "pos.sell")) return { ok: false as const }

  const rows = await db()
    .select({
      id: parts.id, sku: parts.sku, name: parts.name, brand: parts.brand,
      sellingPrice: parts.sellingPrice, unit: parts.unit, barcode: parts.barcode,
      onHand: stockLevels.quantityOnHand, averageCost: stockLevels.averageCost,
    })
    .from(parts)
    .leftJoin(stockLevels, and(
      eq(stockLevels.partId, parts.id),
      eq(stockLevels.garageId, parts.garageId),
      eq(stockLevels.branchId, d.branchId),
    ))
    .where(and(
      eq(parts.garageId, d.garageId),
      eq(parts.isActive, true),
      sql`${parts.deletedAt} IS NULL`,
      d.q ? or(ilike(parts.name, `%${d.q}%`), ilike(parts.sku, `%${d.q}%`), ilike(parts.barcode, `%${d.q}%`)) : undefined,
    ))
    .orderBy(parts.name)
    .limit(60)

  return {
    ok: true as const,
    data: rows.map((r) => ({
      ...r,
      sellingPrice: Number(r.sellingPrice),
      onHand: r.onHand == null ? null : Number(r.onHand),
      averageCost: r.averageCost == null ? null : Number(r.averageCost),
    })),
  }
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export async function completePosSale(rawInput: unknown): Promise<
  ActionResult<{ posSaleId: string; invoiceNumber: string; receiptNumber: string; total: number; change: number }>
> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(),
    branchId: z.string().uuid(),
    customerId: z.string().uuid().optional(),
    items: z.array(z.object({
      partId: z.string().uuid(),
      quantity: z.number().positive().max(999),
    })).min(1).max(100),
    discountPercent: z.number().min(0).max(50).optional(),
    method: z.enum(["cash", "momo", "card", "bank_transfer", "other"]),
    tendered: z.number().int().min(0).optional(), // pesewas, cash only
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "pos.sell")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  // load parts + stock
  const partIds = [...new Set(d.items.map((i) => i.partId))]
  const partRows = await db().select().from(parts)
    .where(and(inArray(parts.id, partIds), eq(parts.garageId, d.garageId), eq(parts.isActive, true)))
  const byId = new Map(partRows.map((p) => [p.id, p]))
  if (partRows.length !== partIds.length) {
    return { ok: false, error: { code: "VALIDATION", message: "One or more parts unavailable" } }
  }

  const stockRows = await db().select().from(stockLevels)
    .where(and(eq(stockLevels.garageId, d.garageId), eq(stockLevels.branchId, d.branchId), inArray(stockLevels.partId, partIds)))
  const stockByPart = new Map(stockRows.map((s) => [s.partId, s]))

  // merge duplicate lines, check stock
  const merged = new Map<string, number>()
  for (const i of d.items) merged.set(i.partId, (merged.get(i.partId) ?? 0) + i.quantity)
  for (const [pid, qty] of merged) {
    const lvl = stockByPart.get(pid)
    const avail = lvl ? Number(lvl.quantityOnHand) - Number(lvl.quantityReserved) : 0
    if (avail < qty) {
      const p = byId.get(pid)!
      return { ok: false, error: { code: "VALIDATION", message: `Not enough stock for ${p.name} (${avail} available)` } }
    }
  }

  // discount cap from garage settings
  const [settings] = await db().select({ advisorDiscountLimitPercent: garageSettings.advisorDiscountLimitPercent })
    .from(garageSettings).where(eq(garageSettings.garageId, d.garageId)).limit(1)
  const maxDiscount = d.discountPercent ?? 0
  const cap = Number(settings?.advisorDiscountLimitPercent ?? 10)
  if (maxDiscount > cap) {
    return { ok: false, error: { code: "FORBIDDEN", message: `Discount above ${cap}% limit` } }
  }

  // totals + tax
  const { rules, pricesIncludeTax } = await garageTaxContext(d.garageId)
  const lineInputs = [...merged.entries()].map(([pid, qty]) => {
    const p = byId.get(pid)!
    const gross = qty * Number(p.sellingPrice)
    const discount = Math.round(gross * maxDiscount / 100)
    return {
      type: "part" as const,
      partId: pid,
      description: `${p.name} (${p.sku})`,
      quantity: qty,
      unitPrice: Number(p.sellingPrice),
      discountAmount: discount,
      taxCodes: p.taxCodes ?? undefined,
    }
  })
  const taxed = computeTaxTotals(lineInputs.map(({ type, quantity, unitPrice, discountAmount, taxCodes }) => ({ type, quantity, unitPrice, discountAmount, taxCodes })), rules, pricesIncludeTax)

  const subtotal = taxed.subtotal
  const discountTotal = taxed.discountTotal ?? lineInputs.reduce((s, l) => s + l.discountAmount, 0)
  const total = taxed.total

  // documents
  const invoiceNumber = await nextDocNumber(d.garageId, d.branchId, "INV", "INV")
  const receiptNumber = await nextDocNumber(d.garageId, d.branchId, "RCT", "RCT")
  const invoiceId = uuidv7()
  const posSaleId = uuidv7()
  const today = new Date().toISOString().slice(0, 10)

  await db().insert(invoices).values({
    id: invoiceId,
    garageId: d.garageId,
    branchId: d.branchId,
    number: invoiceNumber,
    source: "pos_sale",
    sourceId: posSaleId,
    customerId: d.customerId ?? null,
    status: "issued",
    issueDate: today,
    dueDate: today,
    subtotal: BigInt(subtotal),
    discountTotal: BigInt(discountTotal),
    taxTotal: BigInt(taxed.taxTotal),
    total: BigInt(total),
    amountPaid: 0n,
    balanceDue: BigInt(total),
    issuedBy: userId,
    issuedAt: new Date(),
    tokenHash: sha256(randomBytes(24).toString("hex")),
  })

  await db().insert(invoiceLines).values(
    lineInputs.map((l, idx) => {
      const t = taxed.lines[idx]!
      return {
        id: uuidv7(), garageId: d.garageId, invoiceId,
        type: "part" as const, description: l.description, partId: l.partId,
        quantity: String(l.quantity), unitPrice: BigInt(Math.round(l.unitPrice)),
        discountAmount: BigInt(l.discountAmount),
        taxBreakdown: t.taxes,
        lineTotal: BigInt(t.lineTotal),
        sortOrder: idx,
      }
    })
  )

  await db().insert(posSales).values({
    id: posSaleId, garageId: d.garageId, branchId: d.branchId,
    customerId: d.customerId ?? null, invoiceId, soldBy: userId,
    channel: "counter", status: "completed",
  })

  // stock out
  for (const [pid, qty] of merged) {
    await applyStockMovement({
      garageId: d.garageId, branchId: d.branchId, partId: pid,
      quantity: -qty, type: "pos_sale",
      referenceType: "pos_sale", referenceId: posSaleId, actorUserId: userId,
    })
  }

  // payment
  const paymentId = uuidv7()
  await db().insert(payments).values({
    id: paymentId, garageId: d.garageId, branchId: d.branchId,
    customerId: d.customerId ?? null, invoiceId,
    method: d.method, status: "succeeded", amount: BigInt(total),
    receivedBy: userId, paidAt: new Date(), receiptNumber,
    externalReference: randomBytes(24).toString("hex"),
  })
  await applyPaymentToInvoice(db(), { garageId: d.garageId, paymentId, invoiceId, amountPesewas: BigInt(total) })

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "pos.sale",
    entityType: "pos_sale", entityId: posSaleId,
    after: { invoiceId, invoiceNumber, total, method: d.method, items: lineInputs.length },
  })

  const change = d.method === "cash" && d.tendered != null ? Math.max(0, d.tendered - total) : 0
  try { await sendPaymentReceipt(paymentId) } catch { /* best-effort */ }

  return { ok: true, data: { posSaleId, invoiceNumber, receiptNumber, total, change } }
}

// ---------------------------------------------------------------------------
// Return — restock + credit note
// ---------------------------------------------------------------------------

export async function returnPosSale(rawInput: unknown): Promise<ActionResult<{ creditNoteNumber: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(),
    posSaleId: z.string().uuid(),
    reason: z.string().min(2).max(300),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "pos.sell")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [sale] = await db().select().from(posSales)
    .where(and(eq(posSales.id, d.posSaleId), eq(posSales.garageId, d.garageId))).limit(1)
  if (!sale) return { ok: false, error: { code: "NOT_FOUND", message: "Sale not found" } }
  if (sale.status === "returned") return { ok: false, error: { code: "VALIDATION", message: "Already returned" } }

  const lines = await db().select().from(invoiceLines)
    .where(and(eq(invoiceLines.invoiceId, sale.invoiceId!), eq(invoiceLines.garageId, d.garageId)))

  // restock each part line
  for (const l of lines) {
    if (!l.partId) continue
    await applyStockMovement({
      garageId: d.garageId, branchId: sale.branchId, partId: l.partId,
      quantity: Number(l.quantity), type: "pos_return",
      referenceType: "pos_sale", referenceId: sale.id,
      reason: d.reason, actorUserId: userId,
    })
  }

  const amount = lines.reduce((s, l) => s + Number(l.lineTotal), 0)
  const cnNumber = await nextDocNumber(d.garageId, sale.branchId, "CN", "CN")
  await db().insert(creditNotes).values({
    id: uuidv7(), garageId: d.garageId, number: cnNumber,
    invoiceId: sale.invoiceId!, amount: BigInt(amount), reason: d.reason,
    lines: lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), lineTotal: Number(l.lineTotal) })),
    issuedBy: userId,
  })

  await db().update(posSales).set({ status: "returned", updatedAt: new Date() }).where(eq(posSales.id, sale.id))

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "pos.return",
    entityType: "pos_sale", entityId: sale.id,
    after: { creditNote: cnNumber, amount, reason: d.reason },
  })
  return { ok: true, data: { creditNoteNumber: cnNumber } }
}
