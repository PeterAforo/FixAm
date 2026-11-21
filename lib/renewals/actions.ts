"use server"
import { z } from "zod"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  branches,
  customers,
  dueItems,
  garages,
  insurancePartners,
  renewalEvents,
  renewalRequests,
  vehicles,
  insurancePolicies,
  dvlaRecords,
} from "@/lib/db/schema"
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { uuidv7 } from "@/lib/id"
import { canOfferRenewal } from "./core"
import { createManualInvoice, issueInvoice } from "@/lib/money/actions"
import { nextDocNumber } from "@/lib/money/sequence"

async function requireMembership(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return { membership: m, principal: { kind: "staff" as const, role: m.role as StaffRole, garageId, branchId: m.branchId } }
}

async function addEvent(garageId: string, renewalId: string, status: string, userId: string | null, note?: string, customerVisible = true) {
  await db().insert(renewalEvents).values({
    garageId, renewalRequestId: renewalId, status: status as never,
    actorUserId: userId, note: note ?? null, customerVisible,
  })
}

async function getRenewal(garageId: string, renewalId: string) {
  const [r] = await db().select().from(renewalRequests)
    .where(and(eq(renewalRequests.id, renewalId), eq(renewalRequests.garageId, garageId))).limit(1)
  return r ?? null
}

// ---------------------------------------------------------------------------
// Staff Kanban data
// ---------------------------------------------------------------------------

export async function listRenewals(rawInput: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const }
  const parsed = z.object({ garageId: z.string().uuid(), status: z.string().optional() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }
  const ctx = await requireMembership(userId, parsed.data.garageId)
  if (!ctx || !can(ctx.principal, "renewals.view")) return { ok: false as const }

  // auto-advance awaiting_payment → paid when the linked invoice is settled
  await db().execute(sql`
    UPDATE renewal_requests r
    SET status = 'paid', updated_at = now()
    FROM invoices i
    WHERE r.invoice_id = i.id
      AND r.garage_id = ${parsed.data.garageId}
      AND r.status = 'awaiting_payment'
      AND i.balance_due <= 0
      AND i.status IN ('paid','partially_paid')
  `)

  const conds = [eq(renewalRequests.garageId, parsed.data.garageId)]
  if (parsed.data.status) conds.push(eq(renewalRequests.status, parsed.data.status as never))

  const rows = await db()
    .select({
      id: renewalRequests.id, number: renewalRequests.number, kind: renewalRequests.kind,
      dvlaRecordType: renewalRequests.dvlaRecordType, insurancePolicyType: renewalRequests.insurancePolicyType,
      status: renewalRequests.status, officialFee: renewalRequests.officialFee,
      serviceFee: renewalRequests.serviceFee, total: renewalRequests.total,
      customerName: customers.fullName, customerPhone: customers.phone,
      plate: vehicles.plateNumber, vehicleLabel: sql<string>`${vehicles.make} || ' ' || ${vehicles.model}`,
      dueItemId: renewalRequests.dueItemId, invoiceId: renewalRequests.invoiceId,
      assignedTo: renewalRequests.assignedTo, createdAt: renewalRequests.createdAt,
      updatedAt: renewalRequests.updatedAt, completedAt: renewalRequests.completedAt,
      requiredDocuments: renewalRequests.requiredDocuments,
      quoteDetails: renewalRequests.quoteDetails,
    })
    .from(renewalRequests)
    .innerJoin(customers, eq(renewalRequests.customerId, customers.id))
    .innerJoin(vehicles, eq(renewalRequests.vehicleId, vehicles.id))
    .where(and(...conds))
    .orderBy(desc(renewalRequests.updatedAt))
    .limit(200)

  return {
    ok: true as const,
    data: rows.map((r) => ({
      ...r,
      officialFee: r.officialFee != null ? Number(r.officialFee) : null,
      serviceFee: r.serviceFee != null ? Number(r.serviceFee) : null,
      total: r.total != null ? Number(r.total) : null,
    })),
  }
}

/** Renewal detail with event timeline. */
export async function getRenewalDetail(rawInput: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const }
  const parsed = z.object({ garageId: z.string().uuid(), renewalId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }
  const ctx = await requireMembership(userId, parsed.data.garageId)
  if (!ctx || !can(ctx.principal, "renewals.view")) return { ok: false as const }

  const [r] = await db().select({
    renewal: renewalRequests,
    customerName: customers.fullName,
    customerPhone: customers.phone,
    plate: vehicles.plateNumber,
    make: vehicles.make, model: vehicles.model, year: vehicles.year,
    vin: vehicles.vin,
  }).from(renewalRequests)
    .innerJoin(customers, eq(renewalRequests.customerId, customers.id))
    .innerJoin(vehicles, eq(renewalRequests.vehicleId, vehicles.id))
    .where(and(eq(renewalRequests.id, parsed.data.renewalId), eq(renewalRequests.garageId, parsed.data.garageId))).limit(1)
  if (!r) return { ok: false as const }

  const events = await db().select().from(renewalEvents)
    .where(eq(renewalEvents.renewalRequestId, r.renewal.id))
    .orderBy(renewalEvents.createdAt)

  const [partner] = r.renewal.partnerId
    ? await db().select({ name: insurancePartners.name }).from(insurancePartners).where(eq(insurancePartners.id, r.renewal.partnerId)).limit(1)
    : [null]

  return {
    ok: true as const,
    data: {
      ...r.renewal,
      officialFee: r.renewal.officialFee != null ? Number(r.renewal.officialFee) : null,
      serviceFee: r.renewal.serviceFee != null ? Number(r.renewal.serviceFee) : null,
      total: r.renewal.total != null ? Number(r.renewal.total) : null,
      customerName: r.customerName, customerPhone: r.customerPhone,
      vehicle: { plate: r.plate, label: [r.make, r.model, r.year].filter(Boolean).join(" "), vin: r.vin },
      partnerName: partner?.name ?? null,
      events: events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    },
  }
}

// ---------------------------------------------------------------------------
// Staff lifecycle actions
// ---------------------------------------------------------------------------

/** Staff-initiated renewal from an open due item. */
export async function createRenewalFromDueItem(rawInput: unknown): Promise<ActionResult<{ renewalId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({ garageId: z.string().uuid(), dueItemId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const { garageId, dueItemId } = parsed.data

  const ctx = await requireMembership(userId, garageId)
  if (!ctx || !can(ctx.principal, "renewals.process")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }
  }

  const [item] = await db().select().from(dueItems)
    .where(and(eq(dueItems.id, dueItemId), eq(dueItems.garageId, garageId))).limit(1)
  if (!item) return { ok: false, error: { code: "NOT_FOUND", message: "Due item not found" } }

  const KIND: Partial<Record<string, { kind: "insurance" | "dvla"; dvlaRecordType?: "roadworthy" | "registration_licence" | "drivers_licence" }>> = {
    insurance: { kind: "insurance" },
    roadworthy: { kind: "dvla", dvlaRecordType: "roadworthy" },
    registration_licence: { kind: "dvla", dvlaRecordType: "registration_licence" },
    drivers_licence: { kind: "dvla", dvlaRecordType: "drivers_licence" },
  }
  const map = KIND[item.type]
  if (!map) return { ok: false, error: { code: "VALIDATION", message: "This item type can't be renewed" } }

  const gate = await canOfferRenewal(garageId, map.kind)
  if (!gate.ok) return { ok: false, error: { code: "FORBIDDEN", message: gate.reason! } }

  const [existing] = await db().select({ id: renewalRequests.id }).from(renewalRequests)
    .where(and(eq(renewalRequests.dueItemId, dueItemId), sql`${renewalRequests.status} NOT IN ('completed','cancelled','failed')`)).limit(1)
  if (existing) return { ok: true, data: { renewalId: existing.id } }

  const [g] = await db().select({ insurancePartnerId: garages.insurancePartnerId }).from(garages).where(eq(garages.id, garageId)).limit(1)
  const [branch] = await db().select({ id: branches.id }).from(branches)
    .where(and(eq(branches.garageId, garageId), eq(branches.isDefault, true))).limit(1)
  const number = branch ? await nextDocNumber(garageId, branch.id, "REN", "REN") : `REN-${Date.now().toString(36).toUpperCase()}`

  const renewalId = uuidv7()
  await db().insert(renewalRequests).values({
    id: renewalId, garageId, number,
    kind: map.kind, dvlaRecordType: map.dvlaRecordType ?? null,
    vehicleId: item.vehicleId, customerId: item.customerId, dueItemId,
    status: "requested", partnerId: map.kind === "insurance" ? g?.insurancePartnerId ?? null : null,
    requiredDocuments: map.kind === "insurance"
      ? ["policy_document", "vehicle_details"]
      : ["vehicle_details", "inspection_report"],
    assignedTo: userId,
  })
  await addEvent(garageId, renewalId, "requested", userId, "Created by staff")
  await db().update(dueItems).set({ nextReminderAt: null, updatedAt: new Date() }).where(eq(dueItems.id, dueItemId))

  await writeAuditLog({ garageId, actorUserId: userId, action: "renewal.create", entityType: "renewal_request", entityId: renewalId })
  return { ok: true, data: { renewalId } }
}

/** Send a quote: official fee + service fee → invoice issued → quote_sent. */
export async function sendRenewalQuote(rawInput: unknown): Promise<ActionResult<{ renewalId: string; payUrl: string | null }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(), renewalId: z.string().uuid(),
    officialFee: z.number().int().min(0), serviceFee: z.number().int().min(0),
    notes: z.string().max(500).optional(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx || !can(ctx.principal, "renewals.process")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }
  }
  const r = await getRenewal(d.garageId, d.renewalId)
  if (!r) return { ok: false, error: { code: "NOT_FOUND", message: "Renewal not found" } }
  if (!["requested", "documents_pending", "quote_pending"].includes(r.status)) {
    return { ok: false, error: { code: "VALIDATION", message: `Can't quote from status ${r.status}` } }
  }

  const total = d.officialFee + d.serviceFee
  const label = r.kind === "insurance" ? "Insurance renewal" : `${(r.dvlaRecordType ?? "dvla").replace(/_/g, " ")} renewal`

  // renewal invoice (official fee as sundry + service fee)
  const inv = await createManualInvoice({
    garageId: d.garageId, customerId: r.customerId, vehicleId: r.vehicleId,
    notes: `Renewal ${r.number} — ${label}`,
    lines: [
      { type: "sundry", description: `${label} — official fee`, quantity: 1, unitPrice: d.officialFee, discountAmount: 0 },
      { type: "service_fee", description: `${label} — agency service fee`, quantity: 1, unitPrice: d.serviceFee, discountAmount: 0 },
    ],
  })
  if (!inv.ok) return { ok: false, error: inv.error }
  const issued = await issueInvoice({ garageId: d.garageId, invoiceId: inv.data.invoiceId })
  if (!issued.ok) return { ok: false, error: issued.error }
  const payUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/t/${issued.data.payToken}`

  await db().update(renewalRequests).set({
    status: "quote_sent",
    officialFee: BigInt(d.officialFee), serviceFee: BigInt(d.serviceFee), total: BigInt(total),
    invoiceId: inv.data.invoiceId,
    quoteDetails: { ...(typeof r.quoteDetails === "object" && r.quoteDetails ? r.quoteDetails as Record<string, unknown> : {}), notes: d.notes ?? null, commissionPesewas: d.serviceFee },
    updatedAt: new Date(),
  }).where(eq(renewalRequests.id, r.id))
  await addEvent(d.garageId, r.id, "quote_sent", userId, `Quote GH₵ ${(total / 100).toFixed(2)} sent`, true)

  await writeAuditLog({ garageId: d.garageId, actorUserId: userId, action: "renewal.quote", entityType: "renewal_request", entityId: r.id, after: { total } })
  return { ok: true, data: { renewalId: r.id, payUrl } }
}

/** Staff confirms documents received / moves to quote_pending. */
export async function requestRenewalDocuments(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({ garageId: z.string().uuid(), renewalId: z.string().uuid(), note: z.string().max(300).optional() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const { garageId, renewalId, note } = parsed.data
  const ctx = await requireMembership(userId, garageId)
  if (!ctx || !can(ctx.principal, "renewals.process")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }
  const r = await getRenewal(garageId, renewalId)
  if (!r || r.status !== "requested") return { ok: false, error: { code: "VALIDATION", message: "Invalid state" } }

  await db().update(renewalRequests).set({ status: "documents_pending", updatedAt: new Date() }).where(eq(renewalRequests.id, renewalId))
  await addEvent(garageId, renewalId, "documents_pending", userId, note ?? "Documents requested from customer")
  return { ok: true, data: { ok: true as const } }
}

export async function cancelRenewal(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({ garageId: z.string().uuid(), renewalId: z.string().uuid(), reason: z.string().max(300).optional() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const { garageId, renewalId, reason } = parsed.data
  const ctx = await requireMembership(userId, garageId)
  if (!ctx || !can(ctx.principal, "renewals.process")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }
  const r = await getRenewal(garageId, renewalId)
  if (!r || ["completed", "cancelled"].includes(r.status)) return { ok: false, error: { code: "VALIDATION", message: "Invalid state" } }

  await db().update(renewalRequests).set({ status: "cancelled", updatedAt: new Date() }).where(eq(renewalRequests.id, renewalId))
  await addEvent(garageId, renewalId, "cancelled", userId, reason ?? "Cancelled")
  // reopen reminders on the source due item
  if (r.dueItemId) {
    await db().update(dueItems).set({ nextReminderAt: new Date(), updatedAt: new Date() })
      .where(and(eq(dueItems.id, r.dueItemId), inArray(dueItems.status, ["scheduled", "due_soon", "due", "overdue"])))
  }
  return { ok: true, data: { ok: true as const } }
}

/** paid → processing (provider/agent has started work). */
export async function startRenewalProcessing(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({ garageId: z.string().uuid(), renewalId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const { garageId, renewalId } = parsed.data
  const ctx = await requireMembership(userId, garageId)
  if (!ctx || !can(ctx.principal, "renewals.process")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }
  const r = await getRenewal(garageId, renewalId)
  if (!r || r.status !== "paid") return { ok: false, error: { code: "VALIDATION", message: "Only paid renewals can enter processing" } }
  await db().update(renewalRequests).set({ status: "processing", updatedAt: new Date() }).where(eq(renewalRequests.id, renewalId))
  await addEvent(garageId, renewalId, "processing", userId, "Processing started")
  return { ok: true, data: { ok: true as const } }
}

// ---------------------------------------------------------------------------
// Completion — saves the new policy/certificate and schedules next reminders
// ---------------------------------------------------------------------------

const completeSchema = z.object({
  garageId: z.string().uuid(), renewalId: z.string().uuid(),
  referenceNumber: z.string().max(80).optional(),
  // insurance
  insurerName: z.string().max(120).optional(),
  policyType: z.enum(["third_party", "third_party_fire_theft", "comprehensive"]).optional(),
  policyNumber: z.string().max(60).optional(),
  // dvla
  dvlaExpiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // optional pre-inspection repair job link (DVLA roadworthy)
  preInspectionJobId: z.string().uuid().optional(),
})

export async function completeRenewal(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = completeSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Check the fields" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx || !can(ctx.principal, "renewals.process")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }
  }
  const r = await getRenewal(d.garageId, d.renewalId)
  if (!r) return { ok: false, error: { code: "NOT_FOUND", message: "Renewal not found" } }
  if (r.status !== "paid" && r.status !== "processing") {
    return { ok: false, error: { code: "VALIDATION", message: "Renewal must be paid before completion" } }
  }

  const today = new Date().toISOString().slice(0, 10)
  const nextYear = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10)

  if (r.kind === "insurance") {
    const insurer = d.insurerName || "Insurance partner"
    const policyType = d.policyType ?? r.insurancePolicyType ?? "comprehensive"
    // expire existing current policies, insert the renewed one
    await db().update(insurancePolicies).set({ isCurrent: false, updatedAt: new Date() })
      .where(and(eq(insurancePolicies.vehicleId, r.vehicleId), eq(insurancePolicies.garageId, d.garageId), eq(insurancePolicies.isCurrent, true)))
    const policyId = uuidv7()
    await db().insert(insurancePolicies).values({
      id: policyId, garageId: d.garageId, vehicleId: r.vehicleId, customerId: r.customerId,
      insurerName: insurer, partnerId: r.partnerId,
      policyType, policyNumber: d.policyNumber || d.referenceNumber || null,
      startDate: today, endDate: nextYear, isCurrent: true,
      premium: r.officialFee,
    })
    // schedule next year's reminders
    await db().update(dueItems).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(dueItems.garageId, d.garageId), eq(dueItems.vehicleId, r.vehicleId), eq(dueItems.type, "insurance"), inArray(dueItems.status, ["scheduled", "due_soon", "due", "overdue"])))
    await db().insert(dueItems).values({
      garageId: d.garageId, vehicleId: r.vehicleId, customerId: r.customerId,
      type: "insurance", title: `Insurance renewal — ${insurer}`,
      dueDate: nextYear, effectiveDueDate: nextYear, status: "scheduled",
      sourceType: "insurance_policy", sourceId: policyId,
    })
    await addEvent(d.garageId, r.id, "completed", userId, `Policy ${policyId.slice(0, 8)} saved, next renewal ${nextYear}`)
  } else {
    const recType = r.dvlaRecordType ?? "roadworthy"
    const expiry = d.dvlaExpiryDate ?? nextYear
    await db().update(dvlaRecords).set({ isCurrent: false, updatedAt: new Date() })
      .where(and(eq(dvlaRecords.vehicleId, r.vehicleId), eq(dvlaRecords.garageId, d.garageId), eq(dvlaRecords.type, recType), eq(dvlaRecords.isCurrent, true)))
    const recordId = uuidv7()
    await db().insert(dvlaRecords).values({
      id: recordId, garageId: d.garageId, vehicleId: r.vehicleId, customerId: r.customerId,
      type: recType, referenceNumber: d.referenceNumber || d.policyNumber || null,
      issueDate: today, expiryDate: expiry, isCurrent: true,
      renewalRequestId: r.id,
    })
    await db().update(dueItems).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(dueItems.garageId, d.garageId), eq(dueItems.vehicleId, r.vehicleId), eq(dueItems.type, recType), inArray(dueItems.status, ["scheduled", "due_soon", "due", "overdue"])))
    await db().insert(dueItems).values({
      garageId: d.garageId, vehicleId: r.vehicleId, customerId: r.customerId,
      type: recType,
      title: recType === "roadworthy" ? "Roadworthy certificate renewal" : recType === "registration_licence" ? "Registration/licence renewal" : "Driver's licence renewal",
      dueDate: expiry, effectiveDueDate: expiry, status: "scheduled",
      sourceType: "dvla_record", sourceId: recordId,
    })
    const note = d.preInspectionJobId ? `record ${recordId.slice(0, 8)} saved; pre-inspection job ${d.preInspectionJobId.slice(0, 8)} linked` : `record ${recordId.slice(0, 8)} saved, next expiry ${expiry}`
    await addEvent(d.garageId, r.id, "completed", userId, note)
    if (d.preInspectionJobId) {
      const qd = (typeof r.quoteDetails === "object" && r.quoteDetails ? r.quoteDetails as Record<string, unknown> : {})
      await db().update(renewalRequests).set({ quoteDetails: { ...qd, preInspectionJobId: d.preInspectionJobId } }).where(eq(renewalRequests.id, r.id))
    }
  }

  // complete the original source due item
  if (r.dueItemId) {
    await db().update(dueItems).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(dueItems.id, r.dueItemId))
  }
  await db().update(renewalRequests).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() }).where(eq(renewalRequests.id, r.id))

  await writeAuditLog({ garageId: d.garageId, actorUserId: userId, action: "renewal.complete", entityType: "renewal_request", entityId: r.id })
  return { ok: true, data: { ok: true as const } }
}
