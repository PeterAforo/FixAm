import "server-only"
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  customers,
  dvlaRecords,
  garages,
  insurancePolicies,
  jobItems,
  jobs,
  odometerReadings,
  vehiclePassports,
  vehicles,
} from "@/lib/db/schema"
import {
  checkMileage,
  isPassportToken,
  mileageTimeline,
  newPassportToken,
  paperStatuses,
  passportUrl,
  summariseVisit,
  type MileageCheck,
  type PaperStatus,
} from "./core"

export type PassportSettings = {
  enabled: boolean
  showMileage: boolean
  showGarageNames: boolean
  url: string
  token: string
  viewCount: number
  lastViewedAt: string | null
}

/** The vehicle row, if this phone is its current owner. */
async function ownedVehicle(phone: string, vehicleId: string) {
  const [row] = await db()
    .select({ id: vehicles.id, plateSearch: vehicles.plateSearch, plateNumber: vehicles.plateNumber })
    .from(vehicles)
    .innerJoin(customers, eq(customers.id, vehicles.currentOwnerId))
    .where(and(eq(vehicles.id, vehicleId), eq(customers.phone, phone), isNull(vehicles.deletedAt), isNull(customers.deletedAt)))
    .limit(1)
  return row ?? null
}

function toSettings(p: typeof vehiclePassports.$inferSelect): PassportSettings {
  return {
    enabled: p.enabled,
    showMileage: p.showMileage,
    showGarageNames: p.showGarageNames,
    url: passportUrl(p.token),
    token: p.token,
    viewCount: p.viewCount,
    lastViewedAt: p.lastViewedAt?.toISOString() ?? null,
  }
}

/**
 * The owner's passport for this car, created (switched off) if missing.
 * If the car has a new owner, they take over: the passport is switched off
 * and gets a new link, so the previous owner's links stop working.
 */
export async function getOwnerPassport(phone: string, vehicleId: string): Promise<PassportSettings | null> {
  const v = await ownedVehicle(phone, vehicleId)
  if (!v || !v.plateSearch) return null
  const [existing] = await db().select().from(vehiclePassports).where(eq(vehiclePassports.plateSearch, v.plateSearch)).limit(1)
  if (!existing) {
    const [created] = await db()
      .insert(vehiclePassports)
      .values({ plateSearch: v.plateSearch, ownerPhone: phone, token: newPassportToken() })
      .onConflictDoNothing({ target: vehiclePassports.plateSearch })
      .returning()
    if (created) return toSettings(created)
    const [again] = await db().select().from(vehiclePassports).where(eq(vehiclePassports.plateSearch, v.plateSearch)).limit(1)
    return again && again.ownerPhone === phone ? toSettings(again) : null
  }
  if (existing.ownerPhone !== phone) {
    const [moved] = await db()
      .update(vehiclePassports)
      .set({ ownerPhone: phone, enabled: false, token: newPassportToken(), regeneratedAt: new Date(), viewCount: 0, lastViewedAt: null, updatedAt: new Date() })
      .where(eq(vehiclePassports.id, existing.id))
      .returning()
    return toSettings(moved)
  }
  return toSettings(existing)
}

export async function updateOwnerPassport(
  phone: string,
  vehicleId: string,
  patch: { enabled?: boolean; showMileage?: boolean; showGarageNames?: boolean; regenerate?: boolean },
): Promise<PassportSettings | null> {
  const current = await getOwnerPassport(phone, vehicleId)
  if (!current) return null
  const [row] = await db()
    .update(vehiclePassports)
    .set({
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.showMileage !== undefined ? { showMileage: patch.showMileage } : {}),
      ...(patch.showGarageNames !== undefined ? { showGarageNames: patch.showGarageNames } : {}),
      ...(patch.regenerate ? { token: newPassportToken(), regeneratedAt: new Date(), viewCount: 0, lastViewedAt: null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(vehiclePassports.token, current.token), eq(vehiclePassports.ownerPhone, phone)))
    .returning()
  return row ? toSettings(row) : null
}

export type PublicPassport = {
  car: { plateNumber: string; make: string; model: string; year: number | null; color: string | null; colorHex: string | null; bodyType: string | null; fuelType: string | null }
  visits: { date: string; garage: string | null; city: string | null; odometerKm: number | null; work: string[]; more: number; partsWithProof: number; warranty: boolean }[]
  garagesCount: number
  mileage: MileageCheck | null
  mileageTimeline: { km: number; month: string }[]
  papers: PaperStatus[]
  firstSeen: string | null
}

/** The public page data for a token, or null if it doesn't exist or is switched off. */
export async function loadPublicPassport(token: string, opts: { countView?: boolean } = {}): Promise<PublicPassport | null> {
  if (!isPassportToken(token)) return null
  const [p] = await db().select().from(vehiclePassports).where(eq(vehiclePassports.token, token)).limit(1)
  if (!p || !p.enabled) return null

  const cars = await db()
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.plateSearch, p.plateSearch), isNull(vehicles.deletedAt)))
  if (!cars.length) return null
  const ids = cars.map((c) => c.id)
  // The richest record describes the car (most recently updated, with a year).
  const main = [...cars].sort((a, b) => (b.year ? 1 : 0) - (a.year ? 1 : 0) || b.updatedAt.getTime() - a.updatedAt.getTime())[0]

  const jobRows = await db()
    .select({
      id: jobs.id, deliveredAt: jobs.deliveredAt, readyAt: jobs.readyAt, createdAt: jobs.createdAt,
      odometerKm: jobs.checkInOdometerKm, isWarranty: jobs.isWarranty,
      garageName: garages.name, garageCity: garages.city, garageId: jobs.garageId,
    })
    .from(jobs)
    .innerJoin(garages, eq(garages.id, jobs.garageId))
    .where(and(inArray(jobs.vehicleId, ids), inArray(jobs.status, ["delivered", "closed"]), isNull(jobs.deletedAt)))
    .orderBy(desc(sql`coalesce(${jobs.deliveredAt}, ${jobs.readyAt}, ${jobs.createdAt})`))
    .limit(60)

  const itemRows = jobRows.length
    ? await db()
        .select({ jobId: jobItems.jobId, type: jobItems.type, description: jobItems.description, approvalStatus: jobItems.approvalStatus, oldPartProof: jobItems.oldPartProof, sortOrder: jobItems.sortOrder })
        .from(jobItems)
        .where(inArray(jobItems.jobId, jobRows.map((j) => j.id)))
        .orderBy(jobItems.sortOrder)
    : []
  const itemsByJob = new Map<string, typeof itemRows>()
  for (const i of itemRows) itemsByJob.set(i.jobId, [...(itemsByJob.get(i.jobId) ?? []), i])

  const visits = jobRows
    .map((j) => {
      const s = summariseVisit(itemsByJob.get(j.id) ?? [])
      return {
        date: (j.deliveredAt ?? j.readyAt ?? j.createdAt).toISOString().slice(0, 10),
        garage: p.showGarageNames ? j.garageName : null,
        city: j.garageCity,
        odometerKm: p.showMileage ? j.odometerKm : null,
        work: s.work,
        more: s.more,
        partsWithProof: s.partsWithProof,
        warranty: !!j.isWarranty,
      }
    })
    .filter((v) => v.work.length > 0)

  let mileage: MileageCheck | null = null
  let timeline: { km: number; month: string }[] = []
  if (p.showMileage) {
    const odo = await db()
      .select({ km: odometerReadings.readingKm, at: odometerReadings.readAt, replaced: odometerReadings.odometerReplaced, status: odometerReadings.status })
      .from(odometerReadings)
      .where(inArray(odometerReadings.vehicleId, ids))
    const pts = odo
      .filter((o) => o.status !== "rejected")
      .map((o) => ({ km: o.km, at: o.at.toISOString().slice(0, 10), odometerReplaced: !!o.replaced }))
    for (const j of jobRows) if (j.odometerKm) pts.push({ km: j.odometerKm, at: (j.deliveredAt ?? j.createdAt).toISOString().slice(0, 10), odometerReplaced: false })
    mileage = checkMileage(pts)
    timeline = mileageTimeline(pts)
  }

  const [ins, dvla] = await Promise.all([
    db().select({ expiry: insurancePolicies.endDate }).from(insurancePolicies).where(inArray(insurancePolicies.vehicleId, ids)),
    db().select({ kind: dvlaRecords.type, expiry: dvlaRecords.expiryDate }).from(dvlaRecords)
      .where(and(inArray(dvlaRecords.vehicleId, ids), inArray(dvlaRecords.type, ["roadworthy", "registration_licence"]))),
  ])
  const papers = paperStatuses(
    [...ins.map((i) => ({ kind: "insurance", expiry: i.expiry })), ...dvla.map((d) => ({ kind: d.kind, expiry: d.expiry }))],
    new Date().toISOString().slice(0, 10),
  )

  if (opts.countView) {
    await db().update(vehiclePassports)
      .set({ viewCount: sql`${vehiclePassports.viewCount} + 1`, lastViewedAt: new Date() })
      .where(eq(vehiclePassports.id, p.id))
      .catch(() => undefined)
  }

  const firstSeen = cars.map((c) => c.createdAt.toISOString().slice(0, 10)).sort()[0] ?? null
  return {
    car: {
      plateNumber: main.plateNumber, make: main.make, model: main.model, year: main.year,
      color: main.color, colorHex: main.colorHex, bodyType: main.bodyType, fuelType: main.fuelType,
    },
    visits,
    garagesCount: new Set(jobRows.map((j) => j.garageId)).size,
    mileage,
    mileageTimeline: timeline,
    papers,
    firstSeen,
  }
}
