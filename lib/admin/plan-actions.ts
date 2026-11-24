"use server"
import { z } from "zod"
import { and, asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { plans, users } from "@/lib/db/schema"
import { writeAuditLog, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import type { PlanAudience } from "@/lib/billing/account"

const AUDIENCES = ["garage", "driver", "vendor", "broker", "tow", "rider"] as const

async function requirePlatformAdmin(userId: string) {
  const [u] = await db().select({ isPlatformAdmin: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)).limit(1)
  return u?.isPlatformAdmin === true
}

/** All plans grouped for the admin console, every audience. */
export async function adminListAllPlans() {
  const userId = await getSessionUserId()
  if (!userId || !(await requirePlatformAdmin(userId))) return { ok: false as const }
  const rows = await db()
    .select()
    .from(plans)
    .orderBy(asc(plans.audience), asc(plans.priceMonthly), asc(plans.name))
  return {
    ok: true as const,
    data: rows.map((p) => ({
      ...p,
      priceMonthly: Number(p.priceMonthly),
      priceGhs: Number(p.priceMonthly) / 100,
    })),
  }
}

const planSchema = z.object({
  planId: z.string().uuid().optional(),
  code: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_-]+$/, "lowercase letters, numbers, - and _ only"),
  name: z.string().min(2).max(80),
  audience: z.enum(AUDIENCES),
  tagline: z.string().max(140).optional().or(z.literal("")),
  priceGhs: z.number().min(0).max(1_000_000),
  maxBranches: z.number().int().min(0).max(1000).nullable().optional(),
  maxStaff: z.number().int().min(0).max(10000).nullable().optional(),
  messageAllowance: z.number().int().min(0).max(1_000_000),
  features: z.array(z.string().min(1).max(60)).max(40),
  isActive: z.boolean().default(true),
})

/** Create or update a subscription plan (price in GHS, stored as pesewas). */
export async function adminUpsertPlan(rawInput: unknown): Promise<ActionResult<{ planId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in" } }
  if (!(await requirePlatformAdmin(userId))) return { ok: false, error: { code: "FORBIDDEN", message: "Platform admin only" } }
  const parsed = planSchema.safeParse(rawInput)
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: "Check the fields", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> } }
  }
  const d = parsed.data

  const pricePesewas = BigInt(Math.round(d.priceGhs * 100))

  if (d.planId) {
    const [existing] = await db().select({ id: plans.id }).from(plans).where(eq(plans.id, d.planId)).limit(1)
    if (!existing) return { ok: false, error: { code: "NOT_FOUND", message: "Plan not found" } }
    // Code is immutable once plans exist — subscriptions reference plans by id,
    // but code is the public handle used at signup.
    await db()
      .update(plans)
      .set({
        name: d.name,
        tagline: d.tagline || null,
        priceMonthly: pricePesewas,
        maxBranches: d.maxBranches ?? null,
        maxStaff: d.maxStaff ?? null,
        messageAllowance: d.messageAllowance,
        features: d.features,
        isActive: d.isActive,
        updatedAt: new Date(),
      })
      .where(eq(plans.id, d.planId))
    await writeAuditLog({
      garageId: null, actorUserId: userId, action: "admin.plan.update",
      entityType: "plan", entityId: d.planId, after: { code: d.code, audience: d.audience, priceGhs: d.priceGhs },
    })
    return { ok: true, data: { planId: d.planId } }
  }

  const [clash] = await db().select({ id: plans.id }).from(plans).where(eq(plans.code, d.code)).limit(1)
  if (clash) return { ok: false, error: { code: "CONFLICT", message: `Plan code "${d.code}" is already used` } }

  const [created] = await db()
    .insert(plans)
    .values({
      code: d.code,
      name: d.name,
      audience: d.audience as PlanAudience,
      tagline: d.tagline || null,
      priceMonthly: pricePesewas,
      maxBranches: d.maxBranches ?? null,
      maxStaff: d.maxStaff ?? null,
      messageAllowance: d.messageAllowance,
      features: d.features,
      isActive: d.isActive,
    })
    .returning({ id: plans.id })
  if (!created) return { ok: false, error: { code: "INTERNAL", message: "Could not create plan" } }

  await writeAuditLog({
    garageId: null, actorUserId: userId, action: "admin.plan.create",
    entityType: "plan", entityId: created.id, after: { code: d.code, audience: d.audience, priceGhs: d.priceGhs },
  })
  return { ok: true, data: { planId: created.id } }
}
