"use server"
import { randomBytes, createHash } from "crypto"
import { z } from "zod"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  branches,
  creditNotes,
  customers,
  documentSequences,
  invoices,
  jobs,
} from "@/lib/db/schema"
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { buildInvoiceFromJob } from "./invoice-core"
import { computeTaxTotals, type TaxRule } from "@/lib/domain/tax"
import { uuidv7 } from "@/lib/id"
import { garageSettings, invoiceLines } from "@/lib/db/schema"

const staffPrincipal = (role: StaffRole, garageId: string, branchId: string | null) =>
  ({ kind: "staff" as const, role, garageId, branchId })

async function requireMembership(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return { membership: m, principal: staffPrincipal(m.role, garageId, m.branchId) }
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")

// ---------------------------------------------------------------------------
// Create (draft from job, or manual shell)
// ---------------------------------------------------------------------------

export async function createInvoiceFromJob(rawInput: unknown): Promise<ActionResult<{ invoiceId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({ garageId: z.string().uuid(), jobId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "invoices.create")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [job] = await db().select().from(jobs).where(and(eq(jobs.id, d.jobId), eq(jobs.garageId, d.garageId), isNull(jobs.deletedAt))).limit(1)
  if (!job) return { ok: false, error: { code: "NOT_FOUND", message: "Job not found" } }

  const res = await buildInvoiceFromJob(db(), {
    garageId: d.garageId,
    jobId: d.jobId,
    branchId: job.branchId,
    customerId: job.customerId,
    vehicleId: job.vehicleId,
    actorUserId: userId,
  })
  if ("error" in res) return { ok: false, error: { code: "VALIDATION", message: res.error } }

  await writeAuditLog({ garageId: d.garageId, actorUserId: userId, action: "invoice.create", entityType: "invoice", entityId: res.invoiceId, after: { jobId: d.jobId } })
  return { ok: true, data: { invoiceId: res.invoiceId } }
}

// ---------------------------------------------------------------------------
// Manual invoice (walk-in / sundry billing)
// ---------------------------------------------------------------------------

export async function createManualInvoice(rawInput: unknown): Promise<ActionResult<{ invoiceId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const lineSchema = z.object({
    type: z.enum(["labour", "part", "sundry", "service_fee"]),
    description: z.string().min(1).max(300),
    quantity: z.number().positive().max(10000),
    unitPrice: z.number().int().min(0), // pesewas
    discountAmount: z.number().int().min(0).default(0),
  })
  const parsed = z.object({
    garageId: z.string().uuid(),
    customerId: z.string().uuid().optional(),
    vehicleId: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    notes: z.string().max(1000).optional(),
    lines: z.array(lineSchema).min(1).max(100),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "invoices.create")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [settings] = await db()
    .select({ taxRules: garageSettings.taxRules, pricesIncludeTax: garageSettings.pricesIncludeTax })
    .from(garageSettings)
    .where(eq(garageSettings.garageId, d.garageId))
    .limit(1)
  const rules = ((settings?.taxRules as { code: string; rate_bp: number; applies_to: string[]; compound: boolean; enabled: boolean }[] | null) ?? [])
    .filter((r) => r.enabled !== false)
    .map((r) => ({ code: r.code, rate_bp: Number(r.rate_bp), applies_to: r.applies_to ?? [], compound: !!r.compound, enabled: true })) as TaxRule[]

  const taxed = computeTaxTotals(
    d.lines.map((l) => ({
      type: l.type,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountAmount: l.discountAmount,
    })),
    rules,
    !!settings?.pricesIncludeTax
  )

  const invoiceId = uuidv7()
  await db().insert(invoices).values({
    id: invoiceId,
    garageId: d.garageId,
    branchId: d.branchId ?? ctx.membership.branchId,
    source: "manual",
    customerId: d.customerId ?? null,
    vehicleId: d.vehicleId ?? null,
    status: "draft",
    subtotal: BigInt(taxed.subtotal),
    discountTotal: BigInt(taxed.discountTotal),
    taxTotal: BigInt(taxed.taxTotal),
    total: BigInt(taxed.total),
    balanceDue: BigInt(taxed.total),
    notes: d.notes ?? null,
  })

  await db().insert(invoiceLines).values(
    d.lines.map((l, idx) => {
      const t = taxed.lines[idx]!
      return {
        garageId: d.garageId,
        invoiceId,
        type: l.type,
        description: l.description,
        quantity: String(l.quantity),
        unitPrice: BigInt(l.unitPrice),
        discountAmount: BigInt(l.discountAmount),
        taxBreakdown: t.taxes,
        lineTotal: BigInt(t.lineTotal),
        sortOrder: idx,
      }
    })
  )

  await writeAuditLog({ garageId: d.garageId, actorUserId: userId, action: "invoice.create", entityType: "invoice", entityId: invoiceId, after: { source: "manual", lines: d.lines.length } })
  return { ok: true, data: { invoiceId } }
}

// ---------------------------------------------------------------------------
// Issue — gapless number via document_sequences, freezes totals
// ---------------------------------------------------------------------------

async function nextDocNumber(garageId: string, branchId: string | null, docType: string, prefix: string) {
  const rows = await db()
    .insert(documentSequences)
    .values({ garageId, branchId, docType, nextNumber: 2n })
    .onConflictDoUpdate({
      target: [documentSequences.garageId, documentSequences.branchId, documentSequences.docType],
      set: { nextNumber: sql`${documentSequences.nextNumber} + 1`, updatedAt: new Date() },
    })
    .returning({ nextNumber: documentSequences.nextNumber })
  return `${prefix}-${String(Number(rows[0]!.nextNumber) - 1).padStart(5, "0")}`
}

export async function issueInvoice(rawInput: unknown): Promise<ActionResult<{ invoiceId: string; number: string; payToken: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(),
    invoiceId: z.string().uuid(),
    dueDays: z.number().int().min(0).max(365).default(14),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "invoices.issue")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [inv] = await db().select().from(invoices).where(and(eq(invoices.id, d.invoiceId), eq(invoices.garageId, d.garageId))).limit(1)
  if (!inv) return { ok: false, error: { code: "NOT_FOUND", message: "Invoice not found" } }
  if (inv.status !== "draft") return { ok: false, error: { code: "VALIDATION", message: "Only draft invoices can be issued" } }

  // document_sequences requires a concrete branch for gapless numbering —
  // fall back to the garage's default branch for manual invoices.
  let seqBranchId = inv.branchId
  if (!seqBranchId) {
    const [def] = await db().select({ id: branches.id }).from(branches)
      .where(and(eq(branches.garageId, d.garageId), eq(branches.isDefault, true))).limit(1)
    seqBranchId = def?.id ?? null
    if (!seqBranchId) {
      const [any] = await db().select({ id: branches.id }).from(branches)
        .where(eq(branches.garageId, d.garageId)).limit(1)
      seqBranchId = any?.id ?? null
    }
    if (!seqBranchId) return { ok: false, error: { code: "VALIDATION", message: "Garage has no branch" } }
  }

  const number = await nextDocNumber(d.garageId, seqBranchId, "INV", "INV")
  const payToken = randomBytes(24).toString("hex")
  const today = new Date().toISOString().slice(0, 10)
  const due = new Date(Date.now() + d.dueDays * 86400_000).toISOString().slice(0, 10)

  await db().update(invoices).set({
    number,
    branchId: inv.branchId ?? seqBranchId,
    status: "issued",
    issueDate: today,
    dueDate: due,
    issuedBy: userId,
    issuedAt: new Date(),
    tokenHash: sha256(payToken),
    balanceDue: inv.total,
    updatedAt: new Date(),
  }).where(eq(invoices.id, inv.id))

  // job → delivered requires invoice issued (P2-05 delivery gate); mark invoice linkage on job items implicitly via sourceId
  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "invoice.issue",
    entityType: "invoice", entityId: inv.id, before: { status: "draft" }, after: { number, status: "issued" },
  })
  return { ok: true, data: { invoiceId: inv.id, number, payToken } }
}

// ---------------------------------------------------------------------------
// Void / credit note
// ---------------------------------------------------------------------------

export async function voidInvoice(rawInput: unknown): Promise<ActionResult<{ invoiceId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(),
    invoiceId: z.string().uuid(),
    reason: z.string().min(3).max(500),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "A reason is required" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "invoices.void")) return { ok: false, error: { code: "FORBIDDEN", message: "Only owners/managers can void invoices" } }

  const [inv] = await db().select().from(invoices).where(and(eq(invoices.id, d.invoiceId), eq(invoices.garageId, d.garageId))).limit(1)
  if (!inv) return { ok: false, error: { code: "NOT_FOUND", message: "Invoice not found" } }
  if (inv.status === "void") return { ok: true, data: { invoiceId: inv.id } }
  if (Number(inv.amountPaid) > 0) {
    return { ok: false, error: { code: "VALIDATION", message: "Refund payments before voiding" } }
  }

  await db().update(invoices).set({
    status: "void", voidedBy: userId, voidedAt: new Date(), voidReason: d.reason, updatedAt: new Date(),
  }).where(eq(invoices.id, inv.id))

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "invoice.void",
    entityType: "invoice", entityId: inv.id, before: { status: inv.status }, after: { status: "void", reason: d.reason },
  })
  return { ok: true, data: { invoiceId: inv.id } }
}

export async function createCreditNote(rawInput: unknown): Promise<ActionResult<{ creditNoteId: string; number: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(),
    invoiceId: z.string().uuid(),
    amountPesewas: z.number().int().positive(),
    reason: z.string().min(3).max(500),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "credit_notes.create")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [inv] = await db().select().from(invoices).where(and(eq(invoices.id, d.invoiceId), eq(invoices.garageId, d.garageId))).limit(1)
  if (!inv || inv.status === "void" || inv.status === "draft") {
    return { ok: false, error: { code: "VALIDATION", message: "Invoice not eligible" } }
  }
  if (BigInt(d.amountPesewas) > inv.balanceDue) {
    return { ok: false, error: { code: "VALIDATION", message: "Credit exceeds balance due" } }
  }

  const number = await nextDocNumber(d.garageId, inv.branchId, "CN", "CN")
  const cnId = uuidv7()
  await db().insert(creditNotes).values({
    id: cnId,
    garageId: d.garageId,
    number,
    invoiceId: inv.id,
    amount: BigInt(d.amountPesewas),
    reason: d.reason,
    issuedBy: userId,
  })

  // reduce balance + total tracking on the invoice
  const newBalance = inv.balanceDue - BigInt(d.amountPesewas)
  await db().update(invoices).set({ balanceDue: newBalance, updatedAt: new Date() }).where(eq(invoices.id, inv.id))

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "credit_note.create",
    entityType: "credit_note", entityId: cnId, after: { number, invoiceId: inv.id, amount: d.amountPesewas },
  })
  return { ok: true, data: { creditNoteId: cnId, number } }
}

// ---------------------------------------------------------------------------
// Reads for pages
// ---------------------------------------------------------------------------

export async function listInvoicesPage(rawInput: unknown): Promise<
  ActionResult<{
    id: string; number: string | null; status: string; source: string;
    customerName: string | null; total: number; balanceDue: number; amountPaid: number;
    issueDate: string | null; createdAt: string; branchName: string | null;
  }[]>
> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(),
    status: z.string().optional(),
    q: z.string().max(80).optional(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "invoices.view")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const rows = await db()
    .select({
      id: invoices.id, number: invoices.number, status: invoices.status, source: invoices.source,
      total: invoices.total, balanceDue: invoices.balanceDue, amountPaid: invoices.amountPaid,
      issueDate: invoices.issueDate, createdAt: invoices.createdAt, branchName: branches.name,
      customerName: customers.fullName,
    })
    .from(invoices)
    .leftJoin(branches, eq(invoices.branchId, branches.id))
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .where(and(
      eq(invoices.garageId, d.garageId),
      d.status ? eq(invoices.status, d.status as never) : undefined,
    ))
    .orderBy(desc(invoices.createdAt))
    .limit(300)

  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id, number: r.number, status: r.status, source: r.source,
      customerName: r.customerName, total: Number(r.total), balanceDue: Number(r.balanceDue), amountPaid: Number(r.amountPaid),
      issueDate: r.issueDate, createdAt: r.createdAt.toISOString(), branchName: r.branchName,
    })),
  }
}
