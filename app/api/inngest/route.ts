import { serve } from "inngest/next"
import { inngest } from "@/lib/inngest/client"
import { sendMessageFn } from "@/lib/inngest/functions/send-message"
import { recalcMileageNightly, recalcMileageOnReading } from "@/lib/inngest/functions/recalc-mileage"
import { bookingTomorrowReminders } from "@/lib/inngest/functions/booking-reminders"
import { instalmentSweep } from "@/lib/inngest/functions/instalments"
import { creditStatementSweep } from "@/lib/inngest/functions/credit-statements"
import { dailyReportSnapshots, monthlyReportSnapshots } from "@/lib/inngest/functions/report-snapshots"
import { autoReorderNightly, autoReorderOnMovement } from "@/lib/inngest/functions/auto-reorder"
import { reminderScan } from "@/lib/inngest/functions/reminders"

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [sendMessageFn, recalcMileageOnReading, recalcMileageNightly, bookingTomorrowReminders, instalmentSweep, creditStatementSweep, dailyReportSnapshots, monthlyReportSnapshots, autoReorderNightly, autoReorderOnMovement, reminderScan],
})
