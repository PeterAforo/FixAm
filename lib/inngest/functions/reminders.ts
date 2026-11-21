import { inngest } from "../client"
import { runReminderScan } from "@/lib/reminders/engine"

/** Hourly at minute 5 (Africa/Accra per spec) — advance escalations and send. */
export const reminderScan = inngest.createFunction(
  {
    id: "reminder-scan-hourly",
    retries: 1,
    triggers: [{ cron: "5 * * * *" }],
  },
  async () => runReminderScan()
)
