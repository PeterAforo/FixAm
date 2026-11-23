import { planSeasonalCampaigns, runSeasonalSends } from "@/lib/seasonal/service"
import { inngest } from "../client"

/** Daily: create campaigns a week ahead (owners are told), close finished ones. */
export const seasonalPlanDaily = inngest.createFunction(
  { id: "seasonal-plan-daily", retries: 1, concurrency: { limit: 1 }, triggers: [{ cron: "30 6 * * *" }] },
  async ({ step }) => step.run("plan", () => planSeasonalCampaigns())
)

/** Hourly in the daytime (Accra = UTC): send open campaigns. Quiet hours and allowance are checked per garage. */
export const seasonalSendHourly = inngest.createFunction(
  { id: "seasonal-send-hourly", retries: 1, concurrency: { limit: 1 }, triggers: [{ cron: "20 9-18 * * *" }] },
  async ({ step }) => step.run("send", () => runSeasonalSends())
)
