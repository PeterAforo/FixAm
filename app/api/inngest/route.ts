import { serve } from "inngest/next"
import { inngest } from "@/lib/inngest/client"
import { sendMessageFn } from "@/lib/inngest/functions/send-message"
import { recalcMileageNightly, recalcMileageOnReading } from "@/lib/inngest/functions/recalc-mileage"
import { bookingTomorrowReminders } from "@/lib/inngest/functions/booking-reminders"
import { instalmentSweep } from "@/lib/inngest/functions/instalments"

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [sendMessageFn, recalcMileageOnReading, recalcMileageNightly, bookingTomorrowReminders, instalmentSweep],
})
