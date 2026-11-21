"use server"
import { randomBytes } from "crypto"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  branches,
  customers,
  garages,
  invoices,
  payments,
  refunds,
} from "@/lib/db/schema"
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { paymentProvider } from "@/lib/integrations/payments"
import { sendMessage } from "@/lib/messaging/send"
import { applyPaymentToInvoice, reverseInvoicePayment } from "./payments-core"
import { nextDocNumber } from "./sequence"
import { uuidv7 } from "@/lib/id"

const staffPrincipal = (role: StaffRole, garageId: string, branchId: string | null) =>
  ({ kind: "staff" as const, role, garageId, branchId })

async function requireMembership(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return { membership: m, principal: staffPrincipal(m.role, garageId, m.branchId) }
}

const MANUAL_METHODS = ["cash", "momo", "card", "bank_transfer", "cheque", "other"] as const

async function receiptSeqBranch(garageId: string, branchId: string | null) {
  if (branchId) return branchId
  const [def] = await db().select({ id: branches.id }).from(branches)
    .where(and(eq(branches.garageId, garageId), eq(branches.isDefault, true))).limit(1)
  if (def) return def.id
  const [any] = await db().select({ id: branches.id }).from(branches)
    .where(eq(branches.garageId, garageId)).limit(1)
  return any?.id ?? null
}

/** Send the payment_receipt message (best-effort). */
export async function sendPaymentReceipt(paymentId: string) {
  const [p] = await db().select().from(payments).where(eq(payments.id, paymentId)).limit(1)
  if (!p || p.status !== "succeeded") return
  const [inv] = p.invoiceId
    ? await db().select().from(invoices).where(eq(invoices.id, p.invoiceId)).limit(1)
    : [null]
  const [cust] = p.customerId
    ? await db().select().from(customers).where(eq(customers.id, p.customerId)).limit(1)
    : [null]
  const [gr] = await db().select({ name: garages.name }).from(garages).where(eq(garages.id, p.garageId)).limit(1)
  const to = cust?.phone
  if (!to) return

  const ghs = (n: bigint | number) => `GH₵ ${(Number(n) / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const receiptToken = p.externalReference ?? ""
  const link = receiptToken ? `${base}/r/${receiptToken}` : `${base}/print/receipts/${p.id}`

  await sendMessage({
    garageId: p.garageId,
    channel: "sms",
    to,
    templateKey: "payment_receipt",
    variables: {
      garage_name: gr?.name ?? "Garage",
      amount: ghs(p.amount),
      invoice_number: inv?.number ?? p.receiptNumber ?? "—",
      balance: ghs(inv?.balanceDue ?? 0n),
      action_link: link,
    },
    idempotencyKey: `receipt:${p.id}`,
  }).catch(() => undefined)
}

// ---------------------------------------------------------------------------
// Staff-recorded payment (cash / manual momo / card terminal / transfer / cheque)
// ---------------------------------------------------------------------------

export async function recordPayment(rawInput: unknown): Promise<ActionResult<{ paymentId: string; receiptNumber: string; fullyPaid: boolean }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(),
    invoiceId: z.string().uuid(),
    method: z.enum(MANUAL_METHODS),
    amount: z.number().int().positive(), // pesewas
    momoNetwork: z.enum(["mtn", "telecel", "airteltigo"]).optional(),
    payerPhone: z.string().max(20).optional(),
    notes: z.string().max(500).optional(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "payments.record")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [inv] = await db().select().from(invoices).where(and(eq(invoices.id, d.invoiceId), eq(invoices.garageId, d.garageId))).limit(1)
  if (!inv) return { ok: false, error: { code: "NOT_FOUND", message: "Invoice not found" } }
  if (!["issued", "partially_paid", "paid"].includes(inv.status)) {
    return { ok: false, error: { code: "VALIDATION", message: "Invoice must be issued first" } }
  }
  if (BigInt(d.amount) > inv.balanceDue) {
    return { ok: false, error: { code: "VALIDATION", message: "Amount exceeds balance due" } }
  }

  const seqBranch = await receiptSeqBranch(d.garageId, inv.branchId ?? ctx.membership.branchId)
  if (!seqBranch) return { ok: false, error: { code: "VALIDATION", message: "Garage has no branch" } }
  const receiptNumber = await nextDocNumber(d.garageId, seqBranch, "RCT", "RCT")
  const receiptToken = randomBytes(24).toString("hex")

  const paymentId = uuidv7()
  await db().insert(payments).values({
    id: paymentId,
    garageId: d.garageId,
    branchId: inv.branchId ?? seqBranch,
    customerId: inv.customerId,
    invoiceId: inv.id,
    method: d.method,
    status: "succeeded",
    amount: BigInt(d.amount),
    momoNetwork: d.momoNetwork ?? null,
    payerPhone: d.payerPhone ?? null,
    receivedBy: userId,
    paidAt: new Date(),
    receiptNumber,
    externalReference: receiptToken,
    notes: d.notes ?? null,
  })

  const applied = await applyPaymentToInvoice(db(), {
    garageId: d.garageId, paymentId, invoiceId: inv.id, amountPesewas: BigInt(d.amount),
  })

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "payment.record",
    entityType: "payment", entityId: paymentId,
    after: { invoiceId: inv.id, method: d.method, amount: d.amount, receiptNumber },
  })

  await sendPaymentReceipt(paymentId)
  return { ok: true, data: { paymentId, receiptNumber, fullyPaid: applied.fullyPaid } }
}

// ---------------------------------------------------------------------------
// Online payment initiation (MoMo prompt / card checkout) — pending until webhook
// ---------------------------------------------------------------------------

export async function initiateInvoicePayment(rawInput: unknown): Promise<
  ActionResult<{ paymentId: string; reference: string; authorizationUrl?: string; displayText?: string }>
> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(),
    invoiceId: z.string().uuid(),
    channel: z.enum(["momo", "card"]),
    momoNetwork: z.enum(["mtn", "telecel", "airteltigo"]).optional(),
    payerPhone: z.string().max(20).optional(),
    payerEmail: z.string().email().optional(),
    amount: z.number().int().positive().optional(), // defaults to balance due
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  // Allow staff OR the customer via portal token? Staff path only for now —
  // public /t/[token] uses initiatePublicInvoicePayment below.
  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "payments.record")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [inv] = await db().select().from(invoices).where(and(eq(invoices.id, d.invoiceId), eq(invoices.garageId, d.garageId))).limit(1)
  if (!inv) return { ok: false, error: { code: "NOT_FOUND", message: "Invoice not found" } }
  if (!["issued", "partially_paid"].includes(inv.status)) {
    return { ok: false, error: { code: "VALIDATION", message: "Invoice must be issued with a balance" } }
  }

  const amount = BigInt(d.amount ?? Number(inv.balanceDue))
  if (amount <= 0n || amount > inv.balanceDue) {
    return { ok: false, error: { code: "VALIDATION", message: "Invalid amount" } }
  }

  const reference = `FIXAM-${randomBytes(12).toString("hex")}`
  const paymentId = uuidv7()
  const receiptToken = randomBytes(24).toString("hex")

  await db().insert(payments).values({
    id: paymentId,
    garageId: d.garageId,
    branchId: inv.branchId ?? ctx.membership.branchId,
    customerId: inv.customerId,
    invoiceId: inv.id,
    method: d.channel === "momo" ? "momo" : "card",
    status: "pending",
    amount,
    momoNetwork: d.momoNetwork ?? null,
    payerPhone: d.payerPhone ?? null,
    paystackReference: reference,
    externalReference: receiptToken,
  })

  const provider = paymentProvider()
  try {
    if (d.channel === "momo") {
      if (!d.payerPhone || !d.momoNetwork) {
        return { ok: false, error: { code: "VALIDATION", message: "Phone and MoMo network are required" } }
      }
      const res = await provider.chargeMobileMoney({
        amountPesewas: amount,
        phone: d.payerPhone,
        network: d.momoNetwork,
        reference,
        metadata: { invoiceId: inv.id, paymentId },
      })
      return { ok: true, data: { paymentId, reference, displayText: res.displayText } }
    }
    const res = await provider.initializeCheckout({
      amountPesewas: amount,
      email: d.payerEmail,
      phone: d.payerPhone,
      reference,
      metadata: { invoiceId: inv.id, paymentId },
    })
    return { ok: true, data: { paymentId, reference, authorizationUrl: res.authorizationUrl } }
  } catch (e) {
    await db().update(payments).set({ status: "failed", updatedAt: new Date() }).where(eq(payments.id, paymentId))
    return { ok: false, error: { code: "INTERNAL", message: e instanceof Error ? e.message : "Payment init failed" } }
  }
}

/** Public variant for /t/[token] invoice pay page — token is the invoice's. */
export async function initiatePublicInvoicePayment(rawInput: unknown): Promise<
  ActionResult<{ paymentId: string; reference: string; authorizationUrl?: string; displayText?: string }>
> {
  const parsed = z.object({
    token: z.string().min(10),
    channel: z.enum(["momo", "card"]),
    momoNetwork: z.enum(["mtn", "telecel", "airteltigo"]).optional(),
    payerPhone: z.string().max(20).optional(),
    payerEmail: z.string().email().optional(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const { rateLimit, rateLimited } = await import("@/lib/rate-limit")
  const { createHash } = await import("crypto")
  const rl = await rateLimit(`pubpay:${createHash("sha256").update(d.token).digest("hex").slice(0, 16)}`, 10, 3600)
  if (!rl.ok) return rateLimited(rl)

  const tokenHash = createHash("sha256").update(d.token).digest("hex")
  const [inv] = await db().select().from(invoices).where(eq(invoices.tokenHash, tokenHash)).limit(1)
  if (!inv || !["issued", "partially_paid"].includes(inv.status) || Number(inv.balanceDue) <= 0) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Invoice not payable" } }
  }

  const amount = inv.balanceDue
  const reference = `FIXAM-${randomBytes(12).toString("hex")}`
  const paymentId = uuidv7()
  const receiptToken = randomBytes(24).toString("hex")

  await db().insert(payments).values({
    id: paymentId,
    garageId: inv.garageId,
    branchId: inv.branchId,
    customerId: inv.customerId,
    invoiceId: inv.id,
    method: d.channel === "momo" ? "momo" : "card",
    status: "pending",
    amount,
    momoNetwork: d.momoNetwork ?? null,
    payerPhone: d.payerPhone ?? null,
    paystackReference: reference,
    externalReference: receiptToken,
  })

  const provider = paymentProvider()
  try {
    if (d.channel === "momo") {
      if (!d.payerPhone || !d.momoNetwork) {
        return { ok: false, error: { code: "VALIDATION", message: "Phone and MoMo network are required" } }
      }
      const res = await provider.chargeMobileMoney({
        amountPesewas: amount,
        phone: d.payerPhone,
        network: d.momoNetwork,
        reference,
        metadata: { invoiceId: inv.id, paymentId },
      })
      return { ok: true, data: { paymentId, reference, displayText: res.displayText } }
    }
    const res = await provider.initializeCheckout({
      amountPesewas: amount,
      email: d.payerEmail,
      phone: d.payerPhone,
      reference,
      metadata: { invoiceId: inv.id, paymentId },
    })
    return { ok: true, data: { paymentId, reference, authorizationUrl: res.authorizationUrl } }
  } catch (e) {
    await db().update(payments).set({ status: "failed", updatedAt: new Date() }).where(eq(payments.id, paymentId))
    return { ok: false, error: { code: "INTERNAL", message: e instanceof Error ? e.message : "Payment init failed" } }
  }
}

/** Public invoice lookup for the /t/[token] pay page. */
export async function getPublicInvoiceByToken(rawInput: unknown) {
  const parsed = z.object({ token: z.string().min(10) }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const, error: { code: "VALIDATION" as const, message: "Invalid token" } }
  const { createHash } = await import("crypto")
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex")

  const [inv] = await db().select().from(invoices).where(eq(invoices.tokenHash, tokenHash)).limit(1)
  if (!inv || inv.status === "void" || inv.status === "draft") return { ok: false as const, error: { code: "NOT_FOUND" as const, message: "Invoice not found" } }

  const [gr] = await db().select({ name: garages.name, brandColor: garages.brandColor }).from(garages).where(eq(garages.id, inv.garageId)).limit(1)
  const [cust] = inv.customerId
    ? await db().select({ fullName: customers.fullName }).from(customers).where(eq(customers.id, inv.customerId)).limit(1)
    : [null]

  const ghs = (n: bigint | number) => `GH₵ ${(Number(n) / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`
  return {
    ok: true as const,
    data: {
      id: inv.id,
      number: inv.number,
      status: inv.status,
      total: Number(inv.total),
      amountPaid: Number(inv.amountPaid),
      balanceDue: Number(inv.balanceDue),
      depositApplied: Number(inv.depositApplied ?? 0),
      dueDate: inv.dueDate,
      garageName: gr?.name ?? "Garage",
      brandColor: gr?.brandColor ?? null,
      customerName: cust?.fullName ?? null,
      formatted: {
        total: ghs(inv.total),
        paid: ghs(inv.amountPaid),
        balance: ghs(inv.balanceDue),
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Refund (payments.refund permission)
// ---------------------------------------------------------------------------

export async function refundPayment(rawInput: unknown): Promise<ActionResult<{ refundId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(),
    paymentId: z.string().uuid(),
    amount: z.number().int().positive().optional(), // defaults to full remaining
    reason: z.string().min(3).max(500),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "A reason is required" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "payments.refund")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [p] = await db().select().from(payments).where(and(eq(payments.id, d.paymentId), eq(payments.garageId, d.garageId))).limit(1)
  if (!p || p.status !== "succeeded") return { ok: false, error: { code: "VALIDATION", message: "Payment not refundable" } }

  const amount = BigInt(d.amount ?? Number(p.amount))
  if (amount <= 0n || amount > p.amount) {
    return { ok: false, error: { code: "VALIDATION", message: "Invalid refund amount" } }
  }

  const provider = paymentProvider()
  const result = await provider.refund({ reference: p.paystackReference ?? p.id, amountPesewas: amount })

  const refundId = uuidv7()
  await db().insert(refunds).values({
    id: refundId,
    garageId: d.garageId,
    paymentId: p.id,
    amount,
    reason: d.reason,
    method: p.method,
    paystackRefundId: result.refundId,
    processedBy: userId,
  })

  if (p.invoiceId) {
    await reverseInvoicePayment(db(), { garageId: d.garageId, invoiceId: p.invoiceId, amountPesewas: amount })
  }

  const isFull = amount >= p.amount
  await db().update(payments).set({
    status: isFull ? "refunded" : "partially_refunded",
    updatedAt: new Date(),
  }).where(eq(payments.id, p.id))

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "payment.refund",
    entityType: "payment", entityId: p.id,
    after: { amount: Number(amount), reason: d.reason, refundId: result.refundId },
  })
  return { ok: true, data: { refundId } }
}
