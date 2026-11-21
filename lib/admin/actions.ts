"use server"
import { z } from "zod"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  garages, insurancePartners, memberships,
  messageUsage, plans, renewalRequests, subscriptions, users,
} from "@/lib/db/schema"
import { writeAuditLog, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { setImpersonation, clearImpersonation } from "./impersonation"

async function requirePlatformAdmin(userId: string) {
  const [u] = await db().select({ isPlatformAdmin: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)).limit(1)
  return u?.isPlatformAdmin === true
}

// ---------------------------------------------------------------------------
// Garages
// ---------------------------------------------------------------------------

export async function adminListGarages() {
  const userId = await getSessionUserId()
  if (!userId || !(await requirePlatformAdmin(userId))) return { ok: false as const }

  const rows = await db()
    .select({
      id: garages.id, name: garages.name, slug: garages.slug, status: garages.status,
      createdAt: garages.createdAt,
      planCode: plans.code, planName: plans.name,
      subStatus: subscriptions.status, isComplimentary: subscriptions.isComplimentary,
      staffCount: sql<number>`(select count(*)::int from memberships m where m.garage_id = ${garages.id} and m.status = 'active')`,
      branchCount: sql<number>`(select count(*)::int from branches b where b.garage_id = ${garages.id} and b.deleted_at is null)`,
    })
    .from(garages)
    .leftJoin(subscriptions, eq(subscriptions.garageId, garages.id))
    .leftJoin(plans, eq(subscriptions.planId, plans.id))
    .where(isNull(garages.deletedAt))
    .orderBy(desc(garages.createdAt))
    .limit(300)

  return { ok: true as const, data: rows }
}

export async function adminSetGarageStatus(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in" } }
  if (!(await requirePlatformAdmin(userId))) return { ok: false, error: { code: "FORBIDDEN", message: "Platform admin only" } }
  const parsed = z.object({ garageId: z.string().uuid(), status: z.enum(["active", "suspended"]) }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }

  const [g] = await db().select().from(garages).where(eq(garages.id, parsed.data.garageId)).limit(1)
  if (!g) return { ok: false, error: { code: "NOT_FOUND", message: "Garage not found" } }
  await db().update(garages).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(garages.id, g.id))
  await writeAuditLog({
    garageId: g.id, actorUserId: userId, action: `garage.${parsed.data.status === "suspended" ? "suspend" : "activate"}`,
    entityType: "garage", entityId: g.id, before: { status: g.status }, after: { status: parsed.data.status },
  })
  return { ok: true, data: { ok: true as const } }
}

// ---------------------------------------------------------------------------
// Impersonation
// ---------------------------------------------------------------------------

export async function startImpersonation(rawInput: unknown): Promise<ActionResult<{ garageSlug: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in" } }
  if (!(await requirePlatformAdmin(userId))) return { ok: false, error: { code: "FORBIDDEN", message: "Platform admin only" } }
  const parsed = z.object({ garageId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }

  const [g] = await db().select({ id: garages.id, slug: garages.slug }).from(garages).where(eq(garages.id, parsed.data.garageId)).limit(1)
  if (!g) return { ok: false, error: { code: "NOT_FOUND", message: "Garage not found" } }
  await setImpersonation(userId, g.id)
  await writeAuditLog({
    garageId: g.id, actorUserId: userId, action: "admin.impersonate_start",
    entityType: "garage", entityId: g.id, after: { adminId: userId },
  })
  return { ok: true, data: { garageSlug: g.slug } }
}

export async function stopImpersonation(): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in" } }
  await clearImpersonation()
  await writeAuditLog({ garageId: null, actorUserId: userId, action: "admin.impersonate_stop", entityType: "admin" })
  return { ok: true, data: { ok: true as const } }
}

// ---------------------------------------------------------------------------
// Insurance partners (platform directory)
// ---------------------------------------------------------------------------

export async function adminListInsurancePartners() {
  const userId = await getSessionUserId()
  if (!userId || !(await requirePlatformAdmin(userId))) return { ok: false as const }
  const rows = await db().select().from(insurancePartners).orderBy(insurancePartners.name)
  return { ok: true as const, data: rows }
}

export async function adminUpsertInsurancePartner(rawInput: unknown): Promise<ActionResult<{ partnerId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in" } }
  if (!(await requirePlatformAdmin(userId))) return { ok: false, error: { code: "FORBIDDEN", message: "Platform admin only" } }
  const parsed = z.object({
    partnerId: z.string().uuid().optional(),
    name: z.string().min(1).max(120),
    nicLicenceNumber: z.string().max(60).optional().or(z.literal("")),
    contactName: z.string().max(120).optional().or(z.literal("")),
    contactPhone: z.string().max(30).optional().or(z.literal("")),
    contactEmail: z.string().email().optional().or(z.literal("")),
    isActive: z.boolean().default(true),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Check the fields" } }
  const d = parsed.data

  const values = {
    name: d.name,
    nicLicenceNumber: d.nicLicenceNumber || null,
    contactName: d.contactName || null,
    contactPhone: d.contactPhone || null,
    contactEmail: d.contactEmail || null,
    isActive: d.isActive,
    updatedAt: new Date(),
  }
  let partnerId = d.partnerId
  if (partnerId) {
    await db().update(insurancePartners).set(values).where(eq(insurancePartners.id, partnerId))
  } else {
    partnerId = crypto.randomUUID()
    await db().insert(insurancePartners).values({ id: partnerId, ...values })
  }
  await writeAuditLog({ garageId: null, actorUserId: userId, action: "admin.insurance_partner.upsert", entityType: "insurance_partner", entityId: partnerId, after: { name: d.name } })
  return { ok: true, data: { partnerId } }
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export async function adminAnalytics() {
  const userId = await getSessionUserId()
  if (!userId || !(await requirePlatformAdmin(userId))) return { ok: false as const }

  const [garageCount] = await db().select({ n: sql<number>`count(*)::int` }).from(garages).where(and(isNull(garages.deletedAt), eq(garages.status, "active")))
  const [subRows] = await db().select({
    mrr: sql<number>`coalesce(sum(${plans.priceMonthly}),0)::bigint`,
    activeSubs: sql<number>`count(*) filter (where ${subscriptions.status} = 'active')::int`,
    pastDue: sql<number>`count(*) filter (where ${subscriptions.status} = 'past_due')::int`,
    trialing: sql<number>`count(*) filter (where ${subscriptions.status} = 'trialing')::int`,
    cancelled: sql<number>`count(*) filter (where ${subscriptions.status} = 'cancelled')::int`,
  }).from(subscriptions).innerJoin(plans, eq(subscriptions.planId, plans.id))
  const [usage] = await db().select({
    used: sql<number>`coalesce(sum(${messageUsage.usedUnits}),0)::int`,
    allowance: sql<number>`coalesce(sum(${messageUsage.allowance} + coalesce(${messageUsage.addonUnits},0)),0)::int`,
  }).from(messageUsage)
  const [renewalStats] = await db().select({
    total: sql<number>`count(*)::int`,
    completed: sql<number>`count(*) filter (where ${renewalRequests.status} = 'completed')::int`,
  }).from(renewalRequests)
  const [memberCount] = await db().select({ n: sql<number>`count(*)::int` }).from(memberships).where(eq(memberships.status, "active"))

  return {
    ok: true as const,
    data: {
      activeGarages: garageCount?.n ?? 0,
      mrrPesewas: Number(subRows?.mrr ?? 0),
      activeSubs: subRows?.activeSubs ?? 0,
      pastDue: subRows?.pastDue ?? 0,
      trialing: subRows?.trialing ?? 0,
      cancelled: subRows?.cancelled ?? 0,
      messagesUsed: usage?.used ?? 0,
      messagesAllowance: usage?.allowance ?? 0,
      renewalsTotal: renewalStats?.total ?? 0,
      renewalsCompleted: renewalStats?.completed ?? 0,
      activeMembers: memberCount?.n ?? 0,
    },
  }
}
