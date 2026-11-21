"use server"
import { z } from "zod"
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  dueItems,
  insurancePartners,
  insurancePolicies,
  vehicles,
} from "@/lib/db/schema"
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { uuidv7 } from "@/lib/id"

const staffPrincipal = (role: StaffRole, garageId: string, branchId: string | null) =>
  ({ kind: "staff" as const, role, garageId, branchId })

async function requireMembership(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return { membership: m, principal: staffPrincipal(m.role, garageId, m.branchId) }
}

const POLICY_TYPES = ["third_party", "third_party_fire_theft", "comprehensive"] as const

/** Platform insurance partners for the policy form dropdown. */
export async function listInsurancePartners() {
  return db().select({
    id: insurancePartners.id, name: insurancePartners.name,
    contactName: insurancePartners.contactName, contactPhone: insurancePartners.contactPhone,
  }).from(insurancePartners).where(eq(insurancePartners.isActive, true)).orderBy(insurancePartners.name)
}

const policySchema = z.object({
  garageId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  insurerName: z.string().min(1).max(120),
  partnerId: z.string().uuid().optional().or(z.literal("")),
  policyType: z.enum(POLICY_TYPES),
  policyNumber: z.string().max(60).optional().or(z.literal("")),
  stickerNumber: z.string().max(60).optional().or(z.literal("")),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  premium: z.number().int().min(0).optional().nullable(),
  policyId: z.string().uuid().optional(),
})

/** Create or update an insurance policy; refreshes the insurance due item. */
export async function upsertInsurancePolicy(rawInput: unknown): Promise<ActionResult<{ policyId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = policySchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Check the highlighted fields" } }
  const d = parsed.data
  if (d.endDate <= d.startDate) {
    return { ok: false, error: { code: "VALIDATION", message: "End date must be after start date" } }
  }

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
    insurerName: d.insurerName,
    partnerId: d.partnerId || null,
    policyType: d.policyType,
    policyNumber: d.policyNumber || null,
    stickerNumber: d.stickerNumber || null,
    startDate: d.startDate,
    endDate: d.endDate,
    premium: d.premium != null ? BigInt(d.premium) : null,
    isCurrent: true,
    updatedAt: new Date(),
  }

  let policyId = d.policyId
  if (policyId) {
    const [existing] = await db().select({ id: insurancePolicies.id }).from(insurancePolicies)
      .where(and(eq(insurancePolicies.id, policyId), eq(insurancePolicies.garageId, d.garageId))).limit(1)
    if (!existing) return { ok: false, error: { code: "NOT_FOUND", message: "Policy not found" } }
    await db().update(insurancePolicies).set(values).where(eq(insurancePolicies.id, policyId))
  } else {
    policyId = uuidv7()
    await db().insert(insurancePolicies).values({
      id: policyId, garageId: d.garageId, vehicleId: d.vehicleId,
      customerId: vehicle.customerId, ...values,
    })
  }

  // only one current policy per vehicle
  await db().update(insurancePolicies).set({ isCurrent: false, updatedAt: new Date() })
    .where(and(
      eq(insurancePolicies.vehicleId, d.vehicleId),
      eq(insurancePolicies.garageId, d.garageId),
      eq(insurancePolicies.isCurrent, true),
      sql`${insurancePolicies.id} <> ${policyId}`,
    ))

  // refresh the insurance due item: complete stale open items, schedule from end_date
  await db().update(dueItems).set({
    status: "completed", completedAt: new Date(), updatedAt: new Date(),
  }).where(and(
    eq(dueItems.garageId, d.garageId),
    eq(dueItems.vehicleId, d.vehicleId),
    eq(dueItems.type, "insurance"),
    inArray(dueItems.status, ["scheduled", "due_soon", "due", "overdue"]),
  ))
  await db().insert(dueItems).values({
    garageId: d.garageId,
    vehicleId: d.vehicleId,
    customerId: vehicle.customerId,
    type: "insurance",
    title: `Insurance renewal — ${d.insurerName}`,
    dueDate: d.endDate,
    effectiveDueDate: d.endDate,
    status: "scheduled",
    sourceType: "insurance_policy",
    sourceId: policyId,
  })

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId,
    action: policyId ? "insurance_policy.update" : "insurance_policy.create",
    entityType: "insurance_policy", entityId: policyId!,
    after: { insurerName: d.insurerName, endDate: d.endDate, policyType: d.policyType },
  })
  return { ok: true, data: { policyId: policyId! } }
}

export async function deleteInsurancePolicy(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({ garageId: z.string().uuid(), policyId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const { garageId, policyId } = parsed.data

  const ctx = await requireMembership(userId, garageId)
  if (!ctx || !can(ctx.principal, "vehicles.update")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }
  }
  const [p] = await db().select().from(insurancePolicies)
    .where(and(eq(insurancePolicies.id, policyId), eq(insurancePolicies.garageId, garageId))).limit(1)
  if (!p) return { ok: false, error: { code: "NOT_FOUND", message: "Policy not found" } }

  await db().delete(insurancePolicies).where(eq(insurancePolicies.id, policyId))
  await db().update(dueItems).set({ status: "dismissed", dismissedReason: "policy deleted", updatedAt: new Date() })
    .where(and(eq(dueItems.sourceType, "insurance_policy"), eq(dueItems.sourceId, policyId)))

  await writeAuditLog({
    garageId, actorUserId: userId, action: "insurance_policy.delete",
    entityType: "insurance_policy", entityId: policyId,
    before: { insurerName: p.insurerName, endDate: p.endDate },
  })
  return { ok: true, data: { ok: true as const } }
}

/** Policies for a vehicle (staff view). */
export async function listVehicleInsurance(rawInput: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const }
  const parsed = z.object({ garageId: z.string().uuid(), vehicleId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }
  const ctx = await requireMembership(userId, parsed.data.garageId)
  if (!ctx || !can(ctx.principal, "vehicles.view")) return { ok: false as const }

  const rows = await db().select({
    id: insurancePolicies.id, insurerName: insurancePolicies.insurerName,
    partnerId: insurancePolicies.partnerId, partnerName: insurancePartners.name,
    policyType: insurancePolicies.policyType, policyNumber: insurancePolicies.policyNumber,
    stickerNumber: insurancePolicies.stickerNumber, startDate: insurancePolicies.startDate,
    endDate: insurancePolicies.endDate, premium: insurancePolicies.premium,
    isCurrent: insurancePolicies.isCurrent,
  }).from(insurancePolicies)
    .leftJoin(insurancePartners, eq(insurancePolicies.partnerId, insurancePartners.id))
    .where(and(eq(insurancePolicies.vehicleId, parsed.data.vehicleId), eq(insurancePolicies.garageId, parsed.data.garageId)))
    .orderBy(desc(insurancePolicies.endDate)).limit(20)

  return {
    ok: true as const,
    data: rows.map((r) => ({ ...r, premium: r.premium != null ? Number(r.premium) : null })),
  }
}
