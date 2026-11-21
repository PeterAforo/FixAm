/** Pure helpers + badge catalogue for mechanic gamification (P5-03). */

export const BADGES = [
  { key: "first_fix", name: "First Fix", emoji: "🔧", desc: "Completed your first job" },
  { key: "zero_comebacks", name: "Zero Comebacks", emoji: "✨", desc: "Delivered jobs with no warranty comebacks" },
  { key: "speed_demon", name: "Speed Demon", emoji: "⚡", desc: "Turned a job around in under 4 hours" },
  { key: "hundred_jobs", name: "Centurion", emoji: "🏆", desc: "Completed 100 jobs" },
  { key: "streak_7", name: "Week Warrior", emoji: "🔥", desc: "Worked 7 days in a row" },
] as const

export type BadgeKey = (typeof BADGES)[number]["key"]

export const SPEED_DEMON_MS = 4 * 60 * 60 * 1000

export function badgeFor(stats: {
  jobsCompleted: number
  comebacks: number
  speedDemon: boolean
  currentStreak: number
}): BadgeKey[] {
  const out: BadgeKey[] = []
  if (stats.jobsCompleted >= 1) out.push("first_fix")
  if (stats.jobsCompleted >= 1 && stats.comebacks === 0) out.push("zero_comebacks")
  if (stats.speedDemon) out.push("speed_demon")
  if (stats.jobsCompleted >= 100) out.push("hundred_jobs")
  if (stats.currentStreak >= 7) out.push("streak_7")
  return out
}

/**
 * Consecutive-day streak ending today or yesterday.
 * `activityDates` are YYYY-MM-DD strings (UTC), newest first or unordered.
 */
export function computeStreak(activityDates: string[], today: string): { current: number; best: number } {
  const set = new Set(activityDates)
  const dayMs = 86_400_000
  const todayMs = Date.parse(`${today}T00:00:00Z`)
  const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

  // Streak may end today or yesterday (a rest day today doesn't break it yet).
  let cursor = set.has(today) ? todayMs : todayMs - dayMs
  let current = 0
  while (set.has(toDay(cursor))) {
    current++
    cursor -= dayMs
  }

  // Best streak across all history.
  const sorted = [...set].sort()
  let best = 0
  let run = 0
  let prevMs: number | null = null
  for (const d of sorted) {
    const ms = Date.parse(`${d}T00:00:00Z`)
    run = prevMs !== null && ms - prevMs === dayMs ? run + 1 : 1
    if (run > best) best = run
    prevMs = ms
  }

  return { current, best: Math.max(best, current) }
}
