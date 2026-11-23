import "server-only"
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  brokerRequests,
  brokers,
  customers,
  garages,
  insuranceClaimEvents,
  insuranceClaims,
  insurancePartners,
  insurancePolicies,
  users,
  vehicles,
} from "@/lib/db/schema"
import { appUrl, sendDirectSms } from "@/lib/messaging/direct"
import { canTransition, newClaimNumber, type ClaimStatus } from "./core"

type Claim = typeof insuranceClaims.$inferSelect

export async function nextClaimNumber(): Promise<string> {
  const rows = await db().execute<{ v: string }>(sql`select lpad((floor(random() * 1000000))::text, 6, '0') as v`)
  return newClaimNumber(rows[0]?.v ?? String(Date.now()).slice(-6))
}

async function event(claimId: string, status: string, actor: string, note: string | null, actorUserId: string | null) {
  await db().insert(insuranceClaimEvents).values({ claimId, status, actor, note, actorUserId }).catch(() => undefined)
}

async function claimRow(id: string) {
  const [c] = await db().select().from(insuranceClaims).where(eq(insuranceClaims.id, id)).limit(1)
  return c ?? null
}

/** Phones we can reach for each party. */
async function parties(c: Claim) {
  const [driver] = await db().select({ phone: users.phone, name: users.fullName }).from(users).where(eq(users.id, c.userId)).limit(1)
  const [garage] = c.garageId
    ? await db().select({ phone: garages.phone, name: garages.name, slug: garages.slug }).from(garages).where(eq(garages.id, c.garageId)).limit(1)
    : [null]
  const [broker] = c.brokerId
    ? await db().select({ phone: brokers.phone, name: brokers.businessName }).from(brokers).where(eq(brokers.id, c.brokerId)).limit(1)
    : [null]
  return { driver, garage, broker }
}

/**
 * Route a submitted claim: the driver's broker if we can find one
 * (brokerId chosen at submit, else the broker of their most recent
 * renewal request), else the insurer contact on the vehicle's policy.
 */
export async function routeClaim(c: Claim): Promise<{ brokerId: string | null; insurerName: string | null; insurerContact: string | null }> {
  if (c.brokerId) {
    const [b] = await db().select({ name: brokers.businessName }).from(brokers).where(eq(brokers.id, c.brokerId)).limit(1)
    return { brokerId: c.brokerId, insurerName: b?.name ?? null, insurerContact: null }
  }
  // Most recent broker this driver has dealt with.
  const phone = (await db().select({ phone: users.phone }).from(users).where(eq(users.id, c.userId)).limit(1))[0]?.phone
  const [recent] = phone
    ? await db()
        .select({ brokerId: brokerRequests.brokerId })
        .from(brokerRequests)
        .where(eq(brokerRequests.requesterPhone, phone))
        .orderBy(desc(brokerRequests.createdAt))
        .limit(1)
    : [null]
  if (recent?.brokerId) {
    await db().update(insuranceClaims).set({ brokerId: recent.brokerId, updatedAt: new Date() }).where(eq(insuranceClaims.id, c.id))
    const [b] = await db().select({ name: brokers.businessName }).from(brokers).where(eq(brokers.id, recent.brokerId)).limit(1)
    return { brokerId: recent.brokerId, insurerName: b?.name ?? null, insurerContact: null }
  }
  // Fall back to the insurer on the vehicle's current policy.
  if (c.vehicleId) {
    const [pol] = await db()
      .select({ insurerName: insurancePolicies.insurerName, partnerId: insurancePolicies.partnerId })
      .from(insurancePolicies)
      .where(and(eq(insurancePolicies.vehicleId, c.vehicleId), eq(insurancePolicies.isCurrent, true)))
      .orderBy(desc(insurancePolicies.endDate))
      .limit(1)
    if (pol?.partnerId) {
      const [p] = await db().select({ name: insurancePartners.name, phone: insurancePartners.contactPhone }).from(insurancePartners).where(eq(insurancePartners.id, pol.partnerId)).limit(1)
      if (p) {
        await db().update(insuranceClaims).set({ insurerName: p.name, insurerContact: p.phone, updatedAt: new Date() }).where(eq(insuranceClaims.id, c.id))
        return { brokerId: null, insurerName: p.name, insurerContact: p.phone }
      }
    }
    if (pol) {
      await db().update(insuranceClaims).set({ insurerName: pol.insurerName, updatedAt: new Date() }).where(eq(insuranceClaims.id, c.id))
      return { brokerId: null, insurerName: pol.insurerName, insurerContact: null }
    }
  }
  return { brokerId: null, insurerName: null, insurerContact: null }
}

/**
 * Move a claim through its lifecycle. Writes the timeline event and SMSes
 * every other party. Returns the updated claim or an error string.
 */
export async function transitionClaim(input: {
  claimId: string
  to: ClaimStatus
  actor: "driver" | "garage" | "broker" | "system"
  actorUserId?: string | null
  note?: string | null
  patch?: Partial<typeof insuranceClaims.$inferInsert>
}): Promise<{ ok: true; claim: Claim } | { ok: false; error: string }> {
  const c = await claimRow(input.claimId)
  if (!c) return { ok: false, error: "Claim not found" }
  if (!canTransition(c.status, input.to, input.actor)) {
    return { ok: false, error: `Can't move a ${c.status} claim to ${input.to}` }
  }
  const now = new Date()
  const [u] = await db()
    .update(insuranceClaims)
    .set({
      status: input.to,
      ...input.patch,
      ...(input.to === "submitted" ? { submittedAt: now } : {}),
      ...(input.to === "settled" ? { settledAt: now } : {}),
      updatedAt: now,
    })
    .where(and(eq(insuranceClaims.id, c.id), eq(insuranceClaims.status, c.status)))
    .returning()
  if (!u) return { ok: false, error: "The claim changed — refresh and try again" }
  await event(u.id, input.to, input.actor, input.note ?? null, input.actorUserId ?? null)
  await notifyClaimUpdate(u, input.to, input.note ?? null).catch(() => undefined)
  return { ok: true, claim: u }
}

/** SMS every party that isn't the actor about the new status. */
export async function notifyClaimUpdate(c: Claim, status: string, note: string | null) {
  const { driver, garage, broker } = await parties(c)
  const label = status.replace(/_/g, " ")
  const link = driver?.phone ? appUrl(`/portal/claims/${c.id}`) : appUrl("/portal/claims")
  const vars = { number: c.number, vehicle: c.vehicleRef, status: label, note: note ? ` — ${note.slice(0, 120)}` : "", link }
  const jobs: Promise<unknown>[] = []
  if (driver?.phone) jobs.push(sendDirectSms(driver.phone, "claim_status", vars))
  if (garage?.phone && garage.slug) jobs.push(sendDirectSms(garage.phone, "claim_status", { ...vars, link: appUrl(`/g/${garage.slug}/claims`) }))
  if (broker?.phone) jobs.push(sendDirectSms(broker.phone, "claim_status", { ...vars, link: appUrl("/broker/claims") }))
  await Promise.all(jobs)
}

/** The broker sees the claim land in their workspace (and a mirrored request row for their inbox). */
export async function notifyBrokerNewClaim(c: Claim) {
  const { broker } = await parties(c)
  if (!broker?.phone || !c.brokerId) return
  await sendDirectSms(broker.phone, "claim_submitted", {
    number: c.number,
    vehicle: c.vehicleRef,
    link: appUrl("/broker/claims"),
  })
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function claimEventsFor(claimId: string) {
  return db().select().from(insuranceClaimEvents).where(eq(insuranceClaimEvents.claimId, claimId)).orderBy(asc(insuranceClaimEvents.createdAt))
}

export async function claimForUser(claimId: string, userId: string) {
  const [c] = await db().select().from(insuranceClaims).where(and(eq(insuranceClaims.id, claimId), eq(insuranceClaims.userId, userId))).limit(1)
  return c ?? null
}

export async function claimForBroker(claimId: string, brokerId: string) {
  const [c] = await db().select().from(insuranceClaims).where(and(eq(insuranceClaims.id, claimId), eq(insuranceClaims.brokerId, brokerId))).limit(1)
  return c ?? null
}

export async function claimForGarage(claimId: string, garageId: string) {
  const [c] = await db().select().from(insuranceClaims).where(and(eq(insuranceClaims.id, claimId), eq(insuranceClaims.garageId, garageId))).limit(1)
  return c ?? null
}

/** Serialize with joined display names for the driver portal. */
export function serializeClaim(c: Claim, extra?: { garageName?: string | null; brokerName?: string | null; insurerName?: string | null }) {
  return {
    id: c.id,
    number: c.number,
    status: c.status,
    vehicleRef: c.vehicleRef,
    vehicleId: c.vehicleId,
    jobId: c.jobId,
    estimateId: c.estimateId,
    garageId: c.garageId,
    brokerId: c.brokerId,
    occurredAt: c.occurredAt?.toISOString() ?? null,
    location: c.location,
    lat: c.lat != null ? Number(c.lat) : null,
    lng: c.lng != null ? Number(c.lng) : null,
    policeReportNo: c.policeReportNo,
    otherParty: (c.otherParty ?? null) as { name?: string | null; phone?: string | null; plate?: string | null; insurer?: string | null } | null,
    injuries: c.injuries,
    description: c.description,
    photos: Array.isArray(c.photos) ? (c.photos as string[]) : [],
    documents: Array.isArray(c.documents) ? (c.documents as string[]) : [],
    estimateAmount: c.estimateAmount != null ? Number(c.estimateAmount) : null,
    approvedAmount: c.approvedAmount != null ? Number(c.approvedAmount) : null,
    insurerName: extra?.insurerName ?? c.insurerName,
    brokerName: extra?.brokerName ?? null,
    garageName: extra?.garageName ?? null,
    submittedAt: c.submittedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

/** The driver's customer records (one per garage) matching their phone. */
export async function driverCustomerIds(userId: string): Promise<string[]> {
  const phone = (await db().select({ phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1))[0]?.phone
  if (!phone) return []
  const rows = await db().select({ id: customers.id }).from(customers).where(eq(customers.phone, phone))
  return rows.map((r) => r.id)
}

/** Driver's vehicles for the claim wizard (across every garage they deal with). */
export async function driverVehicles(userId: string) {
  const ids = await driverCustomerIds(userId)
  if (!ids.length) return []
  return db()
    .select({ id: vehicles.id, garageId: vehicles.garageId, plateNumber: vehicles.plateNumber, make: vehicles.make, model: vehicles.model, year: vehicles.year })
    .from(vehicles)
    .where(and(inArray(vehicles.currentOwnerId, ids), isNull(vehicles.deletedAt)))
    .limit(20)
}

/** Brokers this driver has used before (for the "send to my broker" picker). */
export async function driverBrokers(userId: string) {
  const phone = (await db().select({ phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1))[0]?.phone
  if (!phone) return []
  const rows = await db()
    .select({ id: brokers.id, name: brokers.businessName, kind: brokers.kind })
    .from(brokerRequests)
    .innerJoin(brokers, eq(brokers.id, brokerRequests.brokerId))
    .where(eq(brokerRequests.requesterPhone, phone))
    .orderBy(desc(brokerRequests.createdAt))
    .limit(10)
  const seen = new Set<string>()
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
}
