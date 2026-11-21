import { and, eq, inArray, isNotNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { dueItems, odometerReadings, vehicles } from "@/lib/db/schema"
import { computeKmPerDay, predictDueDate, type OdometerReading } from "@/lib/domain/mileage"
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

  // refresh predicted/effective dates on open mileage-based due items
  const lastValid = [...readings].sort((a, b) => b.at.getTime() - a.at.getTime())[0] ?? null
  if (lastValid && kmPerDay > 0) {
    const open = await db()
      .select({ id: dueItems.id, dueDate: dueItems.dueDate, dueMileageKm: dueItems.dueMileageKm, predictedDueDate: dueItems.predictedDueDate, effectiveDueDate: dueItems.effectiveDueDate })
      .from(dueItems)
      .where(and(
        eq(dueItems.vehicleId, vehicleId),
        eq(dueItems.garageId, garageId),
        inArray(dueItems.type, ["oil_change", "general_service", "custom"]),
        isNotNull(dueItems.dueMileageKm),
        inArray(dueItems.status, ["scheduled", "due_soon", "due", "overdue"]),
      ))
    const now = new Date()
    for (const item of open) {
      const p = predictDueDate(lastValid, item.dueMileageKm!, kmPerDay, now)
      const predictedISO = p ? p.toISOString().slice(0, 10) : null
      const candidates = [item.dueDate, predictedISO].filter((d): d is string => !!d)
      const effective = candidates.length ? candidates.reduce((a, b) => (a < b ? a : b)) : null
      if (effective && (predictedISO !== item.predictedDueDate || effective !== item.effectiveDueDate)) {
        await db().update(dueItems).set({
          predictedDueDate: predictedISO,
          effectiveDueDate: effective,
          updatedAt: now,
        }).where(eq(dueItems.id, item.id))
      }
    }
  }

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
