"use server"
import { z } from "zod"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  branches,
  goodsReceipts,
  parts,
  purchaseOrderItems,
  purchaseOrders,
  vendors,
} from "@/lib/db/schema"
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { nextDocNumber } from "@/lib/money/sequence"
import { applyStockMovement } from "@/lib/parts/stock"
import { uuidv7 } from "@/lib/id"

const staffPrincipal = (role: StaffRole, garageId: string, branchId: string | null) =>
  ({ kind: "staff" as const, role, garageId, branchId })

async function requireMembership(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return { membership: m, principal: staffPrincipal(m.role, garageId, m.branchId) }
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listPurchaseOrders(rawInput: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const }
  const parsed = z.object({ garageId: z.string().uuid(), status: z.string().optional() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx || !can(ctx.principal, "purchase_orders.view")) return { ok: false as const }

  const rows = await db()
    .select({
      id: purchaseOrders.id, number: purchaseOrders.number, status: purchaseOrders.status,
      vendorName: vendors.businessName, externalSupplierName: purchaseOrders.externalSupplierName,
      total: purchaseOrders.total, expectedAt: purchaseOrders.expectedAt,
      branchName: branches.name, createdAt: purchaseOrders.createdAt,
      itemCount: sql<string>`(select count(*) from purchase_order_items where purchase_order_id = ${purchaseOrders.id})`,
      receivedCount: sql<string>`(select coalesce(sum(quantity_received),0) from purchase_order_items where purchase_order_id = ${purchaseOrders.id})`,
      orderedCount: sql<string>`(select coalesce(sum(quantity),0) from purchase_order_items where purchase_order_id = ${purchaseOrders.id})`,
    })
    .from(purchaseOrders)
    .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
    .leftJoin(branches, eq(purchaseOrders.branchId, branches.id))
    .where(and(
      eq(purchaseOrders.garageId, d.garageId),
      d.status ? eq(purchaseOrders.status, d.status as never) : undefined,
    ))
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(200)

  const vendorRows = await db().select({ id: vendors.id, name: vendors.businessName, city: vendors.city, region: vendors.region })
    .from(vendors)
    .where(and(eq(vendors.status, "approved"), sql`${vendors.deletedAt} IS NULL`))
    .orderBy(vendors.businessName)
    .limit(200)

  const branchRows = await db().select({ id: branches.id, name: branches.name }).from(branches)
    .where(and(eq(branches.garageId, d.garageId), sql`${branches.deletedAt} IS NULL`))

  const partRows = await db().select({ id: parts.id, sku: parts.sku, name: parts.name, sellingPrice: parts.sellingPrice })
    .from(parts)
    .where(and(eq(parts.garageId, d.garageId), eq(parts.isActive, true), sql`${parts.deletedAt} IS NULL`))
    .orderBy(parts.name)
    .limit(1000)

  return {
    ok: true as const,
    data: {
      orders: rows.map((r) => ({
        ...r, total: Number(r.total), itemCount: Number(r.itemCount),
        receivedCount: Number(r.receivedCount), orderedCount: Number(r.orderedCount),
        expectedAt: r.expectedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(),
      })),
      vendors: vendorRows,
      branches: branchRows,
      parts: partRows.map((p) => ({ ...p, sellingPrice: Number(p.sellingPrice) })),
      canCreate: can(ctx.principal, "purchase_orders.create"),
      canApprove: can(ctx.principal, "purchase_orders.approve"),
      canReceive: can(ctx.principal, "purchase_orders.receive"),
    },
  }
}

// ---------------------------------------------------------------------------
// Create draft PO
// ---------------------------------------------------------------------------

export async function createPurchaseOrder(rawInput: unknown): Promise<ActionResult<{ poId: string; number: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(),
    branchId: z.string().uuid(),
    vendorId: z.string().uuid().optional(),
    externalSupplierName: z.string().max(200).optional(),
    expectedAt: z.string().optional(),
    notes: z.string().max(1000).optional(),
    items: z.array(z.object({
      partId: z.string().uuid(),
      quantity: z.number().positive(),
      unitCost: z.number().min(0), // cedis
    })).min(1).max(200),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data
  if (!d.vendorId && !d.externalSupplierName) {
    return { ok: false, error: { code: "VALIDATION", message: "Choose a vendor or enter a supplier name" } }
  }

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "purchase_orders.create")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const partIds = [...new Set(d.items.map((i) => i.partId))]
  const partRows = await db().select({ id: parts.id }).from(parts)
    .where(and(inArray(parts.id, partIds), eq(parts.garageId, d.garageId)))
  if (partRows.length !== partIds.length) {
    return { ok: false, error: { code: "VALIDATION", message: "One or more parts not found" } }
  }

  const number = await nextDocNumber(d.garageId, d.branchId, "PO", "PO")
  const poId = uuidv7()
  const total = d.items.reduce((s, i) => s + Math.round(i.quantity * i.unitCost * 100), 0)

  await db().insert(purchaseOrders).values({
    id: poId, garageId: d.garageId, branchId: d.branchId, number,
    vendorId: d.vendorId ?? null,
    externalSupplierName: d.externalSupplierName ?? null,
    status: "draft",
    subtotal: BigInt(total), total: BigInt(total),
    expectedAt: d.expectedAt ? new Date(d.expectedAt) : null,
    notes: d.notes ?? null,
  })
  await db().insert(purchaseOrderItems).values(
    d.items.map((i) => ({
      id: uuidv7(), garageId: d.garageId, purchaseOrderId: poId,
      partId: i.partId, quantity: String(i.quantity),
      unitCost: BigInt(Math.round(i.unitCost * 100)),
    }))
  )

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "po.create",
    entityType: "purchase_order", entityId: poId,
    after: { number, items: d.items.length, total },
  })
  return { ok: true, data: { poId, number } }
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

async function transitionPO(rawInput: unknown, action: "submit" | "approve" | "cancel"): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({ garageId: z.string().uuid(), poId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }

  const perm = action === "approve" ? "purchase_orders.approve" : action === "cancel" ? "purchase_orders.create" : "purchase_orders.create"
  if (!can(ctx.principal, perm)) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [po] = await db().select().from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, d.poId), eq(purchaseOrders.garageId, d.garageId))).limit(1)
  if (!po) return { ok: false, error: { code: "NOT_FOUND", message: "PO not found" } }

  const next =
    action === "submit" && po.status === "draft" ? "pending_approval" :
    action === "approve" && po.status === "pending_approval" ? "sent" :
    action === "cancel" && !["received", "cancelled"].includes(po.status) ? "cancelled" :
    null
  if (!next) return { ok: false, error: { code: "VALIDATION", message: `Cannot ${action} a ${po.status} PO` } }

  await db().update(purchaseOrders).set({
    status: next as never,
    ...(action === "approve" ? { approvedBy: userId, approvedAt: new Date() } : {}),
    updatedAt: new Date(),
  }).where(eq(purchaseOrders.id, po.id))

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: `po.${action}`,
    entityType: "purchase_order", entityId: po.id,
    before: { status: po.status }, after: { status: next },
  })
  return { ok: true, data: { ok: true as const } }
}

export async function submitPurchaseOrder(i: unknown) { return transitionPO(i, "submit") }
export async function approvePurchaseOrder(i: unknown) { return transitionPO(i, "approve") }
export async function cancelPurchaseOrder(i: unknown) { return transitionPO(i, "cancel") }

// ---------------------------------------------------------------------------
// Goods receiving (partial or full)
// ---------------------------------------------------------------------------

export async function receiveGoods(rawInput: unknown): Promise<ActionResult<{ receiptId: string; poStatus: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(),
    poId: z.string().uuid(),
    lines: z.array(z.object({
      itemId: z.string().uuid(),
      quantity: z.number().positive(),
    })).min(1).max(200),
    notes: z.string().max(500).optional(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "purchase_orders.receive")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [po] = await db().select().from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, d.poId), eq(purchaseOrders.garageId, d.garageId))).limit(1)
  if (!po) return { ok: false, error: { code: "NOT_FOUND", message: "PO not found" } }
  if (["draft", "pending_approval", "cancelled", "received"].includes(po.status)) {
    return { ok: false, error: { code: "VALIDATION", message: `Cannot receive a ${po.status} PO` } }
  }

  const items = await db().select().from(purchaseOrderItems)
    .where(and(eq(purchaseOrderItems.purchaseOrderId, po.id), eq(purchaseOrderItems.garageId, d.garageId)))
  const byId = new Map(items.map((i) => [i.id, i]))

  const receiptLines: { part_id: string; quantity: number; unit_cost: number; condition: string }[] = []
  for (const l of d.lines) {
    const item = byId.get(l.itemId)
    if (!item) return { ok: false, error: { code: "VALIDATION", message: "Unknown PO line" } }
    const ordered = Number(item.quantity)
    const already = Number(item.quantityReceived)
    const remaining = ordered - already
    if (l.quantity > remaining + 1e-9) {
      return { ok: false, error: { code: "VALIDATION", message: `Only ${remaining} remaining on one line` } }
    }
    receiptLines.push({ part_id: item.partId, quantity: l.quantity, unit_cost: Number(item.unitCost), condition: "new" })
  }

  const receiptId = uuidv7()
  await db().insert(goodsReceipts).values({
    id: receiptId, garageId: d.garageId, branchId: po.branchId,
    purchaseOrderId: po.id, receivedBy: userId,
    lines: receiptLines, notes: d.notes ?? null,
  })

  // stock in + WAC + item quantities
  for (const rl of receiptLines) {
    const item = items.find((i) => i.partId === rl.part_id)!
    await applyStockMovement({
      garageId: d.garageId, branchId: po.branchId, partId: rl.part_id,
      quantity: rl.quantity, type: "purchase_receipt",
      unitCost: BigInt(rl.unit_cost),
      referenceType: "purchase_order", referenceId: po.id,
      reason: `PO ${po.number}`, actorUserId: userId,
    })
    await db().update(purchaseOrderItems).set({
      quantityReceived: sql`${purchaseOrderItems.quantityReceived} + ${rl.quantity}`,
      updatedAt: new Date(),
    }).where(eq(purchaseOrderItems.id, item.id))
  }

  // recompute PO status
  const refreshed = await db().select({ quantity: purchaseOrderItems.quantity, received: purchaseOrderItems.quantityReceived })
    .from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, po.id))
  const allDone = refreshed.every((i) => Number(i.received) >= Number(i.quantity))
  const anyDone = refreshed.some((i) => Number(i.received) > 0)
  const poStatus = allDone ? "received" : anyDone ? "partially_delivered" : po.status
  await db().update(purchaseOrders).set({ status: poStatus as never, updatedAt: new Date() }).where(eq(purchaseOrders.id, po.id))

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "po.receive",
    entityType: "purchase_order", entityId: po.id,
    after: { receiptId, lines: receiptLines.length, poStatus },
  })
  return { ok: true, data: { receiptId, poStatus } }
}

export async function getPurchaseOrder(rawInput: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const }
  const parsed = z.object({ garageId: z.string().uuid(), poId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }
  const d = parsed.data
  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx || !can(ctx.principal, "purchase_orders.view")) return { ok: false as const }

  const [po] = await db().select({ po: purchaseOrders, vendorName: vendors.businessName }).from(purchaseOrders)
    .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
    .where(and(eq(purchaseOrders.id, d.poId), eq(purchaseOrders.garageId, d.garageId))).limit(1)
  if (!po) return { ok: true as const, data: null }
  const poRow = po.po

  const items = await db()
    .select({
      id: purchaseOrderItems.id, partId: purchaseOrderItems.partId,
      partName: parts.name, partSku: parts.sku,
      quantity: purchaseOrderItems.quantity, unitCost: purchaseOrderItems.unitCost,
      quantityReceived: purchaseOrderItems.quantityReceived,
    })
    .from(purchaseOrderItems)
    .innerJoin(parts, eq(purchaseOrderItems.partId, parts.id))
    .where(and(eq(purchaseOrderItems.purchaseOrderId, poRow.id), eq(purchaseOrderItems.garageId, d.garageId)))

  return {
    ok: true as const,
    data: {
      id: poRow.id, number: poRow.number, status: poRow.status,
      vendorName: po.vendorName ?? poRow.externalSupplierName, branchId: poRow.branchId,
      items: items.map((i) => ({
        ...i, quantity: Number(i.quantity), unitCost: Number(i.unitCost),
        quantityReceived: Number(i.quantityReceived ?? 0),
      })),
    },
  }
}
