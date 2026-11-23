import "server-only"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  garageSettings,
  garageVehicleCoverage,
  garages,
  jobs,
  repairRequestMedia,
  repairRequestOffers,
  repairRequests,
} from "@/lib/db/schema"
import { storageProvider } from "@/lib/integrations/storage"
import { runPrompt } from "@/lib/ai/run"
import { triagePrompt } from "@/lib/ai/prompts"
import type { AiImage } from "@/lib/integrations/ai"
import { matchPartTypeText } from "@/lib/parts-catalog/actions"
import { matchGarages, rulesTriage, type TriageResult } from "./core"
import { smsBuyer } from "@/lib/parts-shop/notify"
import { appUrl } from "@/lib/messaging/direct"

export const REQUEST_TTL_HOURS = 72

export async function nextRequestNumber(): Promise<string> {
  const rows = await db().execute<{ v: string }>(sql`select nextval('repair_request_seq')::text as v`)
  return `RR-${rows[0]?.v ?? Date.now().toString().slice(-6)}`
}

/** Claude triage (with up to 4 photos) — falls back to the keyword rules so the driver always gets an answer. */
export async function triageComplaint(input: {
  complaint: string
  vehicle: string | null
  warningLights: string[]
  photos: AiImage[]
  ctx: { userId: string | null }
}): Promise<TriageResult & { matchedParts: { id: string; name: string }[]; by: string }> {
  const r = await runPrompt(
    triagePrompt,
    { complaint: input.complaint, vehicle: input.vehicle, warningLights: input.warningLights, photoCount: input.photos.length },
    { userId: input.ctx.userId },
    { images: input.photos.slice(0, 4) }
  )
  const t: TriageResult = r.ok ? { ...r.data, costRangeGhs: { min: Math.min(r.data.costRangeGhs.min, r.data.costRangeGhs.max), max: Math.max(r.data.costRangeGhs.min, r.data.costRangeGhs.max) } } : rulesTriage(input.complaint, input.warningLights)
  const matchedParts: { id: string; name: string }[] = []
  for (const p of t.likelyParts) {
    const m = (await matchPartTypeText(p))[0]
    if (m && m.score >= 0.5 && !matchedParts.some((x) => x.id === m.partType.id)) matchedParts.push({ id: m.partType.id, name: m.partType.name })
  }
  // P8-12: a photo of the part itself can name it more precisely than the words.
  const first = input.photos[0]
  if (first) {
    try {
      const { identifyPartPhoto } = await import("@/lib/part-photo/service")
      const photo = await identifyPartPhoto({ image: first, note: input.complaint.slice(0, 300), vehicle: input.vehicle, source: "request", ctx: { userId: input.ctx.userId } })
      const top = photo.candidates[0]
      if (photo.sure && top && !matchedParts.some((x) => x.id === top.id)) matchedParts.unshift({ id: top.id, name: top.name })
    } catch {
      // photo recognition is a bonus, never a blocker
    }
  }
  return { ...t, matchedParts: matchedParts.slice(0, 6), by: r.ok ? r.provider : "rules" }
}

/** Garages that should receive a broadcast request. */
export async function findRecipientGarages(req: {
  lat: number | null
  lng: number | null
  region: string | null
  city: string | null
  radiusKm: number
  specialty: string
  make: string | null
}) {
  const rows = await db()
    .select({ id: garages.id, lat: garages.gpsLat, lng: garages.gpsLng, region: garages.region, city: garages.city, specialties: garageSettings.specialties })
    .from(garages)
    .leftJoin(garageSettings, eq(garageSettings.garageId, garages.id))
    .where(and(eq(garages.status, "active"), isNull(garages.deletedAt)))
    .limit(2000)
  const ids = rows.map((r) => r.id)
  const cov = ids.length
    ? await db()
        .select({ garageId: garageVehicleCoverage.garageId, make: garageVehicleCoverage.make })
        .from(garageVehicleCoverage)
        .where(and(inArray(garageVehicleCoverage.garageId, ids), eq(garageVehicleCoverage.isActive, true)))
    : []
  const makes = new Map<string, string[]>()
  for (const c of cov) makes.set(c.garageId, [...(makes.get(c.garageId) ?? []), c.make.toLowerCase()])
  return matchGarages(
    rows.map((r) => ({
      id: r.id,
      gpsLat: r.lat != null ? Number(r.lat) : null,
      gpsLng: r.lng != null ? Number(r.lng) : null,
      region: r.region,
      city: r.city,
      specialties: r.specialties ?? [],
      coverageMakes: makes.get(r.id) ?? [],
    })),
    req
  )
}

/** Tell garages a new lead arrived (SMS to the garage's main number). */
export async function notifyGaragesOfLead(garageIds: string[], req: { number: string; summary: string; urgency: string | null }) {
  if (garageIds.length === 0) return
  const rows = await db().select({ id: garages.id, phone: garages.phone, slug: garages.slug }).from(garages).where(inArray(garages.id, garageIds))
  for (const g of rows) {
    await smsBuyer(
      g.phone,
      `FixAm lead ${req.number}${req.urgency === "stop_driving" ? " (urgent)" : ""}: ${req.summary.slice(0, 90)}. Send an offer: ${appUrl(`/g/${g.slug}/leads`)}`,
      `lead:${req.number}:${g.id}`
    )
  }
}

export async function mediaWithUrls(requestIds: string[]) {
  if (requestIds.length === 0) return new Map<string, { id: string; kind: string; url: string }[]>()
  const rows = await db().select().from(repairRequestMedia).where(inArray(repairRequestMedia.requestId, requestIds))
  const out = new Map<string, { id: string; kind: string; url: string }[]>()
  for (const m of rows) {
    const url = await storageProvider().getSignedUrl(m.storagePath, 3600)
    out.set(m.requestId, [...(out.get(m.requestId) ?? []), { id: m.id, kind: m.kind, url }])
  }
  return out
}

/** Check-in from a repair-request booking → the job card shows the complaint, media and triage. */
export async function attachRepairRequestToJob(input: { bookingId: string; jobId: string; garageId: string }) {
  const [req] = await db().select({ id: repairRequests.id }).from(repairRequests).where(eq(repairRequests.bookingId, input.bookingId)).limit(1)
  if (!req) return
  await db().update(repairRequests).set({ jobId: input.jobId, updatedAt: new Date() }).where(eq(repairRequests.id, req.id))
  await db().update(jobs).set({ repairRequestId: req.id, updatedAt: new Date() }).where(and(eq(jobs.id, input.jobId), eq(jobs.garageId, input.garageId)))
}

export type JobRepairRequest = {
  number: string
  complaint: string
  complaintOriginal: string | null
  complaintLanguage: string
  warningLights: string[]
  triage: (TriageResult & { matchedParts?: { id: string; name: string }[] }) | null
  media: { id: string; kind: string; url: string }[]
  offer: { priceMin: number | null; priceMax: number | null; message: string | null } | null
}

export async function getJobRepairRequest(requestId: string, garageId: string): Promise<JobRepairRequest | null> {
  const [req] = await db().select().from(repairRequests).where(eq(repairRequests.id, requestId)).limit(1)
  if (!req) return null
  const [offer] = await db()
    .select()
    .from(repairRequestOffers)
    .where(and(eq(repairRequestOffers.requestId, req.id), eq(repairRequestOffers.garageId, garageId)))
    .limit(1)
  const media = (await mediaWithUrls([req.id])).get(req.id) ?? []
  return {
    number: req.number,
    complaint: req.complaint,
    complaintOriginal: req.complaintOriginal,
    complaintLanguage: req.complaintLanguage,
    warningLights: req.warningLights,
    triage: (req.triage as JobRepairRequest["triage"]) ?? null,
    media,
    offer: offer ? { priceMin: offer.priceMin != null ? Number(offer.priceMin) : null, priceMax: offer.priceMax != null ? Number(offer.priceMax) : null, message: offer.message } : null,
  }
}

