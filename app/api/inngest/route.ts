import { serve } from "inngest/next"
import { inngest } from "@/lib/inngest/client"
import { sendMessageFn } from "@/lib/inngest/functions/send-message"
import { recalcMileageNightly, recalcMileageOnReading } from "@/lib/inngest/functions/recalc-mileage"
import { bookingTomorrowReminders } from "@/lib/inngest/functions/booking-reminders"
import { instalmentSweep } from "@/lib/inngest/functions/instalments"
import { creditStatementSweep } from "@/lib/inngest/functions/credit-statements"
import { dailyReportSnapshots, monthlyReportSnapshots } from "@/lib/inngest/functions/report-snapshots"
import { autoReorderNightly, autoReorderOnMovement } from "@/lib/inngest/functions/auto-reorder"
import { mileageNudgeDaily, reminderScan } from "@/lib/inngest/functions/reminders"
import { billingSweep } from "@/lib/inngest/functions/billing"
import { mechanicStatsNightly } from "@/lib/inngest/functions/mechanic-stats"
import { fairQuoteBackfill } from "@/lib/inngest/functions/fair-quote"
import { seasonalPlanDaily, seasonalSendHourly } from "@/lib/inngest/functions/seasonal"
import { financingRemindersDaily, financingSyncHourly } from "@/lib/inngest/functions/financing"
import { escrowAutoRelease, paymentsPendingPoller, payoutOnQueued, payoutsSweep } from "@/lib/inngest/functions/escrow"

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [sendMessageFn, recalcMileageOnReading, recalcMileageNightly, bookingTomorrowReminders, instalmentSweep, creditStatementSweep, dailyReportSnapshots, monthlyReportSnapshots, autoReorderNightly, autoReorderOnMovement, reminderScan, mileageNudgeDaily, billingSweep, mechanicStatsNightly, paymentsPendingPoller, payoutOnQueued, payoutsSweep, escrowAutoRelease, fairQuoteBackfill, seasonalPlanDaily, seasonalSendHourly, financingSyncHourly, financingRemindersDaily],
})
