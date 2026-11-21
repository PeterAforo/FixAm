import { and, eq, lt } from "drizzle-orm"
import { db } from "@/lib/db"
import { subscriptions } from "@/lib/db/schema"
import { inngest } from "../client"

/**
 * billing-sweep — daily:
 *  - active subscriptions whose period ended → past_due (7-day grace then read-only)
 *  - trialing subscriptions past trial end → past_due so grace/read-only applies
 *  - past_due subscriptions unpaid for > 30 days → cancelled
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
      const cutoff = new Date(now.getTime() - 30 * 86_400_000)
      const r = await db().update(subscriptions).set({ status: "cancelled", updatedAt: now })
        .where(and(
          eq(subscriptions.status, "past_due"),
          lt(subscriptions.currentPeriodEnd, cutoff),
        ))
      return r
    })

    return { toPastDue, trialsEnded, toCancelled }
  }
)
