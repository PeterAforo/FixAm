"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { formatGHS } from "@/lib/money"
import type { PeriodMetrics } from "@/lib/reports/metrics"

const CHART = {
  revenue: "var(--color-ignition-500)",
  payments: "var(--color-turbo-500)",
  cogs: "var(--color-midnight-400)",
  expenses: "var(--color-warning)",
}

type Data = PeriodMetrics & {
  comparison?: { periodStart: string; periodEnd: string; revenue: number; paymentsReceived: number; netProfit: number; jobsCompleted: number }
}

function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null
  const pct = previous === 0 ? null : Math.round(((current - previous) / Math.abs(previous)) * 100)
  const up = current >= previous
  return (
    <span className={`text-xs font-medium ${up ? "text-success" : "text-danger"}`}>
      {pct === null ? "new" : `${up ? "+" : ""}${pct}%`}
    </span>
  )
}

function BarList({ title, rows, color }: { title: string; rows: [string, number][]; color: string }) {
  const max = Math.max(1, ...rows.map(([, v]) => v))
  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
        <div className="mt-3 space-y-2">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">No data</p>}
          {rows.map(([label, v]) => (
            <div key={label} className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0 truncate capitalize">{label.replace(/_/g, " ")}</span>
              <div className="h-4 flex-1 rounded bg-muted">
                <div className="h-4 rounded" style={{ width: `${(v / max) * 100}%`, background: color }} />
              </div>
              <span className="w-24 text-right tabular-nums">{formatGHS(v)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function DailyChart({ data }: { data: { date: string; revenue: number; payments: number }[] }) {
  const w = 720, h = 180, pad = 8
  const max = Math.max(1, ...data.map((d) => Math.max(d.revenue, d.payments)))
  const bw = (w - pad * 2) / Math.max(1, data.length)
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">Daily revenue vs collections</h3>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CHART.revenue }} />Invoiced</span>
            <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CHART.payments }} />Payments</span>
          </div>
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full" role="img" aria-label="Daily revenue chart">
          {data.map((d, i) => {
            const x = pad + i * bw + bw * 0.15
            const rw = bw * 0.32
            const rh = (d.revenue / max) * (h - 24)
            const ph = (d.payments / max) * (h - 24)
            return (
              <g key={d.date}>
                <rect x={x} y={h - 16 - rh} width={rw} height={Math.max(1, rh)} rx={2} fill={CHART.revenue}>
                  <title>{`${d.date}: invoiced ${formatGHS(d.revenue)}`}</title>
                </rect>
                <rect x={x + rw + 2} y={h - 16 - ph} width={rw} height={Math.max(1, ph)} rx={2} fill={CHART.payments}>
                  <title>{`${d.date}: payments ${formatGHS(d.payments)}`}</title>
                </rect>
              </g>
            )
          })}
        </svg>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>{data[0]?.date}</span>
          <span>{data[data.length - 1]?.date}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export function ReportsPanel(props: {
  garageSlug: string
  garageId: string
  type: "day" | "month"
  period: string
  branchId: string | null
  branches: { id: string; name: string }[]
  data: Data
  source: "snapshot" | "live"
  profitVisible: boolean
  canExport: boolean
}) {
  const { garageSlug, type, period, branchId, branches, data: mt, source, profitVisible, canExport } = props
  const router = useRouter()

  const cmp = mt.comparison
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ type, period, ...(branchId ? { branch: branchId } : {}), ...over })
    return `/g/${garageSlug}/reports?${p}`
  }
  const exportUrl = `/g/${garageSlug}/reports/export?type=${type}&period=${period}${branchId ? `&branch=${branchId}` : ""}`

  const netProfitLabel = profitVisible ? mt.netProfit : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-muted-foreground">
            {type === "day" ? `Day report — ${mt.periodStart}` : `Month report — ${mt.periodStart.slice(0, 7)}`}
            {" · "}{source === "live" ? "Live figures" : "Nightly snapshot"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border-2 border-border bg-surface p-0.5">
            {(["day", "month"] as const).map((t) => (
              <button key={t} onClick={() => router.push(qs({ type: t, period: t === "month" ? period.slice(0, 7) : period }))}
                className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                {t}
              </button>
            ))}
          </div>
          {type === "day" ? (
            <input type="date" defaultValue={period} onChange={(e) => e.target.value && router.push(qs({ period: e.target.value }))}
              className="min-h-10 rounded-lg border-2 border-border bg-surface px-2 text-sm" />
          ) : (
            <input type="month" defaultValue={period.slice(0, 7)} onChange={(e) => e.target.value && router.push(qs({ type: "month", period: e.target.value }))}
              className="min-h-10 rounded-lg border-2 border-border bg-surface px-2 text-sm" />
          )}
          {branches.length > 1 && (
            <select value={branchId ?? ""} onChange={(e) => router.push(qs({ branch: e.target.value }))}
              className="min-h-10 rounded-lg border-2 border-border bg-surface px-2 text-sm">
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          {canExport && (
            <>
              <a href={exportUrl}><Button variant="secondary">Export CSV</Button></a>
              <Button variant="secondary" onClick={() => window.print()}>Print / PDF</Button>
            </>
          )}
        </div>
      </div>

      {/* stat tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([
          ["Invoiced", formatGHS(mt.sales.total), cmp ? <Delta current={mt.sales.total} previous={cmp.revenue} /> : null],
          ["Payments received", formatGHS(mt.paymentsReceived), cmp ? <Delta current={mt.paymentsReceived} previous={cmp.paymentsReceived} /> : null],
          ["Expenses", formatGHS(mt.expensesTotal), null],
          ["Net profit", profitVisible ? formatGHS(netProfitLabel ?? 0) : "Restricted", cmp && profitVisible ? <Delta current={mt.netProfit} previous={cmp.netProfit} /> : null],
        ] as const).map(([label, value, delta]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 font-display text-xl font-bold tabular-nums">{value}</p>
              {delta}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Jobs completed</p><p className="font-display text-xl font-bold">{mt.jobsCompleted}</p>{cmp && <Delta current={mt.jobsCompleted} previous={cmp.jobsCompleted} />}</CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Jobs created</p><p className="font-display text-xl font-bold">{mt.jobsCreated}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Invoices issued</p><p className="font-display text-xl font-bold">{mt.sales.invoiceCount}</p></CardContent></Card>
      </div>

      {mt.dailyBreakdown.length > 1 && <DailyChart data={mt.dailyBreakdown} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <BarList title="Sales by type" rows={Object.entries(mt.sales.byType).sort((a, b) => b[1] - a[1])} color={CHART.revenue} />
        <BarList title="Payments by method" rows={Object.entries(mt.paymentsByMethod).sort((a, b) => b[1] - a[1])} color={CHART.payments} />
        <BarList title="Expenses by category" rows={Object.entries(mt.expensesByCategory).sort((a, b) => b[1] - a[1])} color={CHART.expenses} />
        {profitVisible && (
          <BarList title="Profit bridge" rows={[
            ["Sales (ex-tax)", mt.sales.subtotal],
            ["COGS", -mt.cogs],
            ["Gross profit", mt.grossProfit],
            ["Expenses", -mt.expensesTotal],
            ["Net profit", mt.netProfit],
          ]} color={CHART.cogs} />
        )}
      </div>

      {/* outstanding */}
      <Card>
        <CardContent className="p-4">
          <h3 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">Outstanding balances</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {([
              ["Unpaid invoices", mt.outstanding.invoiceBalances],
              ["Overdue instalments", mt.outstanding.instalmentsOverdue],
              ["Credit account balances", mt.outstanding.creditBalances],
            ] as const).map(([label, v]) => (
              <div key={label} className="rounded-xl border-2 border-border bg-surface-muted p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-display text-lg font-bold tabular-nums">{formatGHS(v)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* staff performance */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b px-4 py-3">
            <h3 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">Staff performance — jobs delivered</h3>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {mt.staffPerformance.length === 0 && (
                <tr><td className="px-4 py-8 text-center text-muted-foreground">No completed jobs in this period</td></tr>
              )}
              {mt.staffPerformance.map((s) => (
                <tr key={s.userId} className="border-b last:border-0">
                  <td className="px-4 py-3">{s.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{s.jobsCompleted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        <StatusPill status={source} tone={source === "live" ? "info" : "neutral"}>{source === "live" ? "Live" : "Snapshot"}</StatusPill>
        {" "}Tax collected: {formatGHS(mt.sales.tax)} · Refunds: {formatGHS(mt.refundsTotal)}
      </p>
    </div>
  )
}
