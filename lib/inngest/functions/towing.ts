import { sweepSos } from "@/lib/towing/service"
import { inngest } from "../client"

/** Every 2 minutes: widen unanswered SOS calls once, expire ones nobody took. */
export const sosSweep = inngest.createFunction(
  { id: "sos-sweep", retries: 1, concurrency: { limit: 1 }, triggers: [{ cron: "*/2 * * * *" }] },
  async ({ step }) => step.run("sweep", () => sweepSos())
)
