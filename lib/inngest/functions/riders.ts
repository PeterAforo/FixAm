import { sweepDeliveries } from "@/lib/riders/service"
import { inngest } from "../client"

/** Every 2 minutes: widen unanswered delivery offers, expire dead ones. */
export const riderDispatchSweep = inngest.createFunction(
  { id: "rider-dispatch-sweep", retries: 1, concurrency: { limit: 1 }, triggers: [{ cron: "*/2 * * * *" }] },
  async ({ step }) => step.run("sweep", () => sweepDeliveries())
)
