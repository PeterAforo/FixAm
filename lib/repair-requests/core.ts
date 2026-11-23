/**
 * Pure helpers for complaint-first repair requests (P8-06): specialties,
 * warning lights, a rules-based triage (used by the mock AI and as a floor),
 * and garage matching for broadcasts.
 */

export const SPECIALTIES = [
  { id: "general", label: "General servicing" },
  { id: "engine", label: "Engine" },
  { id: "brakes", label: "Brakes" },
  { id: "suspension", label: "Suspension & steering" },
  { id: "electrical", label: "Electrical & battery" },
  { id: "diagnostics", label: "Computer diagnostics" },
  { id: "ac", label: "Air conditioning" },
  { id: "transmission", label: "Gearbox & clutch" },
  { id: "tyres", label: "Tyres & alignment" },
  { id: "bodywork", label: "Body & paint" },
] as const
export type Specialty = (typeof SPECIALTIES)[number]["id"]
export const SPECIALTY_IDS = SPECIALTIES.map((s) => s.id) as [Specialty, ...Specialty[]]

export const WARNING_LIGHTS = [
  { id: "check_engine", label: "Check engine" },
  { id: "battery", label: "Battery" },
  { id: "oil", label: "Oil pressure" },
  { id: "temperature", label: "Engine temperature" },
  { id: "brake", label: "Brake" },
  { id: "abs", label: "ABS" },
  { id: "airbag", label: "Airbag" },
  { id: "tyre_pressure", label: "Tyre pressure" },
] as const

export type Urgency = "stop_driving" | "soon" | "can_wait"

export type TriageResult = {
  summary: string
  likelyCauses: { cause: string; likelihood: "high" | "medium" | "low" }[]
  urgency: Urgency
  safetyNote: string | null
  costRangeGhs: { min: number; max: number }
  specialty: Specialty
  likelyParts: string[]
  followUps: string[]
}

type Rule = { re: RegExp; specialty: Specialty; urgency: Urgency; cause: string; parts: string[]; cost: [number, number] }

const RULES: Rule[] = [
  { re: /brake|braking|squeal|grind|breki|birki/i, specialty: "brakes", urgency: "soon", cause: "Worn brake pads or discs", parts: ["Brake pads", "Brake discs"], cost: [300, 1500] },
  { re: /overheat|temperature|steam|coolant|radiator|hot engine/i, specialty: "engine", urgency: "stop_driving", cause: "Cooling system fault (radiator, thermostat or water pump)", parts: ["Radiator", "Thermostat", "Water pump"], cost: [400, 3000] },
  { re: /won.?t start|not start|no start|click|battery|dead/i, specialty: "electrical", urgency: "soon", cause: "Weak battery, starter or alternator", parts: ["Battery", "Starter motor", "Alternator"], cost: [400, 2500] },
  { re: /knock|shock|bump|suspension|rattle|wobble|steering/i, specialty: "suspension", urgency: "soon", cause: "Worn shock absorbers, bushes or ball joints", parts: ["Shock absorber", "Ball joint", "Stabiliser link"], cost: [500, 3500] },
  { re: /gear|clutch|transmission|slip/i, specialty: "transmission", urgency: "soon", cause: "Clutch wear or gearbox fault", parts: ["Clutch kit"], cost: [1200, 6000] },
  { re: /a\.?c\b|aircon|air ?con|not cold|cooling inside/i, specialty: "ac", urgency: "can_wait", cause: "Low refrigerant or AC compressor fault", parts: ["AC compressor"], cost: [300, 4000] },
  { re: /tyre|tire|puncture|flat|alignment|pull/i, specialty: "tyres", urgency: "soon", cause: "Tyre damage or wheel alignment", parts: ["Tyre"], cost: [150, 1500] },
  { re: /smoke|oil leak|burning oil|misfire|rough idle|shak/i, specialty: "engine", urgency: "soon", cause: "Engine misfire, worn plugs or oil leak", parts: ["Spark plugs", "Ignition coil", "Valve cover gasket"], cost: [300, 2500] },
  { re: /check engine|engine light|warning light|code/i, specialty: "diagnostics", urgency: "soon", cause: "Fault stored in the engine computer", parts: [], cost: [150, 600] },
  { re: /dent|scratch|paint|bumper|accident/i, specialty: "bodywork", urgency: "can_wait", cause: "Body damage", parts: ["Bumper"], cost: [500, 5000] },
]

const LIGHT_URGENCY: Record<string, Urgency> = { oil: "stop_driving", temperature: "stop_driving", brake: "stop_driving", battery: "soon", check_engine: "soon", abs: "soon", airbag: "soon", tyre_pressure: "soon" }

const URGENCY_RANK: Record<Urgency, number> = { can_wait: 0, soon: 1, stop_driving: 2 }

/** Deterministic triage from keywords + warning lights. */
export function rulesTriage(complaint: string, warningLights: string[] = []): TriageResult {
  const hits = RULES.filter((r) => r.re.test(complaint))
  const lightHits = warningLights.filter((l) => l in LIGHT_URGENCY)
  let urgency: Urgency = hits.length || lightHits.length ? "soon" : "can_wait"
  for (const h of hits) if (URGENCY_RANK[h.urgency] > URGENCY_RANK[urgency]) urgency = h.urgency
  for (const l of lightHits) if (URGENCY_RANK[LIGHT_URGENCY[l]!] > URGENCY_RANK[urgency]) urgency = LIGHT_URGENCY[l]!
  const first = hits[0]
  const specialty: Specialty = first?.specialty ?? (lightHits.length ? "diagnostics" : "general")
  const min = hits.length ? Math.min(...hits.map((h) => h.cost[0])) : 150
  const max = hits.length ? Math.max(...hits.map((h) => h.cost[1])) : 800
  return {
    summary: first ? first.cause : "A mechanic needs to inspect the car to find the cause.",
    likelyCauses: hits.length
      ? hits.slice(0, 3).map((h, i) => ({ cause: h.cause, likelihood: i === 0 ? "high" : "medium" }))
      : [{ cause: "Needs inspection", likelihood: "medium" }],
    urgency,
    safetyNote:
      urgency === "stop_driving" ? "Stop driving if you can — continuing could damage the engine or be unsafe. Ask for towing or a garage visit." : null,
    costRangeGhs: { min, max },
    specialty,
    likelyParts: [...new Set(hits.flatMap((h) => h.parts))].slice(0, 5),
    followUps: ["When did it start?", "Does it happen all the time or only sometimes (cold start, braking, at speed)?"],
  }
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export type GarageCandidate = {
  id: string
  gpsLat: number | null
  gpsLng: number | null
  region: string | null
  city: string | null
  specialties: string[]
  coverageMakes: string[] // lower-case; empty = all makes
}

/**
 * Which garages should receive a broadcast. Distance by GPS when both sides
 * have it (else same city/region); specialty must match unless the garage
 * lists none (general); make must be covered when the garage lists coverage.
 */
export function matchGarages(
  candidates: GarageCandidate[],
  req: { lat: number | null; lng: number | null; region: string | null; city: string | null; radiusKm: number; specialty: string; make: string | null },
  limit = 25
): { id: string; distanceKm: number | null }[] {
  const make = req.make?.trim().toLowerCase() || null
  const norm = (s: string | null) => (s ?? "").trim().toLowerCase()
  const out: { id: string; distanceKm: number | null }[] = []
  for (const g of candidates) {
    let distanceKm: number | null = null
    if (req.lat != null && req.lng != null && g.gpsLat != null && g.gpsLng != null) {
      distanceKm = haversineKm(req.lat, req.lng, g.gpsLat, g.gpsLng)
      if (distanceKm > req.radiusKm) continue
    } else {
      const sameCity = req.city && norm(g.city) === norm(req.city)
      const sameRegion = req.region && norm(g.region) === norm(req.region)
      if (!sameCity && !sameRegion) continue
    }
    if (g.specialties.length && req.specialty !== "general" && !g.specialties.includes(req.specialty)) continue
    if (make && g.coverageMakes.length && !g.coverageMakes.includes(make)) continue
    out.push({ id: g.id, distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null })
  }
  return out.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999)).slice(0, limit)
}
