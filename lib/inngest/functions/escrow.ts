import { autoReleaseDue, pendingReferences, processPayout, reconcileReference, sweepPayouts } from "@/lib/escrow/service"
import { inngest } from "../client"

/**
 * theTeller sends no webhooks, so pending collections are confirmed here
 * (the redirect handler covers the happy path).
 */
export const paymentsPendingPoller = inngest.createFunction(
  { id: "payments-pending-poller", retries: 1, concurrency: { limit: 1 }, triggers: [{ cron: "*/5 * * * *" }] },
  async ({ step }) => {
    const refs = await step.run("list-pending", () => pendingReferences(100))
    const results: Record<string, string> = {}
    for (const ref of refs) {
      results[ref] = await step.run(`reconcile-${ref}`, () => reconcileReference(ref))
    }
    return { checked: refs.length, results }
  }
)

/** Send a payout as soon as it's queued (the sweep below is the safety net). */
export const payoutOnQueued = inngest.createFunction(
  { id: "payout-on-queued", retries: 0, concurrency: { limit: 5 }, triggers: [{ event: "payout/queued" }] },
  async ({ event, step }) => {
    const payoutId = (event.data as { payoutId?: string }).payoutId
    if (!payoutId) return { skipped: true }
    return step.run("process", () => processPayout(payoutId))
  }
)

/** Retries due payouts and confirms ones the gateway left pending. */
export const payoutsSweep = inngest.createFunction(
  { id: "payouts-sweep", retries: 1, concurrency: { limit: 1 }, triggers: [{ cron: "*/10 * * * *" }] },
  async ({ step }) => step.run("sweep", () => sweepPayouts(25))
)

/** Releases held funds once the buyer-protection window passes without a dispute. */
export const escrowAutoRelease = inngest.createFunction(
  { id: "escrow-auto-release", retries: 1, concurrency: { limit: 1 }, triggers: [{ cron: "20 * * * *" }] },
  async ({ step }) => ({ released: await step.run("release-due", () => autoReleaseDue(50)) })
)
