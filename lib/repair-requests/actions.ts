"use server"

import { z } from "zod"
import { and, desc, eq, gt, inArray, isNull, ne, or } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  bookings,
  branches,
  garageReviews,
  garageSettings,
  garages,
  repairRequestMedia,
  repairRequestOffers,
  repairRequestRecipients,
  repairRequests,
} from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { getPortalPhone } from "@/lib/portal/session"
import { can } from "@/lib/auth/permissions"
import { resolveMembership, writeAuditLog } from "@/lib/actions"
import { rateLimit } from "@/lib/rate-limit"
import { storageProvider } from "@/lib/integrations/storage"
import type { AiImage } from "@/lib/integrations/ai"
import { smsBuyer } from "@/lib/parts-shop/notify"
import { appUrl } from "@/lib/messaging/direct"
import { uuidv7 } from "@/lib/id"
import { SPECIALTY_IDS, WARNING_LIGHTS, type TriageResult } from "./core"
import { REQUEST_TTL_HOURS, findRecipientGarages, mediaWithUrls, nextRequestNumber, notifyGaragesOfLead, triageComplaint } from "./service"

type Fail = { ok: false; error: string }
const fail = (error: string): Fail => ({ ok: false, error })

async function driver() {
  const [userId, phone] = await Promise.all([getSessionUserId(), getPortalPhone()])
  return userId && phone ? { userId, phone } : null
}

async function staff(garageId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return { userId, principal: { kind: "staff" as const, role: m.role, garageId, branchId: m.branchId } }
}

const LIGHT_IDS = WARNING_LIGHTS.map((l) => l.id) as string[]
const PHOTO_MAX = 8 * 1024 * 1024
const VIDEO_MAX = 30 * 1024 * 1024

const submitSchema = z.object({
  complaint: z.string().trim().min(5, "Describe the problem in a few words").max(2000),
  complaintOriginal: z.string().trim().max(2000).optional(),
  language: z.enum(["en", "tw", "gaa", "ee", "ha"]).default("en"),
  make: z.string().trim().max(60).optional(),
  model: z.string().trim().max(60).optional(),
  year: z.coerce.number().int().min(1950).max(2100).optional(),
  plate: z.string().trim().max(20).optional(),
  warningLights: z.array(z.string()).max(8).default([]),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  region: z.string().trim().max(60).optional(),
  city: z.string().trim().max(60).optional(),
  mode: z.enum(["preferred", "broadcast"]),
  preferredGarageId: z.string().uuid().optional(),
  radiusKm: z.coerce.number().int().min(2).max(100).default(15),
  name: z.string().trim().max(120).optional(),
})

export type SubmitResult = { ok: true; id: string; number: string; triage: TriageResult & { matchedParts: { id: string; name: string }[] }; sentTo: number } | Fail

/** Driver posts a complaint (text or transcribed voice, photos/video, warning lights) → triage → garages. */
export async function submitRepairRequest(formData: FormData): Promise<SubmitResult> {
  const me = await driver()
  if (!me) return fail("Sign in with your phone to send a request")
  const rl = await rateLimit(`repair-request:${me.userId}`, 6, 3600)
  if (!rl.ok) return fail("You've sent several requests — try again in a little while")

  const parsed = submitSchema.safeParse({
    complaint: formData.get("complaint"),
    complaintOriginal: formData.get("complaintOriginal") || undefined,
    language: formData.get("language") || undefined,
    make: formData.get("make") || undefined,
    model: formData.get("model") || undefined,
    year: formData.get("year") || undefined,
    plate: formData.get("plate") || undefined,
    warningLights: formData.getAll("warningLights").map(String).filter((l) => LIGHT_IDS.includes(l)),
    lat: formData.get("lat") || undefined,
    lng: formData.get("lng") || undefined,
    region: formData.get("region") || undefined,
    city: formData.get("city") || undefined,
    mode: formData.get("mode"),
    preferredGarageId: formData.get("preferredGarageId") || undefined,
    radiusKm: formData.get("radiusKm") || undefined,
    name: formData.get("name") || undefined,
  })
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form")
  const d = parsed.data
  if (d.mode === "preferred" && !d.preferredGarageId) return fail("Choose your garage")
  if (d.mode === "broadcast" && d.lat == null && !d.region && !d.city) return fail("Share your location or pick your area so nearby garages see it")

  const files = formData.getAll("media").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 5)
  for (const f of files) {
    const isVideo = f.type.startsWith("video/")
    if (!isVideo && !f.type.startsWith("image/")) return fail("Only photos and videos can be attached")
    if (f.size > (isVideo ? VIDEO_MAX : PHOTO_MAX)) return fail(isVideo ? "Videos must be under 30 MB" : "Photos must be under 8 MB")
  }

  const id = uuidv7()
  const number = await nextRequestNumber()
  const vehicleLabel = [d.make, d.model, d.year].filter(Boolean).join(" ") || null

  await db().insert(repairRequests).values({
    id,
    number,
    requesterUserId: me.userId,
    requesterPhone: me.phone,
    requesterName: d.name ?? null,
    vehicleMake: d.make ?? null,
    vehicleModel: d.model ?? null,
    vehicleYear: d.year ?? null,
    vehiclePlate: d.plate ?? null,
    complaint: d.complaint,
    complaintOriginal: d.complaintOriginal ?? null,
    complaintLanguage: d.language,
    warningLights: d.warningLights,
    gpsLat: d.lat != null ? d.lat.toFixed(6) : null,
    gpsLng: d.lng != null ? d.lng.toFixed(6) : null,
    region: d.region ?? null,
    city: d.city ?? null,
    mode: d.mode,
    preferredGarageId: d.mode === "preferred" ? d.preferredGarageId! : null,
    radiusKm: d.radiusKm,
    status: "open",
    expiresAt: new Date(Date.now() + REQUEST_TTL_HOURS * 3600_000),
  })

  const photos: AiImage[] = []
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer())
    const kind = f.type.startsWith("video/") ? "video" : "photo"
    const ext = (f.type.split("/")[1] ?? "bin").replace(/[^a-z0-9]/g, "")
    const key = `repair-requests/${id}/${uuidv7()}.${ext}`
    await storageProvider().put(key, buf, f.type)
    await db().insert(repairRequestMedia).values({ requestId: id, kind, storagePath: key, mimeType: f.type })
    if (kind === "photo" && photos.length < 4 && buf.byteLength <= 3.5 * 1024 * 1024 && ["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      photos.push({ mediaType: f.type as AiImage["mediaType"], base64: buf.toString("base64") })
    }
  }

  const triage = await triageComplaint({ complaint: d.complaint, vehicle: vehicleLabel, warningLights: d.warningLights, photos, ctx: { userId: me.userId } })

  let recipients: { id: string; distanceKm: number | null }[]
  if (d.mode === "preferred") {
    recipients = [{ id: d.preferredGarageId!, distanceKm: null }]
  } else {
    recipients = await findRecipientGarages({
      lat: d.lat ?? null,
      lng: d.lng ?? null,
      region: d.region ?? null,
      city: d.city ?? null,
      radiusKm: d.radiusKm,
      specialty: triage.specialty,
      make: d.make ?? null,
    })
  }
  if (recipients.length) {
    await db()
      .insert(repairRequestRecipients)
      .values(recipients.map((r) => ({ requestId: id, garageId: r.id, distanceKm: r.distanceKm != null ? r.distanceKm.toFixed(1) : null })))
      .onConflictDoNothing()
  }
  await db()
    .update(repairRequests)
    .set({ triage, urgency: triage.urgency, specialty: triage.specialty, updatedAt: new Date() })
    .where(eq(repairRequests.id, id))
  await notifyGaragesOfLead(recipients.map((r) => r.id), { number, summary: triage.summary, urgency: triage.urgency })
  await writeAuditLog({ garageId: null, actorUserId: me.userId, action: "repair_request.create", entityType: "repair_request", entityId: id, after: { number, mode: d.mode, sentTo: recipients.length, urgency: triage.urgency } }).catch(() => undefined)

  return { ok: true, id, number, triage, sentTo: recipients.length }
}

// ---------------------------------------------------------------------------
// Driver: my requests + offers
// ---------------------------------------------------------------------------

export type MyRepairRequest = {
  id: string
  number: string
  status: string
  complaint: string
  vehicle: string | null
  urgency: string | null
  triage: (TriageResult & { matchedParts?: { id: string; name: string }[] }) | null
  createdAt: string
  expired: boolean
  sentTo: number
  media: { id: string; kind: string; url: string }[]
  offers: {
    id: string
    garageName: string
    garageSlug: string
    garageCity: string | null
    rating: number | null
    reviewCount: number
    distanceKm: number | null
    priceMin: number | null
    priceMax: number | null
    inspectionFee: number
    earliestAt: string
    message: string | null
    status: string
  }[]
}

export async function listMyRepairRequests(): Promise<MyRepairRequest[]> {
  const me = await driver()
  if (!me) return []
  const reqs = await db()
    .select()
    .from(repairRequests)
    .where(or(eq(repairRequests.requesterUserId, me.userId), eq(repairRequests.requesterPhone, me.phone)))
    .orderBy(desc(repairRequests.createdAt))
    .limit(20)
  const ids = reqs.map((r) => r.id)
  if (ids.length === 0) return []
  const [offers, recips, media] = await Promise.all([
    db()
      .select({ o: repairRequestOffers, g: garages })
      .from(repairRequestOffers)
      .innerJoin(garages, eq(garages.id, repairRequestOffers.garageId))
      .where(and(inArray(repairRequestOffers.requestId, ids), ne(repairRequestOffers.status, "withdrawn"))),
    db().select().from(repairRequestRecipients).where(inArray(repairRequestRecipients.requestId, ids)),
    mediaWithUrls(ids),
  ])
  const garageIds = [...new Set(offers.map((o) => o.g.id))]
  const reviews = garageIds.length
    ? await db().select({ garageId: garageReviews.garageId, rating: garageReviews.rating }).from(garageReviews).where(and(inArray(garageReviews.garageId, garageIds), eq(garageReviews.status, "published")))
    : []
  const agg = new Map<string, { sum: number; n: number }>()
  for (const r of reviews) {
    const a = agg.get(r.garageId) ?? { sum: 0, n: 0 }
    agg.set(r.garageId, { sum: a.sum + r.rating, n: a.n + 1 })
  }
  const now = Date.now()
  return reqs.map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status,
    complaint: r.complaint,
    vehicle: [r.vehicleMake, r.vehicleModel, r.vehicleYear].filter(Boolean).join(" ") || null,
    urgency: r.urgency,
    triage: (r.triage as MyRepairRequest["triage"]) ?? null,
    createdAt: r.createdAt.toISOString(),
    expired: r.status !== "booked" && (r.expiresAt?.getTime() ?? now + 1) < now,
    sentTo: recips.filter((x) => x.requestId === r.id).length,
    media: media.get(r.id) ?? [],
    offers: offers
      .filter((o) => o.o.requestId === r.id)
      .map(({ o, g }) => {
        const a = agg.get(g.id)
        return {
          id: o.id,
          garageName: g.name,
          garageSlug: g.slug,
          garageCity: g.city,
          rating: a ? Math.round((a.sum / a.n) * 10) / 10 : null,
          reviewCount: a?.n ?? 0,
          distanceKm: (() => {
            const rc = recips.find((x) => x.requestId === r.id && x.garageId === g.id)
            return rc?.distanceKm != null ? Number(rc.distanceKm) : null
          })(),
          priceMin: o.priceMin != null ? Number(o.priceMin) : null,
          priceMax: o.priceMax != null ? Number(o.priceMax) : null,
          inspectionFee: Number(o.inspectionFee),
          earliestAt: o.earliestAt.toISOString(),
          message: o.message,
          status: o.status,
        }
      })
      .sort((a, b) => (a.priceMin ?? 1e12) - (b.priceMin ?? 1e12)),
  }))
}

/** Accepting an offer books the visit at that garage. */
export async function acceptRepairOffer(raw: unknown): Promise<{ ok: true; garageName: string; at: string } | Fail> {
  const me = await driver()
  if (!me) return fail("Sign in first")
  const offerId = z.string().uuid().safeParse(raw)
  if (!offerId.success) return fail("Invalid offer")
  const [row] = await db()
    .select({ o: repairRequestOffers, r: repairRequests, g: garages })
    .from(repairRequestOffers)
    .innerJoin(repairRequests, eq(repairRequests.id, repairRequestOffers.requestId))
    .innerJoin(garages, eq(garages.id, repairRequestOffers.garageId))
    .where(eq(repairRequestOffers.id, offerId.data))
    .limit(1)
  if (!row || (row.r.requesterUserId !== me.userId && row.r.requesterPhone !== me.phone)) return fail("Offer not found")
  if (!["open", "offered"].includes(row.r.status)) return fail("This request is already booked or closed")
  if (row.o.status !== "sent") return fail("This offer is no longer available")

  const [branch] = await db().select({ id: branches.id }).from(branches).where(eq(branches.garageId, row.g.id)).orderBy(desc(branches.isDefault)).limit(1)
  if (!branch) return fail("This garage can't take bookings yet")

  const [claimed] = await db()
    .update(repairRequests)
    .set({ status: "booked", acceptedOfferId: row.o.id, updatedAt: new Date() })
    .where(and(eq(repairRequests.id, row.r.id), inArray(repairRequests.status, ["open", "offered"])))
    .returning({ id: repairRequests.id })
  if (!claimed) return fail("This request was just booked")

  const startsAt = row.o.earliestAt.getTime() < Date.now() ? new Date(Date.now() + 3600_000) : row.o.earliestAt
  const bookingId = uuidv7()
  await db().insert(bookings).values({
    id: bookingId,
    garageId: row.g.id,
    branchId: branch.id,
    guestName: row.r.requesterName ?? "FixAm driver",
    guestPhone: row.r.requesterPhone,
    guestPlate: row.r.vehiclePlate,
    serviceType: `Repair request ${row.r.number}`,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 3600_000),
    status: "confirmed",
    confirmedAt: new Date(),
    source: "repair_request",
    notes: `${row.r.complaint}${row.r.vehicleMake ? ` — ${[row.r.vehicleMake, row.r.vehicleModel, row.r.vehicleYear].filter(Boolean).join(" ")}` : ""}`,
  })
  await db().update(repairRequests).set({ bookingId, updatedAt: new Date() }).where(eq(repairRequests.id, row.r.id))
  await db().update(repairRequestOffers).set({ status: "accepted", updatedAt: new Date() }).where(eq(repairRequestOffers.id, row.o.id))
  await db()
    .update(repairRequestOffers)
    .set({ status: "declined", updatedAt: new Date() })
    .where(and(eq(repairRequestOffers.requestId, row.r.id), ne(repairRequestOffers.id, row.o.id), eq(repairRequestOffers.status, "sent")))

  const when = startsAt.toLocaleString("en-GH", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
  await smsBuyer(row.g.phone, `FixAm: ${row.r.number} accepted your offer — booked for ${when}. Customer ${row.r.requesterPhone}. ${appUrl(`/g/${row.g.slug}/bookings`)}`, `rr-accepted:${row.o.id}`)
  await writeAuditLog({ garageId: row.g.id, actorUserId: me.userId, action: "repair_request.accept", entityType: "repair_request", entityId: row.r.id, after: { offerId: row.o.id, bookingId } }).catch(() => undefined)
  return { ok: true, garageName: row.g.name, at: startsAt.toISOString() }
}

export async function cancelRepairRequest(raw: unknown): Promise<{ ok: true } | Fail> {
  const me = await driver()
  if (!me) return fail("Sign in first")
  const id = z.string().uuid().safeParse(raw)
  if (!id.success) return fail("Invalid request")
  const [r] = await db()
    .update(repairRequests)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(repairRequests.id, id.data), or(eq(repairRequests.requesterUserId, me.userId), eq(repairRequests.requesterPhone, me.phone)), inArray(repairRequests.status, ["open", "offered"])))
    .returning({ id: repairRequests.id })
  return r ? { ok: true } : fail("This request can't be cancelled")
}

// ---------------------------------------------------------------------------
// Garage: Leads inbox
// ---------------------------------------------------------------------------

export type GarageLead = {
  requestId: string
  number: string
  status: string
  complaint: string
  complaintOriginal: string | null
  complaintLanguage: string
  vehicle: string | null
  plate: string | null
  warningLights: string[]
  urgency: string | null
  triage: (TriageResult & { matchedParts?: { id: string; name: string }[] }) | null
  distanceKm: number | null
  area: string | null
  createdAt: string
  isPreferred: boolean
  media: { id: string; kind: string; url: string }[]
  myOffer: { priceMin: number | null; priceMax: number | null; inspectionFee: number; earliestAt: string; message: string | null; status: string } | null
  offerCount: number
}

export async function listGarageLeads(raw: unknown): Promise<GarageLead[]> {
  const garageId = z.string().uuid().safeParse(raw)
  if (!garageId.success) return []
  const who = await staff(garageId.data)
  if (!who || !can(who.principal, "bookings.manage")) return []
  const rows = await db()
    .select({ rc: repairRequestRecipients, r: repairRequests })
    .from(repairRequestRecipients)
    .innerJoin(repairRequests, eq(repairRequests.id, repairRequestRecipients.requestId))
    .where(
      and(
        eq(repairRequestRecipients.garageId, garageId.data),
        isNull(repairRequestRecipients.declinedAt),
        or(inArray(repairRequests.status, ["open", "offered"]), eq(repairRequests.status, "booked"))!,
        gt(repairRequests.createdAt, new Date(Date.now() - 14 * 86400_000))
      )
    )
    .orderBy(desc(repairRequests.createdAt))
    .limit(60)
  const ids = rows.map((r) => r.r.id)
  if (ids.length === 0) return []
  const [offers, media] = await Promise.all([db().select().from(repairRequestOffers).where(inArray(repairRequestOffers.requestId, ids)), mediaWithUrls(ids)])
  await db()
    .update(repairRequestRecipients)
    .set({ viewedAt: new Date() })
    .where(and(eq(repairRequestRecipients.garageId, garageId.data), inArray(repairRequestRecipients.requestId, ids), isNull(repairRequestRecipients.viewedAt)))
  const now = Date.now()
  return rows
    .filter(({ r }) => r.status === "booked" ? offers.some((o) => o.requestId === r.id && o.garageId === garageId.data && o.status === "accepted") : (r.expiresAt?.getTime() ?? now + 1) > now)
    .map(({ rc, r }) => {
      const mine = offers.find((o) => o.requestId === r.id && o.garageId === garageId.data)
      return {
        requestId: r.id,
        number: r.number,
        status: r.status,
        complaint: r.complaint,
        complaintOriginal: r.complaintOriginal,
        complaintLanguage: r.complaintLanguage,
        vehicle: [r.vehicleMake, r.vehicleModel, r.vehicleYear].filter(Boolean).join(" ") || null,
        plate: r.status === "booked" ? r.vehiclePlate : null,
        warningLights: r.warningLights,
        urgency: r.urgency,
        triage: (r.triage as GarageLead["triage"]) ?? null,
        distanceKm: rc.distanceKm != null ? Number(rc.distanceKm) : null,
        area: [r.city, r.region].filter(Boolean).join(", ") || null,
        createdAt: r.createdAt.toISOString(),
        isPreferred: r.mode === "preferred",
        media: media.get(r.id) ?? [],
        myOffer: mine
          ? { priceMin: mine.priceMin != null ? Number(mine.priceMin) : null, priceMax: mine.priceMax != null ? Number(mine.priceMax) : null, inspectionFee: Number(mine.inspectionFee), earliestAt: mine.earliestAt.toISOString(), message: mine.message, status: mine.status }
          : null,
        offerCount: offers.filter((o) => o.requestId === r.id && o.status !== "withdrawn").length,
      }
    })
}

const offerSchema = z
  .object({
    garageId: z.string().uuid(),
    requestId: z.string().uuid(),
    priceMin: z.number().int().min(0).max(100_000_000).nullable(),
    priceMax: z.number().int().min(0).max(100_000_000).nullable(),
    inspectionFee: z.number().int().min(0).max(10_000_000).default(0),
    earliestAt: z.string().datetime({ offset: true }),
    message: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.priceMin == null || v.priceMax == null || v.priceMin <= v.priceMax, { message: "Minimum price must be below the maximum" })

export async function sendRepairOffer(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = offerSchema.safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the offer")
  const d = parsed.data
  const who = await staff(d.garageId)
  if (!who || !can(who.principal, "bookings.manage")) return fail("No permission")
  const [rc] = await db()
    .select({ r: repairRequests })
    .from(repairRequestRecipients)
    .innerJoin(repairRequests, eq(repairRequests.id, repairRequestRecipients.requestId))
    .where(and(eq(repairRequestRecipients.requestId, d.requestId), eq(repairRequestRecipients.garageId, d.garageId)))
    .limit(1)
  if (!rc) return fail("Lead not found")
  if (!["open", "offered"].includes(rc.r.status)) return fail("The driver has already booked")
  await db()
    .insert(repairRequestOffers)
    .values({ requestId: d.requestId, garageId: d.garageId, priceMin: d.priceMin != null ? BigInt(d.priceMin) : null, priceMax: d.priceMax != null ? BigInt(d.priceMax) : null, inspectionFee: BigInt(d.inspectionFee), earliestAt: new Date(d.earliestAt), message: d.message || null, createdBy: who.userId })
    .onConflictDoUpdate({
      target: [repairRequestOffers.requestId, repairRequestOffers.garageId],
      set: { priceMin: d.priceMin != null ? BigInt(d.priceMin) : null, priceMax: d.priceMax != null ? BigInt(d.priceMax) : null, inspectionFee: BigInt(d.inspectionFee), earliestAt: new Date(d.earliestAt), message: d.message || null, status: "sent", updatedAt: new Date() },
    })
  await db().update(repairRequests).set({ status: "offered", updatedAt: new Date() }).where(and(eq(repairRequests.id, d.requestId), eq(repairRequests.status, "open")))
  const [g] = await db().select({ name: garages.name }).from(garages).where(eq(garages.id, d.garageId)).limit(1)
  const price = d.priceMin != null ? ` GH₵${(d.priceMin / 100).toFixed(0)}${d.priceMax != null && d.priceMax !== d.priceMin ? `–${(d.priceMax / 100).toFixed(0)}` : ""}` : ""
  await smsBuyer(rc.r.requesterPhone, `FixAm: ${g?.name ?? "A garage"} sent an offer for ${rc.r.number}${price}. Compare and book: ${appUrl("/portal/requests")}`, `rr-offer:${d.requestId}:${d.garageId}`)
  return { ok: true }
}

export async function declineLead(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({ garageId: z.string().uuid(), requestId: z.string().uuid() }).safeParse(raw)
  if (!parsed.success) return fail("Invalid lead")
  const who = await staff(parsed.data.garageId)
  if (!who || !can(who.principal, "bookings.manage")) return fail("No permission")
  await db().update(repairRequestRecipients).set({ declinedAt: new Date() }).where(and(eq(repairRequestRecipients.requestId, parsed.data.requestId), eq(repairRequestRecipients.garageId, parsed.data.garageId)))
  await db().update(repairRequestOffers).set({ status: "withdrawn", updatedAt: new Date() }).where(and(eq(repairRequestOffers.requestId, parsed.data.requestId), eq(repairRequestOffers.garageId, parsed.data.garageId), eq(repairRequestOffers.status, "sent")))
  return { ok: true }
}

export async function countNewLeads(raw: unknown): Promise<number> {
  const garageId = z.string().uuid().safeParse(raw)
  if (!garageId.success) return 0
  const who = await staff(garageId.data)
  if (!who) return 0
  const rows = await db()
    .select({ id: repairRequestRecipients.id })
    .from(repairRequestRecipients)
    .innerJoin(repairRequests, eq(repairRequests.id, repairRequestRecipients.requestId))
    .where(and(eq(repairRequestRecipients.garageId, garageId.data), isNull(repairRequestRecipients.viewedAt), isNull(repairRequestRecipients.declinedAt), inArray(repairRequests.status, ["open", "offered"])))
  return rows.length
}

export async function saveGarageSpecialties(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({ garageId: z.string().uuid(), specialties: z.array(z.enum(SPECIALTY_IDS)).max(10) }).safeParse(raw)
  if (!parsed.success) return fail("Invalid specialties")
  const who = await staff(parsed.data.garageId)
  if (!who || !can(who.principal, "garage.settings.manage")) return fail("No permission")
  await db()
    .insert(garageSettings)
    .values({ garageId: parsed.data.garageId, specialties: parsed.data.specialties })
    .onConflictDoUpdate({ target: garageSettings.garageId, set: { specialties: parsed.data.specialties, updatedAt: new Date() } })
  return { ok: true }
}
