import "server-only"
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { reportSnapshots } from "@/lib/db/schema"
import { computePeriodMetrics, prevPeriod, type PeriodMetrics } from "./metrics"

export type ReportData = {
  metrics: PeriodMetrics & {
    comparison?: {
      periodStart: string
      periodEnd: string
      revenue: number
      paymentsReceived: number
      netProfit: number
      jobsCompleted: number
    }
    generatedAt?: string
  }
  source: "snapshot" | "live"
}

function monthRange(period: string) {
  const [y, m] = period.split("-").map(Number)
  const start = `${period}-01`
  const end = m === 12
    ? `${y + 1}-01-01`
    : `${y}-${String(m + 1).padStart(2, "0")}-01`
  return { start, end }
}

export async function getReportData(
  garageId: string,
  branchId: string | null,
  periodType: "day" | "month",
  period: string, // YYYY-MM-DD or YYYY-MM
): Promise<ReportData | null> {
  const { start, end } = periodType === "day"
    ? { start: period, end: new Date(new Date(`${period}T00:00:00Z`).getTime() + 86400_000).toISOString().slice(0, 10) }
    : monthRange(period)

  const today = new Date().toISOString().slice(0, 10)
  const isToday = periodType === "day" && start === today

  // snapshots only exist garage-wide; use them for non-today, non-branch views
  if (!isToday && !branchId) {
    const [snap] = await db()
      .select({ metrics: reportSnapshots.metrics })
      .from(reportSnapshots)
      .where(and(
        eq(reportSnapshots.garageId, garageId),
        isNull(reportSnapshots.branchId),
        eq(reportSnapshots.periodType, periodType),
        eq(reportSnapshots.periodStart, start),
      ))
      .limit(1)
    if (snap?.metrics) {
      return { metrics: snap.metrics as ReportData["metrics"], source: "snapshot" }
    }
  }

  const metrics = await computePeriodMetrics(garageId, branchId, start, end)
  const prev = prevPeriod(start, end)
  const prevMetrics = await computePeriodMetrics(garageId, branchId, prev.start, prev.end)
  return {
    source: "live",
    metrics: {
      ...metrics,
      comparison: {
        periodStart: prev.start,
        periodEnd: prev.end,
        revenue: prevMetrics.sales.total,
        paymentsReceived: prevMetrics.paymentsReceived,
        netProfit: prevMetrics.netProfit,
        jobsCompleted: prevMetrics.jobsCompleted,
      },
    },
  }
}
