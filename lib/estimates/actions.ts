"use server"
import { createHash, randomBytes } from "crypto"
import { z } from "zod"
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  customers,
  documentSequences,
  estimates,
  garages,
  jobFindings,
  jobItems,
  jobs,
  vehicles,
} from "@/lib/db/schema"
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { computeTaxTotals } from "@/lib/domain/tax"
import { garageTaxContext } from "@/lib/money/tax-context"
import { finalizeApproval } from "./core"
import { sendMessage } from "@/lib/messaging/send"
import { uuidv7 } from "@/lib/id"

const staffPrincipal = (role: StaffRole, garageId: string, branchId: string | null) =>
  ({ kind: "staff" as const, role, garageId, branchId })

async function requireMembership(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return { membership: m, principal: staffPrincipal(m.role, garageId, m.branchId) }
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")

async function nextEstimateNumber(garageId: string, branchId: string | null): Promise<string> {
  const rows = await db()
    .insert(documentSequences)
    .values({ garageId, branchId, docType: "EST", nextNumber: 2n })
    .onConflictDoUpdate({
      target: [documentSequences.garageId, documentSequences.branchId, documentSequences.docType],
      set: { nextNumber: sql`${documentSequences.nextNumber} + 1`, updatedAt: new Date() },
    })
    .returning({ nextNumber: documentSequences.nextNumber })
  return `EST-${String(Number(rows[0]!.nextNumber) - 1).padStart(5, "0")}`
}

const createSchema = z.object({
  garageId: z.string().uuid(),
  jobId: z.string().uuid(),
  notes: z.string().max(2000).optional(),
  depositPercent: z.number().min(0).max(100).optional(),
})

/** Build an estimate from the job's pending items; supersedes the previous live version. */
export async function createEstimate(rawInput: unknown): Promise<ActionResult<{ estimateId: string; number: string; version: number; total: number }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = createSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "estimates.create")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [job] = await db().select().from(jobs).where(and(eq(jobs.id, d.jobId), eq(jobs.garageId, d.garageId), isNull(jobs.deletedAt))).limit(1)
  if (!job) return { ok: false, error: { code: "NOT_FOUND", message: "Job not found" } }

  const items = await db()
    .select()
    .from(jobItems)
    .where(and(eq(jobItems.jobId, d.jobId), eq(jobItems.garageId, d.garageId), inArray(jobItems.approvalStatus, ["pending"])))
    .orderBy(jobItems.sortOrder)
  if (items.length === 0) return { ok: false, error: { code: "VALIDATION", message: "No pending items on this job" } }

  // latest live estimate for this job → same number, next version; else new number
  const [latest] = await db()
    .select()
    .from(estimates)
    .where(and(eq(estimates.jobId, d.jobId), eq(estimates.garageId, d.garageId)))
    .orderBy(desc(estimates.version), desc(estimates.createdAt))
    .limit(1)

  const number = latest ? latest.number : await nextEstimateNumber(d.garageId, job.branchId)
  const version = latest ? latest.version + 1 : 1
  if (latest && ["draft", "sent", "partially_approved"].includes(latest.status)) {
    await db().update(estimates).set({ status: "superseded", updatedAt: new Date() }).where(eq(estimates.id, latest.id))
  }

  const { rules, pricesIncludeTax } = await garageTaxContext(d.garageId)
  const totals = computeTaxTotals(
    items.map((i) => ({
      type: i.type,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      discountAmount: Number(i.discountAmount ?? 0),
      taxCodes: i.taxCodes ?? undefined,
    })),
    rules,
    pricesIncludeTax
  )

  const depositPercent = d.depositPercent ?? 0
  const depositRequired = Math.round((totals.total * depositPercent) / 100)

  const estimateId = uuidv7()
  await db().insert(estimates).values({
    id: estimateId,
    garageId: d.garageId,
    jobId: d.jobId,
    number,
    version,
    status: "draft",
    subtotal: BigInt(totals.subtotal),
    discountTotal: BigInt(totals.discountTotal),
    taxTotal: BigInt(totals.taxTotal),
    total: BigInt(totals.total),
    depositRequired: BigInt(depositRequired),
    validUntil: new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10),
    notes: d.notes ?? null,
  })

  await db().update(jobItems).set({ estimateId, updatedAt: new Date() }).where(inArray(jobItems.id, items.map((i) => i.id)))

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "estimate.create",
    entityType: "estimate", entityId: estimateId,
    after: { number, version, total: totals.total },
  })

  return { ok: true, data: { estimateId, number, version, total: totals.total } }
}

const sendSchema = z.object({ garageId: z.string().uuid(), estimateId: z.string().uuid() })

/** Send the estimate to the customer via magic link (SMS/WhatsApp). */
export async function sendEstimate(rawInput: unknown): Promise<ActionResult<{ token: string; channel: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = sendSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "estimates.send")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [est] = await db().select().from(estimates).where(and(eq(estimates.id, d.estimateId), eq(estimates.garageId, d.garageId))).limit(1)
  if (!est) return { ok: false, error: { code: "NOT_FOUND", message: "Estimate not found" } }
  if (!["draft", "superseded"].includes(est.status)) return { ok: false, error: { code: "VALIDATION", message: "Estimate already sent" } }

  const token = randomBytes(24).toString("hex")
  await db().update(estimates).set({
    status: "sent",
    sentAt: new Date(),
    tokenHash: sha256(token),
    updatedAt: new Date(),
  }).where(eq(estimates.id, est.id))

  const [job] = await db().select().from(jobs).where(eq(jobs.id, est.jobId)).limit(1)
  const [customer] = job ? await db().select().from(customers).where(eq(customers.id, job.customerId)).limit(1) : []
  const [vehicle] = job ? await db().select().from(vehicles).where(eq(vehicles.id, job.vehicleId)).limit(1) : []
  const [garage] = await db().select().from(garages).where(eq(garages.id, d.garageId)).limit(1)

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const url = `${base}/t/${token}`
  const ghs = (p: number | bigint | null) => `GH₵ ${(Number(p ?? 0) / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`

  let channel = "link"
  if (customer?.phone) {
    const res = await sendMessage({
      garageId: d.garageId,
      channel: "whatsapp",
      to: customer.phone,
      templateKey: "estimate_ready",
      variables: {
        customer_first_name: (customer?.fullName ?? "there").split(" ")[0]!,
        customer_name: customer?.fullName ?? "there",
        garage_name: garage?.name ?? "your garage",
        plate: vehicle?.plateNumber ?? "",
        vehicle_plate: vehicle?.plateNumber ?? "",
        vehicle: vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.plateNumber})` : "",
        amount: ghs(est.total),
        total: ghs(est.total),
        estimate_number: `${est.number} v${est.version}`,
        action_link: url,
        approve_url: url,
      },
      idempotencyKey: `estimate:${est.id}:${est.version}`,
    })
    channel = res.ok ? res.channel : `failed:${res.error}`
  }

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "estimate.send",
    entityType: "estimate", entityId: est.id, after: { number: est.number, version: est.version, channel },
  })

  return { ok: true, data: { token, channel } }
}

const behalfSchema = z.object({
  garageId: z.string().uuid(),
  estimateId: z.string().uuid(),
  approvedItemIds: z.array(z.string().uuid()),
  declinedItemIds: z.array(z.string().uuid()).default([]),
  reason: z.string().min(3).max(500),
  signatureName: z.string().max(120).optional(),
})

/** Approve on behalf of the customer (phone/in-person) — reason required, audited. */
export async function approveEstimateOnBehalf(rawInput: unknown): Promise<ActionResult<{ status: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = behalfSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "A reason is required" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "estimates.approve_on_behalf")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [est] = await db().select().from(estimates).where(and(eq(estimates.id, d.estimateId), eq(estimates.garageId, d.garageId))).limit(1)
  if (!est) return { ok: false, error: { code: "NOT_FOUND", message: "Estimate not found" } }
  if (!["sent", "partially_approved", "draft"].includes(est.status)) {
    return { ok: false, error: { code: "VALIDATION", message: "Estimate is not awaiting approval" } }
  }

  return finalizeApproval({
    garageId: d.garageId,
    estimate: est,
    approvedIds: d.approvedItemIds,
    declinedIds: d.declinedItemIds,
    method: "on_behalf_in_person",
    onBehalfUserId: userId,
    onBehalfReason: d.reason,
    signatureName: d.signatureName,
    actorUserId: userId,
    auditAction: "estimate.approve_on_behalf",
  })
}

// ---------------------------------------------------------------------------
// Public approval (magic link /t/[token])
// ---------------------------------------------------------------------------

async function estimateByToken(token: string) {
  const [est] = await db()
    .select()
    .from(estimates)
    .where(eq(estimates.tokenHash, sha256(token)))
    .limit(1)
  return est ?? null
}

export async function getPublicEstimate(rawInput: unknown): Promise<
  ActionResult<{
    number: string
    version: number
    status: string
    subtotal: number
    discountTotal: number
    taxTotal: number
    total: number
    depositRequired: number
    validUntil: string | null
    garageName: string
    vehiclePlate: string | null
    customerName: string | null
    items: { id: string; type: string; description: string; quantity: number; unitPrice: number; discountAmount: number; approvalStatus: string | null; severity: string | null }[]
  } | null>
> {
  const parsed = z.object({ token: z.string().min(16).max(128) }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid link" } }
  const est = await estimateByToken(parsed.data.token)
  if (!est) return { ok: true, data: null }

  const [job, garage] = await Promise.all([
    db().select().from(jobs).where(eq(jobs.id, est.jobId)).limit(1),
    db().select().from(garages).where(eq(garages.id, est.garageId)).limit(1),
  ])
  const j = job[0]
  const [vehicle, customer] = j
    ? await Promise.all([
        db().select().from(vehicles).where(eq(vehicles.id, j.vehicleId)).limit(1),
        db().select().from(customers).where(eq(customers.id, j.customerId)).limit(1),
      ])
    : [[], []]
  const items = await db()
    .select()
    .from(jobItems)
    .where(and(eq(jobItems.estimateId, est.id), eq(jobItems.garageId, est.garageId)))
    .orderBy(jobItems.sortOrder)

  const findingIds = [...new Set(items.map((i) => i.findingId).filter((x): x is string => Boolean(x)))]
  const findings = findingIds.length
    ? await db().select({ id: jobFindings.id, severity: jobFindings.severity }).from(jobFindings)
        .where(and(eq(jobFindings.garageId, est.garageId), inArray(jobFindings.id, findingIds)))
    : []
  const severityByFinding = new Map(findings.map((f) => [f.id, f.severity]))

  return {
    ok: true,
    data: {
      number: est.number,
      version: est.version,
      status: est.status,
      subtotal: Number(est.subtotal),
      discountTotal: Number(est.discountTotal),
      taxTotal: Number(est.taxTotal),
      total: Number(est.total),
      depositRequired: Number(est.depositRequired ?? 0),
      validUntil: est.validUntil,
      garageName: garage[0]?.name ?? "Garage",
      vehiclePlate: vehicle[0]?.plateNumber ?? null,
      customerName: customer[0]?.fullName ?? null,
      items: items.map((i) => ({
        id: i.id,
        type: i.type,
        description: i.description,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        discountAmount: Number(i.discountAmount ?? 0),
        approvalStatus: i.approvalStatus,
        severity: i.findingId ? severityByFinding.get(i.findingId) ?? null : null,
      })),
    },
  }
}

const respondSchema = z.object({
  token: z.string().min(16).max(128),
  decisions: z.array(z.object({
    itemId: z.string().uuid(),
    decision: z.enum(["approved", "declined"]),
  })).min(1),
  signerName: z.string().min(2).max(120),
  signatureDataUrl: z.string().max(200_000).optional(),
})

/** Customer approves/declines lines via the magic link. */
export async function respondToEstimate(rawInput: unknown): Promise<ActionResult<{ status: string }>> {
  const parsed = respondSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Check the form" } }
  const d = parsed.data

  const { rateLimit, rateLimited } = await import("@/lib/rate-limit")
  const rl = await rateLimit(`est-respond:${sha256(d.token)}`, 30, 3600)
  if (!rl.ok) return rateLimited(rl)

  const est = await estimateByToken(d.token)
  if (!est) return { ok: false, error: { code: "NOT_FOUND", message: "Link expired or invalid" } }
  if (!["sent", "partially_approved"].includes(est.status)) {
    return { ok: false, error: { code: "VALIDATION", message: "This estimate is no longer awaiting approval" } }
  }

  const approvedIds = d.decisions.filter((x) => x.decision === "approved").map((x) => x.itemId)
  const declinedIds = d.decisions.filter((x) => x.decision === "declined").map((x) => x.itemId)

  return finalizeApproval({
    garageId: est.garageId,
    estimate: est,
    approvedIds,
    declinedIds,
    method: "magic_link",
    onBehalfUserId: null,
    onBehalfReason: null,
    signatureName: d.signerName,
    signaturePath: d.signatureDataUrl ?? null,
    actorUserId: null,
    auditAction: "estimate.customer_respond",
  })
}
