/**
 * Fair-quote check (P8-09) — pure helpers, no database.
 *
 * Prices from issued invoices are grouped by what was bought (part type, or
 * labour per hour), the class of car and the garage's city. A quoted price is
 * compared with the middle half of those prices (25th–75th percentile).
 * Nothing is shown unless there are enough prices from enough garages, so no
 * single garage's prices can be worked out.
 */

export const MIN_OBSERVATIONS = 5
/** Prices must come from at least this many different garages. */
export const MIN_GARAGES = 3
/** Only prices from the last 18 months count. */
export const LOOKBACK_DAYS = 548
/** A price this much over the top of the typical range is "above". */
export const ABOVE_TOLERANCE = 0.1
/** …and this much under the bottom is "below". */
export const BELOW_TOLERANCE = 0.1

export type CarClass = "economy" | "premium" | "suv" | "commercial" | "motorbike"
export type ObservationKind = "part" | "labour_rate"
export type Verdict = "below" | "within" | "above"
/** How widely we had to look to find enough prices. */
export type Scope = "city" | "country"

const PREMIUM_MAKES = new Set([
  "mercedes", "mercedes-benz", "bmw", "audi", "lexus", "land rover", "range rover", "porsche", "jaguar",
  "volvo", "infiniti", "acura", "cadillac", "lincoln", "genesis", "maserati", "bentley", "tesla", "mini",
])

export function carClass(v: { make?: string | null; bodyType?: string | null; usage?: string | null } | null | undefined): CarClass {
  if (!v) return "economy"
  const body = (v.bodyType ?? "").toLowerCase()
  if (body === "motorbike") return "motorbike"
  if (body === "bus" || body === "truck" || body === "van") return "commercial"
  const make = (v.make ?? "").trim().toLowerCase()
  if (PREMIUM_MAKES.has(make)) return "premium"
  if (body === "suv" || body === "pickup") return "suv"
  return "economy"
}

export const CAR_CLASS_LABEL: Record<CarClass, string> = {
  economy: "saloon and hatchback cars",
  premium: "premium-brand cars",
  suv: "SUVs and pickups",
  commercial: "vans, buses and trucks",
  motorbike: "motorbikes",
}

export function normaliseCity(city: string | null | undefined): string {
  return (city ?? "").trim().toLowerCase().replace(/\s+/g, " ")
}

/** Linear-interpolated percentile (same as Postgres percentile_cont). */
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  if (sorted.length === 1) return sorted[0]
  const pos = (sorted.length - 1) * p
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export type PriceBand = { low: number; median: number; high: number; sampleSize: number; garages: number; scope: Scope }

/** Enough prices from enough different garages to show a range? */
export function meetsThreshold(sampleSize: number, garages: number): boolean {
  return sampleSize >= MIN_OBSERVATIONS && garages >= MIN_GARAGES
}

export function bandFrom(amounts: number[], garages: number, scope: Scope): PriceBand | null {
  if (!meetsThreshold(amounts.length, garages)) return null
  const s = [...amounts].sort((a, b) => a - b)
  return {
    low: Math.round(percentile(s, 0.25)),
    median: Math.round(percentile(s, 0.5)),
    high: Math.round(percentile(s, 0.75)),
    sampleSize: s.length,
    garages,
    scope,
  }
}

export function verdictFor(price: number, band: Pick<PriceBand, "low" | "high">): Verdict {
  if (price > band.high * (1 + ABOVE_TOLERANCE)) return "above"
  if (price < band.low * (1 - BELOW_TOLERANCE)) return "below"
  return "within"
}

export type FairQuoteCheck = {
  verdict: Verdict
  /** Pesewas: per unit for parts, per hour for labour. */
  price: number
  band: PriceBand
  kind: ObservationKind
  carClass: CarClass
  /** Short sentence for customers and staff. */
  summary: string
}

const ghs = (p: number) => `GH₵${(p / 100).toLocaleString("en-GH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

export function describeCheck(kind: ObservationKind, price: number, band: PriceBand, cls: CarClass, city: string): FairQuoteCheck {
  const verdict = verdictFor(price, band)
  const unit = kind === "labour_rate" ? "/hr" : ""
  const where = band.scope === "city" && city ? ` in ${city.replace(/\b\w/g, (c) => c.toUpperCase())}` : " across Ghana"
  const range = `${ghs(band.low)}–${ghs(band.high)}${unit}`
  const lead = verdict === "within" ? "Within the typical range" : verdict === "above" ? "Above the typical range" : "Below the typical range"
  return {
    verdict,
    price,
    band,
    kind,
    carClass: cls,
    summary: `${lead}: most garages charge ${range} for ${CAR_CLASS_LABEL[cls]}${where} (${band.sampleSize} recent prices).`,
  }
}

/**
 * Price to compare for a line. Parts: unit price. Labour: price per hour,
 * only when hours are known. Returns null when the line can't be compared.
 */
export function comparablePrice(line: {
  type: string
  partTypeId?: string | null
  unitPrice: number
  quantity: number
  labourHours?: number | null
}): { kind: ObservationKind; price: number; quantity: number } | null {
  if (line.unitPrice <= 0 || line.quantity <= 0) return null
  if (line.type === "part" && line.partTypeId) return { kind: "part", price: Math.round(line.unitPrice), quantity: line.quantity }
  if (line.type === "labour" && line.labourHours && line.labourHours > 0) {
    return { kind: "labour_rate", price: Math.round((line.unitPrice * line.quantity) / line.labourHours), quantity: line.labourHours }
  }
  return null
}
