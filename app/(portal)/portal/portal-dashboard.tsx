"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Bell, Check, Plus, Scale, ShieldCheck, ShoppingBag, TriangleAlert, Wrench } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { VehicleHealthCard } from "@/components/brand/vehicle-health-card"
import { Torq } from "@/components/brand/torq"
import { portalApproveFleetEstimates } from "@/lib/portal/actions"
import { PortalVehiclesCard } from "./portal-vehicles"

const gh = (n: number | null) => (n != null ? `GH₵ ${(n / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}` : "—")
const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" }) : "—")

type Ring = { status: "ok" | "soon" | "overdue" | "unknown"; nextDue?: string }

export type PortalData = {
  customers: { id: string; garageId: string; fullName: string; garageName: string; preferredChannels: string[] | null; whatsappOptIn: boolean | null; marketingOptIn: boolean | null; seasonalOptOut?: boolean | null }[]
  vehicles: { id: string; garageId: string; plateNumber: string; make: string; model: string; year: number | null; color: string | null; bodyType: string | null; fuelType: string | null; lastOdometerKm: number | null; lastOdometerAt: string | null; garageName: string; rings: { oil: Ring; insurance: Ring; dvla: Ring; issues: Ring }; fixamScore?: { score: number; tips: string[] } }[]
  dueItems: { id: string; type: string; title: string; effectiveDueDate: string; vehicleId: string; status: string; vehicleLabel: string }[]
  invoices: { id: string; number: string | null; garageId: string; garageName: string; status: string; total: number | null; balanceDue: number | null; issuedAt: string; payUrl: string | null }[]
  plans: { id: string; garageName: string; totalAmount: number | null; status: string; instalments: { id: string; sequence: number; dueDate: string; amount: number | null; amountPaid: number | null; status: string; payUrl: string | null }[] }[]
  bookings: { id: string; garageId: string; startsAt: string; endsAt: string; status: string; serviceType: string; guestPlate: string | null; garageName: string }[]
  renewals: { id: string; garageId: string; kind: string; status: string; number: string; vehicleId: string; total: number | null; garageName: string }[]
}

export type FleetEstimate = { id: string; number: string; version: number; total: number; status: string; vehicleId: string; plateNumber: string }
export type FleetData = {
  customer: { id: string; garageId: string; fullName: string; companyName: string | null; phone: string; garageName: string; garageSlug: string }
  featureEnabled: boolean
  vehicles: { id: string; plateNumber: string; make: string; model: string; year: number | null; lastOdometerKm: number | null; jobsCount: number; totalSpend: number }[]
  pendingEstimates: FleetEstimate[]
  credit: { balance: number; creditLimit: number; status: string } | null
}

export function PortalDashboard({ data, fleets = [], claimedVehicles = [], catalogue = [], name }: {
  phone: string
  data: PortalData
  fleets?: FleetData[]
  claimedVehicles?: import("./portal-vehicles").ClaimedVehicle[]
  catalogue?: import("./portal-vehicles").CatalogueEntry[]
  name?: string | null
}) {
  const [pending, startTransition] = useTransition()
  const first = data.customers[0]
  const firstName = (name ?? first?.fullName ?? "").trim().split(/\s+/)[0] || null
  const carCount = data.vehicles.length + claimedVehicles.length
  const garageCount = data.customers.length
  const steps = [
    { label: "Add your car", done: carCount > 0, href: "#my-cars" },
    { label: "Choose your garage", done: garageCount > 0, href: "/garages" },
    { label: "Pick how we remind you", done: garageCount > 0 && (first?.preferredChannels?.length ?? 0) > 0, href: "/portal/settings#notifications" },
  ]
  const nextStep = steps.findIndex((st) => !st.done)
  const showSetup = carCount === 0 || garageCount === 0

  const [selectedEstimates, setSelectedEstimates] = useState<string[]>([])
  const [approveMsg, setApproveMsg] = useState<string | null>(null)

  function approveSelected() {
    if (!selectedEstimates.length) return
    setApproveMsg(null)
    startTransition(async () => {
      const res = await portalApproveFleetEstimates({ estimateIds: selectedEstimates })
      if (!res.ok) { setApproveMsg(res.error.message); return }
      setApproveMsg(`Approved ${res.data.approved} estimate${res.data.approved === 1 ? "" : "s"}.`)
      setSelectedEstimates([])
      window.location.reload()
    })
  }

  const openInvoices = data.invoices.filter((i) => Number(i.balanceDue ?? 0) > 0 || i.status === "paid").slice(0, 6)

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Torq pose="wave" className="size-14" />
          <div>
            <p className="text-sm text-muted-foreground" suppressHydrationWarning>{greeting()}</p>
            <h1 className="font-display text-[30px] font-bold leading-tight tracking-[-0.02em] md:text-[36px]">
              {firstName ? `Hi ${firstName}` : "Welcome to FixAm"}
            </h1>
          </div>
        </div>
        <Link
          href="/portal/sos"
          className="inline-flex h-12 items-center gap-2.5 rounded-full bg-danger px-5 text-[15px] font-semibold text-danger-foreground shadow-[0_10px_24px_-10px_rgba(255,59,92,0.7)] transition-colors hover:bg-danger/90"
        >
          <TriangleAlert className="size-5" /> Breakdown? Get help now
        </Link>
      </header>

      {showSetup && (
        <section className="flex flex-wrap items-center gap-7 rounded-[22px] bg-secondary p-6 text-secondary-foreground md:p-7">
          <div className="flex min-w-[260px] flex-[1_1_320px] flex-col gap-2.5">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#C6F432]">
              Step {nextStep + 1} of {steps.length}
            </span>
            <h2 className="font-display text-[26px] font-bold leading-tight">
              {carCount === 0 ? "Add your car to get started" : "Choose your garage"}
            </h2>
            <p className="text-[15px] leading-relaxed text-white/75">
              {carCount === 0
                ? "Enter the plate and model and we’ll set up oil change, insurance and DVLA reminders, and let garages recognise you when you book."
                : "Book with a garage on FixAm and your repairs, invoices and reminders show up here automatically."}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2.5">
              {carCount === 0 ? (
                <a href="#my-cars" className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-foreground hover:bg-primary-hover">
                  <Plus className="size-4" /> Add my car
                </a>
              ) : null}
              <Link href="/garages" className={carCount === 0
                ? "inline-flex h-12 items-center rounded-full border border-white/25 px-5 text-[15px] font-medium text-white hover:bg-white/10"
                : "inline-flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-foreground hover:bg-primary-hover"}>
                Find a garage
              </Link>
            </div>
          </div>
          <ol className="flex flex-[1_1_240px] flex-col gap-2.5 text-sm">
            {steps.map((st, i) => (
              <li key={st.label}>
                <a href={st.href} className={i === nextStep
                  ? "flex items-center gap-3 rounded-xl bg-white/10 px-3.5 py-3 font-medium"
                  : "flex items-center gap-3 rounded-xl bg-white/[0.04] px-3.5 py-3 text-white/70"}>
                  <span className={st.done
                    ? "flex size-6 items-center justify-center rounded-full bg-[#C6F432] text-[#0B1B3F]"
                    : i === nextStep
                      ? "flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold"
                      : "flex size-6 items-center justify-center rounded-full border border-white/30 text-xs"}>
                    {st.done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={st.done ? "line-through decoration-white/40" : undefined}>{st.label}</span>
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-labelledby="qa-title">
        <h2 id="qa-title" className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">What do you need?</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {QUICK_ACTIONS.map((q) => (
            <Link key={q.href} href={q.href} className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-border-strong md:p-5">
              <span className={`flex size-11 items-center justify-center rounded-xl ${q.tint}`}>
                <q.icon className="size-[22px]" strokeWidth={1.75} />
              </span>
              <span>
                <span className="block text-[15px] font-semibold">{q.title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{q.text}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Fleet view */}
      {fleets.map((f) => (
        <section key={f.customer.id} className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold">Fleet · {f.customer.companyName ?? f.customer.fullName}</h2>
              <p className="text-sm text-muted-foreground">{f.customer.garageName} · {f.vehicles.length} vehicles</p>
            </div>
            {f.credit && (
              <p className="text-sm">
                Credit balance <span className="font-bold">{gh(f.credit.balance)}</span>
                <span className="text-muted-foreground"> / {gh(f.credit.creditLimit)} limit</span>
              </p>
            )}
          </div>

          {!f.featureEnabled && (
            <p className="mt-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              Fleet management isn&apos;t enabled on this garage&apos;s plan — ask them to upgrade to Pro.
            </p>
          )}

          {f.featureEnabled && f.pendingEstimates.length > 0 && (
            <Card className="mt-3"><CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Estimates awaiting approval ({f.pendingEstimates.length})</h3>
                <Button size="sm" onClick={approveSelected} disabled={pending || selectedEstimates.length === 0}>
                  Approve selected ({selectedEstimates.length})
                </Button>
              </div>
              {approveMsg && <p className="mt-2 text-sm font-semibold text-success">{approveMsg}</p>}
              <ul className="mt-3 space-y-2">
                {f.pendingEstimates.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                    <input type="checkbox" checked={selectedEstimates.includes(e.id)}
                      onChange={(ev) => setSelectedEstimates(ev.target.checked ? [...selectedEstimates, e.id] : selectedEstimates.filter((x) => x !== e.id))} />
                    <span className="font-semibold">{e.number} v{e.version}</span>
                    <span className="text-muted-foreground">{e.plateNumber}</span>
                    <span className="ml-auto font-bold">{gh(e.total)}</span>
                  </li>
                ))}
              </ul>
            </CardContent></Card>
          )}

          {/* Fleet report: per-vehicle jobs + spend */}
          {f.featureEnabled && f.vehicles.length > 0 && (
            <Card className="mt-3"><CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Vehicle</th><th className="px-4 py-3 text-right">Jobs</th>
                    <th className="px-4 py-3 text-right">Total spend</th><th className="px-4 py-3 text-right">Odometer</th>
                  </tr>
                </thead>
                <tbody>
                  {f.vehicles.map((v) => (
                    <tr key={v.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-semibold">{v.plateNumber} · {v.make} {v.model}{v.year ? ` ${v.year}` : ""}</td>
                      <td className="px-4 py-2 text-right">{v.jobsCount}</td>
                      <td className="px-4 py-2 text-right">{gh(v.totalSpend)}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{v.lastOdometerKm != null ? `${v.lastOdometerKm.toLocaleString()} km` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent></Card>
          )}
        </section>
      ))}

      <section id="my-cars" className="scroll-mt-20">
        {data.vehicles.length > 0 && (
          <>
            <h2 className="font-display text-lg font-bold">My cars</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {data.vehicles.map((v) => (
                <Link key={v.id} href={`/portal/vehicles/${v.id}`} className="block">
                  <VehicleHealthCard
                    plate={v.plateNumber}
                    nickname={`${v.make} ${v.model}${v.year ? ` ${v.year}` : ""}`}
                    type={(v.bodyType as never) ?? "sedan"}
                    color={v.color ?? undefined}
                    oil={v.rings.oil}
                    insurance={v.rings.insurance}
                    dvla={v.rings.dvla}
                    issues={v.rings.issues}
                    score={v.fixamScore}
                  />
                  <p className="mt-1 text-center text-xs text-muted-foreground">Looked after by {v.garageName}</p>
                </Link>
              ))}
            </div>
          </>
        )}
        <div className={data.vehicles.length > 0 ? "mt-4" : undefined}>
          <PortalVehiclesCard
            vehicles={claimedVehicles}
            catalogue={catalogue}
            title={data.vehicles.length > 0 ? "Other cars you added" : "My cars"}
            startOpen={carCount === 0}
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card><CardContent className="p-5">
          <h2 className="text-base font-semibold">Coming up</h2>
          {data.dueItems.length === 0 ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {carCount === 0
                ? "Nothing due yet. Once your car is added, oil changes, insurance and DVLA renewals show here before they’re due."
                : "Nothing due right now. We’ll remind you before oil, insurance or roadworthy run out."}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {data.dueItems.slice(0, 6).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground">{d.vehicleLabel} · due {fmtDate(d.effectiveDueDate)}</p>
                  </div>
                  <StatusPill status={d.status.replace(/_/g, " ")} />
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>

        <Card><CardContent className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Invoices &amp; payments</h2>
            {data.plans.length > 0 || data.invoices.length > 0 ? (
              <Link href="/portal/financing" className="text-[13px] font-medium text-primary hover:underline">Pay later plans</Link>
            ) : null}
          </div>
          {openInvoices.length === 0 && data.plans.length === 0 ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">No invoices yet. Bills from your garage appear here and can be paid by MoMo or spread with Pay later.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {openInvoices.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{inv.number ?? "Invoice"} · {inv.garageName}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(inv.issuedAt)} · balance {gh(inv.balanceDue)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={inv.status.replace(/_/g, " ")} />
                    {inv.payUrl && Number(inv.balanceDue ?? 0) > 0 && <Button size="sm" asChild><a href={inv.payUrl}>Pay</a></Button>}
                  </div>
                </li>
              ))}
              {data.plans.map((plan) => (
                <li key={plan.id} className="py-2.5">
                  <p className="text-sm font-medium">Payment plan · {plan.garageName} · {gh(plan.totalAmount)}</p>
                  <ul className="mt-2 space-y-1">
                    {plan.instalments.map((i) => (
                      <li key={i.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5 text-xs">
                        <span>#{i.sequence} · due {fmtDate(i.dueDate)} · {gh(i.amount)}</span>
                        <span className="flex items-center gap-2">
                          <StatusPill status={i.status.replace(/_/g, " ")} />
                          {i.payUrl && Number(i.amount ?? 0) - Number(i.amountPaid ?? 0) > 0 && <a className="font-bold text-primary underline" href={i.payUrl}>Pay</a>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>
      </section>

      {/* Renewals */}
      {data.renewals.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg font-bold">Renewals</h2>
          <div className="mt-3 space-y-2">
            {data.renewals.slice(0, 6).map((r) => (
              <Card key={r.id}><CardContent className="flex items-center justify-between p-3 text-sm">
                <div>
                  <p className="font-semibold">{r.number} · {r.kind === "insurance" ? "Insurance" : "DVLA"}</p>
                  <p className="text-xs text-muted-foreground">{r.garageName}{r.total != null ? ` · ${gh(r.total)}` : ""}</p>
                </div>
                <StatusPill status={r.status.replace(/_/g, " ")} />
              </CardContent></Card>
            ))}
          </div>
        </section>
      )}

      {/* Bookings */}
      {data.bookings.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg font-bold">Bookings</h2>
          <div className="mt-3 space-y-2">
            {data.bookings.slice(0, 6).map((b) => (
              <Card key={b.id}><CardContent className="flex items-center justify-between p-3 text-sm">
                <div>
                  <p className="font-semibold">{b.serviceType} · {b.garageName}</p>
                  <p className="text-xs text-muted-foreground">{new Date(b.startsAt).toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" })}</p>
                </div>
                <StatusPill status={b.status.replace(/_/g, " ")} />
              </CardContent></Card>
            ))}
          </div>
        </section>
      )}

      <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
        <Bell className="size-4" />
        {channelLine(first?.preferredChannels ?? null, garageCount)}
        <Link href="/portal/settings#notifications" className="font-medium text-primary hover:underline">Change in Profile</Link>
      </p>
    </div>
  )
}

function greeting() {
  // Ghana is UTC+0 all year.
  const h = new Date().getUTCHours()
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
}

const CHANNEL_NAME: Record<string, string> = { whatsapp: "WhatsApp", sms: "SMS", push: "app notifications", email: "email" }

function channelLine(channels: string[] | null, garages: number) {
  if (garages === 0) return "Reminders start once a garage adds you."
  const names = (channels?.length ? channels : ["whatsapp", "sms"]).map((c) => CHANNEL_NAME[c] ?? c)
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0]
  return `You’ll get reminders by ${list}.`
}

const QUICK_ACTIONS = [
  { title: "Get it fixed", text: "Describe the problem, get quotes", href: "/portal/requests?new=1", icon: Wrench, tint: "bg-primary/10 text-primary" },
  { title: "Buy parts", text: "Delivered to you or your garage", href: "/portal/parts", icon: ShoppingBag, tint: "bg-[#E6F8F6] text-[#00756F] dark:bg-[#00C2B8]/15 dark:text-[#5FE3DB]" },
  { title: "Renew insurance / DVLA", text: "Quotes from verified brokers", href: "/portal/renewals?new=1", icon: ShieldCheck, tint: "bg-[#EFE9FF] text-[#5B3CC4] dark:bg-[#5B3CC4]/25 dark:text-[#B9A5FF]" },
  { title: "Check a price", text: "Is this quote fair?", href: "/portal/price-check", icon: Scale, tint: "bg-[#FFF4D6] text-[#8A5A00] dark:bg-[#F5B400]/20 dark:text-[#FFD45C]" },
]
