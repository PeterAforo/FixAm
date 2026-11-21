import { inngest } from "../client"
import { runAutoReorderAll, runAutoReorderForGarage } from "@/lib/parts/reorder"

/** Nightly sweep: every garage's low-stock parts with a preferred vendor. */
export const autoReorderNightly = inngest.createFunction(
  {
    id: "auto-reorder-nightly",
    retries: 1,
    triggers: [{ cron: "45 1 * * *" }],
  },
  async () => runAutoReorderAll()
)

/** On stock movement: re-check the affected garage (debounced per garage). */
export const autoReorderOnMovement = inngest.createFunction(
  {
    id: "auto-reorder-on-movement",
    retries: 1,
    debounce: { period: "10m", key: "event.data.garageId" },
    triggers: [{ event: "fixam/stock.changed" }],
  },
  async ({ event }) => {
    const garageId = (event.data as { garageId?: string }).garageId
    if (!garageId) return { skipped: true }
    return runAutoReorderForGarage(garageId)
  }
)
