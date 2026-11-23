import { sendRepaymentReminders, syncFinancing } from "@/lib/financing/service"
import { inngest } from "../client"

/** Hourly: lender decisions, invoices to pay from approved plans, repayments received. */
export const financingSyncHourly = inngest.createFunction(
  { id: "financing-sync-hourly", retries: 1, concurrency: { limit: 1 }, triggers: [{ cron: "35 * * * *" }] },
  async ({ step }) => step.run("sync", () => syncFinancing())
)

/** Daily 09:15 (Accra = UTC): repayment reminders, with quiet hours respected. */
export const financingRemindersDaily = inngest.createFunction(
  { id: "financing-reminders-daily", retries: 1, concurrency: { limit: 1 }, triggers: [{ cron: "15 9 * * *" }] },
  async ({ step }) => step.run("remind", () => sendRepaymentReminders())
)
