import { and, eq, gte, inArray, lt, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  creditAccounts,
  expenseCategories,
  expenses,
  instalments,
  invoiceLines,
  invoices,
  jobAssignments,
  jobs,
  parts,
  paymentPlans,
  payments,
  refunds,
  users,
} from "@/lib/db/schema"

export type PeriodMetrics = {
  periodStart: string
  periodEnd: string // exclusive
  sales: {
    invoiceCount: number
    subtotal: number
    tax: number
    total: number
    byType: Record<string, number>
  }
  cogs: number
  grossProfit: number
  expensesTotal: number
  expensesByCategory: Record<string, number>
  paymentsReceived: number
  paymentsByMethod: Record<string, number>
  refundsTotal: number
  netProfit: number
  jobsCompleted: number
  jobsCreated: number
  dailyBreakdown: { date: string; revenue: number; payments: number }[]
  staffPerformance: { userId: string; name: string; jobsCompleted: number }[]
  outstanding: {
    invoiceBalances: number
    instalmentsOverdue: number
    creditBalances: number
  }
}

const num = (v: unknown) => Number(v ?? 0)

/** Metrics for [startISO date, endISO date) — dates as YYYY-MM-DD, end exclusive. */
export async function computePeriodMetrics(
  garageId: string,
  branchId: string | null,
  startISO: string,
  endISO: string,
): Promise<PeriodMetrics> {
  const start = new Date(`${startISO}T00:00:00Z`)
  const end = new Date(`${endISO}T00:00:00Z`)
  const branchCond = branchId ? eq(invoices.branchId, branchId) : undefined

  const issuedStatuses = ["issued", "partially_paid", "paid"] as const

  // ---- sales from issued invoices ----
  const invRows = await db()
    .select({
      status: invoices.status,
      subtotal: invoices.subtotal,
      taxTotal: invoices.taxTotal,
      total: invoices.total,
    })
    .from(invoices)
    .where(and(
      eq(invoices.garageId, garageId),
      inArray(invoices.status, [...issuedStatuses]),
      gte(invoices.issuedAt, start),
      lt(invoices.issuedAt, end),
      ...(branchCond ? [branchCond] : []),
    ))

  const sales = {
    invoiceCount: invRows.length,
    subtotal: invRows.reduce((s, r) => s + num(r.subtotal), 0),
    tax: invRows.reduce((s, r) => s + num(r.taxTotal), 0),
    total: invRows.reduce((s, r) => s + num(r.total), 0),
    byType: {} as Record<string, number>,
  }

  // invoice lines grouped by type for the same invoice set
  const lineRows = await db()
    .select({ type: invoiceLines.type, lineTotal: invoiceLines.lineTotal })
    .from(invoiceLines)
    .innerJoin(invoices, eq(invoiceLines.invoiceId, invoices.id))
    .where(and(
      eq(invoices.garageId, garageId),
      inArray(invoices.status, [...issuedStatuses]),
      gte(invoices.issuedAt, start),
      lt(invoices.issuedAt, end),
      ...(branchCond ? [branchCond] : []),
    ))
  for (const l of lineRows) {
    sales.byType[l.type] = (sales.byType[l.type] ?? 0) + num(l.lineTotal)
  }

  // ---- COGS: parts lines × part cost price ----
  const cogsRows = await db()
    .select({
      quantity: invoiceLines.quantity,
      cost: parts.costPrice,
    })
    .from(invoiceLines)
    .innerJoin(invoices, eq(invoiceLines.invoiceId, invoices.id))
    .innerJoin(parts, eq(invoiceLines.partId, parts.id))
    .where(and(
      eq(invoices.garageId, garageId),
      inArray(invoices.status, [...issuedStatuses]),
      gte(invoices.issuedAt, start),
      lt(invoices.issuedAt, end),
      ...(branchCond ? [branchCond] : []),
    ))
  const cogs = cogsRows.reduce((s, r) => s + num(r.quantity) * num(r.cost), 0)

  // ---- expenses ----
  const expBranch = branchId ? eq(expenses.branchId, branchId) : undefined
  const expRows = await db()
    .select({ name: expenseCategories.name, amount: expenses.amount })
    .from(expenses)
    .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .where(and(
      eq(expenses.garageId, garageId),
      gte(expenses.paidOn, startISO),
      lt(expenses.paidOn, endISO),
      ...(expBranch ? [expBranch] : []),
    ))
  const expensesByCategory: Record<string, number> = {}
  let expensesTotal = 0
  for (const r of expRows) {
    expensesByCategory[r.name] = (expensesByCategory[r.name] ?? 0) + num(r.amount)
    expensesTotal += num(r.amount)
  }

  // ---- payments received ----
  const payBranch = branchId ? eq(payments.branchId, branchId) : undefined
  const payRows = await db()
    .select({ method: payments.method, amount: payments.amount })
    .from(payments)
    .where(and(
      eq(payments.garageId, garageId),
      eq(payments.status, "succeeded"),
      gte(payments.paidAt, start),
      lt(payments.paidAt, end),
      ...(payBranch ? [payBranch] : []),
    ))
  const paymentsByMethod: Record<string, number> = {}
  let paymentsReceived = 0
  for (const r of payRows) {
    paymentsByMethod[r.method] = (paymentsByMethod[r.method] ?? 0) + num(r.amount)
    paymentsReceived += num(r.amount)
  }

  const refundRows = await db()
    .select({ total: sql<string>`coalesce(sum(${refunds.amount}),0)` })
    .from(refunds)
    .innerJoin(payments, eq(refunds.paymentId, payments.id))
    .where(and(
      eq(refunds.garageId, garageId),
      gte(refunds.createdAt, start),
      lt(refunds.createdAt, end),
      ...(branchId ? [eq(payments.branchId, branchId)] : []),
    ))
  const refundsTotal = num(refundRows[0]?.total)

  // ---- jobs ----
  const jobBranch = branchId ? eq(jobs.branchId, branchId) : undefined
  const [completedRows, createdRows] = await Promise.all([
    db().select({ count: sql<string>`count(*)` }).from(jobs)
      .where(and(eq(jobs.garageId, garageId), gte(jobs.deliveredAt, start), lt(jobs.deliveredAt, end), ...(jobBranch ? [jobBranch] : []))),
    db().select({ count: sql<string>`count(*)` }).from(jobs)
      .where(and(eq(jobs.garageId, garageId), gte(jobs.createdAt, start), lt(jobs.createdAt, end), ...(jobBranch ? [jobBranch] : []))),
  ])
  const jobsCompleted = num(completedRows[0]?.count)
  const jobsCreated = num(createdRows[0]?.count)

  // ---- daily breakdown (payments + issued-invoice totals per day) ----
  const dailyPay = await db()
    .select({
      day: sql<string>`to_char(${payments.paidAt} at time zone 'UTC', 'YYYY-MM-DD')`,
      total: sql<string>`coalesce(sum(${payments.amount}),0)`,
    })
    .from(payments)
    .where(and(
      eq(payments.garageId, garageId),
      eq(payments.status, "succeeded"),
      gte(payments.paidAt, start),
      lt(payments.paidAt, end),
      ...(payBranch ? [payBranch] : []),
    ))
    .groupBy(sql`1`)
  const dailyInv = await db()
    .select({
      day: sql<string>`to_char(${invoices.issuedAt} at time zone 'UTC', 'YYYY-MM-DD')`,
      total: sql<string>`coalesce(sum(${invoices.total}),0)`,
    })
    .from(invoices)
    .where(and(
      eq(invoices.garageId, garageId),
      inArray(invoices.status, [...issuedStatuses]),
      gte(invoices.issuedAt, start),
      lt(invoices.issuedAt, end),
      ...(branchCond ? [branchCond] : []),
    ))
    .groupBy(sql`1`)

  const dayMap = new Map<string, { revenue: number; payments: number }>()
  const spanDays = Math.min(92, Math.round((end.getTime() - start.getTime()) / 86400_000))
  for (let i = 0; i < spanDays; i++) {
    const d = new Date(start.getTime() + i * 86400_000).toISOString().slice(0, 10)
    dayMap.set(d, { revenue: 0, payments: 0 })
  }
  for (const r of dailyInv) {
    const e = dayMap.get(r.day)
    if (e) e.revenue = num(r.total)
  }
  for (const r of dailyPay) {
    const e = dayMap.get(r.day)
    if (e) e.payments = num(r.total)
  }
  const dailyBreakdown = [...dayMap.entries()].map(([date, v]) => ({ date, ...v }))

  // ---- staff performance: jobs delivered per assignee ----
  const staffRows = await db()
    .select({
      userId: jobAssignments.userId,
      name: users.fullName,
      count: sql<string>`count(distinct ${jobs.id})`,
    })
    .from(jobAssignments)
    .innerJoin(jobs, eq(jobAssignments.jobId, jobs.id))
    .innerJoin(users, eq(jobAssignments.userId, users.id))
    .where(and(
      eq(jobs.garageId, garageId),
      gte(jobs.deliveredAt, start),
      lt(jobs.deliveredAt, end),
      ...(jobBranch ? [jobBranch] : []),
    ))
    .groupBy(jobAssignments.userId, users.fullName)
    .orderBy(sql`count(distinct ${jobs.id}) desc`)
    .limit(10)
  const staffPerformance = staffRows.map((r) => ({
    userId: r.userId, name: r.name, jobsCompleted: num(r.count),
  }))

  // ---- outstanding balances (point-in-time, not period-bound) ----
  const outInv = await db()
    .select({ total: sql<string>`coalesce(sum(${invoices.balanceDue}),0)` })
    .from(invoices)
    .where(and(
      eq(invoices.garageId, garageId),
      inArray(invoices.status, ["issued", "partially_paid"]),
      ...(branchCond ? [branchCond] : []),
    ))
  const outInstQuery = db()
    .select({ total: sql<string>`coalesce(sum(${instalments.amount} - ${instalments.amountPaid} + ${instalments.lateFee}),0)` })
    .from(instalments)
    .innerJoin(paymentPlans, eq(instalments.paymentPlanId, paymentPlans.id))
    .innerJoin(invoices, eq(paymentPlans.invoiceId, invoices.id))
    .where(and(
      eq(instalments.garageId, garageId),
      eq(instalments.status, "overdue"),
      ...(branchId ? [eq(invoices.branchId, branchId)] : []),
    ))
  const outInst = await outInstQuery
  const outCredit = await db()
    .select({ total: sql<string>`coalesce(sum(${creditAccounts.balance}),0)` })
    .from(creditAccounts)
    .where(and(eq(creditAccounts.garageId, garageId), eq(creditAccounts.status, "active")))

  const grossProfit = sales.subtotal - cogs
  return {
    periodStart: startISO,
    periodEnd: endISO,
    sales: { ...sales, byType: sales.byType },
    cogs,
    grossProfit,
    expensesTotal,
    expensesByCategory,
    paymentsReceived,
    paymentsByMethod,
    refundsTotal,
    netProfit: grossProfit - expensesTotal,
    jobsCompleted,
    jobsCreated,
    dailyBreakdown,
    staffPerformance,
    outstanding: {
      invoiceBalances: num(outInv[0]?.total),
      instalmentsOverdue: num(outInst[0]?.total),
      creditBalances: num(outCredit[0]?.total),
    },
  }
}

export function prevPeriod(startISO: string, endISO: string): { start: string; end: string } {
  const s = new Date(`${startISO}T00:00:00Z`)
  const e = new Date(`${endISO}T00:00:00Z`)
  const span = e.getTime() - s.getTime()
  const pe = new Date(s.getTime())
  const ps = new Date(s.getTime() - span)
  return { start: ps.toISOString().slice(0, 10), end: pe.toISOString().slice(0, 10) }
}
