import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { odometerReadings, vehicles } from "@/lib/db/schema"
import { computeKmPerDay, type OdometerReading } from "@/lib/domain/mileage"
import { inngest } from "../client"
import { defaultKmPerDay } from "@/lib/vehicles/actions"

/** Recompute km/day + confidence for one vehicle from its valid readings. */
export async function recalculateVehicleMileage(garageId: string, vehicleId: string) {
  const defaults = await defaultKmPerDay(garageId)
  const [vehicle] = await db()
    .select({ usage: vehicles.usage })
    .from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.garageId, garageId)))
    .limit(1)
  if (!vehicle) return null

  const rows = await db()
    .select({ readingKm: odometerReadings.readingKm, readAt: odometerReadings.readAt, status: odometerReadings.status })
    .from(odometerReadings)
    .where(
      and(
        eq(odometerReadings.vehicleId, vehicleId),
        eq(odometerReadings.garageId, garageId),
        eq(odometerReadings.status, "valid")
      )
    )
    .orderBy(odometerReadings.readAt)

  const readings: OdometerReading[] = rows.map((r) => ({ km: r.readingKm, at: r.readAt, status: "valid" }))
  const fallback = defaults[vehicle.usage ?? "private"] ?? defaults.private ?? 40
  const { kmPerDay, confidence } = computeKmPerDay(readings, new Date(), fallback)

  await db()
    .update(vehicles)
    .set({
      kmPerDay: String(kmPerDay),
      kmPerDayConfidence: confidence,
      updatedAt: new Date(),
    })
    .where(eq(vehicles.id, vehicleId))

  return { kmPerDay, confidence }
}

/** Recalc on every new valid odometer reading. */
export const recalcMileageOnReading = inngest.createFunction(
  {
    id: "recalc-mileage-on-reading",
    retries: 2,
    triggers: [{ event: "vehicle/odometer.recorded" }],
  },
  async ({ event, step }) => {
    const { garageId, vehicleId, status } = event.data as {
      garageId: string
      vehicleId: string
      status: string
    }
    if (status !== "valid") return { skipped: true }
    return step.run("recalc", () => recalculateVehicleMileage(garageId, vehicleId))
  }
)

/** Nightly sweep: every vehicle with readings gets a fresh prediction. */
export const recalcMileageNightly = inngest.createFunction(
  {
    id: "recalc-mileage-nightly",
    retries: 1,
    triggers: [{ cron: "15 2 * * *" }],
  },
  async ({ step }) => {
    const vehiclesWithReadings = await step.run("list", async () => {
      const rows = await db()
        .selectDistinct({ garageId: odometerReadings.garageId, vehicleId: odometerReadings.vehicleId })
        .from(odometerReadings)
        .where(eq(odometerReadings.status, "valid"))
      return rows
    })

    let updated = 0
    for (const v of vehiclesWithReadings) {
      const res = await step.run(`recalc-${v.vehicleId}`, () =>
        recalculateVehicleMileage(v.garageId, v.vehicleId)
      )
      if (res) updated++
    }
    return { scanned: vehiclesWithReadings.length, updated }
  }
)
