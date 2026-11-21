import "server-only"
import { and, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  customers,
  dueItems,
  expenses,
  instalments,
  invoices,
  jobs,
  paymentPlans,
  payments,
  vehicles,
} from "@/lib/db/schema"

export type DashboardData = {
  today: {
    paymentsTotal: number
    paymentsCount: number
    cashTotal: number
    cashExpenses: number
  }
  jobsByStatus: Record<string, number>
  jobsInProgress: number
  readyJobs: {
    id: string
    number: string
    plateNumber: string | null
    customerName: string | null
    balanceDue: number
    invoiceId: string | null
  }[]
  dueThisWeek: {
    id: string
    title: string
    effectiveDueDate: string
    status: string
    customerName: string | null
  }[]
  sparkline: { date: string; total: number }[]
  outstanding: { invoiceBalances: number; instalmentsOverdue: number }
}

const ACTIVE_STATUSES = ["booked", "checked_in", "in_progress", "waiting_parts", "quality_check", "ready"] as const

export async function loadDashboard(garageId: string, branchId: string | null): Promise<DashboardData> {
  const now = new Date()
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dayEnd = new Date(dayStart.getTime() + 86400_000)
  const todayISO = dayStart.toISOString().slice(0, 10)
  const weekEndISO = new Date(dayStart.getTime() + 7 * 86400_000).toISOString().slice(0, 10)

  const jobBranch = branchId ? eq(jobs.branchId, branchId) : undefined

  const [payToday, statusRows, readyRows, dueRows, sparkRows, outInv, outInst, cashExp] = await Promise.all([
    db()
      .select({ total: sql<string>`coalesce(sum(${payments.amount}),0)`, count: sql<string>`count(*)`, cash: sql<string>`coalesce(sum(case when ${payments.method} = 'cash' then ${payments.amount} else 0 end),0)` })
      .from(payments)
      .where(and(
        eq(payments.garageId, garageId),
        eq(payments.status, "succeeded"),
        gte(payments.paidAt, dayStart),
        lt(payments.paidAt, dayEnd),
        ...(branchId ? [eq(payments.branchId, branchId)] : []),
      )),
    db()
      .select({ status: jobs.status, count: sql<string>`count(*)` })
      .from(jobs)
      .where(and(eq(jobs.garageId, garageId), isNull(jobs.deletedAt), ...(jobBranch ? [jobBranch] : [])))
      .groupBy(jobs.status),
    db()
      .select({
        id: jobs.id, number: jobs.number,
        plateNumber: vehicles.plateNumber,
        customerName: customers.fullName,
        balanceDue: invoices.balanceDue, invoiceId: invoices.id,
      })
      .from(jobs)
      .leftJoin(vehicles, eq(jobs.vehicleId, vehicles.id))
      .leftJoin(customers, eq(jobs.customerId, customers.id))
      .leftJoin(invoices, and(eq(invoices.source, "job"), eq(invoices.sourceId, jobs.id), inArray(invoices.status, ["issued", "partially_paid"])))
      .where(and(eq(jobs.garageId, garageId), eq(jobs.status, "ready"), isNull(jobs.deletedAt), ...(jobBranch ? [jobBranch] : [])))
      .orderBy(jobs.updatedAt)
      .limit(8),
    db()
      .select({
        id: dueItems.id, title: dueItems.title, effectiveDueDate: dueItems.effectiveDueDate,
        status: dueItems.status, customerName: customers.fullName,
      })
      .from(dueItems)
      .leftJoin(customers, eq(dueItems.customerId, customers.id))
      .where(and(
        eq(dueItems.garageId, garageId),
        inArray(dueItems.status, ["scheduled", "due_soon", "due", "overdue"]),
        lte(dueItems.effectiveDueDate, weekEndISO),
        gte(dueItems.effectiveDueDate, todayISO),
      ))
      .orderBy(dueItems.effectiveDueDate)
      .limit(10),
    // 7-day payment sparkline
    db()
      .select({
        day: sql<string>`to_char(${payments.paidAt} at time zone 'UTC', 'YYYY-MM-DD')`,
        total: sql<string>`coalesce(sum(${payments.amount}),0)`,
      })
      .from(payments)
      .where(and(
        eq(payments.garageId, garageId),
        eq(payments.status, "succeeded"),
        gte(payments.paidAt, new Date(dayStart.getTime() - 6 * 86400_000)),
        lt(payments.paidAt, dayEnd),
        ...(branchId ? [eq(payments.branchId, branchId)] : []),
      ))
      .groupBy(sql`1`),
    db()
      .select({ total: sql<string>`coalesce(sum(${invoices.balanceDue}),0)` })
      .from(invoices)
      .where(and(
        eq(invoices.garageId, garageId),
        inArray(invoices.status, ["issued", "partially_paid"]),
        ...(branchId ? [eq(invoices.branchId, branchId)] : []),
      )),
    db()
      .select({ total: sql<string>`coalesce(sum(${instalments.amount} - ${instalments.amountPaid} + ${instalments.lateFee}),0)` })
      .from(instalments)
      .innerJoin(paymentPlans, eq(instalments.paymentPlanId, paymentPlans.id))
      .innerJoin(invoices, eq(paymentPlans.invoiceId, invoices.id))
      .where(and(
        eq(instalments.garageId, garageId),
        eq(instalments.status, "overdue"),
        ...(branchId ? [eq(invoices.branchId, branchId)] : []),
      )),
    db()
      .select({ total: sql<string>`coalesce(sum(${expenses.amount}),0)` })
      .from(expenses)
      .where(and(
        eq(expenses.garageId, garageId),
        eq(expenses.paidOn, todayISO),
        eq(expenses.method, "cash"),
        ...(branchId ? [eq(expenses.branchId, branchId)] : []),
      )),
  ])

  const jobsByStatus: Record<string, number> = {}
  let jobsInProgress = 0
  for (const r of statusRows) {
    jobsByStatus[r.status] = Number(r.count)
    if ((ACTIVE_STATUSES as readonly string[]).includes(r.status) && r.status !== "booked" && r.status !== "ready") {
      jobsInProgress += Number(r.count)
    }
  }

  const sparkMap = new Map(sparkRows.map((r) => [r.day, Number(r.total)]))
  const sparkline = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(dayStart.getTime() - (6 - i) * 86400_000).toISOString().slice(0, 10)
    return { date: d, total: sparkMap.get(d) ?? 0 }
  })

  // ready jobs may have multiple live invoices — keep first per job
  const seen = new Set<string>()
  const ready = readyRows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))

  return {
    today: {
      paymentsTotal: Number(payToday[0]?.total ?? 0),
      paymentsCount: Number(payToday[0]?.count ?? 0),
      cashTotal: Number(payToday[0]?.cash ?? 0),
      cashExpenses: Number(cashExp[0]?.total ?? 0),
    },
    jobsByStatus,
    jobsInProgress,
    readyJobs: ready.map((r) => ({
      id: r.id, number: r.number, plateNumber: r.plateNumber, customerName: r.customerName,
      balanceDue: Number(r.balanceDue ?? 0), invoiceId: r.invoiceId,
    })),
    dueThisWeek: dueRows.map((r) => ({
      id: r.id, title: r.title, effectiveDueDate: r.effectiveDueDate,
      status: r.status, customerName: r.customerName,
    })),
    sparkline,
    outstanding: {
      invoiceBalances: Number(outInv[0]?.total ?? 0),
      instalmentsOverdue: Number(outInst[0]?.total ?? 0),
    },
  }
}

