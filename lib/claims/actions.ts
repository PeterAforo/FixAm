"use server"

import { z } from "zod"
import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  brokerMembers,
  brokers,
  customers,
  estimates,
  garages,
  insuranceClaimEvents,
  insuranceClaims,
  jobs,
  users,
  vehicles,
} from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { getPortalPhone } from "@/lib/portal/session"
import { resolveMembership, writeAuditLog } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { rateLimit } from "@/lib/rate-limit"
import { storageProvider } from "@/lib/integrations/storage"
import { uuidv7 } from "@/lib/id"
import { claimReadyForSubmit } from "./core"
import {
  claimEventsFor,
  claimForBroker,
  claimForGarage,
  claimForUser,
  driverBrokers,
  driverCustomerIds,
  driverVehicles,
  nextClaimNumber,
  notifyBrokerNewClaim,
  routeClaim,
  serializeClaim,
  transitionClaim,
} from "./service"

type Fail = { ok: false; error: string }
const staffPrincipal = (role: StaffRole, garageId: string, branchId: string | null) =>
  ({ kind: "staff" as const, role, garageId, branchId })

async function driver() {
  const [userId, phone] = await Promise.all([getSessionUserId(), getPortalPhone()])
  return userId && phone ? { userId, phone } : null
}

const draftSchema = z.object({
  occurredAt: z.string().datetime({ offset: true }).optional().or(z.literal("")),
  location: z.string().trim().max(300).optional(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  policeReportNo: z.string().trim().max(60).optional(),
  otherPartyName: z.string().trim().max(120).optional(),
  otherPartyPhone: z.string().trim().max(20).optional(),
  otherPartyPlate: z.string().trim().max(20).optional(),
  otherPartyInsurer: z.string().trim().max(120).optional(),
  injuries: z.boolean().optional(),
  description: z.string().trim().max(2000).optional(),
  vehicleId: z.string().uuid().optional(),
  vehicleRef: z.string().trim().max(120).optional(),
  garageId: z.string().uuid().optional(),
  brokerId: z.string().uuid().optional(),
  insurerName: z.string().trim().max(120).optional(),
})

function draftToColumns(d: z.infer<typeof draftSchema>) {
  return {
    occurredAt: d.occurredAt ? new Date(d.occurredAt) : null,
    location: d.location || null,
    lat: d.lat != null ? d.lat.toFixed(6) : null,
    lng: d.lng != null ? d.lng.toFixed(6) : null,
    policeReportNo: d.policeReportNo || null,
    otherParty: d.otherPartyName || d.otherPartyPhone || d.otherPartyPlate || d.otherPartyInsurer
      ? { name: d.otherPartyName || null, phone: d.otherPartyPhone || null, plate: d.otherPartyPlate || null, insurer: d.otherPartyInsurer || null }
      : null,
    injuries: d.injuries ?? null,
    description: d.description || null,
    vehicleId: d.vehicleId || null,
    vehicleRef: d.vehicleRef || "Vehicle",
    garageId: d.garageId || null,
    brokerId: d.brokerId || null,
    insurerName: d.insurerName || null,
  }
}

/** Autosave the wizard — safe to call on every change. */
export async function saveClaimDraft(raw: unknown): Promise<{ ok: true; claimId: string } | Fail> {
  const me = await driver()
  if (!me) return { ok: false, error: "Sign in first" }
  const parsed = draftSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Check the form" }
  const d = parsed.data
  const claimId = (raw as { claimId?: string }).claimId
  const cols = draftToColumns(d)
  const draft = { ...d }

  if (claimId && /^[0-9a-f-]{36}$/i.test(claimId)) {
    const [u] = await db()
      .update(insuranceClaims)
      .set({ ...cols, draft, updatedAt: new Date() })
      .where(and(eq(insuranceClaims.id, claimId), eq(insuranceClaims.userId, me.userId), eq(insuranceClaims.status, "draft")))
      .returning({ id: insuranceClaims.id })
    if (u) return { ok: true, claimId: u.id }
  }
  const [c] = await db()
    .insert(insuranceClaims)
    .values({
      id: uuidv7(),
      number: await nextClaimNumber(),
      userId: me.userId,
      status: "draft",
      draft,
      ...cols,
    })
    .returning({ id: insuranceClaims.id })
  return { ok: true, claimId: c!.id }
}

/** Final submit — photos + police report come as FormData. */
export async function submitClaim(form: FormData): Promise<{ ok: true; claimId: string } | Fail> {
  const me = await driver()
  if (!me) return { ok: false, error: "Sign in first" }
  const rl = await rateLimit(`claim:${me.userId}`, 6, 3600)
  if (!rl.ok) return { ok: false, error: "Too many claims — please wait a while" }

  const claimId = String(form.get("claimId") ?? "")
  const [c] = claimId && /^[0-9a-f-]{36}$/i.test(claimId)
    ? await db().select().from(insuranceClaims).where(and(eq(insuranceClaims.id, claimId), eq(insuranceClaims.userId, me.userId), eq(insuranceClaims.status, "draft"))).limit(1)
    : [null]
  if (!c) return { ok: false, error: "Draft not found — fill the form again" }

  // Upload photos (max 6) + police report doc.
  const folder = uuidv7()
  const photos: string[] = []
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0 && f.type.startsWith("image/")).slice(0, 6)
  for (const f of files) {
    if (f.size > 4 * 1024 * 1024) continue
    const key = `claims/${folder}/${uuidv7()}.${(f.type.split("/")[1] ?? "jpg").replace(/[^a-z0-9]/g, "")}`
    await storageProvider().put(key, Buffer.from(await f.arrayBuffer()), f.type).then(() => photos.push(key)).catch(() => undefined)
  }
  const docs: string[] = []
  const doc = form.get("policeReport")
  if (doc instanceof File && doc.size > 0 && doc.size <= 4 * 1024 * 1024) {
    const ext = (doc.type.split("/")[1] ?? "pdf").replace(/[^a-z0-9]/g, "")
    const key = `claims/${folder}/${uuidv7()}.${ext}`
    await storageProvider().put(key, Buffer.from(await doc.arrayBuffer()), doc.type || "application/octet-stream").then(() => docs.push(key)).catch(() => undefined)
  }

  // Merge any final field edits from the form.
  const merged = draftSchema.safeParse({
    occurredAt: form.get("occurredAt") || undefined,
    location: form.get("location") || undefined,
    lat: form.get("lat") ? Number(form.get("lat")) : undefined,
    lng: form.get("lng") ? Number(form.get("lng")) : undefined,
    policeReportNo: form.get("policeReportNo") || undefined,
    otherPartyName: form.get("otherPartyName") || undefined,
    otherPartyPhone: form.get("otherPartyPhone") || undefined,
    otherPartyPlate: form.get("otherPartyPlate") || undefined,
    otherPartyInsurer: form.get("otherPartyInsurer") || undefined,
    injuries: form.get("injuries") === "yes" ? true : form.get("injuries") === "no" ? false : undefined,
    description: form.get("description") || undefined,
    vehicleId: form.get("vehicleId") || undefined,
    vehicleRef: form.get("vehicleRef") || undefined,
    garageId: form.get("garageId") || undefined,
    brokerId: form.get("brokerId") || undefined,
    insurerName: form.get("insurerName") || undefined,
  })
  const priorPhotos = (c.photos as string[] | null) ?? []
  const priorDocs = (c.documents as string[] | null) ?? []
  const allPhotos = [...priorPhotos, ...photos]
  const allDocs = [...priorDocs, ...docs]
  if (merged.success) {
    const cols = draftToColumns(merged.data)
    await db().update(insuranceClaims).set({ ...cols, draft: merged.data, photos: allPhotos, documents: allDocs, updatedAt: new Date() }).where(eq(insuranceClaims.id, c.id))
    Object.assign(c, cols, { photos: allPhotos, documents: allDocs })
  } else {
    await db().update(insuranceClaims).set({ photos: allPhotos, documents: allDocs, updatedAt: new Date() }).where(eq(insuranceClaims.id, c.id))
    c.photos = allPhotos
    c.documents = allDocs
  }
  const ready = claimReadyForSubmit({
    occurredAt: !!c.occurredAt,
    photos: allPhotos.length,
    injuries: c.injuries,
    otherParty: !!c.otherParty,
  })
  if (!ready.ok) {
    return { ok: false, error: `Before you submit we still need: ${ready.missing.join(", ")}` }
  }

  // Resolve vehicle/customer display ref.
  let vehicleRef = c.vehicleRef
  if (c.vehicleId) {
    const [v] = await db().select({ plate: vehicles.plateNumber, make: vehicles.make, model: vehicles.model }).from(vehicles).where(eq(vehicles.id, c.vehicleId)).limit(1)
    if (v) vehicleRef = [v.plate, v.make, v.model].filter(Boolean).join(" ")
  }
  const custIds = await driverCustomerIds(me.userId)
  const [cust] = custIds.length ? await db().select({ id: customers.id }).from(customers).where(inArray(customers.id, custIds)).limit(1) : [null]

  const routed = await routeClaim({ ...c, vehicleRef })
  const res = await transitionClaim({
    claimId: c.id,
    to: "submitted",
    actor: "driver",
    actorUserId: me.userId,
    note: routed.brokerId ? "Sent to your broker" : routed.insurerContact ? `Sent to ${routed.insurerName}` : "Submitted",
    patch: { vehicleRef, brokerId: routed.brokerId ?? c.brokerId, insurerName: routed.insurerName ?? c.insurerName, insurerContact: routed.insurerContact ?? null, customerId: cust?.id ?? c.customerId },
  })
  if (!res.ok) return { ok: false, error: res.error }
  await notifyBrokerNewClaim(res.claim).catch(() => undefined)
  void writeAuditLog({ garageId: null, actorUserId: me.userId, action: "claim.submit", entityType: "insurance_claim", entityId: c.id, after: { number: c.number } }).catch(() => undefined)
  return { ok: true, claimId: c.id }
}

export async function listMyClaims() {
  const me = await driver()
  if (!me) return []
  const rows = await db()
    .select({ c: insuranceClaims, garageName: garages.name, brokerName: brokers.businessName })
    .from(insuranceClaims)
    .leftJoin(garages, eq(garages.id, insuranceClaims.garageId))
    .leftJoin(brokers, eq(brokers.id, insuranceClaims.brokerId))
    .where(eq(insuranceClaims.userId, me.userId))
    .orderBy(desc(insuranceClaims.createdAt))
    .limit(20)
  return rows.map((r) => serializeClaim(r.c, { garageName: r.garageName, brokerName: r.brokerName }))
}

export async function getMyClaim(claimId: string) {
  const me = await driver()
  if (!me || !/^[0-9a-f-]{36}$/i.test(claimId)) return null
  const c = await claimForUser(claimId, me.userId)
  if (!c) return null
  const [g] = c.garageId ? await db().select({ name: garages.name }).from(garages).where(eq(garages.id, c.garageId)).limit(1) : [null]
  const [b] = c.brokerId ? await db().select({ name: brokers.businessName }).from(brokers).where(eq(brokers.id, c.brokerId)).limit(1) : [null]
  const events = await claimEventsFor(c.id)
  return {
    claim: serializeClaim(c, { garageName: g?.name ?? null, brokerName: b?.name ?? null }),
    events: events.map((e) => ({ id: e.id, status: e.status, actor: e.actor, note: e.note, at: e.createdAt.toISOString() })),
  }
}

export async function getClaimFormData() {
  const me = await driver()
  if (!me) return null
  const [vehicles, brokersList] = await Promise.all([driverVehicles(me.userId), driverBrokers(me.userId)])
  return { vehicles, brokers: brokersList }
}

export async function cancelMyClaim(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({ claimId: z.string().uuid() }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Invalid input" }
  const me = await driver()
  if (!me) return { ok: false, error: "Sign in first" }
  const [c] = await db().select().from(insuranceClaims).where(and(eq(insuranceClaims.id, parsed.data.claimId), eq(insuranceClaims.userId, me.userId))).limit(1)
  if (!c) return { ok: false, error: "Claim not found" }
  if (!["draft", "submitted"].includes(c.status)) return { ok: false, error: "This claim can no longer be cancelled" }
  await transitionClaim({ claimId: c.id, to: "rejected", actor: "driver", actorUserId: me.userId, note: "Withdrawn by the driver" })
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Broker
// ---------------------------------------------------------------------------

async function brokerCtx() {
  const userId = await getSessionUserId()
  if (!userId) return null
  const [m] = await db()
    .select({ brokerId: brokerMembers.brokerId, role: brokerMembers.role })
    .from(brokerMembers)
    .where(eq(brokerMembers.userId, userId))
    .limit(1)
  return m ? { userId, brokerId: m.brokerId, role: m.role } : null
}

export async function listBrokerClaims() {
  const ctx = await brokerCtx()
  if (!ctx) return []
  const rows = await db()
    .select({ c: insuranceClaims, driverName: users.fullName, driverPhone: users.phone })
    .from(insuranceClaims)
    .innerJoin(users, eq(users.id, insuranceClaims.userId))
    .where(eq(insuranceClaims.brokerId, ctx.brokerId))
    .orderBy(desc(insuranceClaims.createdAt))
    .limit(100)
  return rows.map((r) => ({ ...serializeClaim(r.c), driverName: r.driverName, driverPhone: r.driverPhone }))
}

export async function getBrokerClaim(claimId: string) {
  const ctx = await brokerCtx()
  if (!ctx || !/^[0-9a-f-]{36}$/i.test(claimId)) return null
  const c = await claimForBroker(claimId, ctx.brokerId)
  if (!c) return null
  const [driver] = await db().select({ name: users.fullName, phone: users.phone }).from(users).where(eq(users.id, c.userId)).limit(1)
  const events = await claimEventsFor(c.id)
  return {
    claim: { ...serializeClaim(c), driverName: driver?.name ?? null, driverPhone: driver?.phone ?? null },
    events: events.map((e) => ({ id: e.id, status: e.status, actor: e.actor, note: e.note, at: e.createdAt.toISOString() })),
  }
}

const brokerActionSchema = z.object({
  claimId: z.string().uuid(),
  action: z.enum(["assess", "approve", "partially_approve", "reject", "settle"]),
  approvedAmount: z.number().min(0).max(10_000_000).optional(), // cedis
  note: z.string().trim().max(500).optional(),
})

export async function brokerClaimAction(raw: unknown): Promise<{ ok: true } | Fail> {
  const ctx = await brokerCtx()
  if (!ctx) return { ok: false, error: "Sign in first" }
  const parsed = brokerActionSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Invalid input" }
  const d = parsed.data
  const toMap = { assess: "assessing", approve: "approved", partially_approve: "partially_approved", reject: "rejected", settle: "settled" } as const
  const to = toMap[d.action]
  const patch: Partial<typeof insuranceClaims.$inferInsert> = {}
  if (d.action === "approve" || d.action === "partially_approve") {
    if (d.approvedAmount == null) return { ok: false, error: "Enter the approved amount" }
    patch.approvedAmount = BigInt(Math.round(d.approvedAmount * 100))
  }
  const res = await transitionClaim({ claimId: d.claimId, to, actor: "broker", actorUserId: ctx.userId, note: d.note ?? null, patch })
  return res.ok ? { ok: true } : { ok: false, error: res.error }
}

// ---------------------------------------------------------------------------
// Garage
// ---------------------------------------------------------------------------

async function garageCtx(garageId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return { userId, membership: m, principal: staffPrincipal(m.role, garageId, m.branchId) }
}

export async function listGarageClaims(garageId: string) {
  const ctx = await garageCtx(garageId)
  if (!ctx) return []
  const canSee = can(ctx.principal, "claims.estimate") || can(ctx.principal, "claims.manage") || ["owner", "manager", "service_advisor"].includes(ctx.membership.role)
  if (!canSee) return []
  const rows = await db()
    .select({ c: insuranceClaims, driverName: users.fullName, driverPhone: users.phone })
    .from(insuranceClaims)
    .innerJoin(users, eq(users.id, insuranceClaims.userId))
    .where(eq(insuranceClaims.garageId, garageId))
    .orderBy(desc(insuranceClaims.createdAt))
    .limit(100)
  return rows.map((r) => ({ ...serializeClaim(r.c), driverName: r.driverName, driverPhone: r.driverPhone }))
}

export async function getGarageClaim(garageId: string, claimId: string) {
  const ctx = await garageCtx(garageId)
  if (!ctx || !/^[0-9a-f-]{36}$/i.test(claimId)) return null
  const c = await claimForGarage(claimId, garageId)
  if (!c) return null
  const [driver] = await db().select({ name: users.fullName, phone: users.phone }).from(users).where(eq(users.id, c.userId)).limit(1)
  const events = await claimEventsFor(c.id)
  return {
    claim: { ...serializeClaim(c), driverName: driver?.name ?? null, driverPhone: driver?.phone ?? null },
    events: events.map((e) => ({ id: e.id, status: e.status, actor: e.actor, note: e.note, at: e.createdAt.toISOString() })),
  }
}

/** Garage links the claim to a job and/or records the repair estimate. */
export async function garageSetClaimEstimate(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({
    garageId: z.string().uuid(),
    claimId: z.string().uuid(),
    jobId: z.string().uuid().optional(),
    estimateId: z.string().uuid().optional(),
    amountGhs: z.number().min(0).max(10_000_000).optional(),
  }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Invalid input" }
  const d = parsed.data
  const ctx = await garageCtx(d.garageId)
  if (!ctx) return { ok: false, error: "Sign in first" }
  if (!can(ctx.principal, "claims.estimate")) return { ok: false, error: "No permission to estimate claims" }
  const c = await claimForGarage(d.claimId, d.garageId)
  if (!c) return { ok: false, error: "Claim not found" }
  if (["rejected", "settled", "repair_authorised"].includes(c.status)) return { ok: false, error: "This claim is closed" }

  const patch: Partial<typeof insuranceClaims.$inferInsert> = { updatedAt: new Date() }
  if (d.jobId) {
    const [j] = await db().select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, d.jobId), eq(jobs.garageId, d.garageId), isNull(jobs.deletedAt))).limit(1)
    if (!j) return { ok: false, error: "Job not found" }
    patch.jobId = d.jobId
  }
  if (d.estimateId) {
    const [e] = await db().select({ id: estimates.id, total: estimates.total }).from(estimates).where(and(eq(estimates.id, d.estimateId), eq(estimates.garageId, d.garageId))).limit(1)
    if (!e) return { ok: false, error: "Estimate not found" }
    patch.estimateId = d.estimateId
    patch.estimateAmount = e.total
  } else if (d.amountGhs != null) {
    patch.estimateAmount = BigInt(Math.round(d.amountGhs * 100))
  }
  await db().update(insuranceClaims).set(patch).where(eq(insuranceClaims.id, c.id))
  await db().insert(insuranceClaimEvents).values({ claimId: c.id, status: c.status, actor: "garage", actorUserId: ctx.userId, note: "Repair estimate added" }).catch(() => undefined)
  return { ok: true }
}

/** Garage moves approved/partly-approved claims to repair_authorised — approves the linked estimate. */
export async function garageAuthoriseRepair(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({ garageId: z.string().uuid(), claimId: z.string().uuid(), note: z.string().trim().max(300).optional() }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Invalid input" }
  const d = parsed.data
  const ctx = await garageCtx(d.garageId)
  if (!ctx) return { ok: false, error: "Sign in first" }
  if (!can(ctx.principal, "claims.estimate")) return { ok: false, error: "No permission" }
  const c = await claimForGarage(d.claimId, d.garageId)
  if (!c) return { ok: false, error: "Claim not found" }

  const res = await transitionClaim({ claimId: c.id, to: "repair_authorised", actor: "garage", actorUserId: ctx.userId, note: d.note ?? "Repair authorised" })
  if (!res.ok) return { ok: false, error: res.error }
  // Approve the linked estimate + job so work can start.
  if (c.estimateId) {
    await db().update(estimates).set({ status: "approved", updatedAt: new Date() }).where(and(eq(estimates.id, c.estimateId), eq(estimates.status, "sent"))).catch(() => undefined)
  }
  if (c.jobId) {
    await db().update(jobs).set({ status: "approved", updatedAt: new Date() }).where(and(eq(jobs.id, c.jobId), eq(jobs.garageId, d.garageId))).catch(() => undefined)
  }
  void writeAuditLog({ garageId: d.garageId, actorUserId: ctx.userId, action: "claim.repair_authorised", entityType: "insurance_claim", entityId: c.id, after: { estimateId: c.estimateId, jobId: c.jobId } }).catch(() => undefined)
  return { ok: true }
}
