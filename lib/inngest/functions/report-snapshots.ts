import { isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages, reportSnapshots } from "@/lib/db/schema"
import { computePeriodMetrics, prevPeriod } from "@/lib/reports/metrics"
import { inngest } from "../client"
import { uuidv7 } from "@/lib/id"

const iso = (d: Date) => d.toISOString().slice(0, 10)

async function snapshot(garageId: string, periodType: "day" | "month", startISO: string, endISO: string) {
  const metrics = await computePeriodMetrics(garageId, null, startISO, endISO)
  const prev = prevPeriod(startISO, endISO)
  const prevMetrics = await computePeriodMetrics(garageId, null, prev.start, prev.end)

  const payload = {
    ...metrics,
    comparison: {
      periodStart: prev.start,
      periodEnd: prev.end,
      revenue: prevMetrics.sales.total,
      paymentsReceived: prevMetrics.paymentsReceived,
      netProfit: prevMetrics.netProfit,
      jobsCompleted: prevMetrics.jobsCompleted,
    },
    generatedAt: new Date().toISOString(),
  }

  await db()
    .insert(reportSnapshots)
    .values({
      id: uuidv7(),
      garageId,
      branchId: null,
      periodType,
      periodStart: startISO,
      metrics: payload,
    })
    .onConflictDoUpdate({
      target: [reportSnapshots.garageId, reportSnapshots.branchId, reportSnapshots.periodType, reportSnapshots.periodStart],
      set: { metrics: payload, updatedAt: new Date() },
    })
  return { garageId, periodType, startISO, invoices: metrics.sales.invoiceCount }
}

/** Nightly: snapshot yesterday for every garage. */
export const dailyReportSnapshots = inngest.createFunction(
  {
    id: "daily-report-snapshots",
    retries: 1,
    triggers: [{ cron: "30 1 * * *" }],
  },
  async ({ step }) => {
    const all = await step.run("list-garages", async () =>
      db().select({ id: garages.id }).from(garages).where(isNull(garages.deletedAt))
    )
    const yesterday = new Date(Date.now() - 86400_000)
    const start = iso(yesterday)
    const results = []
    for (const g of all) {
      results.push(await step.run(`snap-${g.id}`, () => snapshot(g.id, "day", start, iso(new Date()))))
    }
    return { count: results.length }
  }
)

/** Monthly: on the 1st, snapshot the previous month for every garage. */
export const monthlyReportSnapshots = inngest.createFunction(
  {
    id: "monthly-report-snapshots",
    retries: 1,
    triggers: [{ cron: "0 2 1 * *" }],
  },
  async ({ step }) => {
    const all = await step.run("list-garages", async () =>
      db().select({ id: garages.id }).from(garages).where(isNull(garages.deletedAt))
    )
    const now = new Date()
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const start = iso(monthStart)
    const end = iso(monthEnd)
    const results = []
    for (const g of all) {
      results.push(await step.run(`snap-${g.id}`, () => snapshot(g.id, "month", start, end)))
    }
    return { count: results.length }
  }
)
