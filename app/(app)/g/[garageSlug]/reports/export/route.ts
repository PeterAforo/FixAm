import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages } from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { getReportData } from "@/lib/reports/load"
import { formatGHS } from "@/lib/money"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ garageSlug: string }> },
) {
  const { garageSlug } = await params
  const userId = await getSessionUserId()
  if (!userId) return new NextResponse("Unauthorized", { status: 401 })

  const [garage] = await db().select().from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) return new NextResponse("Not found", { status: 404 })
  const m = await resolveMembership(userId, garage.id)
  if (!m) return new NextResponse("Forbidden", { status: 403 })
  const principal = { kind: "staff" as const, role: m.role as StaffRole, garageId: garage.id, branchId: m.branchId }
  if (!can(principal, "reports.export")) return new NextResponse("Forbidden", { status: 403 })

  const sp = req.nextUrl.searchParams
  const type = sp.get("type") === "month" ? "month" : "day"
  const period = sp.get("period") ?? new Date().toISOString().slice(0, 10)
  const branchId = sp.get("branch") || null

  const data = await getReportData(garage.id, branchId, type, period)
  if (!data) return new NextResponse("No data", { status: 404 })
  const { metrics: mt } = data

  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  const lines: string[] = []
  lines.push(`FixAm report — ${garage.name}`)
  lines.push(`Period,${type === "day" ? mt.periodStart : mt.periodStart.slice(0, 7)}`)
  lines.push(`Source,${data.source}`)
  lines.push("")
  lines.push("Summary")
  lines.push("Metric,Value")
  lines.push(`Invoices issued,${mt.sales.invoiceCount}`)
  lines.push(`Sales (excl. tax),${formatGHS(mt.sales.subtotal)}`)
  lines.push(`Tax collected,${formatGHS(mt.sales.tax)}`)
  lines.push(`Total sales,${formatGHS(mt.sales.total)}`)
  lines.push(`COGS,${formatGHS(mt.cogs)}`)
  lines.push(`Gross profit,${formatGHS(mt.grossProfit)}`)
  lines.push(`Expenses,${formatGHS(mt.expensesTotal)}`)
  lines.push(`Net profit,${formatGHS(mt.netProfit)}`)
  lines.push(`Payments received,${formatGHS(mt.paymentsReceived)}`)
  lines.push(`Refunds,${formatGHS(mt.refundsTotal)}`)
  lines.push(`Jobs completed,${mt.jobsCompleted}`)
  lines.push(`Jobs created,${mt.jobsCreated}`)
  lines.push("")
  lines.push("Sales by type")
  lines.push("Type,Amount")
  for (const [k, v] of Object.entries(mt.sales.byType)) lines.push(`${esc(k)},${formatGHS(v)}`)
  lines.push("")
  lines.push("Payments by method")
  lines.push("Method,Amount")
  for (const [k, v] of Object.entries(mt.paymentsByMethod)) lines.push(`${esc(k)},${formatGHS(v)}`)
  lines.push("")
  lines.push("Expenses by category")
  lines.push("Category,Amount")
  for (const [k, v] of Object.entries(mt.expensesByCategory)) lines.push(`${esc(k)},${formatGHS(v)}`)
  lines.push("")
  lines.push("Daily breakdown")
  lines.push("Date,Invoiced,Payments received")
  for (const d of mt.dailyBreakdown) lines.push(`${d.date},${formatGHS(d.revenue)},${formatGHS(d.payments)}`)
  lines.push("")
  lines.push("Staff performance")
  lines.push("Staff,Jobs completed")
  for (const s of mt.staffPerformance) lines.push(`${esc(s.name)},${s.jobsCompleted}`)
  lines.push("")
  lines.push("Outstanding")
  lines.push("Invoice balances," + formatGHS(mt.outstanding.invoiceBalances))
  lines.push("Overdue instalments," + formatGHS(mt.outstanding.instalmentsOverdue))
  lines.push("Credit balances," + formatGHS(mt.outstanding.creditBalances))

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fixam-report-${period}.csv"`,
    },
  })
}
