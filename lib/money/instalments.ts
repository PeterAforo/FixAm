"use server"
import { createHash, randomBytes } from "crypto"
import { z } from "zod"
import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  branches,
  dueItems,
  garages,
  invoices,
  instalments,
  paymentPlans,
  payments,
  vehicles,
} from "@/lib/db/schema"
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { paymentProvider } from "@/lib/integrations/payments"
import { buildSchedule, type Frequency } from "@/lib/domain/instalments"
import { applyPaymentToInvoice } from "./payments-core"
import { nextDocNumber } from "./sequence"
import { sendPaymentReceipt } from "./payments"
import { uuidv7 } from "@/lib/id"

const staffPrincipal = (role: StaffRole, garageId: string, branchId: string | null) =>
  ({ kind: "staff" as const, role, garageId, branchId })

async function requireMembership(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return { membership: m, principal: staffPrincipal(m.role, garageId, m.branchId) }
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")

const frequencySchema = z.enum(["weekly", "fortnightly", "monthly", "custom"])
const lateFeeSchema = z.object({
  kind: z.enum(["percent", "fixed"]),
  rate_bp: z.number().int().min(0).max(10000).optional(),
  amount: z.number().int().min(0).optional(),
  after_days: z.number().int().min(0).max(365),
})

// ---------------------------------------------------------------------------
// Preview + create
// ---------------------------------------------------------------------------

export async function previewPaymentPlan(rawInput: unknown) {
  const parsed = z.object({
    totalAmount: z.number().int().positive(),
    downPayment: z.number().int().min(0).default(0),
    instalmentCount: z.number().int().min(1).max(60),
    frequency: frequencySchema,
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    customDays: z.number().int().min(1).max(365).optional(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const, error: "Invalid input" }
  const d = parsed.data
  const schedule = buildSchedule({
    totalAmount: d.totalAmount,
    downPayment: d.downPayment,
    instalmentCount: d.instalmentCount,
    frequency: d.frequency as Frequency,
    startDate: d.startDate,
    customDays: d.customDays,
  })
  return { ok: true as const, data: schedule }
}

async function vehicleForInvoice(garageId: string, invoice: typeof invoices.$inferSelect) {
  if (invoice.vehicleId) return invoice.vehicleId
  if (!invoice.customerId) return null
  const [v] = await db().select({ id: vehicles.id }).from(vehicles)
    .where(and(eq(vehicles.garageId, garageId), eq(vehicles.currentOwnerId, invoice.customerId!)))
    .limit(1)
  return v?.id ?? null
}

export async function createPaymentPlan(rawInput: unknown): Promise<ActionResult<{ planId: string; links: { instalmentId: string; sequence: number; url: string }[] }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(),
    invoiceId: z.string().uuid(),
    downPayment: z.number().int().min(0).default(0),
    instalmentCount: z.number().int().min(1).max(60),
    frequency: frequencySchema,
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    customDays: z.number().int().min(1).max(365).optional(),
    lateFeeRule: lateFeeSchema.nullable().optional(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "payment_plans.create")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [inv] = await db().select().from(invoices).where(and(eq(invoices.id, d.invoiceId), eq(invoices.garageId, d.garageId))).limit(1)
  if (!inv) return { ok: false, error: { code: "NOT_FOUND", message: "Invoice not found" } }
  if (!["issued", "partially_paid"].includes(inv.status) || Number(inv.balanceDue) <= 0) {
    return { ok: false, error: { code: "VALIDATION", message: "Invoice must be issued with a balance" } }
  }
  if (!inv.customerId) return { ok: false, error: { code: "VALIDATION", message: "Invoice needs a customer for a payment plan" } }
  if (inv.paymentPlanId) {
    const [existing] = await db().select({ status: paymentPlans.status }).from(paymentPlans).where(eq(paymentPlans.id, inv.paymentPlanId)).limit(1)
    if (existing && existing.status === "active") {
      return { ok: false, error: { code: "CONFLICT", message: "Invoice already has an active plan" } }
    }
  }

  const totalAmount = Number(inv.balanceDue)
  const schedule = buildSchedule({
    totalAmount,
    downPayment: d.downPayment,
    instalmentCount: d.instalmentCount,
    frequency: d.frequency as Frequency,
    startDate: d.startDate,
    customDays: d.customDays,
  })
  if (schedule.length === 0) return { ok: false, error: { code: "VALIDATION", message: "Nothing left to schedule" } }

  const planId = uuidv7()
  await db().insert(paymentPlans).values({
    id: planId,
    garageId: d.garageId,
    invoiceId: inv.id,
    customerId: inv.customerId,
    totalAmount: BigInt(totalAmount),
    downPayment: BigInt(d.downPayment),
    instalmentCount: schedule.length,
    frequency: d.frequency,
    startDate: d.startDate,
    lateFeeRule: d.lateFeeRule ?? null,
    status: "active",
    approvedBy: userId,
  })

  const vehicleId = await vehicleForInvoice(d.garageId, inv)
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const links: { instalmentId: string; sequence: number; url: string }[] = []

  for (const s of schedule) {
    const instId = uuidv7()
    await db().insert(instalments).values({
      id: instId,
      garageId: d.garageId,
      paymentPlanId: planId,
      sequence: s.sequence,
      dueDate: s.dueDate,
      amount: BigInt(s.amount),
      status: "upcoming",
    })

    // due item + public pay link (token shown once; rotate via action)
    if (vehicleId) {
      const token = randomBytes(24).toString("hex")
      await db().insert(dueItems).values({
        garageId: d.garageId,
        vehicleId,
        customerId: inv.customerId,
        type: "instalment",
        title: `Instalment ${s.sequence}/${schedule.length} — ${inv.number ?? "invoice"}`,
        dueDate: s.dueDate,
        effectiveDueDate: s.dueDate,
        status: "scheduled",
        sourceType: "instalment",
        sourceId: instId,
        actionTokenHash: sha256(token),
      })
      links.push({ instalmentId: instId, sequence: s.sequence, url: `${base}/i/${token}` })
    }
  }

  await db().update(invoices).set({ paymentPlanId: planId, updatedAt: new Date() }).where(eq(invoices.id, inv.id))

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "payment_plan.create",
    entityType: "payment_plan", entityId: planId,
    after: { invoiceId: inv.id, instalments: schedule.length, total: totalAmount },
  })
  return { ok: true, data: { planId, links } }
}

// ---------------------------------------------------------------------------
// Pay an instalment (staff-recorded or online-settled)
// ---------------------------------------------------------------------------

export async function settleInstalmentPayment(args: {
  garageId: string
  instalmentId: string
  invoiceId: string
  paymentId: string
  amountPesewas: bigint
}) {
  const [inst] = await db().select().from(instalments).where(eq(instalments.id, args.instalmentId)).limit(1)
  if (!inst) return

  await applyPaymentToInvoice(db(), {
    garageId: args.garageId,
    paymentId: args.paymentId,
    invoiceId: args.invoiceId,
    amountPesewas: args.amountPesewas,
  })

  const newPaid = (inst.amountPaid ?? 0n) + args.amountPesewas
  const covered = newPaid >= inst.amount + (inst.lateFee ?? 0n)
  await db().update(instalments).set({
    amountPaid: newPaid,
    status: covered ? "paid" : "due",
    updatedAt: new Date(),
  }).where(eq(instalments.id, inst.id))

  // close the linked due item
  await db().update(dueItems).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(dueItems.sourceType, "instalment"), eq(dueItems.sourceId, inst.id), eq(dueItems.garageId, args.garageId)))

  // plan status: all paid → completed
  const siblings = await db().select({ status: instalments.status }).from(instalments)
    .where(and(eq(instalments.paymentPlanId, inst.paymentPlanId), eq(instalments.garageId, args.garageId)))
  const allPaid = siblings.every((s) => s.status === "paid" || s.status === "waived")
  if (allPaid) {
    await db().update(paymentPlans).set({ status: "completed", updatedAt: new Date() }).where(eq(paymentPlans.id, inst.paymentPlanId))
    await db().update(invoices).set({ updatedAt: new Date() }).where(eq(invoices.id, args.invoiceId))
  }
}

export async function payInstalment(rawInput: unknown): Promise<ActionResult<{ paymentId: string; receiptNumber: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(),
    instalmentId: z.string().uuid(),
    method: z.enum(["cash", "momo", "card", "bank_transfer", "cheque", "other"]),
    amount: z.number().int().positive().optional(),
    momoNetwork: z.enum(["mtn", "telecel", "airteltigo"]).optional(),
    payerPhone: z.string().max(20).optional(),
    notes: z.string().max(500).optional(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "payments.record")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [inst] = await db().select().from(instalments).where(and(eq(instalments.id, d.instalmentId), eq(instalments.garageId, d.garageId))).limit(1)
  if (!inst || inst.status === "paid" || inst.status === "waived") {
    return { ok: false, error: { code: "VALIDATION", message: "Instalment not payable" } }
  }
  const [plan] = await db().select().from(paymentPlans).where(eq(paymentPlans.id, inst.paymentPlanId)).limit(1)
  if (!plan || plan.status !== "active") return { ok: false, error: { code: "VALIDATION", message: "Plan not active" } }

  const [inv] = await db().select().from(invoices).where(eq(invoices.id, plan.invoiceId)).limit(1)
  if (!inv || !["issued", "partially_paid", "paid"].includes(inv.status)) {
    return { ok: false, error: { code: "VALIDATION", message: "Invoice not payable" } }
  }

  const outstanding = Number(inst.amount) + Number(inst.lateFee ?? 0) - Number(inst.amountPaid ?? 0)
  const amount = BigInt(d.amount ?? outstanding)
  if (amount <= 0n || amount > BigInt(Math.min(outstanding, Number(inv.balanceDue)))) {
    return { ok: false, error: { code: "VALIDATION", message: "Invalid amount" } }
  }

  let branchId = inv.branchId ?? ctx.membership.branchId
  if (!branchId) {
    const [def] = await db().select({ id: branches.id }).from(branches)
      .where(and(eq(branches.garageId, d.garageId), eq(branches.isDefault, true))).limit(1)
    branchId = def?.id ?? null
  }
  if (!branchId) return { ok: false, error: { code: "VALIDATION", message: "Garage has no branch" } }
  const receiptNumber = await nextDocNumber(d.garageId, branchId, "RCT", "RCT")
  const receiptToken = randomBytes(24).toString("hex")

  const paymentId = uuidv7()
  await db().insert(payments).values({
    id: paymentId,
    garageId: d.garageId,
    branchId,
    customerId: inv.customerId,
    invoiceId: inv.id,
    instalmentId: inst.id,
    method: d.method,
    status: "succeeded",
    amount,
    momoNetwork: d.momoNetwork ?? null,
    payerPhone: d.payerPhone ?? null,
    receivedBy: userId,
    paidAt: new Date(),
    receiptNumber,
    externalReference: receiptToken,
    notes: d.notes ?? null,
  })

  await settleInstalmentPayment({ garageId: d.garageId, instalmentId: inst.id, invoiceId: inv.id, paymentId, amountPesewas: amount })

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "instalment.pay",
    entityType: "instalment", entityId: inst.id,
    after: { paymentId, amount: Number(amount), receiptNumber },
  })
  await sendPaymentReceipt(paymentId)
  return { ok: true, data: { paymentId, receiptNumber } }
}

// ---------------------------------------------------------------------------
// Public instalment pay link (/i/[token])
// ---------------------------------------------------------------------------

export async function getPublicInstalment(rawInput: unknown) {
  const parsed = z.object({ token: z.string().min(10) }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }
  const [due] = await db().select().from(dueItems)
    .where(and(eq(dueItems.actionTokenHash, sha256(parsed.data.token)), eq(dueItems.type, "instalment")))
    .limit(1)
  if (!due || due.status === "completed" || due.status === "dismissed") return { ok: false as const }

  const [inst] = await db().select().from(instalments).where(eq(instalments.id, due.sourceId!)).limit(1)
  if (!inst || inst.status === "paid" || inst.status === "waived") return { ok: false as const }
  const [plan] = await db().select().from(paymentPlans).where(eq(paymentPlans.id, inst.paymentPlanId)).limit(1)
  if (!plan) return { ok: false as const }
  const [inv] = await db().select().from(invoices).where(eq(invoices.id, plan.invoiceId)).limit(1)
  const [gr] = inv
    ? await db().select({ name: garages.name }).from(garages).where(eq(garages.id, inv.garageId)).limit(1)
    : [null]

  const outstanding = Number(inst.amount) + Number(inst.lateFee) - Number(inst.amountPaid)
  const ghs = (n: number) => `GH₵ ${(n / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`
  return {
    ok: true as const,
    data: {
      instalmentId: inst.id,
      invoiceNumber: inv?.number ?? null,
      garageName: gr?.name ?? "Garage",
      sequence: inst.sequence,
      dueDate: inst.dueDate,
      amount: outstanding,
      formatted: ghs(outstanding),
      status: inst.status,
    },
  }
}

export async function initiatePublicInstalmentPayment(rawInput: unknown): Promise<
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

  const pub = await getPublicInstalment({ token: d.token })
  if (!pub.ok) return { ok: false, error: { code: "NOT_FOUND", message: "Payment link invalid or already paid" } }

  const [due] = await db().select().from(dueItems)
    .where(and(eq(dueItems.actionTokenHash, sha256(d.token)), eq(dueItems.type, "instalment")))
    .limit(1)
  const [inst] = await db().select().from(instalments).where(eq(instalments.id, due!.sourceId!)).limit(1)
  const [plan] = await db().select().from(paymentPlans).where(eq(paymentPlans.id, inst!.paymentPlanId)).limit(1)
  const [inv] = await db().select().from(invoices).where(eq(invoices.id, plan!.invoiceId)).limit(1)
  if (!inst || !plan || !inv) return { ok: false, error: { code: "NOT_FOUND", message: "Not found" } }

  const outstanding = Number(inst.amount) + Number(inst.lateFee) - Number(inst.amountPaid)
  const capped = Math.min(outstanding, Number(inv.balanceDue))
  if (capped <= 0) return { ok: false, error: { code: "VALIDATION", message: "Nothing to pay" } }
  const amount = BigInt(capped)

  const reference = `FIXAM-${randomBytes(12).toString("hex")}`
  const paymentId = uuidv7()
  const receiptToken = randomBytes(24).toString("hex")

  await db().insert(payments).values({
    id: paymentId,
    garageId: inst.garageId,
    branchId: inv.branchId,
    customerId: inv.customerId,
    invoiceId: inv.id,
    instalmentId: inst.id,
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
        amountPesewas: amount, phone: d.payerPhone, network: d.momoNetwork, reference,
        metadata: { invoiceId: inv.id, paymentId, instalmentId: inst.id },
      })
      return { ok: true, data: { paymentId, reference, displayText: res.displayText } }
    }
    const res = await provider.initializeCheckout({
      amountPesewas: amount, email: d.payerEmail, phone: d.payerPhone, reference,
      metadata: { invoiceId: inv.id, paymentId, instalmentId: inst.id },
    })
    return { ok: true, data: { paymentId, reference, authorizationUrl: res.authorizationUrl } }
  } catch (e) {
    await db().update(payments).set({ status: "failed", updatedAt: new Date() }).where(eq(payments.id, paymentId))
    return { ok: false, error: { code: "INTERNAL", message: e instanceof Error ? e.message : "Payment init failed" } }
  }
}

/** Staff: rotate an instalment pay link (old link dies). */
export async function rotateInstalmentLink(rawInput: unknown): Promise<ActionResult<{ url: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({ garageId: z.string().uuid(), instalmentId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }

  const [due] = await db().select().from(dueItems)
    .where(and(eq(dueItems.sourceType, "instalment"), eq(dueItems.sourceId, d.instalmentId), eq(dueItems.garageId, d.garageId)))
    .limit(1)
  if (!due) return { ok: false, error: { code: "NOT_FOUND", message: "No pay link for this instalment" } }

  const token = randomBytes(24).toString("hex")
  await db().update(dueItems).set({ actionTokenHash: sha256(token), updatedAt: new Date() }).where(eq(dueItems.id, due.id))
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  return { ok: true, data: { url: `${base}/i/${token}` } }
}

// ---------------------------------------------------------------------------
// Cancel plan
// ---------------------------------------------------------------------------

export async function cancelPaymentPlan(rawInput: unknown): Promise<ActionResult<{ planId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({ garageId: z.string().uuid(), planId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "payment_plans.create")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [plan] = await db().select().from(paymentPlans).where(and(eq(paymentPlans.id, d.planId), eq(paymentPlans.garageId, d.garageId))).limit(1)
  if (!plan || plan.status !== "active") return { ok: false, error: { code: "VALIDATION", message: "Plan not active" } }

  await db().update(paymentPlans).set({ status: "cancelled", updatedAt: new Date() }).where(eq(paymentPlans.id, plan.id))
  await db().update(instalments).set({ status: "waived", updatedAt: new Date() })
    .where(and(eq(instalments.paymentPlanId, plan.id), inArray(instalments.status, ["upcoming", "due", "overdue"])))
  await db().update(dueItems).set({ status: "dismissed", dismissedReason: "payment plan cancelled", updatedAt: new Date() })
    .where(and(eq(dueItems.garageId, d.garageId), sql`${dueItems.sourceId} IN (SELECT id FROM instalments WHERE payment_plan_id = ${plan.id})`))

  await writeAuditLog({ garageId: d.garageId, actorUserId: userId, action: "payment_plan.cancel", entityType: "payment_plan", entityId: plan.id })
  return { ok: true, data: { planId: plan.id } }
}
