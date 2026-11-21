"use server"
import { z } from "zod"
import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  bookings, customers, documents, dueItems, estimates, invoices,
  jobs, messageLogs, odometerReadings, payments, privacyRequests,
  renewalRequests, users, vehicles,
} from "@/lib/db/schema"
import { writeAuditLog, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { getPortalPhone } from "@/lib/portal/session"

// ---------------------------------------------------------------------------
// Customer-facing requests (portal session)
// ---------------------------------------------------------------------------

export async function requestDataExport(): Promise<ActionResult<{ requestId: string }>> {
  const phone = await getPortalPhone()
  if (!phone) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Portal session required" } }
  const [req] = await db().insert(privacyRequests).values({
    phone, type: "export", status: "requested", requestedBy: "customer",
  }).returning({ id: privacyRequests.id })
  return { ok: true, data: { requestId: req!.id } }
}

export async function requestDataDeletion(): Promise<ActionResult<{ requestId: string }>> {
  const phone = await getPortalPhone()
  if (!phone) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Portal session required" } }
  const [req] = await db().insert(privacyRequests).values({
    phone, type: "delete", status: "requested", requestedBy: "customer",
  }).returning({ id: privacyRequests.id })
  return { ok: true, data: { requestId: req!.id } }
}

// ---------------------------------------------------------------------------
// Platform admin handling
// ---------------------------------------------------------------------------

async function requirePlatformAdmin(userId: string) {
  const [u] = await db().select({ isPlatformAdmin: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)).limit(1)
  return u?.isPlatformAdmin === true
}

export async function adminListPrivacyRequests() {
  const userId = await getSessionUserId()
  if (!userId || !(await requirePlatformAdmin(userId))) return { ok: false as const }
  const rows = await db().select().from(privacyRequests).orderBy(desc(privacyRequests.createdAt)).limit(100)
  return { ok: true as const, data: rows }
}

/** Build the export bundle for a customer phone across all garages. */
async function buildExportBundle(phone: string) {
  const custs = await db().select().from(customers).where(and(eq(customers.phone, phone), isNull(customers.deletedAt)))
  const customerIds = custs.map((c) => c.id)
  const garageIds = [...new Set(custs.map((c) => c.garageId))]
  if (!customerIds.length) return { customers: custs }

  const [vehicleRows, jobRows, invoiceRows, paymentRows, bookingRows, docRows, dueRows, renewalRows] = await Promise.all([
    db().select().from(vehicles).where(and(inArray(vehicles.currentOwnerId, customerIds), inArray(vehicles.garageId, garageIds), isNull(vehicles.deletedAt))),
    db().select().from(jobs).where(and(inArray(jobs.customerId, customerIds), inArray(jobs.garageId, garageIds), isNull(jobs.deletedAt))),
    db().select().from(invoices).where(and(inArray(invoices.customerId, customerIds), inArray(invoices.garageId, garageIds))),
    db().select().from(payments).where(and(inArray(payments.customerId, customerIds), inArray(payments.garageId, garageIds))),
    db().select().from(bookings).where(and(inArray(bookings.customerId, customerIds), inArray(bookings.garageId, garageIds))),
    db().select().from(documents).where(and(inArray(documents.customerId, customerIds), inArray(documents.garageId, garageIds))),
    db().select().from(dueItems).where(and(inArray(dueItems.customerId, customerIds), inArray(dueItems.garageId, garageIds))),
    db().select().from(renewalRequests).where(and(inArray(renewalRequests.customerId, customerIds), inArray(renewalRequests.garageId, garageIds))),
  ])
  const estimateRows = jobRows.length
    ? await db().select().from(estimates).where(inArray(estimates.jobId, jobRows.map((j) => j.id)))
    : []
  const odoRows = vehicleRows.length
    ? await db().select().from(odometerReadings).where(inArray(odometerReadings.vehicleId, vehicleRows.map((v) => v.id)))
    : []
  const msgRows = customerIds.length
    ? await db().select().from(messageLogs).where(and(inArray(messageLogs.customerId, customerIds), inArray(messageLogs.garageId, garageIds)))
    : []

  return {
    exportedAt: new Date().toISOString(),
    customers: custs,
    vehicles: vehicleRows,
    odometerReadings: odoRows,
    jobs: jobRows, estimates: estimateRows,
    invoices: invoiceRows, payments: paymentRows, bookings: bookingRows,
    documents: docRows, dueItems: dueRows, renewalRequests: renewalRows,
    messageLogs: msgRows,
  }
}

/** Anonymise all customer records for a phone (Act 843 deletion). */
async function anonymiseCustomer(phone: string) {
  const custs = await db().select().from(customers).where(and(eq(customers.phone, phone), isNull(customers.deletedAt)))
  for (const c of custs) {
    await db().update(customers).set({
      fullName: "Deleted customer",
      companyName: null,
      phone: `del-${c.id.slice(0, 8)}`,
      altPhone: null,
      email: null,
      nationalIdNumber: null,
      address: null,
      notes: null,
      userId: null,
      deletedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(customers.id, c.id))
  }
  return custs.length
}

export async function adminFulfillPrivacyRequest(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in" } }
  if (!(await requirePlatformAdmin(userId))) return { ok: false, error: { code: "FORBIDDEN", message: "Platform admin only" } }
  const parsed = z.object({ requestId: z.string().uuid(), action: z.enum(["complete", "reject"]) }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }

  const [req] = await db().select().from(privacyRequests).where(eq(privacyRequests.id, parsed.data.requestId)).limit(1)
  if (!req) return { ok: false, error: { code: "NOT_FOUND", message: "Request not found" } }
  if (req.status !== "requested") return { ok: false, error: { code: "VALIDATION", message: "Already handled" } }

  if (parsed.data.action === "reject") {
    await db().update(privacyRequests).set({ status: "rejected", handledBy: userId, handledAt: new Date(), updatedAt: new Date() }).where(eq(privacyRequests.id, req.id))
    return { ok: true, data: { ok: true as const } }
  }

  if (req.type === "export" && req.phone) {
    const bundle = await buildExportBundle(req.phone)
    await db().update(privacyRequests).set({
      status: "completed", payload: bundle, handledBy: userId, handledAt: new Date(), updatedAt: new Date(),
    }).where(eq(privacyRequests.id, req.id))
  } else if (req.type === "delete" && req.phone) {
    await anonymiseCustomer(req.phone)
    await db().update(privacyRequests).set({
      status: "completed", handledBy: userId, handledAt: new Date(), updatedAt: new Date(),
    }).where(eq(privacyRequests.id, req.id))
  } else {
    return { ok: false, error: { code: "VALIDATION", message: "Request missing phone" } }
  }

  await writeAuditLog({
    garageId: req.garageId, actorUserId: userId,
    action: `privacy.${req.type}.${parsed.data.action}`, entityType: "privacy_request", entityId: req.id,
    after: { phone: req.phone, type: req.type },
  })
  return { ok: true, data: { ok: true as const } }
}
