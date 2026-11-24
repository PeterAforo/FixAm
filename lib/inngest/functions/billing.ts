import { and, eq, isNull, lt, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { accountSubscriptions, garages, plans, subscriptions } from "@/lib/db/schema"
import { sendDirectSms, appUrl } from "@/lib/messaging/direct"
import { resolveOwnerContact, type BillingOwner } from "@/lib/billing/owners"
import { inngest } from "../client"

const DAY = 86_400_000
const REMIND_BEFORE_MS = 3 * DAY

async function remind(owner: BillingOwner, planName: string, priceGhs: number, phase: "ending" | "due") {
  const contact = await resolveOwnerContact(owner)
  if (!contact.phone) return
  const when = phase === "ending" ? "your trial ends soon" : "your trial has ended"
  const price = priceGhs > 0 ? ` It is GH₵${priceGhs.toFixed(2)}/month after that.` : ""
  await sendDirectSms(
    contact.phone,
    phase === "ending" ? "subscription_trial_ending" : "subscription_payment_due",
    {
      plan: planName,
      detail: `${when}.${price}`,
      link: appUrl(contact.returnPath),
    }
  )
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
      return db().update(accountSubscriptions).set({ status: "past_due", updatedAt: now })
        .where(and(eq(accountSubscriptions.status, "trialing"), lt(accountSubscriptions.trialEndsAt, now)))
    })
    const acctCancelled = await step.run("acct-cancel-lapsed", async () => {
      const cutoff = new Date(now.getTime() - 30 * DAY)
      return db().update(accountSubscriptions).set({ status: "cancelled", updatedAt: now })
        .where(and(eq(accountSubscriptions.status, "past_due"), lt(accountSubscriptions.currentPeriodEnd, cutoff)))
    })

    // --- reminders ---------------------------------------------------------
    const reminded = await step.run("trial-reminders", async () => {
      const horizon = new Date(now.getTime() + REMIND_BEFORE_MS)
      let sent = 0

      const garageRows = await db()
        .select({
          garageId: subscriptions.garageId,
          trialEndsAt: subscriptions.trialEndsAt,
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

      // Garage trialing subs ending within the window
      const gEnding = garageRows.filter((g) => g.status === "trialing" && g.trialEndsAt && g.trialEndsAt > now && g.trialEndsAt <= horizon)
      for (const g of gEnding) {
        await remind({ kind: "garage", garageId: g.garageId }, g.planName, Number(g.priceMonthly) / 100, "ending")
        sent++
      }
      // Garage subs whose trial just ended (past_due within last 24h of trial end)
      const gDue = garageRows.filter((g) => {
        if (g.status !== "past_due" || !g.trialEndsAt) return false
        const endedAgo = now.getTime() - g.trialEndsAt.getTime()
        return endedAgo >= 0 && endedAgo <= DAY
      })
      for (const g of gDue) {
        await remind({ kind: "garage", garageId: g.garageId }, g.planName, Number(g.priceMonthly) / 100, "due")
        sent++
      }

      // Account subscriptions
      const acctRows = await db()
        .select({
          ownerKind: accountSubscriptions.ownerKind,
          ownerId: accountSubscriptions.ownerId,
          trialEndsAt: accountSubscriptions.trialEndsAt,
          currentPeriodEnd: accountSubscriptions.currentPeriodEnd,
          status: accountSubscriptions.status,
          planName: plans.name,
          priceMonthly: plans.priceMonthly,
        })
        .from(accountSubscriptions)
        .innerJoin(plans, eq(accountSubscriptions.planId, plans.id))
        .where(and(eq(accountSubscriptions.isComplimentary, false), sql`${accountSubscriptions.status} in ('trialing','past_due')`))

      for (const a of acctRows) {
        const owner: BillingOwner = { kind: a.ownerKind as never, ownerId: a.ownerId }
        if (a.status === "trialing" && a.trialEndsAt && a.trialEndsAt > now && a.trialEndsAt <= horizon) {
          await remind(owner, a.planName, Number(a.priceMonthly) / 100, "ending")
          sent++
        } else if (a.status === "past_due" && a.trialEndsAt) {
          const endedAgo = now.getTime() - a.trialEndsAt.getTime()
          if (endedAgo >= 0 && endedAgo <= DAY) {
            await remind(owner, a.planName, Number(a.priceMonthly) / 100, "due")
            sent++
          }
        }
      }
      return sent
    })

    return { toPastDue, trialsEnded, toCancelled, acctPastDue, acctTrialsEnded, acctCancelled, reminded }
  }
)
