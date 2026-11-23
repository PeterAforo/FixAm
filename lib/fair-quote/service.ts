import "server-only"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages, invoiceLines, invoices, jobItems, jobs, parts, priceObservations, vehicles } from "@/lib/db/schema"
import {
  LOOKBACK_DAYS,
  carClass,
  comparablePrice,
  describeCheck,
  meetsThreshold,
  normaliseCity,
  type CarClass,
  type FairQuoteCheck,
  type ObservationKind,
  type PriceBand,
} from "./core"

/**
 * Turns an issued invoice's lines into anonymised price observations.
 * Safe to call more than once (one row per invoice line).
 */
export async function recordInvoiceObservations(invoiceId: string): Promise<number> {
  const [inv] = await db().select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1)
  if (!inv || !["issued", "partially_paid", "paid"].includes(inv.status)) return 0
  const [garage] = await db().select({ city: garages.city }).from(garages).where(eq(garages.id, inv.garageId)).limit(1)
  const [vehicle] = inv.vehicleId
    ? await db().select({ make: vehicles.make, bodyType: vehicles.bodyType }).from(vehicles).where(eq(vehicles.id, inv.vehicleId)).limit(1)
    : []
  const cls = carClass(vehicle ?? null)
  const city = normaliseCity(garage?.city)

  const lines = await db()
    .select({
      id: invoiceLines.id,
      type: invoiceLines.type,
      quantity: invoiceLines.quantity,
      unitPrice: invoiceLines.unitPrice,
      discountAmount: invoiceLines.discountAmount,
      itemPartTypeId: jobItems.partTypeId,
      itemSupplyMode: jobItems.supplyMode,
      labourHours: jobItems.labourHours,
      stockPartTypeId: parts.partTypeId,
    })
    .from(invoiceLines)
    .leftJoin(jobItems, eq(jobItems.id, invoiceLines.jobItemId))
    .leftJoin(parts, eq(parts.id, invoiceLines.partId))
    .where(eq(invoiceLines.invoiceId, inv.id))

  const observedOn = inv.issueDate ?? new Date().toISOString().slice(0, 10)
  const rows = lines.flatMap((l) => {
    // Customer-supplied parts are only a fitting fee — not a part price.
    if (l.itemSupplyMode === "customer") return []
    const qty = Number(l.quantity)
    const net = Number(l.unitPrice) - (qty > 0 ? Number(l.discountAmount ?? 0n) / qty : 0)
    const c = comparablePrice({
      type: l.type,
      partTypeId: l.itemPartTypeId ?? l.stockPartTypeId,
      unitPrice: net,
      quantity: qty,
      labourHours: l.labourHours != null ? Number(l.labourHours) : null,
    })
    if (!c) return []
    return [{
      kind: c.kind,
      partTypeId: c.kind === "part" ? (l.itemPartTypeId ?? l.stockPartTypeId) : null,
      carClass: cls,
      city,
      amount: BigInt(c.price),
      quantity: String(c.quantity),
      observedOn,
      sourceGarageId: inv.garageId,
      sourceInvoiceId: inv.id,
      sourceInvoiceLineId: l.id,
    }]
  })
  if (!rows.length) return 0
  await db().insert(priceObservations).values(rows).onConflictDoNothing({ target: priceObservations.sourceInvoiceLineId })
  return rows.length
}

/** A voided invoice's prices no longer count. */
export async function removeInvoiceObservations(invoiceId: string): Promise<void> {
  await db().delete(priceObservations).where(eq(priceObservations.sourceInvoiceId, invoiceId))
}

/** Nightly safety net: record recently issued invoices that were missed. */
export async function backfillObservations(days = 3, limit = 500): Promise<number> {
  const since = new Date(Date.now() - days * 86400_000)
  const rows = await db()
    .select({ id: invoices.id })
    .from(invoices)
    .leftJoin(priceObservations, eq(priceObservations.sourceInvoiceId, invoices.id))
    .where(and(
      inArray(invoices.status, ["issued", "partially_paid", "paid"]),
      sql`${invoices.issuedAt} >= ${since.toISOString()}`,
      isNull(priceObservations.id),
    ))
    .limit(limit)
  let n = 0
  for (const r of rows) n += await recordInvoiceObservations(r.id).catch(() => 0)
  return n
}

type BandRow = { kind: string; part_type_id: string | null; n: number; g: number; p25: number; p50: number; p75: number }

async function bands(opts: {
  cls: CarClass
  city: string | null
  excludeGarageId: string | null
  partTypeIds: string[]
  labour: boolean
}): Promise<BandRow[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString().slice(0, 10)
  const keyFilter = opts.partTypeIds.length && opts.labour
    ? sql`((kind = 'part' and part_type_id in (${sql.join(opts.partTypeIds.map((id) => sql`${id}::uuid`), sql`, `)})) or kind = 'labour_rate')`
    : opts.partTypeIds.length
      ? sql`(kind = 'part' and part_type_id in (${sql.join(opts.partTypeIds.map((id) => sql`${id}::uuid`), sql`, `)}))`
      : sql`kind = 'labour_rate'`
  const rows = await db().execute<BandRow>(sql`
    select kind, part_type_id,
      count(*)::int as n,
      count(distinct source_garage_id)::int as g,
      percentile_cont(0.25) within group (order by amount)::float8 as p25,
      percentile_cont(0.5) within group (order by amount)::float8 as p50,
      percentile_cont(0.75) within group (order by amount)::float8 as p75
    from price_observations
    where car_class = ${opts.cls}
      and observed_on >= ${since}
      ${opts.excludeGarageId ? sql`and source_garage_id <> ${opts.excludeGarageId}::uuid` : sql``}
      ${opts.city !== null ? sql`and city = ${opts.city}` : sql``}
      and ${keyFilter}
    group by kind, part_type_id
  `)
  return [...rows]
}

function toBand(r: BandRow | undefined, scope: "city" | "country"): PriceBand | null {
  if (!r) return null
  if (!meetsThreshold(Number(r.n), Number(r.g))) return null
  return { low: Math.round(r.p25), median: Math.round(r.p50), high: Math.round(r.p75), sampleSize: Number(r.n), garages: Number(r.g), scope }
}

export type QuoteLine = { id: string; type: string; partTypeId: string | null; unitPrice: number; quantity: number; labourHours: number | null; supplyMode?: string | null }

/**
 * Compares a garage's quoted lines with what other garages charge.
 * Returns a check per line id; lines without enough data are left out.
 * The quoting garage's own prices are never part of its comparison.
 */
export async function checkQuote(input: {
  garageId: string
  vehicle: { make?: string | null; bodyType?: string | null } | null
  lines: QuoteLine[]
}): Promise<Record<string, FairQuoteCheck>> {
  if (!input.lines.some((l) => l.supplyMode !== "customer" && comparablePrice(l))) return {}
  const [garage] = await db().select({ city: garages.city }).from(garages).where(eq(garages.id, input.garageId)).limit(1)
  return checkLines({ excludeGarageId: input.garageId, city: normaliseCity(garage?.city), cls: carClass(input.vehicle), lines: input.lines })
}

/** Core comparison, shared by garage quotes and the driver's "check a price" tool. */
export async function checkLines(input: {
  excludeGarageId: string | null
  city: string
  cls: CarClass
  lines: QuoteLine[]
}): Promise<Record<string, FairQuoteCheck>> {
  const comparable = input.lines.flatMap((l) => {
    if (l.supplyMode === "customer") return []
    const c = comparablePrice(l)
    return c ? [{ line: l, ...c }] : []
  })
  if (!comparable.length) return {}
  const { city, cls } = input
  const partTypeIds = [...new Set(comparable.filter((c) => c.kind === "part").map((c) => c.line.partTypeId!))]
  const labour = comparable.some((c) => c.kind === "labour_rate")
  const base = { cls, excludeGarageId: input.excludeGarageId, partTypeIds, labour }

  try {
    const [cityRows, countryRows] = await Promise.all([
      city ? bands({ ...base, city }) : Promise.resolve([] as BandRow[]),
      bands({ ...base, city: null }),
    ])
    const key = (kind: string, pt: string | null) => `${kind}:${pt ?? ""}`
    const cityMap = new Map(cityRows.map((r) => [key(r.kind, r.part_type_id), r]))
    const countryMap = new Map(countryRows.map((r) => [key(r.kind, r.part_type_id), r]))

    const out: Record<string, FairQuoteCheck> = {}
    for (const c of comparable) {
      const k = key(c.kind, c.kind === "part" ? c.line.partTypeId : null)
      const band = toBand(cityMap.get(k), "city") ?? toBand(countryMap.get(k), "country")
      if (band) out[c.line.id] = describeCheck(c.kind as ObservationKind, c.price, band, cls, city)
    }
    return out
  } catch {
    return {}
  }
}

/** Cities with enough garages on FixAm to offer as choices (no counts exposed). */
export async function priceCheckCities(): Promise<string[]> {
  const rows = await db().execute<{ city: string }>(sql`
    select city from price_observations
    where city <> ''
    group by city
    having count(distinct source_garage_id) >= 3
    order by count(*) desc
    limit 30
  `)
  return [...rows].map((r) => r.city)
}

/** Fair-quote checks for a job's current lines (garage job card). */
export async function checkJobQuote(garageId: string, jobId: string): Promise<Record<string, FairQuoteCheck>> {
  const items = await db().select().from(jobItems).where(and(eq(jobItems.jobId, jobId), eq(jobItems.garageId, garageId)))
  if (!items.length) return {}
  const [row] = await db()
    .select({ make: vehicles.make, bodyType: vehicles.bodyType })
    .from(jobs)
    .innerJoin(vehicles, eq(vehicles.id, jobs.vehicleId))
    .where(and(eq(jobs.id, jobId), eq(jobs.garageId, garageId)))
    .limit(1)
  return checkQuote({
    garageId,
    vehicle: row ?? null,
    lines: items.map((i) => ({
      id: i.id,
      type: i.type,
      partTypeId: i.partTypeId,
      unitPrice: Number(i.unitPrice) - (Number(i.quantity) > 0 ? Number(i.discountAmount ?? 0n) / Number(i.quantity) : 0),
      quantity: Number(i.quantity),
      labourHours: i.labourHours != null ? Number(i.labourHours) : null,
      supplyMode: i.supplyMode,
    })),
  })
}
