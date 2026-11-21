"use server"
import { z } from "zod"
import { and, eq, ilike, isNull, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  branches,
  parts,
  stockLevels,
  vendors,
} from "@/lib/db/schema"
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { applyStockMovement } from "./stock"
import { parsePartsCsv, type CsvIssue } from "./csv"
import { uuidv7 } from "@/lib/id"

const staffPrincipal = (role: StaffRole, garageId: string, branchId: string | null) =>
  ({ kind: "staff" as const, role, garageId, branchId })

async function requireMembership(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return { membership: m, principal: staffPrincipal(m.role, garageId, m.branchId) }
}

// ---------------------------------------------------------------------------
// Catalogue list
// ---------------------------------------------------------------------------

export async function listPartsPage(rawInput: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const }
  const parsed = z.object({
    garageId: z.string().uuid(),
    q: z.string().optional(),
    lowStock: z.boolean().optional(),
    branchId: z.string().uuid().optional(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx || !can(ctx.principal, "parts.view")) return { ok: false as const }

  const branchId = d.branchId ?? ctx.membership.branchId ?? null

  const rows = await db()
    .select({
      id: parts.id, sku: parts.sku, name: parts.name, brand: parts.brand, category: parts.category,
      unit: parts.unit, costPrice: parts.costPrice, sellingPrice: parts.sellingPrice,
      barcode: parts.barcode, isActive: parts.isActive, onlineVisible: parts.onlineVisible,
      preferredVendorName: vendors.businessName,
      levelId: stockLevels.id, branchId: stockLevels.branchId,
      onHand: stockLevels.quantityOnHand, reserved: stockLevels.quantityReserved,
      reorderLevel: stockLevels.reorderLevel, binLocation: stockLevels.binLocation,
      branchName: branches.name,
    })
    .from(parts)
    .leftJoin(vendors, eq(parts.preferredVendorId, vendors.id))
    .leftJoin(stockLevels, and(
      eq(stockLevels.partId, parts.id),
      eq(stockLevels.garageId, parts.garageId),
      branchId ? eq(stockLevels.branchId, branchId) : sql`true`,
    ))
    .leftJoin(branches, eq(stockLevels.branchId, branches.id))
    .where(and(
      eq(parts.garageId, d.garageId),
      isNull(parts.deletedAt),
      d.q ? or(ilike(parts.name, `%${d.q}%`), ilike(parts.sku, `%${d.q}%`), ilike(parts.barcode, `%${d.q}%`)) : undefined,
    ))
    .orderBy(parts.name)
    .limit(500)

  let filtered = rows.map((r) => ({
    ...r,
    costPrice: Number(r.costPrice), sellingPrice: Number(r.sellingPrice),
    onHand: r.onHand == null ? null : Number(r.onHand),
    reserved: r.reserved == null ? null : Number(r.reserved),
    reorderLevel: r.reorderLevel == null ? null : Number(r.reorderLevel),
  }))

  if (d.lowStock) {
    filtered = filtered.filter((r) =>
      r.onHand != null && r.reorderLevel != null && r.onHand <= r.reorderLevel
    )
  }

  const branchRows = await db().select({ id: branches.id, name: branches.name }).from(branches)
    .where(and(eq(branches.garageId, d.garageId), sql`${branches.deletedAt} IS NULL`))

  return {
    ok: true as const,
    data: {
      parts: filtered,
      branches: branchRows,
      branchId,
      canManage: can(ctx.principal, "parts.manage"),
      canAdjust: can(ctx.principal, "stock.adjust"),
      canTransfer: can(ctx.principal, "stock.transfer"),
    },
  }
}

// ---------------------------------------------------------------------------
// Part CRUD
// ---------------------------------------------------------------------------

const partSchema = z.object({
  garageId: z.string().uuid(),
  partId: z.string().uuid().optional(),
  sku: z.string().min(1).max(60),
  name: z.string().min(1).max(200),
  brand: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  barcode: z.string().max(60).optional(),
  unit: z.string().max(20).optional(),
  costPrice: z.number().min(0),
  sellingPrice: z.number().min(0),
  isActive: z.boolean().optional(),
  onlineVisible: z.boolean().optional(),
  isServiceItem: z.boolean().optional(),
  preferredVendorId: z.string().uuid().optional(),
})

export async function upsertPart(rawInput: unknown): Promise<ActionResult<{ partId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = partSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "parts.manage")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const values = {
    sku: d.sku.trim(),
    name: d.name.trim(),
    brand: d.brand || null,
    category: d.category || null,
    description: d.description || null,
    barcode: d.barcode || null,
    unit: d.unit || "pcs",
    costPrice: BigInt(Math.round(d.costPrice * 100)),
    sellingPrice: BigInt(Math.round(d.sellingPrice * 100)),
    isActive: d.isActive ?? true,
    onlineVisible: d.onlineVisible ?? false,
    isServiceItem: d.isServiceItem ?? false,
    preferredVendorId: d.preferredVendorId ?? null,
    updatedAt: new Date(),
  }

  if (d.partId) {
    const [existing] = await db().select({ id: parts.id }).from(parts)
      .where(and(eq(parts.id, d.partId), eq(parts.garageId, d.garageId))).limit(1)
    if (!existing) return { ok: false, error: { code: "NOT_FOUND", message: "Part not found" } }
    await db().update(parts).set(values).where(eq(parts.id, d.partId))
    await writeAuditLog({ garageId: d.garageId, actorUserId: userId, action: "part.update", entityType: "part", entityId: d.partId, after: { sku: d.sku } })
    return { ok: true, data: { partId: d.partId } }
  }

  const partId = uuidv7()
  try {
    await db().insert(parts).values({ id: partId, garageId: d.garageId, ...values })
  } catch {
    return { ok: false, error: { code: "CONFLICT", message: `SKU "${d.sku}" already exists` } }
  }
  await writeAuditLog({ garageId: d.garageId, actorUserId: userId, action: "part.create", entityType: "part", entityId: partId, after: { sku: d.sku } })
  return { ok: true, data: { partId } }
}

// ---------------------------------------------------------------------------
// Stock operations
// ---------------------------------------------------------------------------

export async function adjustStock(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(),
    branchId: z.string().uuid(),
    partId: z.string().uuid(),
    /** signed delta */
    quantity: z.number().refine((n) => n !== 0),
    reason: z.string().min(2).max(300),
    unitCost: z.number().min(0).optional(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "stock.adjust")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [part] = await db().select({ id: parts.id }).from(parts)
    .where(and(eq(parts.id, d.partId), eq(parts.garageId, d.garageId))).limit(1)
  if (!part) return { ok: false, error: { code: "NOT_FOUND", message: "Part not found" } }

  await applyStockMovement({
    garageId: d.garageId, branchId: d.branchId, partId: d.partId,
    quantity: d.quantity, type: "adjustment", reason: d.reason,
    unitCost: d.unitCost != null ? BigInt(Math.round(d.unitCost * 100)) : null,
    actorUserId: userId,
  })

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "stock.adjust",
    entityType: "part", entityId: d.partId,
    after: { branchId: d.branchId, quantity: d.quantity, reason: d.reason },
  })
  return { ok: true, data: { ok: true as const } }
}

export async function transferStock(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(),
    fromBranchId: z.string().uuid(),
    toBranchId: z.string().uuid(),
    partId: z.string().uuid(),
    quantity: z.number().positive(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data
  if (d.fromBranchId === d.toBranchId) return { ok: false, error: { code: "VALIDATION", message: "Branches must differ" } }

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "stock.transfer")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [from] = await db().select().from(stockLevels)
    .where(and(eq(stockLevels.garageId, d.garageId), eq(stockLevels.branchId, d.fromBranchId), eq(stockLevels.partId, d.partId))).limit(1)
  const available = from ? Number(from.quantityOnHand) - Number(from.quantityReserved) : 0
  if (available < d.quantity) {
    return { ok: false, error: { code: "VALIDATION", message: `Only ${available} available at source branch` } }
  }

  await applyStockMovement({
    garageId: d.garageId, branchId: d.fromBranchId, partId: d.partId,
    quantity: -d.quantity, type: "transfer_out", reason: `transfer to branch`, actorUserId: userId,
    referenceType: "transfer", referenceId: d.toBranchId,
  })
  const [destLevel] = await db().select().from(stockLevels)
    .where(and(eq(stockLevels.garageId, d.garageId), eq(stockLevels.branchId, d.toBranchId), eq(stockLevels.partId, d.partId))).limit(1)
  await applyStockMovement({
    garageId: d.garageId, branchId: d.toBranchId, partId: d.partId,
    quantity: d.quantity, type: "transfer_in",
    unitCost: destLevel?.averageCost ?? from?.averageCost ?? null,
    reason: `transfer from branch`, actorUserId: userId,
    referenceType: "transfer", referenceId: d.fromBranchId,
  })

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "stock.transfer",
    entityType: "part", entityId: d.partId,
    after: { from: d.fromBranchId, to: d.toBranchId, quantity: d.quantity },
  })
  return { ok: true, data: { ok: true as const } }
}

export async function setStockConfig(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(),
    branchId: z.string().uuid(),
    partId: z.string().uuid(),
    reorderLevel: z.number().min(0).optional(),
    reorderQuantity: z.number().min(0).optional(),
    binLocation: z.string().max(60).optional(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "stock.adjust")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [level] = await db().select({ id: stockLevels.id }).from(stockLevels)
    .where(and(eq(stockLevels.garageId, d.garageId), eq(stockLevels.branchId, d.branchId), eq(stockLevels.partId, d.partId))).limit(1)
  if (!level) return { ok: false, error: { code: "NOT_FOUND", message: "No stock row for this branch" } }

  await db().update(stockLevels).set({
    ...(d.reorderLevel != null ? { reorderLevel: String(d.reorderLevel) } : {}),
    ...(d.reorderQuantity != null ? { reorderQuantity: String(d.reorderQuantity) } : {}),
    ...(d.binLocation !== undefined ? { binLocation: d.binLocation || null } : {}),
    updatedAt: new Date(),
  }).where(eq(stockLevels.id, level.id))
  return { ok: true, data: { ok: true as const } }
}

// ---------------------------------------------------------------------------
// CSV import — two-phase: preview then commit
// ---------------------------------------------------------------------------

export async function importPartsCsv(rawInput: unknown): Promise<
  ActionResult<{ inserted: number; updated: number; issues: CsvIssue[] }>
> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({ garageId: z.string().uuid(), csvText: z.string().min(10).max(2_000_000) }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "parts.manage")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const { rows, issues } = parsePartsCsv(d.csvText)
  if (rows.length === 0) return { ok: true, data: { inserted: 0, updated: 0, issues } }

  const existing = await db().select({ id: parts.id, sku: parts.sku }).from(parts)
    .where(and(eq(parts.garageId, d.garageId), isNull(parts.deletedAt)))
  const bySku = new Map(existing.map((e) => [e.sku.toLowerCase(), e.id]))

  let inserted = 0, updated = 0
  for (const r of rows) {
    const existingId = bySku.get(r.sku.toLowerCase())
    const values = {
      name: r.name, brand: r.brand || null, category: r.category || null,
      unit: r.unit || "pcs", barcode: r.barcode || null,
      costPrice: BigInt(Math.round((r.costPrice ?? 0) * 100)),
      sellingPrice: BigInt(Math.round((r.sellingPrice ?? 0) * 100)),
      updatedAt: new Date(),
    }
    if (existingId) {
      await db().update(parts).set(values).where(eq(parts.id, existingId))
      updated++
    } else {
      await db().insert(parts).values({ id: uuidv7(), garageId: d.garageId, sku: r.sku, ...values })
      inserted++
    }
  }

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "part.import",
    entityType: "part", entityId: "bulk",
    after: { inserted, updated, issues: issues.length },
  })
  return { ok: true, data: { inserted, updated, issues } }
}
