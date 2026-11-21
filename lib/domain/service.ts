/**
 * Service interval defaults + due-date computation — mirrors
 * specs/reminder-rules.json due_item_types.{oil_change,general_service}
 * and the mileage_prediction section. Pure functions only.
 */
import { predictDueDate, type OdometerReading } from "./mileage"

export type ServiceInterval = { months: number; km: number }

/** default_intervals keyed by oil grade (reminder-rules.json). */
export const OIL_INTERVALS: Record<string, ServiceInterval> = {
  mineral: { months: 3, km: 5000 },
  semi_synthetic: { months: 6, km: 7500 },
  fully_synthetic: { months: 6, km: 10000 },
  diesel_commercial: { months: 3, km: 5000 },
}

export const OIL_GRADES = Object.keys(OIL_INTERVALS)

export const GENERAL_SERVICE_INTERVAL: ServiceInterval = { months: 12, km: 15000 }

/** Unknown/blank grade falls back to semi_synthetic (mid-range default). */
export function intervalForOilGrade(grade: string | null | undefined): ServiceInterval {
  return OIL_INTERVALS[(grade ?? "").trim()] ?? OIL_INTERVALS.semi_synthetic!
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d
}

export type ServiceDueDates = {
  /** date-based due date (performed + interval.months) as YYYY-MM-DD */
  dueDate: string
  dueMileageKm: number
  /** mileage-predicted due date, or null when prediction inputs are missing */
  predictedDueDate: string | null
  /** min(dueDate, predictedDueDate) — the date the engine escalates against */
  effectiveDueDate: string
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Compute due-item dates for a completed service.
 * @param performedAt when the service was performed (delivery/manual date)
 * @param odometerKm  odometer at service time (sets the mileage baseline)
 * @param interval    service interval {months, km}
 * @param mileage     optional prediction inputs: km/day rate + last valid
 *                    reading. When supplied, predictedDueDate uses
 *                    predictDueDate anchored on the service odometer.
 */
export function computeServiceDueDates(args: {
  performedAt: Date
  odometerKm: number | null
  interval: ServiceInterval
  kmPerDay?: number | null
  now?: Date
}): ServiceDueDates {
  const now = args.now ?? new Date()
  const dueDate = isoDay(addMonths(args.performedAt, args.interval.months))
  const dueMileageKm = args.odometerKm != null ? args.odometerKm + args.interval.km : 0

  let predicted: string | null = null
  if (args.odometerKm != null && args.kmPerDay != null && args.kmPerDay > 0) {
    // anchor the "last valid reading" at the service odometer/time
    const lastValid: OdometerReading = { km: args.odometerKm, at: args.performedAt }
    const p = predictDueDate(lastValid, dueMileageKm, args.kmPerDay, now)
    predicted = p ? isoDay(p) : null
  }

  const effective = predicted && predicted < dueDate ? predicted : dueDate
  return { dueDate, dueMileageKm, predictedDueDate: predicted, effectiveDueDate: effective }
}
