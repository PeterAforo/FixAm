"use server"

import { createHash } from "crypto"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { estimates, financingApplications, garages, invoices, jobItems, jobs } from "@/lib/db/schema"
import { financingProvider } from "@/lib/integrations/financing"
import { rateLimit } from "@/lib/rate-limit"
import { getPortalPhone } from "@/lib/portal/session"
import { MAX_MONTHS, MIN_MONTHS, buildSchedule, isGhanaCard } from "./core"
import { applyForFinancing, customerFor, financingForPhone, latestApplication, recordRepayment, type MyFinancing } from "./service"

const sha = (s: string) => createHash("sha256").update(s).digest("hex")
type Fail = { ok: false; error: string }

type Target = {
  kind: "estimate" | "invoice"
  garageId: string
  garageName: string
  customerId: string | null
  jobId: string | null
  estimateId: string | null
  invoiceId: string | null
  amount: number
  canApply: boolean
  why: string | null
}

/** What a /t/ token points at, and how much could be financed. */
async function targetFor(token: string): Promise<Target | null> {
  const hash = sha(token)
  const [est] = await db().select({ e: estimates, garageName: garages.name, customerId: jobs.customerId })
    .from(estimates).innerJoin(garages, eq(garages.id, estimates.garageId)).innerJoin(jobs, eq(jobs.id, estimates.jobId))
    .where(eq(estimates.tokenHash, hash)).limit(1)
  if (est) {
    const e = est.e
    let amount = Number(e.total)
    if (e.status === "partially_approved") {
      const items = await db().select().from(jobItems).where(and(eq(jobItems.estimateId, e.id), eq(jobItems.garageId, e.garageId)))
      const line = (i: (typeof items)[number]) => Number(i.unitPrice) * Number(i.quantity) - Number(i.discountAmount ?? 0n)
      const all = items.reduce((s, i) => s + line(i), 0)
      const ok = items.filter((i) => i.approvalStatus === "approved" && i.supplyMode !== "customer").reduce((s, i) => s + line(i), 0)
      amount = all > 0 ? Math.round((amount * ok) / all) : 0
    }
    amount -= Number(e.depositRequired ?? 0n)
    const approved = e.status === "approved" || e.status === "partially_approved"
    return {
      kind: "estimate", garageId: e.garageId, garageName: est.garageName, customerId: est.customerId,
      jobId: e.jobId, estimateId: e.id, invoiceId: null, amount: Math.max(0, amount),
      canApply: approved && amount > 0, why: approved ? null : "Approve the work first, then you can choose to pay later.",
    }
  }
  const [inv] = await db().select({ i: invoices, garageName: garages.name }).from(invoices).innerJoin(garages, eq(garages.id, invoices.garageId))
    .where(eq(invoices.tokenHash, hash)).limit(1)
  if (inv) {
    const i = inv.i
    const payable = ["issued", "partially_paid"].includes(i.status) && i.balanceDue > 0n
    return {
      kind: "invoice", garageId: i.garageId, garageName: inv.garageName, customerId: i.customerId,
      jobId: i.source === "job" ? i.sourceId : null, estimateId: null, invoiceId: i.id, amount: Number(i.balanceDue),
      canApply: payable, why: payable ? null : "This invoice has nothing left to pay.",
    }
  }
  return null
}

export type PayLaterView = {
  kind: "estimate" | "invoice"
  amount: number
  canApply: boolean
  why: string | null
  rateLabel: string
  options: { months: number; monthly: number; total: number }[]
  application: {
    reference: string; status: string; months: number; monthlyPayment: number | null; totalRepayable: number | null
    amount: number; declineReason: string | null; rateLabel: string | null
  } | null
}

export async function getPayLater(raw: unknown): Promise<PayLaterView | null> {
  const parsed = z.object({ token: z.string().min(16).max(128) }).safeParse(raw)
  if (!parsed.success) return null
  const t = await targetFor(parsed.data.token)
  if (!t) return null
  const provider = financingProvider()
  const start = new Date().toISOString().slice(0, 10)
  const options = t.amount > 0
    ? Array.from({ length: MAX_MONTHS - MIN_MONTHS + 1 }, (_, k) => k + MIN_MONTHS).map((months) => {
        const s = buildSchedule(t.amount, months, provider.terms(t.amount, months).monthlyRateBp, start)
        return { months, monthly: s.monthly, total: s.totalRepayable }
      })
    : []
  const app = await latestApplication(t.invoiceId ? { invoiceId: t.invoiceId } : { jobId: t.jobId })
    ?? (t.invoiceId && t.jobId ? await latestApplication({ jobId: t.jobId }) : null)
  const blocking = app && ["pending", "approved", "disbursing", "disbursed", "completed"].includes(app.status)
  return {
    kind: t.kind, amount: t.amount, canApply: t.canApply && !blocking, why: t.why,
    rateLabel: provider.terms(t.amount, 3).rateLabel, options,
    application: app ? {
      reference: app.reference, status: app.status, months: app.months,
      monthlyPayment: app.monthlyPayment != null ? Number(app.monthlyPayment) : null,
      totalRepayable: app.totalRepayable != null ? Number(app.totalRepayable) : null,
      amount: Number(app.amountFinanced ?? app.amountRequested), declineReason: app.declineReason, rateLabel: app.rateLabel,
    } : null,
  }
}

const applySchema = z.object({
  token: z.string().min(16).max(128),
  months: z.number().int().min(MIN_MONTHS).max(MAX_MONTHS),
  fullName: z.string().trim().min(3, "Enter your full name as on your Ghana Card").max(120),
  ghanaCard: z.string().trim().refine(isGhanaCard, "Ghana Card number looks like GHA-123456789-0"),
  consent: z.literal(true, { message: "Tick the box to agree to share your details with the lender" }),
})

/** Customer applies from the approval or invoice page. The Ghana Card number goes to the lender only. */
export async function applyPayLater(raw: unknown): Promise<{ ok: true; status: string } | Fail> {
  const parsed = applySchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" }
  const d = parsed.data
  const rl = await rateLimit(`paylater:${sha(d.token).slice(0, 16)}`, 5, 86_400)
  if (!rl.ok) return { ok: false, error: "Too many applications for this bill today" }
  const t = await targetFor(d.token)
  if (!t) return { ok: false, error: "This link isn't valid any more" }
  if (!t.canApply) return { ok: false, error: t.why ?? "Pay later isn't available for this bill" }
  const existing = await latestApplication(t.invoiceId ? { invoiceId: t.invoiceId } : { jobId: t.jobId })
  if (existing && ["pending", "approved", "disbursing", "disbursed", "completed"].includes(existing.status)) {
    return { ok: false, error: "There's already a pay-later application for this bill" }
  }
  const customer = await customerFor(t.customerId)
  if (!customer?.phone) return { ok: false, error: "The garage needs your phone number on file first" }

  const app = await applyForFinancing({
    garageId: t.garageId, customerId: t.customerId, jobId: t.jobId, estimateId: t.estimateId, invoiceId: t.invoiceId,
    amount: t.amount, months: d.months,
    applicant: { fullName: d.fullName, phone: customer.phone, ghanaCard: d.ghanaCard.toUpperCase() },
    purpose: `Car repair at ${t.garageName}`,
  })
  return { ok: true, status: app.status }
}

/** Driver app: my pay-later plans. */
export async function listMyFinancing(): Promise<MyFinancing[]> {
  const phone = await getPortalPhone()
  if (!phone) return []
  return financingForPhone(phone)
}

/** Test lender only: mark a repayment as paid (stands in for the lender's payment page). */
export async function mockPayRepayment(raw: unknown): Promise<{ ok: true } | Fail> {
  if (financingProvider().name !== "mock") return { ok: false, error: "Repayments are made with the lender" }
  const parsed = z.object({ providerRef: z.string().max(80), sequence: z.number().int().min(1).max(12) }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Invalid input" }
  const phone = await getPortalPhone()
  if (!phone) return { ok: false, error: "Sign in first" }
  const [app] = await db().select({ id: financingApplications.id }).from(financingApplications)
    .where(and(eq(financingApplications.providerRef, parsed.data.providerRef), eq(financingApplications.applicantPhone, phone))).limit(1)
  if (!app) return { ok: false, error: "Plan not found" }
  await recordRepayment(app.id, parsed.data.sequence)
  return { ok: true }
}
