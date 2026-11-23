import "server-only"
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  branches,
  customers,
  financingApplications,
  financingRepayments,
  garageSettings,
  garages,
  invoices,
  payments,
} from "@/lib/db/schema"
import { financingProvider } from "@/lib/integrations/financing"
import { decryptPayoutAccount, maskPayoutAccount } from "@/lib/escrow/payout-account"
import { applyPaymentToInvoice } from "@/lib/money/payments-core"
import { nextDocNumber } from "@/lib/money/sequence"
import { sendMessage } from "@/lib/messaging/send"
import { DEFAULT_QUIET_HOURS, type QuietHours } from "@/lib/messaging/quiet-hours"
import { platformGarageId } from "@/lib/portal/platform"
import { writeAuditLog } from "@/lib/actions"
import { uuidv7 } from "@/lib/id"
import { buildSchedule, ghs, reminderToSend, repaymentStatus } from "./core"

type App = typeof financingApplications.$inferSelect
const today = () => new Date().toISOString().slice(0, 10)

async function nextReference(): Promise<string> {
  const rows = await db().execute<{ v: string }>(sql`select to_char(now(), 'YYMMDD') || lpad((floor(random() * 1000000))::text, 6, '0') as v`)
  return `PL-${rows[0]?.v ?? Date.now()}`
}

export type ApplyArgs = {
  garageId: string
  customerId: string | null
  jobId: string | null
  estimateId: string | null
  invoiceId: string | null
  amount: number
  months: number
  applicant: { fullName: string; phone: string; ghanaCard: string }
  purpose: string
}

/** Sends an application to the lender. Disburses at once when the invoice already exists. */
export async function applyForFinancing(a: ApplyArgs): Promise<App> {
  const provider = financingProvider()
  const reference = await nextReference()
  const [g] = await db().select({ name: garages.name, payout: garages.payoutDetailsEncrypted }).from(garages).where(eq(garages.id, a.garageId)).limit(1)
  const acct = decryptPayoutAccount(g?.payout)
  const [app] = await db().insert(financingApplications).values({
    reference, garageId: a.garageId, customerId: a.customerId, jobId: a.jobId, estimateId: a.estimateId, invoiceId: a.invoiceId,
    applicantName: a.applicant.fullName, applicantPhone: a.applicant.phone, provider: provider.name,
    amountRequested: BigInt(a.amount), months: a.months, consentAt: new Date(),
  }).returning()

  const res = await provider.apply({
    reference, amount: a.amount, months: a.months, applicant: a.applicant, purpose: a.purpose,
    garage: { id: a.garageId, name: g?.name ?? "", payoutMethod: acct?.method ?? null, payoutAccountMasked: maskPayoutAccount(acct) },
  })
  const updated = await recordDecision(app, res)
  if (updated.status === "approved" && updated.invoiceId) return disburse(updated)
  return updated
}

async function recordDecision(app: App, res: Awaited<ReturnType<ReturnType<typeof financingProvider>["apply"]>>): Promise<App> {
  if (res.status === "pending") {
    const [u] = await db().update(financingApplications).set({ providerRef: res.providerRef || app.providerRef, updatedAt: new Date() }).where(eq(financingApplications.id, app.id)).returning()
    return u
  }
  if (res.status === "declined") {
    const [u] = await db().update(financingApplications)
      .set({ status: "declined", providerRef: res.providerRef, declineReason: res.reason, decidedAt: new Date(), updatedAt: new Date() })
      .where(eq(financingApplications.id, app.id)).returning()
    return u
  }
  const months = res.offer.months
  const preview = buildSchedule(Number(app.amountRequested), months, res.offer.monthlyRateBp, today())
  const [u] = await db().update(financingApplications).set({
    status: "approved", providerRef: res.providerRef, months, maxMonths: res.maxMonths,
    monthlyRateBp: res.offer.monthlyRateBp, rateLabel: res.offer.rateLabel,
    totalRepayable: BigInt(preview.totalRepayable), monthlyPayment: BigInt(preview.monthly),
    decidedAt: new Date(), updatedAt: new Date(),
  }).where(eq(financingApplications.id, app.id)).returning()
  return u
}

/**
 * The lender pays the garage: the invoice gets a "financing" payment for the
 * financed amount (never more than the balance due), and the repayment
 * schedule starts today. Safe to call more than once.
 */
export async function disburse(app: App): Promise<App> {
  if (app.status !== "approved" || !app.invoiceId || !app.providerRef) return app
  const [inv] = await db().select().from(invoices).where(eq(invoices.id, app.invoiceId)).limit(1)
  if (!inv || !["issued", "partially_paid"].includes(inv.status) || inv.balanceDue <= 0n) return app
  const amount = inv.balanceDue < app.amountRequested ? inv.balanceDue : app.amountRequested

  // Claim the application so two workers can't disburse it twice.
  const [claimed] = await db().update(financingApplications).set({ status: "disbursing", updatedAt: new Date() })
    .where(and(eq(financingApplications.id, app.id), eq(financingApplications.status, "approved"))).returning()
  if (!claimed) return app

  const res = await financingProvider().disburse(app.providerRef, Number(amount)).catch((e) => ({ status: "failed" as const, reason: String(e) }))
  if (res.status !== "disbursed") {
    const [back] = await db().update(financingApplications).set({ status: "approved", updatedAt: new Date() }).where(eq(financingApplications.id, app.id)).returning()
    return back
  }

  // Record the lender's payment on the invoice.
  const seqBranch = inv.branchId ?? (await db().select({ id: branches.id }).from(branches).where(eq(branches.garageId, inv.garageId)).limit(1))[0]?.id ?? null
  const receiptNumber = seqBranch ? await nextDocNumber(inv.garageId, seqBranch, "RCT", "RCT") : null
  const paymentId = uuidv7()
  await db().insert(payments).values({
    id: paymentId, garageId: inv.garageId, branchId: seqBranch, customerId: inv.customerId, invoiceId: inv.id,
    method: "financing", status: "succeeded", amount, payerPhone: app.applicantPhone, paidAt: new Date(),
    receiptNumber, externalReference: res.disbursementRef, notes: `Pay later ${app.reference} (${app.provider})`,
  })
  await applyPaymentToInvoice(db(), { garageId: inv.garageId, paymentId, invoiceId: inv.id, amountPesewas: amount })

  const schedule = buildSchedule(Number(amount), app.months, app.monthlyRateBp ?? 0, today())
  await db().insert(financingRepayments).values(schedule.lines.map((l) => ({
    applicationId: app.id, sequence: l.sequence, dueDate: l.dueDate, amount: BigInt(l.amount),
  }))).onConflictDoNothing()
  const [done] = await db().update(financingApplications).set({
    status: "disbursed", amountFinanced: amount, totalRepayable: BigInt(schedule.totalRepayable), monthlyPayment: BigInt(schedule.monthly),
    paymentId, disbursementRef: res.disbursementRef, disbursedAt: new Date(), updatedAt: new Date(),
  }).where(eq(financingApplications.id, app.id)).returning()

  await writeAuditLog({ garageId: inv.garageId, actorUserId: null, action: "financing.disbursed", entityType: "invoice", entityId: inv.id, after: { reference: app.reference, amount: Number(amount), paymentId } }).catch(() => undefined)
  await notify(done, "financing_approved", {
    amount: ghs(Number(amount)),
    monthly: ghs(schedule.monthly),
    months: String(app.months),
    first_due: schedule.lines[0]?.dueDate ?? "",
  }).catch(() => undefined)
  return done
}

/** After an invoice is issued: pay it with an approved application for the same job (estimate-stage approval). */
export async function disburseForIssuedInvoice(invoiceId: string): Promise<void> {
  const [inv] = await db().select({ id: invoices.id, garageId: invoices.garageId, source: invoices.source, sourceId: invoices.sourceId }).from(invoices).where(eq(invoices.id, invoiceId)).limit(1)
  if (!inv || inv.source !== "job" || !inv.sourceId) return
  const [app] = await db().select().from(financingApplications)
    .where(and(eq(financingApplications.jobId, inv.sourceId), eq(financingApplications.garageId, inv.garageId), eq(financingApplications.status, "approved")))
    .orderBy(desc(financingApplications.createdAt)).limit(1)
  if (!app) return
  const [linked] = await db().update(financingApplications).set({ invoiceId: inv.id, updatedAt: new Date() }).where(eq(financingApplications.id, app.id)).returning()
  await disburse(linked)
}

/** Marks a repayment paid (lender callback/poll, or the mock test page). */
export async function recordRepayment(applicationId: string, sequence: number, paidAmount?: bigint): Promise<void> {
  const [r] = await db().select().from(financingRepayments)
    .where(and(eq(financingRepayments.applicationId, applicationId), eq(financingRepayments.sequence, sequence))).limit(1)
  if (!r || r.paidAmount >= r.amount) return
  await db().update(financingRepayments).set({ paidAmount: paidAmount ?? r.amount, paidAt: new Date() }).where(eq(financingRepayments.id, r.id))
  const left = await db().select({ id: financingRepayments.id }).from(financingRepayments)
    .where(and(eq(financingRepayments.applicationId, applicationId), sql`${financingRepayments.paidAmount} < ${financingRepayments.amount}`))
  if (!left.length) {
    await db().update(financingApplications).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() }).where(eq(financingApplications.id, applicationId))
  }
}

/** Hourly: pending decisions, approved-but-unpaid invoices, repayments from the lender. */
export async function syncFinancing(): Promise<{ decided: number; disbursed: number; repaymentsUpdated: number }> {
  const provider = financingProvider()
  let decided = 0
  let disbursed = 0
  let repaymentsUpdated = 0
  const pending = await db().select().from(financingApplications).where(eq(financingApplications.status, "pending")).limit(200)
  for (const app of pending) {
    if (!app.providerRef) continue
    const res = await provider.status(app.providerRef).catch(() => null)
    if (!res || res.status === "pending") continue
    const u = await recordDecision(app, res)
    decided++
    if (u.status === "approved" && u.invoiceId) await disburse(u)
  }
  const approved = await db().select().from(financingApplications).where(and(eq(financingApplications.status, "approved"))).limit(200)
  for (const app of approved) {
    if (!app.invoiceId) continue
    const u = await disburse(app)
    if (u.status === "disbursed") disbursed++
  }
  const active = await db().select().from(financingApplications).where(eq(financingApplications.status, "disbursed")).limit(500)
  for (const app of active) {
    if (!app.providerRef) continue
    const list = await provider.repayments(app.providerRef).catch(() => null)
    if (!list) continue
    for (const p of list) {
      if (p.paidAmount <= 0) continue
      await recordRepayment(app.id, p.sequence, BigInt(p.paidAmount))
      repaymentsUpdated++
    }
  }
  return { decided, disbursed, repaymentsUpdated }
}

async function notify(app: App, templateKey: string, vars: Record<string, string>, quiet?: QuietHours) {
  const [g] = await db().select({ name: garages.name }).from(garages).where(eq(garages.id, app.garageId)).limit(1)
  return sendMessage({
    garageId: await platformGarageId(),
    channel: "sms",
    to: app.applicantPhone,
    templateKey,
    variables: { customer_first_name: app.applicantName.split(" ")[0] || "there", garage_name: g?.name ?? "the garage", reference: app.reference, ...vars },
    idempotencyKey: `${templateKey}:${app.id}:${vars.sequence ?? ""}:${vars.stage ?? ""}`,
    quietHours: quiet ?? DEFAULT_QUIET_HOURS,
  })
}

/**
 * Daily: repayment reminders — 3 days before, on the day, 3 and 10 days late.
 * Sent with quiet hours applied (a reminder that lands in quiet hours is
 * left for the next run instead of being marked sent).
 */
export async function sendRepaymentReminders(todayISO = today()): Promise<{ sent: number; deferred: number }> {
  const provider = financingProvider()
  const rows = await db()
    .select({ r: financingRepayments, app: financingApplications, quiet: garageSettings.quietHours })
    .from(financingRepayments)
    .innerJoin(financingApplications, eq(financingApplications.id, financingRepayments.applicationId))
    .leftJoin(garageSettings, eq(garageSettings.garageId, financingApplications.garageId))
    .where(and(
      eq(financingApplications.status, "disbursed"),
      sql`${financingRepayments.paidAmount} < ${financingRepayments.amount}`,
      sql`${financingRepayments.dueDate} <= (${todayISO}::date + 3)`,
    ))
    .orderBy(asc(financingRepayments.dueDate))
    .limit(1000)
  let sent = 0
  let deferred = 0
  for (const { r, app, quiet } of rows) {
    const step = reminderToSend({ dueDate: r.dueDate, amount: Number(r.amount), paidAmount: Number(r.paidAmount), reminderStage: r.reminderStage }, todayISO)
    if (!step) continue
    const q = quiet as { start?: string; end?: string } | null
    const res = await notify(app, step.templateKey, {
      amount: ghs(Number(r.amount - r.paidAmount)),
      due_date: r.dueDate,
      sequence: String(r.sequence),
      months: String(app.months),
      pay_link: provider.repaymentUrl(app.providerRef ?? app.reference, r.sequence),
      stage: String(step.stage),
    }, q?.start && q?.end ? { start: q.start, end: q.end } : undefined).catch(() => null)
    if (!res?.ok) continue
    if (res.deferredTo) { deferred++; continue }
    await db().update(financingRepayments).set({ reminderStage: step.stage, lastRemindedAt: new Date() }).where(eq(financingRepayments.id, r.id))
    sent++
  }
  return { sent, deferred }
}

export type MyFinancing = {
  id: string; reference: string; garageName: string; status: string; amount: number; months: number
  monthlyPayment: number | null; totalRepayable: number | null; rateLabel: string | null; declineReason: string | null; createdAt: string
  repayments: { sequence: number; dueDate: string; amount: number; paidAmount: number; status: "paid" | "overdue" | "upcoming"; payUrl: string | null }[]
}

/** A driver's applications and repayment schedules (by verified phone). */
export async function financingForPhone(phone: string): Promise<MyFinancing[]> {
  const apps = await db().select({ a: financingApplications, garageName: garages.name })
    .from(financingApplications).innerJoin(garages, eq(garages.id, financingApplications.garageId))
    .where(eq(financingApplications.applicantPhone, phone)).orderBy(desc(financingApplications.createdAt)).limit(30)
  if (!apps.length) return []
  const reps = await db().select().from(financingRepayments).where(inArray(financingRepayments.applicationId, apps.map((x) => x.a.id))).orderBy(asc(financingRepayments.sequence))
  const provider = financingProvider()
  const t = today()
  return apps.map(({ a, garageName }) => ({
    id: a.id, reference: a.reference, garageName, status: a.status,
    amount: Number(a.amountFinanced ?? a.amountRequested), months: a.months,
    monthlyPayment: a.monthlyPayment != null ? Number(a.monthlyPayment) : null,
    totalRepayable: a.totalRepayable != null ? Number(a.totalRepayable) : null,
    rateLabel: a.rateLabel, declineReason: a.declineReason, createdAt: a.createdAt.toISOString(),
    repayments: reps.filter((r) => r.applicationId === a.id).map((r) => {
      const status = repaymentStatus({ dueDate: r.dueDate, amount: Number(r.amount), paidAmount: Number(r.paidAmount) }, t)
      return { sequence: r.sequence, dueDate: r.dueDate, amount: Number(r.amount), paidAmount: Number(r.paidAmount), status, payUrl: status === "paid" ? null : provider.repaymentUrl(a.providerRef ?? a.reference, r.sequence) }
    }),
  }))
}

/** Latest application for an estimate's job or an invoice (shown on the public page). */
export async function latestApplication(where: { jobId?: string | null; invoiceId?: string | null }): Promise<App | null> {
  const cond = where.invoiceId ? eq(financingApplications.invoiceId, where.invoiceId) : where.jobId ? eq(financingApplications.jobId, where.jobId) : null
  if (!cond) return null
  const [a] = await db().select().from(financingApplications).where(cond).orderBy(desc(financingApplications.createdAt)).limit(1)
  return a ?? null
}

/** Customer record + phone for an estimate or invoice. */
export async function customerFor(customerId: string | null) {
  if (!customerId) return null
  const [c] = await db().select({ id: customers.id, name: customers.fullName, phone: customers.phone }).from(customers).where(eq(customers.id, customerId)).limit(1)
  return c ?? null
}

