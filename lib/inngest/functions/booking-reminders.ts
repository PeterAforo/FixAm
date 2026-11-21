import { and, eq, gte, lt } from "drizzle-orm"
import { db } from "@/lib/db"
import { bookings, customers, garages, vehicles } from "@/lib/db/schema"
import { inngest } from "../client"
import { sendMessage } from "@/lib/messaging/send"

/** Daily 08:00 — remind customers of bookings starting tomorrow.
 *  Africa/Accra is UTC+0 year-round, so UTC day boundaries suffice. */
export const bookingTomorrowReminders = inngest.createFunction(
  {
    id: "booking-tomorrow-reminders",
    retries: 1,
    triggers: [{ cron: "0 8 * * *" }],
  },
  async ({ step }) => {
    const now = new Date()
    const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
    const dayAfter = new Date(tomorrow.getTime() + 86400_000)

    const rows = await step.run("list", () =>
      db()
        .select({
          id: bookings.id,
          garageId: bookings.garageId,
          guestName: bookings.guestName,
          guestPhone: bookings.guestPhone,
          guestPlate: bookings.guestPlate,
          startsAt: bookings.startsAt,
          customerPhone: customers.phone,
          customerName: customers.fullName,
          plate: vehicles.plateNumber,
        })
        .from(bookings)
        .leftJoin(customers, eq(bookings.customerId, customers.id))
        .leftJoin(vehicles, eq(bookings.vehicleId, vehicles.id))
        .where(and(
          eq(bookings.status, "confirmed"),
          gte(bookings.startsAt, tomorrow),
          lt(bookings.startsAt, dayAfter),
        ))
        .limit(500)
    )

    let sent = 0
    for (const b of rows) {
      const phone = b.guestPhone ?? b.customerPhone
      if (!phone) continue
      const [gr] = await db().select({ name: garages.name }).from(garages).where(eq(garages.id, b.garageId)).limit(1)
      const first = (b.guestName ?? b.customerName ?? "there").split(" ")[0]!
      const res = await sendMessage({
        garageId: b.garageId,
        channel: "sms",
        to: phone,
        templateKey: "booking_tomorrow",
        variables: {
          customer_first_name: first,
          plate: b.plate ?? b.guestPlate ?? "",
          garage_name: gr?.name ?? "the garage",
          due_date: new Date(b.startsAt).toLocaleString("en-GH", { timeZone: "Africa/Accra", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
        },
        idempotencyKey: `booking-tomorrow:${b.id}`,
      })
      if (res.ok) sent++
    }
    return { reminders: rows.length, sent }
  }
)
