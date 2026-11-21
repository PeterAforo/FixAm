"use server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { customers, portalOtps, garages } from "@/lib/db/schema"
import { sendMessage } from "@/lib/messaging/send"
import { portalPhone, sha256, setPortalSession, clearPortalSession } from "./session"
import { getPortalPhone } from "./session"
import type { ActionResult } from "@/lib/actions"

const OTP_TTL_MS = 10 * 60_000
const MAX_ATTEMPTS = 5

/** Step 1 Ã¢â‚¬â€ send a 6-digit OTP to the phone (must match a customer record). */
export async function requestPortalOtp(rawInput: unknown): Promise<ActionResult<{ sent: true }>> {
  const parsed = z.object({ phone: z.string().min(9).max(20) }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Enter your Ghana phone number" } }
  const phone = portalPhone(parsed.data.phone)
  if (!phone) return { ok: false, error: { code: "VALIDATION", message: "Enter a valid Ghana phone number (e.g. 024 000 0000)" } }

  // find garages where this phone is a customer Ã¢â‚¬â€ OTP is sent via the first
  const matches = await db().select({ garageId: customers.garageId })
    .from(customers)
    .where(eq(customers.phone, phone))
    .limit(5)
  if (!matches.length) {
    return { ok: false, error: { code: "NOT_FOUND", message: "No garage records found for this number yet" } }
  }
  const [garage] = await db().select({ name: garages.name }).from(garages)
    .where(eq(garages.id, matches[0]!.garageId)).limit(1)

  const code = String(Math.floor(100000 + Math.random() * 900000))
  await db().insert(portalOtps).values({
    phone,
    codeHash: sha256(`${phone}:${code}`),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    attempts: 0,
  }).onConflictDoUpdate({
    target: portalOtps.phone,
    set: { codeHash: sha256(`${phone}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0 },
  })

  try {
    await sendMessage({
      garageId: matches[0]!.garageId,
      channel: "sms",
      to: phone,
      templateKey: "otp",
      variables: { otp_code: code, garage_name: garage?.name ?? "FixAm" },
      idempotencyKey: `portal-otp:${phone}:${Date.now()}`,
    })
  } catch {
    // dev fallback: still allow verification so the flow is testable without SMS
  }
  return { ok: true, data: { sent: true as const } }
}

/** Step 2 Ã¢â‚¬â€ verify the OTP and open a portal session. */
export async function verifyPortalOtp(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const parsed = z.object({ phone: z.string().min(9).max(20), code: z.string().regex(/^\d{6}$/) }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Enter the 6-digit code" } }
  const phone = portalPhone(parsed.data.phone)
  if (!phone) return { ok: false, error: { code: "VALIDATION", message: "Invalid phone number" } }

  const [otp] = await db().select().from(portalOtps).where(eq(portalOtps.phone, phone)).limit(1)
  if (!otp || otp.expiresAt < new Date() || otp.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: { code: "VALIDATION", message: "Code expired Ã¢â‚¬â€ request a new one" } }
  }
  if (otp.codeHash !== sha256(`${phone}:${parsed.data.code}`)) {
    await db().update(portalOtps).set({ attempts: otp.attempts + 1 }).where(eq(portalOtps.phone, phone))
    return { ok: false, error: { code: "VALIDATION", message: "Incorrect code" } }
  }

  await db().delete(portalOtps).where(eq(portalOtps.phone, phone))
  await setPortalSession(phone)
  return { ok: true, data: { ok: true as const } }
}

export async function portalLogout(): Promise<ActionResult<{ ok: true }>> {
  await clearPortalSession()
  return { ok: true, data: { ok: true as const } }
}

/** Update notification preferences for ALL customer records with this phone. */
export async function updatePortalPreferences(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const phone = await getPortalPhone()
  if (!phone) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    whatsappOptIn: z.boolean(),
    preferredChannels: z.array(z.enum(["whatsapp", "sms", "push", "email"])).min(1),
    marketingOptIn: z.boolean(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }

  await db().update(customers).set({
    whatsappOptIn: parsed.data.whatsappOptIn,
    preferredChannels: parsed.data.preferredChannels as never,
    marketingOptIn: parsed.data.marketingOptIn,
    updatedAt: new Date(),
  }).where(eq(customers.phone, phone))
  return { ok: true, data: { ok: true as const } }
}

/** Record an odometer reading from the portal (portal-sourced). */
export async function portalUpdateMileage(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const phone = await getPortalPhone()
  if (!phone) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    vehicleId: z.string().uuid(),
    readingKm: z.number().int().min(0).max(10_000_000),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid mileage" } }

  // only vehicles owned by a customer record matching this phone
  const { vehicles, odometerReadings } = await import("@/lib/db/schema")
  const { and, eq: eq2, isNull } = await import("drizzle-orm")
  const owned = await db().select({ id: vehicles.id, garageId: vehicles.garageId, ownerId: vehicles.currentOwnerId })
    .from(vehicles)
    .innerJoin(customers, eq2(vehicles.currentOwnerId, customers.id))
    .where(and(
      eq2(vehicles.id, parsed.data.vehicleId),
      eq2(customers.phone, phone),
      isNull(vehicles.deletedAt),
    ))
    .limit(1)
  const v = owned[0]
  if (!v) return { ok: false, error: { code: "FORBIDDEN", message: "Vehicle not found" } }

  await db().insert(odometerReadings).values({
    garageId: v.garageId,
    vehicleId: v.id,
    recordedByCustomerId: v.ownerId,
    readingKm: parsed.data.readingKm,
    readAt: new Date(),
    source: "customer_update",
    status: "valid",
  })
  await db().update(vehicles).set({
    lastOdometerKm: parsed.data.readingKm,
    lastOdometerAt: new Date(),
    updatedAt: new Date(),
  }).where(eq2(vehicles.id, v.id))

  // recalc mileage predictions for this vehicle
  const { recalculateVehicleMileage } = await import("@/lib/inngest/functions/recalc-mileage")
  await recalculateVehicleMileage(v.garageId, v.id).catch(() => {})
  return { ok: true, data: { ok: true as const } }
}

/**
 * P5-04 â€” fleet manager bulk approval. Approves every pending estimate on
 * vehicles owned by this portal user's fleet customer records.
 */
export async function portalApproveFleetEstimates(rawInput: unknown): Promise<ActionResult<{ approved: number }>> {
  const parsed = z.object({ estimateIds: z.array(z.string().uuid()).min(1).max(50) }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Select estimates to approve" } }

  const phone = await getPortalPhone()
  if (!phone) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Portal session required" } }

  const custs = await db().select({ id: customers.id, garageId: customers.garageId })
    .from(customers)
    .where(and(eq(customers.phone, phone), eq(customers.type, "fleet")))
  if (!custs.length) return { ok: false, error: { code: "FORBIDDEN", message: "No fleet account for this number" } }

  const customerIds = custs.map((c) => c.id)
  const { vehicles, jobs: jobsTable, estimates: estimatesTable, jobItems } = await import("@/lib/db/schema")
  const { inArray, isNull: isNullFn } = await import("drizzle-orm")
  const { finalizeApproval } = await import("@/lib/estimates/core")

  const ownedVehicles = await db().select({ id: vehicles.id, garageId: vehicles.garageId })
    .from(vehicles)
    .where(and(inArray(vehicles.currentOwnerId, customerIds), isNullFn(vehicles.deletedAt)))
  const vehicleIds = ownedVehicles.map((v) => v.id)
  if (!vehicleIds.length) return { ok: false, error: { code: "NOT_FOUND", message: "No fleet vehicles found" } }

  // Only estimates on jobs for owned vehicles, still awaiting approval
  const pending = await db().select({ est: estimatesTable, job: jobsTable })
    .from(estimatesTable)
    .innerJoin(jobsTable, eq(jobsTable.id, estimatesTable.jobId))
    .where(and(
      inArray(estimatesTable.id, parsed.data.estimateIds),
      inArray(jobsTable.vehicleId, vehicleIds),
      inArray(estimatesTable.status, ["sent", "partially_approved"]),
    ))
  if (!pending.length) return { ok: false, error: { code: "NOT_FOUND", message: "No matching pending estimates" } }

  let approved = 0
  for (const { est } of pending) {
    const items = await db().select({ id: jobItems.id })
      .from(jobItems)
      .where(and(eq(jobItems.estimateId, est.id), eq(jobItems.garageId, est.garageId)))
    const res = await finalizeApproval({
      garageId: est.garageId,
      estimate: est,
      approvedIds: items.map((i) => i.id),
      declinedIds: [],
      method: "portal",
      onBehalfUserId: null,
      onBehalfReason: null,
      signatureName: "Fleet manager (portal)",
      actorUserId: null,
      auditAction: "estimate.portal_bulk_approve",
    })
    if (res.ok) approved++
  }

  return { ok: true, data: { approved } }
}
