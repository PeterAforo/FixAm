"use client"

import Link from "next/link"
import { useEffect, useState, useTransition } from "react"
import { BadgeCheck, MapPin, Phone, Truck } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { cancelMySos, chooseSosCash, getMySos, paySosByMomo, setSosDestination, type DriverSosView } from "@/lib/towing/actions"
import { STATUS_LABEL, mapsLink, problemLabel, type SosStatus } from "@/lib/towing/core"
import { searchDestinationGarages, type DestGarage } from "@/lib/parts-shop/actions"

const ghs = (p: number) => `GH₵${(p / 100).toLocaleString("en-GH", { maximumFractionDigits: 0 })}`
const STEPS: SosStatus[] = ["searching", "assigned", "en_route", "arrived", "towing", "completed"]

/** P8-15: live view of the driver's SOS — who's coming, how far, price, pay, garage. */
export function SosTracker({ initial, myGarages, payment }: { initial: DriverSosView; myGarages: DestGarage[]; payment: string | null }) {
  const [s, setS] = useState(initial)
  const [msg, setMsg] = useState<string | null>(payment === "success" ? "Payment received — FixAm holds it until the job is done." : payment === "failed" ? "The MoMo payment didn't go through. Try again or pay cash." : null)
  const [garageQ, setGarageQ] = useState("")
  const [hits, setHits] = useState<DestGarage[]>([])
  const [pending, start] = useTransition()
  const open = ["searching", "assigned", "en_route", "arrived", "towing"].includes(s.status)

  useEffect(() => {
    if (!open) return
    const t = setInterval(async () => { const v = await getMySos(s.id).catch(() => null); if (v) setS(v) }, 4000)
    return () => clearInterval(t)
  }, [s.id, open])

  const refresh = async () => { const v = await getMySos(s.id); if (v) setS(v) }
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok?: string) => start(async () => {
    const r = await fn()
    setMsg(r.ok ? ok ?? null : r.error)
    if (r.ok) await refresh()
  })
  const pay = () => start(async () => {
    const r = await paySosByMomo({ sosId: s.id })
    if (r.ok) window.location.href = r.checkoutUrl
    else setMsg(r.error)
  })
  const findGarage = (v: string) => {
    setGarageQ(v)
    if (v.trim().length < 2) return setHits([])
    start(async () => setHits(await searchDestinationGarages(v)))
  }

  const stepIdx = STEPS.indexOf(s.status as SosStatus)
  const settled = s.paymentStatus === "paid" || s.paymentStatus === "cash"
  return (
    <div className="mt-4 space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-red-600">{s.number} · {problemLabel(s.problem)}</p>
        <h1 className="font-display text-2xl font-semibold">{STATUS_LABEL[s.status as SosStatus] ?? s.status}</h1>
      </div>

      {stepIdx >= 0 && (
        <div className="flex gap-1">
          {STEPS.map((st, i) => <div key={st} className={`h-1.5 flex-1 rounded-full ${i <= stepIdx ? "bg-red-500" : "bg-surface-muted"}`} />)}
        </div>
      )}

      {s.status === "searching" && (
        <Card><CardContent className="flex items-center gap-3 p-4 text-sm">
          <span className="relative flex size-3"><span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex size-3 rounded-full bg-red-500" /></span>
          Alerting tow trucks near you… This usually takes a few minutes. Keep your phone on.
        </CardContent></Card>
      )}

      {s.operator && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-1 font-semibold"><Truck className="size-4" /> {s.operator.name} {s.operator.verified && <BadgeCheck className="size-4 text-emerald-600" />}</p>
                <p className="text-xs text-muted-foreground">{s.operator.completedJobs} jobs done on FixAm</p>
              </div>
              <a href={`tel:${s.operator.phone}`} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold"><Phone className="size-4" /> Call</a>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-surface-sunken p-3"><p className="text-xs text-muted-foreground">Price</p><p className="font-display text-xl font-bold">{s.quote != null ? ghs(s.quote) : "—"}</p></div>
              <div className="rounded-xl bg-surface-sunken p-3"><p className="text-xs text-muted-foreground">Arriving in</p><p className="font-display text-xl font-bold">{s.operatorLocation ? `~${s.operatorLocation.etaMinutes} min` : s.etaMinutes ? `~${s.etaMinutes} min` : "—"}</p></div>
            </div>
            {s.quoteNote && <p className="text-sm text-muted-foreground">“{s.quoteNote}”</p>}
            {s.operatorLocation && (
              <p className="flex items-center gap-1 text-sm"><MapPin className="size-4" /> {s.operatorLocation.distanceKm} km away ·{" "}
                <a className="text-primary underline" href={mapsLink(s.operatorLocation.lat, s.operatorLocation.lng)} target="_blank" rel="noreferrer">see the truck on the map</a>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {s.operator && open && !settled && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-semibold">Pay {s.quote != null ? ghs(s.quote) : ""}</p>
            <p className="text-xs text-muted-foreground">Pay by MoMo now — FixAm holds the money and only pays the operator when the job is done. Or pay them cash.</p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending || s.paymentStatus === "pending"} onClick={pay}>{s.paymentStatus === "pending" ? "Waiting for MoMo…" : "Pay with MoMo"}</Button>
              {s.paymentMethod !== "cash" && <Button variant="ghost" disabled={pending} onClick={() => run(() => chooseSosCash({ sosId: s.id }), "OK — pay the operator in cash when they finish.")}>I&apos;ll pay cash</Button>}
            </div>
          </CardContent>
        </Card>
      )}
      {settled && <p className="text-sm text-emerald-700">✓ {s.paymentStatus === "paid" ? "Paid by MoMo — held by FixAm until the job is done" : "Paid in cash"}</p>}

      {open && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-semibold">Garage</p>
            {s.destination ? <p className="text-sm">The car goes to <strong>{s.destination.name}</strong>. They&apos;ll get your repair request when it arrives.</p> : <p className="text-sm text-muted-foreground">Choose where the car should be towed.</p>}
            <select className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" value="" onChange={(e) => e.target.value && run(() => setSosDestination({ sosId: s.id, garageId: e.target.value }), "Garage saved.")}>
              <option value="">{s.destination ? "Change garage…" : "Pick a garage…"}</option>
              {[...myGarages, ...hits.filter((h) => !myGarages.some((g) => g.id === h.id))].map((g) => <option key={g.id} value={g.id}>{g.name}{g.city ? ` — ${g.city}` : ""}</option>)}
            </select>
            <input className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" placeholder="Search garages…" value={garageQ} onChange={(e) => findGarage(e.target.value)} />
          </CardContent>
        </Card>
      )}

      {s.status === "completed" && (
        <Card><CardContent className="p-4 text-sm">
          Job done. {s.repairRequestId ? <>Your repair request has been sent to {s.destination?.name ?? "the garage"} — follow it in <Link className="underline" href="/portal/requests">Get it fixed</Link>.</> : "Thanks for using FixAm."}
        </CardContent></Card>
      )}

      {msg && <p className="rounded-lg bg-surface-sunken p-3 text-sm">{msg}</p>}

      {s.events.length > 0 && (
        <ul className="space-y-1 border-l-2 border-border pl-3 text-xs text-muted-foreground">
          {s.events.map((e, i) => <li key={i}>{new Date(e.at).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })} — {e.note ?? STATUS_LABEL[e.status as SosStatus] ?? e.status}</li>)}
        </ul>
      )}

      {["searching", "assigned", "en_route"].includes(s.status) && s.paymentStatus !== "paid" && (
        <button type="button" className="text-sm text-muted-foreground underline" disabled={pending} onClick={() => run(() => cancelMySos({ sosId: s.id }), "SOS cancelled.")}>Cancel SOS</button>
      )}
    </div>
  )
}
