"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill, statusTone } from "@/components/brand/status-pill"
import { formatGHS } from "@/lib/money"
import { getInvoicePayLink } from "@/lib/money/actions"
import type { DashboardData } from "@/lib/dashboard"

const STATUS_ORDER = [
  "booked", "checked_in", "in_progress", "waiting_parts", "quality_check", "ready", "delivered", "cancelled",
]

function Sparkline({ data }: { data: { date: string; total: number }[] }) {
  const w = 280, h = 56
  const max = Math.max(1, ...data.map((d) => d.total))
  const bw = w / data.length
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full" role="img" aria-label="7-day revenue">
      {data.map((d, i) => {
        const bh = (d.total / max) * (h - 8)
        return (
          <rect key={d.date} x={i * bw + 4} y={h - bh} width={Math.max(4, bw - 8)} height={Math.max(2, bh)} rx={3}
            fill="var(--color-ignition-500)">
            <title>{`${d.date.slice(5)}: ${formatGHS(d.total)}`}</title>
          </rect>
        )
      })}
    </svg>
  )
}

function PayLinkButton({ garageId, invoiceId }: { garageId: string; invoiceId: string }) {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  return (
    <Button
      variant="secondary"
      disabled={pending || done}
      onClick={() => startTransition(async () => {
        const res = await getInvoicePayLink({ garageId, invoiceId })
        if (res.ok) {
          await navigator.clipboard.writeText(res.data.url).catch(() => {})
          setDone(true)
        }
      })}
    >
      {done ? "Link copied" : "Send pay link"}
    </Button>
  )
}

export function DashboardPanel(props: {
  garageId: string
  garageSlug: string
  garageName: string
  userName: string
  canSeeMoney: boolean
  canCheckIn: boolean
  canBook: boolean
  canExpense: boolean
  canPos: boolean
  data: DashboardData
}) {
  const { garageId, garageSlug, garageName, userName, canSeeMoney, canCheckIn, canBook, canExpense, canPos, data } = props
  const base = `/g/${garageSlug}`
  const today = new Date().toLocaleDateString("en-GH", { weekday: "long", day: "numeric", month: "long" })

  const quickActions = [
    canCheckIn && { href: `${base}/check-in`, label: "Check in vehicle" },
    canBook && { href: `${base}/bookings`, label: "New booking" },
    canPos && { href: `${base}/pos`, label: "Counter sale" },
    canExpense && { href: `${base}/expenses`, label: "Record expense" },
  ].filter(Boolean) as { href: string; label: string }[]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Good day, {userName.split(" ")[0]}</h1>
          <p className="text-sm text-muted-foreground">{garageName} · {today}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickActions.map((a) => (
            <Link key={a.href} href={a.href}>
              <Button variant="secondary" className="!min-h-9 text-sm">{a.label}</Button>
            </Link>
          ))}
        </div>
      </div>

      {canSeeMoney && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {([
            ["Today's revenue", formatGHS(data.today.paymentsTotal)],
            ["Payments received", `${data.today.paymentsCount}`],
            ["Jobs in progress", `${data.jobsInProgress}`],
            ["Ready for pickup", `${data.readyJobs.length}`],
          ] as const).map(([label, value]) => (
            <Card key={label}>
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!canSeeMoney && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {([
            ["Jobs in progress", `${data.jobsInProgress}`],
            ["Ready for pickup", `${data.readyJobs.length}`],
            ["Reminders this week", `${data.dueThisWeek.length}`],
            ["Vehicles", "—"],
          ] as const).map(([label, value]) => (
            <Card key={label}>
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* jobs by status */}
        <Card className="lg:col-span-1">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">Jobs by status</h2>
              <Link href={`${base}/jobs`} className="text-xs font-bold text-primary">Board →</Link>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {STATUS_ORDER.map((s) => {
                const n = data.jobsByStatus[s] ?? 0
                if (n === 0) return null
                return (
                  <Link key={s} href={`${base}/jobs?status=${s}`}>
                    <StatusPill status={s} tone={statusTone(s)}>{s.replace(/_/g, " ")} · {n}</StatusPill>
                  </Link>
                )
              })}
              {Object.keys(data.jobsByStatus).length === 0 && (
                <p className="text-sm text-muted-foreground">No jobs yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ready for pickup */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">Ready for pickup</h2>
            <div className="mt-3 divide-y">
              {data.readyJobs.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">Nothing waiting for collection</p>
              )}
              {data.readyJobs.map((j) => (
                <div key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="font-medium">{j.number} · {j.plateNumber ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{j.customerName ?? "Walk-in"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {canSeeMoney && j.balanceDue > 0 && (
                      <span className="text-sm font-bold tabular-nums text-warning">{formatGHS(j.balanceDue)} due</span>
                    )}
                    {canSeeMoney && j.invoiceId && j.balanceDue > 0 && (
                      <PayLinkButton garageId={garageId} invoiceId={j.invoiceId} />
                    )}
                    <Link href={`${base}/jobs/${j.id}`} className="text-sm font-bold text-primary">Open →</Link>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* reminders due this week */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">Reminders due this week</h2>
              <Link href={`${base}/vehicles`} className="text-xs font-bold text-primary">Vehicles →</Link>
            </div>
            <div className="mt-3 space-y-2">
              {data.dueThisWeek.length === 0 && (
                <p className="text-sm text-muted-foreground">All clear</p>
              )}
              {data.dueThisWeek.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground">{d.customerName ?? ""} · {d.effectiveDueDate}</p>
                  </div>
                  <StatusPill status={d.status} tone={statusTone(d.status)} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* outstanding */}
        {canSeeMoney && (
          <Card>
            <CardContent className="p-4">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">Outstanding</h2>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Unpaid invoices</span><span className="font-bold tabular-nums">{formatGHS(data.outstanding.invoiceBalances)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Overdue instalments</span><span className="font-bold tabular-nums">{formatGHS(data.outstanding.instalmentsOverdue)}</span></div>
                <Link href={`${base}/invoices`} className="block pt-1 text-xs font-bold text-primary">Invoices →</Link>
                <Link href={`${base}/credit`} className="block text-xs font-bold text-primary">Credit accounts →</Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* sparkline + cash */}
        {canSeeMoney && (
          <Card>
            <CardContent className="p-4">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">Last 7 days</h2>
              <div className="mt-3">
                <Sparkline data={data.sparkline} />
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>Cash today: {formatGHS(data.today.cashTotal - data.today.cashExpenses)}</span>
                <Link href={`${base}/reports`} className="font-bold text-primary">Reports →</Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
