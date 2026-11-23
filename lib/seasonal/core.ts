/**
 * Seasonal car-care campaigns (P8-11) — pure helpers, no database.
 *
 * Ghana's weather runs differently in the north, the middle belt and the
 * coast. Each garage gets campaigns timed for its region:
 *  - harmattan: dry, dusty north-east winds (filters, wipers, lights, cooling)
 *  - rainy_major / rainy_minor: the rains (wipers, tyres, brakes, lights)
 * The north has one rainy season; the middle belt and the coast have two.
 */

export type SeasonKey = "harmattan" | "rainy_major" | "rainy_minor"
export type Zone = "north" | "middle" | "coast"

export const NORTH = ["northern", "savannah", "north east", "upper east", "upper west"]
export const MIDDLE = ["ashanti", "bono", "bono east", "ahafo", "eastern", "oti", "volta"]
export const COAST = ["greater accra", "central", "western", "western north"]

/** Region text (any case, "Region" suffix, "N/E" style) → weather zone. Unknown → coast. */
export function zoneFor(region: string | null | undefined): Zone {
  const r = (region ?? "")
    .toLowerCase()
    .replace(/\bregion\b/g, "")
    .replace(/[-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!r) return "coast"
  if (NORTH.includes(r) || r === "ne" || r === "northeast") return "north"
  if (MIDDLE.includes(r) || r === "brong ahafo") return "middle"
  if (COAST.includes(r) || r === "accra") return "coast"
  if (r.includes("upper") || r.includes("north") || r.includes("savannah")) return "north"
  return "coast"
}

/** Send day (month 1–12, day) per zone. Missing = that season doesn't apply. */
export const SEND_DAYS: Record<SeasonKey, Partial<Record<Zone, { m: number; d: number }>>> = {
  harmattan: { north: { m: 11, d: 15 }, middle: { m: 11, d: 28 }, coast: { m: 12, d: 5 } },
  rainy_major: { north: { m: 4, d: 25 }, middle: { m: 3, d: 15 }, coast: { m: 4, d: 1 } },
  rainy_minor: { middle: { m: 9, d: 1 }, coast: { m: 9, d: 10 } },
}

export const SEASON_INFO: Record<SeasonKey, { title: string; short: string; checklist: string[]; smsLine: string; templateKey: string }> = {
  harmattan: {
    title: "Harmattan car care",
    short: "harmattan check",
    checklist: [
      "Air filter and AC/cabin filter (dust clogs them fast)",
      "Wiper blades and washer fluid for dusty windscreens",
      "Headlights and fog lights for hazy mornings",
      "Radiator and coolant — dust blocks cooling",
      "Battery terminals and tyre pressure on cold mornings",
    ],
    smsLine: "air & AC filters, wipers, lights and coolant",
    templateKey: "seasonal_harmattan",
  },
  rainy_major: {
    title: "Rainy season car care",
    short: "rainy-season check",
    checklist: [
      "Wiper blades — replace if they streak or squeak",
      "Tyre tread and pressure for wet roads",
      "Brakes — pads, discs and fluid",
      "Headlights, brake lights and indicators",
      "AC demist, door seals and electrics against leaks",
    ],
    smsLine: "wipers, tyres, brakes and lights",
    templateKey: "seasonal_rainy",
  },
  rainy_minor: {
    title: "Minor rains car care",
    short: "rainy-season check",
    checklist: [
      "Wiper blades — replace if they streak or squeak",
      "Tyre tread and pressure for wet roads",
      "Brakes — pads, discs and fluid",
      "Headlights, brake lights and indicators",
    ],
    smsLine: "wipers, tyres, brakes and lights",
    templateKey: "seasonal_rainy",
  },
}

export const SEASON_KEYS = Object.keys(SEND_DAYS) as SeasonKey[]

/** Campaigns are created this many days before sending so the garage can review them. */
export const PREVIEW_DAYS = 7
/** After the send day, keep trying (quiet hours, allowance) for this many days. */
export const SEND_WINDOW_DAYS = 14
/** Only customers whose car was serviced within this many days are messaged. */
export const ACTIVE_CUSTOMER_DAYS = 548
/** A customer gets at most one seasonal message in this many days, across seasons. */
export const MIN_GAP_DAYS = 45

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
const addDays = (isoDate: string, n: number) => new Date(Date.parse(`${isoDate}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

export type PlannedCampaign = { season: SeasonKey; sendOn: string; zone: Zone }

/**
 * Campaigns that should exist on `today` for a garage in `zone`: those whose
 * send day is between PREVIEW_DAYS ahead and SEND_WINDOW_DAYS behind.
 * Looks at this year and next so late-December previews work.
 */
export function plannedCampaigns(zone: Zone, todayISO: string): PlannedCampaign[] {
  const y = Number(todayISO.slice(0, 4))
  const out: PlannedCampaign[] = []
  for (const season of SEASON_KEYS) {
    const day = SEND_DAYS[season][zone]
    if (!day) continue
    for (const year of [y - 1, y, y + 1]) {
      const sendOn = iso(year, day.m, day.d)
      if (addDays(sendOn, -PREVIEW_DAYS) <= todayISO && todayISO <= addDays(sendOn, SEND_WINDOW_DAYS)) out.push({ season, sendOn, zone })
    }
  }
  return out
}

/** Next send day per season for a zone, on or after today (for the settings screen). */
export function upcomingSendDays(zone: Zone, todayISO: string): PlannedCampaign[] {
  const y = Number(todayISO.slice(0, 4))
  return SEASON_KEYS.flatMap((season) => {
    const day = SEND_DAYS[season][zone]
    if (!day) return []
    const thisYear = iso(y, day.m, day.d)
    const sendOn = addDays(thisYear, SEND_WINDOW_DAYS) >= todayISO ? thisYear : iso(y + 1, day.m, day.d)
    return [{ season, sendOn, zone }]
  }).sort((a, b) => a.sendOn.localeCompare(b.sendOn))
}

/** Campaigns created late (send day already near or past) wait this long so the garage can review. */
export const LATE_REVIEW_HOURS = 48

/** Earliest moment a campaign may start sending: its send day, but never sooner than 48h after it was created. */
export function earliestStart(sendOn: string, createdAt: Date): Date {
  const day = new Date(`${sendOn}T00:00:00Z`)
  const review = new Date(createdAt.getTime() + LATE_REVIEW_HOURS * 3_600_000)
  return review > day ? review : day
}

export function windowOpen(sendOn: string, todayISO: string): boolean {
  return sendOn <= todayISO && todayISO <= addDays(sendOn, SEND_WINDOW_DAYS)
}

export function windowClosed(sendOn: string, todayISO: string): boolean {
  return todayISO > addDays(sendOn, SEND_WINDOW_DAYS)
}

/** Short checklist for SMS/WhatsApp. */
export function checklistLine(season: SeasonKey): string {
  return SEASON_INFO[season].smsLine
}

/** Who gets a seasonal message. */
export function eligible(c: {
  seasonalOptOut: boolean | null
  deleted: boolean
  lastServiceAt: string | null
  lastSeasonalAt: string | null
  todayISO: string
}): { ok: true } | { ok: false; reason: string } {
  if (c.deleted) return { ok: false, reason: "deleted" }
  if (c.seasonalOptOut) return { ok: false, reason: "opted_out" }
  if (!c.lastServiceAt || c.lastServiceAt < addDays(c.todayISO, -ACTIVE_CUSTOMER_DAYS)) return { ok: false, reason: "inactive" }
  if (c.lastSeasonalAt && c.lastSeasonalAt > addDays(c.todayISO, -MIN_GAP_DAYS)) return { ok: false, reason: "recently_messaged" }
  return { ok: true }
}

/** Channel to use: WhatsApp if the customer allows it and prefers it, else SMS. */
export function seasonalChannel(c: { whatsappOptIn: boolean | null; preferredChannels: string[] | null }): "whatsapp" | "sms" {
  const pref = c.preferredChannels ?? ["whatsapp", "sms"]
  if (c.whatsappOptIn !== false && pref.indexOf("whatsapp") !== -1 && (pref.indexOf("sms") === -1 || pref.indexOf("whatsapp") < pref.indexOf("sms"))) return "whatsapp"
  return "sms"
}
