import { fromZonedTime, toZonedTime } from "date-fns-tz"

/**
 * Quiet hours — garage_settings.quiet_hours {start:"21:00",end:"07:00"}
 * in Africa/Accra. Messages inside quiet hours are rescheduled to the
 * end of the window.
 */

export const DEFAULT_QUIET_HOURS = { start: "21:00", end: "07:00" }
export const GARAGE_TZ = "Africa/Accra"

export type QuietHours = { start: string; end: string }

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function isOvernight(q: QuietHours): boolean {
  return minutes(q.start) > minutes(q.end)
}

/** True when `date` falls inside the quiet-hours window (garage-local time). */
export function isQuietHour(date: Date, quiet: QuietHours = DEFAULT_QUIET_HOURS): boolean {
  const local = toZonedTime(date, GARAGE_TZ)
  const mins = local.getHours() * 60 + local.getMinutes()
  const start = minutes(quiet.start)
  const end = minutes(quiet.end)
  if (isOvernight(quiet)) {
    return mins >= start || mins < end
  }
  return mins >= start && mins < end
}

/**
 * If `date` is inside quiet hours, return the moment the window ends
 * (next occurrence of quiet.end, garage-local). Otherwise return `date`.
 */
export function nextAllowedTime(
  date: Date,
  quiet: QuietHours = DEFAULT_QUIET_HOURS
): Date {
  if (!isQuietHour(date, quiet)) return date

  const local = toZonedTime(date, GARAGE_TZ)
  const [eh, em] = quiet.end.split(":").map(Number)
  const endLocal = new Date(local)
  endLocal.setHours(eh ?? 7, em ?? 0, 0, 0)

  // If today's end-time already passed, the window ends tomorrow.
  if (endLocal.getTime() <= local.getTime()) {
    endLocal.setDate(endLocal.getDate() + 1)
  }

  return fromZonedTime(endLocal, GARAGE_TZ)
}
