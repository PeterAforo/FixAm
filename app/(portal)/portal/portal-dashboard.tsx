"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { VehicleHealthCard } from "@/components/brand/vehicle-health-card"
import { portalLogout, portalApproveFleetEstimates, updatePortalPreferences } from "@/lib/portal/actions"
import { requestDataExport, requestDataDeletion } from "@/lib/privacy/actions"
import { PortalVehiclesCard } from "./portal-vehicles"

const gh = (n: number | null) => (n != null ? `GH₵ ${(n / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}` : "—")
const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" }) : "—")

type Ring = { status: "ok" | "soon" | "overdue" | "unknown"; nextDue?: string }

export type PortalData = {
  customers: { id: string; garageId: string; fullName: string; garageName: string; preferredChannels: string[] | null; whatsappOptIn: boolean | null; marketingOptIn: boolean | null }[]
  vehicles: { id: string; garageId: string; plateNumber: string; make: string; model: string; year: number | null; color: string | null; bodyType: string | null; fuelType: string | null; lastOdometerKm: number | null; lastOdometerAt: string | null; garageName: string; rings: { oil: Ring; insurance: Ring; dvla: Ring; issues: Ring } }[]
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

export function PortalDashboard({ phone, data, fleets = [], claimedVehicles = [], catalogue = [] }: {
  phone: string
  data: PortalData
  fleets?: FleetData[]
  claimedVehicles?: import("./portal-vehicles").ClaimedVehicle[]
  catalogue?: import("./portal-vehicles").CatalogueEntry[]
}) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const first = data.customers[0]

  const prefs = {
    whatsappOptIn: first?.whatsappOptIn ?? true,
    preferredChannels: first?.preferredChannels ?? ["whatsapp", "sms"],
    marketingOptIn: first?.marketingOptIn ?? false,
  }
  const [channels, setChannels] = useState<string[]>(prefs.preferredChannels)
  const [waOptIn, setWaOptIn] = useState(prefs.whatsappOptIn)
  const [mktOptIn, setMktOptIn] = useState(prefs.marketingOptIn)

  function savePrefs() {
    setMsg(null)
    startTransition(async () => {
      const res = await updatePortalPreferences({ whatsappOptIn: waOptIn, preferredChannels: channels, marketingOptIn: mktOptIn })
      setMsg(res.ok ? "Preferences saved." : res.error.message)
    })
  }

  function logout() {
    startTransition(async () => { await portalLogout(); window.location.reload() })
  }

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

  return (
    <main className="mx-auto max-w-5xl p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Hi{first?.fullName ? `, ${first.fullName.split(" ")[0]}` : ""}</h1>
          <p className="text-sm text-muted-foreground">{phone} · {data.customers.length} garage{data.customers.length === 1 ? "" : "s"} linked</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={logout} disabled={pending}>Sign out</Button>
        </div>
      </header>
      {msg && <p className="mt-3 text-sm font-semibold text-success">{msg}</p>}

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
            <p className="mt-3 rounded-xl border-2 border-border bg-card p-4 text-sm text-muted-foreground">
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

      {/* Vehicles */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-bold">My vehicles</h2>
        {data.vehicles.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No vehicles on file yet — your garage will add them after your first visit.</p>
        ) : (
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
                />
                <p className="mt-1 text-center text-xs text-muted-foreground">{v.garageName}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Upcoming due items */}
      {data.dueItems.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg font-bold">Upcoming</h2>
          <div className="mt-3 space-y-2">
            {data.dueItems.slice(0, 8).map((d) => (
              <Card key={d.id}><CardContent className="flex items-center justify-between p-3 text-sm">
                <div>
                  <p className="font-semibold">{d.title}</p>
                  <p className="text-xs text-muted-foreground">{d.vehicleLabel} · due {fmtDate(d.effectiveDueDate)}</p>
                </div>
                <StatusPill status={d.status.replace(/_/g, " ")} />
              </CardContent></Card>
            ))}
          </div>
        </section>
      )}

      {/* Invoices & payments */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-bold">Invoices &amp; payments</h2>
        {data.invoices.length === 0 && data.plans.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No invoices yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {data.invoices.filter((i) => Number(i.balanceDue ?? 0) > 0 || i.status === "paid").slice(0, 10).map((inv) => (
              <Card key={inv.id}><CardContent className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div>
                  <p className="font-semibold">{inv.number ?? "Invoice"} · {inv.garageName}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(inv.issuedAt)} · balance {gh(inv.balanceDue)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={inv.status.replace(/_/g, " ")} />
                  {inv.payUrl && <Button size="sm" asChild><a href={inv.payUrl}>Pay</a></Button>}
                </div>
              </CardContent></Card>
            ))}
            {data.plans.map((plan) => (
              <Card key={plan.id}><CardContent className="p-3">
                <p className="text-sm font-semibold">Payment plan · {plan.garageName} · {gh(plan.totalAmount)}</p>
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
              </CardContent></Card>
            ))}
          </div>
        )}
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

      {/* Preferences */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-bold">Notifications</h2>
        <Card className="mt-3"><CardContent className="space-y-3 p-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={waOptIn} onChange={(e) => setWaOptIn(e.target.checked)} /> WhatsApp reminders
          </label>
          {(["whatsapp", "sms", "push", "email"] as const).map((ch) => (
            <label key={ch} className="flex items-center gap-2 capitalize">
              <input type="checkbox" checked={channels.includes(ch)}
                onChange={(e) => setChannels(e.target.checked ? [...channels, ch] : channels.filter((c) => c !== ch))} />
              {ch}
            </label>
          ))}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={mktOptIn} onChange={(e) => setMktOptIn(e.target.checked)} /> Offers &amp; marketing
          </label>
          <Button size="sm" onClick={savePrefs} disabled={pending || channels.length === 0}>Save preferences</Button>
          <InstallPrompt />
        </CardContent></Card>
      </section>

      {/* Claimed vehicles (self-registered customer) */}
      <section className="mt-8">
        <PortalVehiclesCard vehicles={claimedVehicles} catalogue={catalogue} />
      </section>

      {/* Privacy (Data Protection Act 843) */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-bold">Your data</h2>
        <Card className="mt-3"><CardContent className="space-y-3 p-4 text-sm">
          <p className="text-muted-foreground">Under Ghana&apos;s Data Protection Act, 2012 (Act 843) you can request a copy of your data or have it deleted.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => startTransition(async () => {
              const res = await requestDataExport()
              setMsg(res.ok ? "Export requested — the platform team will send your data." : res.error.message)
            })}>Request data export</Button>
            <Button size="sm" variant="danger" disabled={pending} onClick={() => {
              if (!confirm("This will permanently anonymise your customer records. Continue?")) return
              startTransition(async () => {
                const res = await requestDataDeletion()
                setMsg(res.ok ? "Deletion requested — records will be anonymised after review." : res.error.message)
              })
            }}>Request data deletion</Button>
          </div>
        </CardContent></Card>
      </section>
    </main>
  )
}

function InstallPrompt() {
  const [deferred, setDeferred] = useState<{ prompt: () => Promise<void> } | null>(null)
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferred(e as unknown as { prompt: () => Promise<void> })
    }
    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])
  if (!deferred) return <p className="text-xs text-muted-foreground">Add FixAm to your home screen for the full app experience.</p>
  return (
    <Button size="sm" variant="secondary" onClick={async () => {
      await deferred.prompt()
      setDeferred(null)
    }}>Install app</Button>
  )
}
