"use server"
import { createHash } from "crypto"
import { z } from "zod"
import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  customers,
  dueItems,
  garages,
  invoices,
  renewalEvents,
  renewalRequests,
  vehicles,
} from "@/lib/db/schema"
import { uuidv7 } from "@/lib/id"

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")
const OPEN = ["scheduled", "due_soon", "due", "overdue"] as const

/** Resolve the reminder token to the set of open due items (same as /t/[token]). */
async function itemsForToken(token: string) {
  const hash = sha256(token)
  return db()
    .select({ item: dueItems, customerId: dueItems.customerId })
    .from(dueItems)
    .where(and(eq(dueItems.actionTokenHash, hash), inArray(dueItems.status, [...OPEN])))
    .limit(10)
}

async function renewalForToken(token: string, renewalId: string) {
  const items = await itemsForToken(token)
  if (!items.length) return null
  const customerIds = [...new Set(items.map((r) => r.customerId))]
  const [r] = await db().select({
    renewal: renewalRequests,
    customerName: customers.fullName,
    plate: vehicles.plateNumber,
    make: vehicles.make, model: vehicles.model,
    garageName: garages.name,
  }).from(renewalRequests)
    .innerJoin(customers, eq(renewalRequests.customerId, customers.id))
    .innerJoin(vehicles, eq(renewalRequests.vehicleId, vehicles.id))
    .innerJoin(garages, eq(renewalRequests.garageId, garages.id))
    .where(and(
      eq(renewalRequests.id, renewalId),
      inArray(renewalRequests.customerId, customerIds),
      sql`${renewalRequests.status} NOT IN ('completed','cancelled','failed')`,
    ))
    .limit(1)
  return r ?? null
}

/** Customer view of their renewal request (quote, status, pay link). */
export async function getPublicRenewal(rawInput: unknown) {
  const parsed = z.object({ token: z.string().min(10).max(200), renewalId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }
  const row = await renewalForToken(parsed.data.token, parsed.data.renewalId)
  if (!row) return { ok: false as const }
  const r = row.renewal

  let payUrl: string | null = null
  let invoiceBalance: number | null = null
  if (r.invoiceId) {
    const [inv] = await db().select({ balanceDue: invoices.balanceDue, status: invoices.status, tokenHash: invoices.tokenHash })
      .from(invoices).where(eq(invoices.id, r.invoiceId)).limit(1)
    if (inv) {
      invoiceBalance = Number(inv.balanceDue)
      if (invoiceBalance > 0) {
        const payToken = uuidv7().replace(/-/g, "") + uuidv7().replace(/-/g, "")
        await db().update(invoices).set({ tokenHash: sha256(payToken), updatedAt: new Date() }).where(eq(invoices.id, r.invoiceId))
        payUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/t/${payToken}`
      }
    }
  }

  const events = await db().select({
    status: renewalEvents.status, note: renewalEvents.note, createdAt: renewalEvents.createdAt,
  }).from(renewalEvents).where(eq(renewalEvents.renewalRequestId, r.id))
    .orderBy(renewalEvents.createdAt)

  return {
    ok: true as const,
    data: {
      id: r.id, number: r.number, kind: r.kind, status: r.status,
      dvlaRecordType: r.dvlaRecordType, insurancePolicyType: r.insurancePolicyType,
      officialFee: r.officialFee != null ? Number(r.officialFee) : null,
      serviceFee: r.serviceFee != null ? Number(r.serviceFee) : null,
      total: r.total != null ? Number(r.total) : null,
      requiredDocuments: r.requiredDocuments ?? [],
      quoteDetails: r.quoteDetails,
      customerName: row.customerName,
      vehicleLabel: [row.make, row.model, row.plate].filter(Boolean).join(" "),
      garageName: row.garageName,
      payUrl, invoiceBalance,
      events: events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    },
  }
}

/** Customer confirms details / submits documents → documents_pending. */
export async function submitRenewalDetails(rawInput: unknown) {
  const parsed = z.object({
    token: z.string().min(10).max(200), renewalId: z.string().uuid(),
    documentNotes: z.string().max(1000).optional(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const, error: { code: "VALIDATION" as const, message: "Invalid input" } }
  const row = await renewalForToken(parsed.data.token, parsed.data.renewalId)
  if (!row) return { ok: false as const, error: { code: "NOT_FOUND" as const, message: "Link expired" } }
  const r = row.renewal
  if (!["requested", "documents_pending"].includes(r.status)) {
    return { ok: false as const, error: { code: "VALIDATION" as const, message: "Already processed" } }
  }
  const qd = (typeof r.quoteDetails === "object" && r.quoteDetails ? r.quoteDetails as Record<string, unknown> : {})
  await db().update(renewalRequests).set({
    status: "documents_pending",
    quoteDetails: { ...qd, customerDocumentNotes: parsed.data.documentNotes ?? null, documentsSubmittedAt: new Date().toISOString() },
    updatedAt: new Date(),
  }).where(eq(renewalRequests.id, r.id))
  await db().insert(renewalEvents).values({
    garageId: r.garageId, renewalRequestId: r.id, status: "documents_pending",
    actorUserId: null, note: "Customer submitted renewal details", customerVisible: true,
  })
  return { ok: true as const }
}

/** Customer accepts the quote → awaiting_payment. */
export async function acceptRenewalQuote(rawInput: unknown) {
  const parsed = z.object({ token: z.string().min(10).max(200), renewalId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const, error: { code: "VALIDATION" as const, message: "Invalid input" } }
  const row = await renewalForToken(parsed.data.token, parsed.data.renewalId)
  if (!row) return { ok: false as const, error: { code: "NOT_FOUND" as const, message: "Link expired" } }
  const r = row.renewal
  if (r.status !== "quote_sent") {
    return { ok: false as const, error: { code: "VALIDATION" as const, message: "No quote to accept" } }
  }
  await db().update(renewalRequests).set({ status: "awaiting_payment", updatedAt: new Date() }).where(eq(renewalRequests.id, r.id))
  await db().insert(renewalEvents).values({
    garageId: r.garageId, renewalRequestId: r.id, status: "awaiting_payment",
    actorUserId: null, note: "Customer accepted quote", customerVisible: true,
  })
  return { ok: true as const }
}
