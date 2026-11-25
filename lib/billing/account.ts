import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountSubscriptions, plans, type planAudienceEnum } from "@/lib/db/schema";
import { accessState, type AccessState, type GarageBilling } from "./core";

export type PlanAudience = (typeof planAudienceEnum.enumValues)[number];

export const NON_GARAGE_AUDIENCES = ["driver", "vendor", "broker", "tow", "rider"] as const;
export type AccountOwnerKind = (typeof NON_GARAGE_AUDIENCES)[number];

const TRIAL_DAYS = 14;
const DAY = 86_400_000;

export type AccountBilling = GarageBilling & { ownerKind: AccountOwnerKind; ownerId: string };

/** A drizzle db handle or an open transaction — lets signups create the
 *  workspace row and its trial subscription atomically. */
export type DbOrTx = Pick<ReturnType<typeof db>, "select" | "insert">;

/** Plans an audience can pick from (active only, cheapest first). */
export async function listAudiencePlans(audience: PlanAudience) {
  const rows = await db()
    .select({
      id: plans.id,
      code: plans.code,
      name: plans.name,
      tagline: plans.tagline,
      priceMonthly: plans.priceMonthly,
      maxBranches: plans.maxBranches,
      maxStaff: plans.maxStaff,
      messageAllowance: plans.messageAllowance,
      features: plans.features,
    })
    .from(plans)
    .where(and(eq(plans.audience, audience), eq(plans.isActive, true)))
    .orderBy(plans.priceMonthly);
  return rows.map((p) => ({ ...p, priceMonthly: Number(p.priceMonthly) }));
}

/**
 * Resolve which plan a signup should use: the requested code when it's an
 * active plan for that audience, otherwise the cheapest active plan.
 * Returns null when the audience has no active plans at all.
 */
export async function resolvePlanCode(
  audience: PlanAudience,
  planCode?: string | null,
): Promise<string | null> {
  if (planCode) {
    const [p] = await db()
      .select({ code: plans.code })
      .from(plans)
      .where(and(eq(plans.code, planCode), eq(plans.audience, audience), eq(plans.isActive, true)))
      .limit(1);
    if (p) return p.code;
  }
  const [p] = await db()
    .select({ code: plans.code })
    .from(plans)
    .where(and(eq(plans.audience, audience), eq(plans.isActive, true)))
    .orderBy(plans.priceMonthly)
    .limit(1);
  return p?.code ?? null;
}

/** Current subscription for a workspace owner, or null. */
export async function accountBilling(
  ownerKind: AccountOwnerKind,
  ownerId: string,
): Promise<AccountBilling | null> {
  const [row] = await db()
    .select({
      ownerId: accountSubscriptions.ownerId,
      planCode: plans.code,
      planName: plans.name,
      features: plans.features,
      maxStaff: plans.maxStaff,
      maxBranches: plans.maxBranches,
      status: accountSubscriptions.status,
      isComplimentary: accountSubscriptions.isComplimentary,
      priceMonthly: plans.priceMonthly,
      trialEndsAt: accountSubscriptions.trialEndsAt,
      currentPeriodEnd: accountSubscriptions.currentPeriodEnd,
    })
    .from(accountSubscriptions)
    .innerJoin(plans, eq(accountSubscriptions.planId, plans.id))
    .where(
      and(eq(accountSubscriptions.ownerKind, ownerKind), eq(accountSubscriptions.ownerId, ownerId)),
    )
    .limit(1);
  if (!row) return null;
  return {
    ownerKind,
    ownerId: row.ownerId,
    planCode: row.planCode,
    planName: row.planName,
    features: row.features ?? [],
    maxStaff: row.maxStaff,
    maxBranches: row.maxBranches,
    status: row.status,
    isComplimentary: row.isComplimentary ?? false,
    trialEndsAt: row.trialEndsAt,
    currentPeriodEnd: row.currentPeriodEnd,
    isFreePlan: Number(row.priceMonthly ?? 0) <= 0,
  };
}

/**
 * Create the trialing subscription for a new workspace. planCode is looked up
 * within the owner's audience so a vendor can't subscribe to a garage plan.
 */
export async function createTrialSubscription(
  input: {
    ownerKind: AccountOwnerKind;
    ownerId: string;
    planCode: string;
    isComplimentary?: boolean;
  },
  executor: DbOrTx = db(),
) {
  const [plan] = await executor
    .select({ id: plans.id })
    .from(plans)
    .where(
      and(
        eq(plans.code, input.planCode),
        eq(plans.audience, input.ownerKind),
        eq(plans.isActive, true),
      ),
    )
    .limit(1);
  if (!plan) throw new Error(`No active ${input.ownerKind} plan "${input.planCode}"`);

  const trialEnd = new Date(Date.now() + TRIAL_DAYS * DAY);
  await executor
    .insert(accountSubscriptions)
    .values({
      ownerKind: input.ownerKind,
      ownerId: input.ownerId,
      planId: plan.id,
      status: "trialing",
      trialEndsAt: trialEnd,
      currentPeriodStart: new Date(),
      currentPeriodEnd: trialEnd,
      isComplimentary: input.isComplimentary ?? false,
    })
    .onConflictDoNothing({
      target: [accountSubscriptions.ownerKind, accountSubscriptions.ownerId],
    });
}

/** Access state for a workspace owner (same rules as garage billing). */
export async function accountAccessState(
  ownerKind: AccountOwnerKind,
  ownerId: string,
): Promise<{ state: AccessState; reason: string | null }> {
  return accessState(await accountBilling(ownerKind, ownerId));
}

/** Error message when the workspace is read-only, else null. */
export async function accountWriteBlockReason(
  ownerKind: AccountOwnerKind,
  ownerId: string,
): Promise<string | null> {
  const { state, reason } = await accountAccessState(ownerKind, ownerId);
  if (state !== "readonly") return null;
  return `This account is read-only (${reason}) — renew your subscription to continue`;
}
