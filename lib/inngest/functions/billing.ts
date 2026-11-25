import { and, eq, gte, isNull, lt, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { accountSubscriptions, garages, jobs, payments, plans, subscriptions } from "@/lib/db/schema"
import { sendDirectSms, appUrl } from "@/lib/messaging/direct"
import { resolveOwnerContact, type BillingOwner } from "@/lib/billing/owners"
import { reminderDetail, reminderStage, type ReminderStage } from "@/lib/billing/trial-schedule"
import { inngest } from "../client"

const DAY = 86_400_000
const TEMPLATE: Record<ReminderStage, string> = {
  midway: "subscription_trial_ending",
  ending: "subscription_trial_ending",
  last_day: "subscription_trial_ending",
  ended: "subscription_payment_due",
  grace_last: "subscription_payment_due",
}

async function remind(owner: BillingOwner, planName: string, priceGhs: number, stage: ReminderStage, stats?: string) {
  const contact = await resolveOwnerContact(owner)
  if (!contact.phone) return
  await sendDirectSms(contact.phone, TEMPLATE[stage], {
    plan: planName,
    detail: reminderDetail(stage, planName, priceGhs, stats),
    link: appUrl(contact.returnPath),
  })
}

/** "23 jobs and GH₵4,860 collected" since the trial started, for the midway nudge. */
async function garageTrialStats(garageId: string, since: Date): Promise<string | undefined> {
  const [j] = await db().select({ n: sql<number>`count(*)::int` }).from(jobs)
    .where(and(eq(jobs.garageId, garageId), gte(jobs.createdAt, since)))
  const [p] = await db().select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)::text` }).from(payments)
    .where(and(eq(payments.garageId, garageId), eq(payments.status, "succeeded"), gte(payments.createdAt, since)))
  const nJobs = j?.n ?? 0
  const ghs = Number(p?.total ?? 0) / 100
  if (nJobs === 0 && ghs === 0) return undefined
  const money = ghs > 0 ? ` and GH₵${ghs.toLocaleString("en-GH", { maximumFractionDigits: 0 })} collected` : ""
  return `${nJobs} job${nJobs === 1 ? "" : "s"}${money} so far`
}

/**
 * billing-sweep — daily:
 *  - active subscriptions whose period ended → past_due (7-day grace then read-only)
 *  - trialing subscriptions past trial end → past_due so grace/read-only applies
 *  - past_due subscriptions unpaid for > 30 days → cancelled
 *  - trial-ending / payment-due SMS reminders for garage + account subscriptions
 */
export const billingSweep = inngest.createFunction(
  {
    id: "billing-sweep",
    retries: 1,
    triggers: [{ cron: "0 3 * * *" }],
  },
  async ({ step }) => {
    const now = new Date()

    const toPastDue = await step.run("mark-past-due", async () => {
      const r = await db().update(subscriptions).set({ status: "past_due", updatedAt: now })
        .where(and(
          eq(subscriptions.status, "active"),
          lt(subscriptions.currentPeriodEnd, now),
        ))
      return r
    })

    const trialsEnded = await step.run("end-trials", async () => {
      // Garages an admin made free carry on as active; everyone else must pay (7-day grace, then read-only).
      await db().update(subscriptions).set({ status: "active", updatedAt: now })
        .where(and(eq(subscriptions.status, "trialing"), lt(subscriptions.trialEndsAt, now), eq(subscriptions.isComplimentary, true)))
      const r = await db().update(subscriptions).set({ status: "past_due", updatedAt: now })
        .where(and(
          eq(subscriptions.status, "trialing"),
          lt(subscriptions.trialEndsAt, now),
        ))
      return r
    })

    const toCancelled = await step.run("cancel-lapsed", async () => {
      const cutoff = new Date(now.getTime() - 30 * DAY)
      const r = await db().update(subscriptions).set({ status: "cancelled", updatedAt: now })
        .where(and(
          eq(subscriptions.status, "past_due"),
          lt(subscriptions.currentPeriodEnd, cutoff),
        ))
      return r
    })

    // --- account_subscriptions (driver, vendor, broker, tow, rider) ---------
    const acctPastDue = await step.run("acct-mark-past-due", async () => {
      return db().update(accountSubscriptions).set({ status: "past_due", updatedAt: now })
        .where(and(eq(accountSubscriptions.status, "active"), lt(accountSubscriptions.currentPeriodEnd, now)))
    })
    const acctTrialsEnded = await step.run("acct-end-trials", async () => {
      // Free entry plans (driver, seller, broker, tow, rider) simply stay on.
      await db().update(accountSubscriptions).set({ status: "active", updatedAt: now })
        .where(and(
          eq(accountSubscriptions.status, "trialing"),
          lt(accountSubscriptions.trialEndsAt, now),
          sql`(${accountSubscriptions.isComplimentary} or ${accountSubscriptions.planId} in (select id from plans where price_monthly <= 0))`,
        ))
      return db().update(accountSubscriptions).set({ status: "past_due", updatedAt: now })
        .where(and(eq(accountSubscriptions.status, "trialing"), lt(accountSubscriptions.trialEndsAt, now)))
    })
    const acctCancelled = await step.run("acct-cancel-lapsed", async () => {
      const cutoff = new Date(now.getTime() - 30 * DAY)
      return db().update(accountSubscriptions).set({ status: "cancelled", updatedAt: now })
        .where(and(eq(accountSubscriptions.status, "past_due"), lt(accountSubscriptions.currentPeriodEnd, cutoff)))
    })

    // --- reminders: day 7, 2 days left, last day, trial ended, 2 days before read-only
    const reminded = await step.run("trial-reminders", async () => {
      let sent = 0

      const garageRows = await db()
        .select({
          garageId: subscriptions.garageId,
          trialEndsAt: subscriptions.trialEndsAt,
          createdAt: subscriptions.createdAt,
          planName: plans.name,
          priceMonthly: plans.priceMonthly,
          status: subscriptions.status,
        })
        .from(subscriptions)
        .innerJoin(plans, eq(subscriptions.planId, plans.id))
        .innerJoin(garages, eq(subscriptions.garageId, garages.id))
        .where(
          and(
            eq(subscriptions.isComplimentary, false),
            sql`${subscriptions.status} in ('trialing','past_due')`,
            isNull(garages.deletedAt),
          )
        )

      for (const g of garageRows) {
        const stage = reminderStage(g.status, g.trialEndsAt, now)
        if (!stage) continue
        const stats = stage === "midway" ? await garageTrialStats(g.garageId, g.createdAt).catch(() => undefined) : undefined
        await remind({ kind: "garage", garageId: g.garageId }, g.planName, Number(g.priceMonthly) / 100, stage, stats)
        sent++
      }

      // Account subscriptions on paid plans (Seller Pro, Broker Pro…)
      const acctRows = await db()
        .select({
          ownerKind: accountSubscriptions.ownerKind,
          ownerId: accountSubscriptions.ownerId,
          trialEndsAt: accountSubscriptions.trialEndsAt,
          status: accountSubscriptions.status,
          planName: plans.name,
          priceMonthly: plans.priceMonthly,
        })
        .from(accountSubscriptions)
        .innerJoin(plans, eq(accountSubscriptions.planId, plans.id))
        .where(and(
          eq(accountSubscriptions.isComplimentary, false),
          sql`${accountSubscriptions.status} in ('trialing','past_due')`,
          sql`${plans.priceMonthly} > 0`,
        ))

      for (const a of acctRows) {
        const stage = reminderStage(a.status, a.trialEndsAt, now)
        if (!stage || stage === "midway") continue
        const owner: BillingOwner = { kind: a.ownerKind as never, ownerId: a.ownerId }
        await remind(owner, a.planName, Number(a.priceMonthly) / 100, stage)
        sent++
      }
      return sent
    })

    return { toPastDue, trialsEnded, toCancelled, acctPastDue, acctTrialsEnded, acctCancelled, reminded }
  }
)
