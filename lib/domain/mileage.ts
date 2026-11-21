/**
 * Mileage prediction — pure functions per specs/reminder-rules.json.
 * No DB access here; callers supply readings and garage defaults.
 */

export type OdometerReading = {
  km: number
  at: Date
  status?: "valid" | "flagged" | "rejected"
}

export type Confidence = "high" | "medium" | "low"

export const MAX_KM_PER_DAY = 1000
export const MIN_DAYS_FOR_RATE = 7
export const HALF_LIFE_DAYS = 90
export const MAX_INTERVALS = 12
export const MIN_VALID_READINGS = 2

/** Days between two dates (UTC, whole days). */
export function daysBetween(a: Date, b: Date): number {
  return Math.max(
    0,
    Math.floor((b.getTime() - a.getTime()) / 86_400_000)
  )
}

/**
 * Validate a candidate reading against prior valid readings.
 * Returns "valid" | "flagged" — flagged readings are excluded from rates
 * until approved. odometer_replaced starts a new series (lower allowed).
 */
export function validateReading(
  candidate: { km: number; at: Date; odometerReplaced?: boolean },
  history: OdometerReading[]
): "valid" | "flagged" {
  const valid = history
    .filter((r) => (r.status ?? "valid") === "valid")
    .sort((a, b) => a.at.getTime() - b.at.getTime())

  if (!valid.length) return "valid"
  const last = valid[valid.length - 1]

  // Lower than previous → flagged unless the odometer was replaced
  if (!candidate.odometerReplaced && candidate.km < last.km) return "flagged"

  // Implausible jump: > MAX_KM_PER_DAY average since last reading
  const days = daysBetween(last.at, candidate.at)
  if (days >= 1 && (candidate.km - last.km) / Math.max(1, days) > MAX_KM_PER_DAY) {
    return "flagged"
  }

  return "valid"
}

type Interval = { rate: number; endAt: Date }

function intervals(readings: OdometerReading[]): Interval[] {
  const sorted = readings
    .filter((r) => (r.status ?? "valid") === "valid")
    .sort((a, b) => a.at.getTime() - b.at.getTime())
  const out: Interval[] = []
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const cur = sorted[i]
    const days = daysBetween(prev.at, cur.at)
    if (days < MIN_DAYS_FOR_RATE) continue
    const rate = (cur.km - prev.km) / days
    if (rate < 0) continue
    out.push({ rate, endAt: cur.at })
  }
  return out.slice(-MAX_INTERVALS)
}

/**
 * km/day via exponentially weighted average of interval rates.
 * w_i = 0.5 ^ (age_days_of_interval_end / half_life_days), measured from `now`.
 * Falls back to defaultKmPerDay when < MIN_VALID_READINGS.
 */
export function computeKmPerDay(
  readings: OdometerReading[],
  now: Date,
  defaultKmPerDay: number
): { kmPerDay: number; confidence: Confidence } {
  const ints = intervals(readings)
  if (ints.length < MIN_VALID_READINGS - 1 || readings.filter((r) => (r.status ?? "valid") === "valid").length < MIN_VALID_READINGS) {
    return { kmPerDay: defaultKmPerDay, confidence: "low" }
  }

  let wSum = 0
  let wrSum = 0
  for (const iv of ints) {
    const age = daysBetween(iv.endAt, now)
    const w = Math.pow(0.5, age / HALF_LIFE_DAYS)
    wSum += w
    wrSum += w * iv.rate
  }
  const kmPerDay = Math.round((wrSum / wSum) * 100) / 100

  // confidence: high needs ≥4 valid readings + CV of rates ≤ 0.35
  const validCount = readings.filter((r) => (r.status ?? "valid") === "valid").length
  const rates = ints.map((i) => i.rate)
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length
  const variance = rates.reduce((a, r) => a + (r - mean) ** 2, 0) / rates.length
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0

  const confidence: Confidence =
    validCount >= 4 && cv <= 0.35 ? "high" : "medium"

  return { kmPerDay, confidence }
}

/** Predicted odometer at `now`: last valid km + km/day × days elapsed. */
export function predictOdometer(
  lastValid: OdometerReading,
  kmPerDay: number,
  now: Date
): number {
  return Math.round(lastValid.km + kmPerDay * daysBetween(lastValid.at, now))
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

/**
 * Predicted due date from mileage: last_valid + ceil((due_km - last_km)/km_per_day).
 * Already past → today. Returns null when inputs are missing.
 */
export function predictDueDate(
  lastValid: OdometerReading,
  dueMileageKm: number,
  kmPerDay: number,
  now: Date
): Date | null {
  if (kmPerDay <= 0) return null
  const remaining = dueMileageKm - lastValid.km
  if (remaining <= 0) return now
  const days = Math.ceil(remaining / kmPerDay)
  return addDays(lastValid.at, days)
}

/** effective_due_date = min(due_date, predicted_due_date) ignoring nulls. */
export function effectiveDueDate(
  dueDate: Date | null,
  predicted: Date | null
): Date | null {
  if (dueDate && predicted) return dueDate < predicted ? dueDate : predicted
  return dueDate ?? predicted
}
