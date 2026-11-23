import { backfillObservations } from "@/lib/fair-quote/service"
import { inngest } from "../client"

/** Records prices from any issued invoices the inline hook missed. */
export const fairQuoteBackfill = inngest.createFunction(
  { id: "fair-quote-backfill", retries: 1, concurrency: { limit: 1 }, triggers: [{ cron: "40 2 * * *" }] },
  async ({ step }) => ({ recorded: await step.run("backfill", () => backfillObservations(3, 500)) })
)
