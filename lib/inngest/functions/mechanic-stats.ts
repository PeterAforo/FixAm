import { inngest } from "../client"
import { recomputeAllStats } from "@/lib/stats/recompute"

/** mechanic-stats-nightly — recompute mechanic stats + award badges. */
export const mechanicStatsNightly = inngest.createFunction(
  {
    id: "mechanic-stats-nightly",
    retries: 1,
    triggers: [{ cron: "30 2 * * *" }],
  },
  async ({ step }) => {
    return step.run("recompute", () => recomputeAllStats())
  }
)
