import { inngest } from "../client"
import { runMileageNudge, runReminderScan } from "@/lib/reminders/engine"

/** Hourly at minute 5 (Africa/Accra per spec) — advance escalations and send. */
export const reminderScan = inngest.createFunction(
  {
    id: "reminder-scan-hourly",
    retries: 1,
    triggers: [{ cron: "5 * * * *" }],
  },
  async () => runReminderScan()
)

/** Daily 10:00 (Accra = UTC) — mileage nudge for stale readings. */
export const mileageNudgeDaily = inngest.createFunction(
  {
    id: "mileage-nudge-daily",
    retries: 1,
    triggers: [{ cron: "0 10 * * *" }],
  },
  async () => runMileageNudge()
)
