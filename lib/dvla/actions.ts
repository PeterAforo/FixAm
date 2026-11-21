"use server"
import { z } from "zod"
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { dueItems, dvlaFees, dvlaRecords, users, vehicles } from "@/lib/db/schema"
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { uuidv7 } from "@/lib/id"

const staffPrincipal = (role: StaffRole, garageId: string, branchId: string | null) =>
  ({ kind: "staff" as const, role, garageId, branchId })

const RECORD_TYPES = ["roadworthy", "registration_licence", "drivers_licence"] as const
type RecordType = (typeof RECORD_TYPES)[number]

const TITLES: Record<RecordType, string> = {
  roadworthy: "Roadworthy certificate renewal",
  registration_licence: "Registration/licence renewal",
  drivers_licence: "Driver's licence renewal",
}

async function requireMembership(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return { membership: m, principal: staffPrincipal(m.role, garageId, m.branchId) }
}

/** Active DVLA fee rows (platform table) for a record type + optional category. */
export async function listDvlaFees(rawInput?: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const }
  const parsed = z.object({
    garageId: z.string().uuid(),
    recordType: z.enum(RECORD_TYPES).optional(),
    vehicleCategory: z.string().max(60).optional(),
  }).safeParse(rawInput ?? {})
  if (!parsed.success) return { ok: false as const }
  const ctx = await requireMembership(userId, parsed.data.garageId)
  if (!ctx) return { ok: false as const }

  const today = new Date().toISOString().slice(0, 10)
  const conds = [lte(dvlaFees.effectiveFrom, today), or(isNull(dvlaFees.effectiveTo), gte(dvlaFees.effectiveTo, today))]
  if (parsed.data.recordType) conds.push(eq(dvlaFees.recordType, parsed.data.recordType))
  if (parsed.data.vehicleCategory) conds.push(eq(dvlaFees.vehicleCategory, parsed.data.vehicleCategory))

  const rows = await db().select().from(dvlaFees).where(and(...conds)).orderBy(dvlaFees.recordType, dvlaFees.vehicleCategory)
  return { ok: true as const, data: rows.map((r) => ({ ...r, amount: Number(r.amount) })) }
}

const recordSchema = z.object({
  garageId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  type: z.enum(RECORD_TYPES),
  referenceNumber: z.string().max(80).optional().or(z.literal("")),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  recordId: z.string().uuid().optional(),
})

/** Create or update a DVLA record; refreshes the matching due item. */
export async function upsertDvlaRecord(rawInput: unknown): Promise<ActionResult<{ recordId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = recordSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Check the fields" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "vehicles.update")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }
  }

  const [vehicle] = await db().select({ id: vehicles.id, customerId: vehicles.currentOwnerId })
    .from(vehicles).where(and(eq(vehicles.id, d.vehicleId), eq(vehicles.garageId, d.garageId), isNull(vehicles.deletedAt))).limit(1)
  if (!vehicle) return { ok: false, error: { code: "NOT_FOUND", message: "Vehicle not found" } }
  if (!vehicle.customerId) return { ok: false, error: { code: "VALIDATION", message: "Vehicle has no owner" } }

  const values = {
    type: d.type,
    referenceNumber: d.referenceNumber || null,
    issueDate: d.issueDate || null,
    expiryDate: d.expiryDate,
    isCurrent: true,
    updatedAt: new Date(),
  }

  let recordId = d.recordId
  if (recordId) {
    const [existing] = await db().select({ id: dvlaRecords.id }).from(dvlaRecords)
      .where(and(eq(dvlaRecords.id, recordId), eq(dvlaRecords.garageId, d.garageId))).limit(1)
    if (!existing) return { ok: false, error: { code: "NOT_FOUND", message: "Record not found" } }
    await db().update(dvlaRecords).set(values).where(eq(dvlaRecords.id, recordId))
  } else {
    recordId = uuidv7()
    await db().insert(dvlaRecords).values({
      id: recordId, garageId: d.garageId, vehicleId: d.vehicleId,
      customerId: vehicle.customerId, ...values,
    })
  }

  // one current record per type per vehicle
  await db().update(dvlaRecords).set({ isCurrent: false, updatedAt: new Date() })
    .where(and(
      eq(dvlaRecords.vehicleId, d.vehicleId),
      eq(dvlaRecords.garageId, d.garageId),
      eq(dvlaRecords.type, d.type),
      eq(dvlaRecords.isCurrent, true),
      sql`${dvlaRecords.id} <> ${recordId}`,
    ))

  // refresh due item for this record type
  await db().update(dueItems).set({
    status: "completed", completedAt: new Date(), updatedAt: new Date(),
  }).where(and(
    eq(dueItems.garageId, d.garageId),
    eq(dueItems.vehicleId, d.vehicleId),
    eq(dueItems.type, d.type),
    inArray(dueItems.status, ["scheduled", "due_soon", "due", "overdue"]),
  ))
  await db().insert(dueItems).values({
    garageId: d.garageId,
    vehicleId: d.vehicleId,
    customerId: vehicle.customerId,
    type: d.type,
    title: TITLES[d.type],
    dueDate: d.expiryDate,
    effectiveDueDate: d.expiryDate,
    status: "scheduled",
    sourceType: "dvla_record",
    sourceId: recordId,
  })

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId,
    action: recordId ? "dvla_record.update" : "dvla_record.create",
    entityType: "dvla_record", entityId: recordId!,
    after: { type: d.type, expiryDate: d.expiryDate, referenceNumber: d.referenceNumber || null },
  })
  return { ok: true, data: { recordId: recordId! } }
}

export async function deleteDvlaRecord(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({ garageId: z.string().uuid(), recordId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const { garageId, recordId } = parsed.data

  const ctx = await requireMembership(userId, garageId)
  if (!ctx || !can(ctx.principal, "vehicles.update")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }
  }
  const [r] = await db().select().from(dvlaRecords)
    .where(and(eq(dvlaRecords.id, recordId), eq(dvlaRecords.garageId, garageId))).limit(1)
  if (!r) return { ok: false, error: { code: "NOT_FOUND", message: "Record not found" } }

  await db().delete(dvlaRecords).where(eq(dvlaRecords.id, recordId))
  await db().update(dueItems).set({ status: "dismissed", dismissedReason: "record deleted", updatedAt: new Date() })
    .where(and(eq(dueItems.sourceType, "dvla_record"), eq(dueItems.sourceId, recordId)))

  await writeAuditLog({
    garageId, actorUserId: userId, action: "dvla_record.delete",
    entityType: "dvla_record", entityId: recordId,
    before: { type: r.type, expiryDate: r.expiryDate },
  })
  return { ok: true, data: { ok: true as const } }
}

// ---- platform admin fee table ----

async function requirePlatformAdmin(userId: string) {
  const [u] = await db().select({ isPlatformAdmin: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)).limit(1)
  return u?.isPlatformAdmin === true
}

const feeSchema = z.object({
  recordType: z.enum(RECORD_TYPES),
  vehicleCategory: z.string().min(1).max(60),
  description: z.string().max(200).optional().or(z.literal("")),
  amount: z.number().int().min(0),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  feeId: z.string().uuid().optional(),
})

/** List all DVLA fees (platform admin view). */
export async function adminListDvlaFees() {
  const userId = await getSessionUserId()
  if (!userId || !(await requirePlatformAdmin(userId))) return { ok: false as const }
  const rows = await db().select().from(dvlaFees).orderBy(desc(dvlaFees.effectiveFrom))
  return { ok: true as const, data: rows.map((r) => ({ ...r, amount: Number(r.amount) })) }
}

export async function adminUpsertDvlaFee(rawInput: unknown): Promise<ActionResult<{ feeId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  if (!(await requirePlatformAdmin(userId))) return { ok: false, error: { code: "FORBIDDEN", message: "Platform admin only" } }
  const parsed = feeSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Check the fields" } }
  const d = parsed.data

  const values = {
    recordType: d.recordType,
    vehicleCategory: d.vehicleCategory.trim(),
    description: d.description || null,
    amount: BigInt(d.amount),
    effectiveFrom: d.effectiveFrom,
    effectiveTo: d.effectiveTo || null,
    updatedAt: new Date(),
  }
  let feeId = d.feeId
  if (feeId) {
    await db().update(dvlaFees).set(values).where(eq(dvlaFees.id, feeId))
  } else {
    feeId = uuidv7()
    await db().insert(dvlaFees).values({ id: feeId, ...values })
  }
  await writeAuditLog({
    garageId: null, actorUserId: userId, action: "dvla_fee.upsert",
    entityType: "dvla_fee", entityId: feeId,
    after: { recordType: d.recordType, vehicleCategory: d.vehicleCategory, amount: d.amount },
  })
  return { ok: true, data: { feeId } }
}
