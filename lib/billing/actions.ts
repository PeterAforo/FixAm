"use server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { garages, plans, subscriptions, users } from "@/lib/db/schema";
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions";
import { getSessionUserId } from "@/lib/auth/ensure-user";
import { can, type StaffRole } from "@/lib/auth/permissions";
import { garageBilling, accessState } from "./core";

async function requireOwner(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId);
  if (!m) return null;
  const principal = {
    kind: "staff" as const,
    role: m.role as StaffRole,
    garageId,
    branchId: m.branchId,
  };
  if (!can(principal, "garage.subscription.manage")) return null;
  return { membership: m, principal };
}

/** All active plans for the plan picker. */
export async function listPlans() {
  const rows = await db()
    .select({
      id: plans.id,
      code: plans.code,
      name: plans.name,
      priceMonthly: plans.priceMonthly,
      maxBranches: plans.maxBranches,
      maxStaff: plans.maxStaff,
      messageAllowance: plans.messageAllowance,
      features: plans.features,
    })
    .from(plans)
    .where(and(eq(plans.isActive, true), eq(plans.audience, "garage")))
    .orderBy(plans.priceMonthly);
  return rows.map((p) => ({ ...p, priceMonthly: Number(p.priceMonthly) }));
}

/** Current subscription + access state for the settings page. */
export async function getGarageBilling(rawInput: unknown) {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false as const };
  const parsed = z.object({ garageId: z.string().uuid() }).safeParse(rawInput);
  if (!parsed.success) return { ok: false as const };
  const ctx = await requireOwner(userId, parsed.data.garageId);
  if (!ctx) return { ok: false as const };

  const b = await garageBilling(parsed.data.garageId);
  if (!b) return { ok: true as const, data: null };
  const { state, reason } = accessState(b);
  const allPlans = await listPlans();
  return {
    ok: true as const,
    data: {
      planCode: b.planCode,
      planName: b.planName,
      features: b.features,
      maxStaff: b.maxStaff,
      maxBranches: b.maxBranches,
      status: b.status,
      isComplimentary: b.isComplimentary,
      trialEndsAt: b.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: b.currentPeriodEnd?.toISOString() ?? null,
      accessState: state,
      accessReason: reason,
      currentPlan: allPlans.find((p) => p.code === b.planCode) ?? null,
      plans: allPlans,
    },
  };
}

/**
 * Change the garage's plan (upgrade/downgrade). Applies immediately; the
 * billing panel then sends the owner to theTeller checkout for the new
 * plan's monthly price (skipped for complimentary pilot subs).
 */
export async function changePlan(rawInput: unknown): Promise<ActionResult<{ planCode: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } };
  const parsed = z
    .object({ garageId: z.string().uuid(), planCode: z.string().min(1).max(40) })
    .safeParse(rawInput);
  if (!parsed.success)
    return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } };
  const { garageId, planCode } = parsed.data;

  const ctx = await requireOwner(userId, garageId);
  if (!ctx)
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "Only the owner can change the plan" },
    };

  const [plan] = await db()
    .select()
    .from(plans)
    .where(and(eq(plans.code, planCode), eq(plans.audience, "garage"), eq(plans.isActive, true)))
    .limit(1);
  if (!plan) return { ok: false, error: { code: "NOT_FOUND", message: "Plan not found" } };

  const [sub] = await db()
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.garageId, garageId))
    .limit(1);
  if (!sub) return { ok: false, error: { code: "NOT_FOUND", message: "No subscription" } };
  if (sub.planId === plan.id) return { ok: true, data: { planCode } };

  const periodEnd = new Date(Date.now() + 30 * 86_400_000);
  await db()
    .update(subscriptions)
    .set({
      planId: plan.id,
      status: sub.isComplimentary ? sub.status : "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, sub.id));

  await writeAuditLog({
    garageId,
    actorUserId: userId,
    action: "subscription.plan_change",
    entityType: "subscription",
    entityId: sub.id,
    before: { planId: sub.planId },
    after: { planId: plan.id, planCode },
  });
  return { ok: true, data: { planCode } };
}

/** Platform admin: list garages with subscription state for the admin console. */
export async function adminListGarageBilling() {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false as const };
  const [me] = await db()
    .select({ isPlatformAdmin: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!me?.isPlatformAdmin) return { ok: false as const };

  const rows = await db()
    .select({
      garageId: subscriptions.garageId,
      garageName: garages.name,
      status: subscriptions.status,
      isComplimentary: subscriptions.isComplimentary,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      planCode: plans.code,
      planName: plans.name,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .innerJoin(garages, eq(subscriptions.garageId, garages.id))
    .limit(500);

  return { ok: true as const, data: rows };
}
