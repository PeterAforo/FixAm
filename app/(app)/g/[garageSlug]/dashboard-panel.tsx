"use client"

import Link from "next/link"
import { useState, useTransition, type ReactNode } from "react"
import {
  ArrowRight,
  BellRing,
  CalendarPlus,
  CarFront,
  CircleCheck,
  Receipt,
  ScanBarcode,
  Wallet,
  Wrench,
} from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card } from "@/components/brand/card"
import { EmptyState } from "@/components/brand/empty-state"
import { MoneyCard } from "@/components/brand/money-card"
import { StatTile } from "@/components/brand/stat-tile"
import { StatusPill, statusTone } from "@/components/brand/status-pill"
import { formatGHS } from "@/lib/money"
import { getInvoicePayLink } from "@/lib/money/actions"
import { HelpTips } from "@/components/help-tips"
import type { DashboardData } from "@/lib/dashboard"

const STATUS_ORDER = [
  "booked", "checked_in", "in_progress", "waiting_parts", "quality_check", "ready", "delivered", "cancelled",
]
const STATUS_BAR: Record<string, string> = {
  booked: "#A79E91",
  checked_in: "#00A39B",
  in_progress: "#FF5A1F",
  waiting_parts: "#FFB020",
  quality_check: "#7C6CFF",
  ready: "#A6D914",
  delivered: "#2D375B",
  cancelled: "#D3CABC",
}

function CardHead({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {href && (
        <Link href={href} className="inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground">
          {linkLabel ?? "View all"} <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  )
}

function RevenueBars({ data }: { data: { date: string; total: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.total))
  const total = data.reduce((s, d) => s + d.total, 0)
  return (
    <div>
      <p className="font-display text-2xl font-semibold tracking-[-0.02em] tabular-nums">{formatGHS(total)}</p>
      <p className="text-xs text-muted-foreground">Collected in the last 7 days</p>
      <div className="mt-4 hidden h-24 items-end gap-2 md:flex" role="img" aria-label="Revenue for the last 7 days">
        {data.map((d, i) => {
          const pct = Math.max(4, (d.total / max) * 100)
          const isToday = i === data.length - 1
          return (
            <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <div
                className="w-full rounded-md"
                style={{ height: `${pct}%`, background: isToday ? "#FF5A1F" : "#F1D9CC" }}
                title={`${d.date}: ${formatGHS(d.total)}`}
              />
              <span className="text-[11px] text-muted-foreground">
                {new Date(`${d.date}T12:00:00`).toLocaleDateString("en-GH", { weekday: "narrow" })}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PayLinkButton({ garageId, invoiceId }: { garageId: string; invoiceId: string }) {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  return (
    <Button
      variant="secondary"
      size="sm"
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

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
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
    canCheckIn && { href: `${base}/check-in`, label: "Check in", icon: <CarFront /> },
    canBook && { href: `${base}/bookings`, label: "New booking", icon: <CalendarPlus /> },
    canPos && { href: `${base}/pos`, label: "Counter sale", icon: <ScanBarcode /> },
    canExpense && { href: `${base}/expenses`, label: "Record expense", icon: <Receipt /> },
  ].filter(Boolean) as { href: string; label: string; icon: ReactNode }[]

  const statusEntries = STATUS_ORDER.map((s) => [s, data.jobsByStatus[s] ?? 0] as const).filter(([, n]) => n > 0)
  const statusTotal = statusEntries.reduce((s, [, n]) => s + n, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold leading-tight md:text-[30px] tracking-[-0.025em]">
            {greeting()}, {userName.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{garageName} · {today}</p>
        </div>
        {/* Phones: one swipe row of quick actions instead of a wrapped block. */}
        <div className="-mx-5 flex w-[calc(100%+2.5rem)] gap-2 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0">
          {quickActions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border-strong bg-card px-4 text-sm font-medium transition-colors hover:bg-surface-sunken [&>svg]:size-4 [&>svg]:text-muted-foreground"
            >
              {a.icon}
              {a.label}
            </Link>
          ))}
        </div>
      </div>

      <HelpTips />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {canSeeMoney ? (
          <>
            <div className="col-span-2 lg:col-span-1">
              <MoneyCard label="Today's revenue" pesewas={data.today.paymentsTotal} className="h-full" />
            </div>
            <StatTile label="Payments received" value={data.today.paymentsCount} icon={<Wallet />} hint="Today" />
            <StatTile label="Jobs in progress" value={data.jobsInProgress} icon={<Wrench />} hint="Across the workshop" />
            <StatTile label="Ready for pickup" value={data.readyJobs.length} icon={<CircleCheck />} hint="Waiting for customers" />
          </>
        ) : (
          <>
            <StatTile label="Jobs in progress" value={data.jobsInProgress} icon={<Wrench />} />
            <StatTile label="Ready for pickup" value={data.readyJobs.length} icon={<CircleCheck />} />
            <StatTile label="Reminders this week" value={data.dueThisWeek.length} icon={<BellRing />} />
            <StatTile label="Vehicles" value="—" icon={<CarFront />} />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Left — workshop now */}
        <div className="space-y-4 lg:col-span-3">
          <Card>
            <CardHead title="Workshop now" href={`${base}/jobs`} linkLabel="Job board" />
            <div className="px-5 pb-5 pt-4">
              {statusTotal === 0 ? (
                <EmptyState
                  compact
                  icon={Wrench}
                  title="No cars in the bays yet"
                  description="Check a vehicle in and it will appear here and on the job board."
                  action={
                    canCheckIn ? (
                      <Link href={`${base}/check-in`} className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">
                        Check in a vehicle
                      </Link>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-muted">
                    {statusEntries.map(([s, n]) => (
                      <div key={s} style={{ width: `${(n / statusTotal) * 100}%`, background: STATUS_BAR[s] }} />
                    ))}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {statusEntries.map(([s, n]) => (
                      <Link
                        key={s}
                        href={`${base}/jobs?status=${s}`}
                        className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm transition-colors hover:border-border-strong"
                      >
                        <span className="flex items-center gap-2 capitalize">
                          <span className="size-2 rounded-full" style={{ background: STATUS_BAR[s] }} />
                          {s.replace(/_/g, " ")}
                        </span>
                        <span className="font-semibold tabular-nums">{n}</span>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHead title="Ready for pickup" href={`${base}/jobs?status=ready`} />
            <div className="px-5 pb-3 pt-2">
              {data.readyJobs.length === 0 ? (
                <EmptyState compact icon={CircleCheck} title="Nothing waiting for collection" description="Finished jobs show here so you can send a pay link in one tap." />
              ) : (
                <ul className="divide-y divide-border max-md:[&>li:nth-child(n+4)]:hidden">
                  {data.readyJobs.map((j) => (
                    <li key={j.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="rounded-md border-[1.5px] border-foreground bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#16130F]">
                          {j.plateNumber ?? "—"}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{j.customerName ?? "Walk-in"}</p>
                          <p className="text-xs text-muted-foreground">{j.number}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {canSeeMoney && j.balanceDue > 0 && (
                          <span className="text-sm font-semibold tabular-nums">{formatGHS(j.balanceDue)} <span className="font-normal text-muted-foreground">due</span></span>
                        )}
                        {canSeeMoney && j.invoiceId && j.balanceDue > 0 && (
                          <PayLinkButton garageId={garageId} invoiceId={j.invoiceId} />
                        )}
                        <Link href={`${base}/jobs/${j.id}`} className="text-sm font-medium text-muted-foreground hover:text-foreground">Open</Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        {/* Right — money & reminders */}
        <div className="space-y-4 lg:col-span-2">
          {canSeeMoney && (
            <Card>
              <CardHead title="Money owed" href={`${base}/invoices`} linkLabel="Invoices" />
              <div className="px-5 pb-5 pt-3 text-sm">
                <div className="flex items-center justify-between py-2">
                  <span className="text-muted-foreground">Outstanding invoices</span>
                  <span className="font-semibold tabular-nums">{formatGHS(data.outstanding.invoiceBalances)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border-subtle py-2">
                  <span className="text-muted-foreground">Overdue instalments</span>
                  <span className="font-semibold tabular-nums">{formatGHS(data.outstanding.instalmentsOverdue)}</span>
                </div>
                <Link href={`${base}/credit`} className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground">
                  Credit accounts <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </Card>
          )}

          <Card>
            <CardHead title="Reminders this week" href={`${base}/reminders`} />
            <div className="px-5 pb-4 pt-2">
              {data.dueThisWeek.length === 0 ? (
                <EmptyState compact icon={BellRing} title="All clear" description="No oil, insurance or DVLA reminders due in the next 7 days." />
              ) : (
                <ul className="divide-y divide-border max-md:[&>li:nth-child(n+4)]:hidden">
                  {data.dueThisWeek.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{d.title}</p>
                        <p className="text-xs text-muted-foreground">{d.customerName ?? ""} · {d.effectiveDueDate}</p>
                      </div>
                      <StatusPill status={d.status} tone={statusTone(d.status)} size="sm" />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {canSeeMoney && (
            <Card>
              <CardHead title="Last 7 days" href={`${base}/reports`} linkLabel="Reports" />
              <div className="px-5 pb-5 pt-3">
                <RevenueBars data={data.sparkline} />
                <p className="mt-4 border-t border-border-subtle pt-3 text-xs text-muted-foreground">
                  Cash in hand today:{" "}
                  <span className="font-semibold text-foreground tabular-nums">
                    {formatGHS(data.today.cashTotal - data.today.cashExpenses)}
                  </span>
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
