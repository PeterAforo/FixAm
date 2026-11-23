"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, MapPin, Sparkles, Star } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { declineLead, sendRepairOffer, type GarageLead } from "@/lib/repair-requests/actions"
import { TriageCard, MediaStrip } from "@/components/repair-requests/triage-card"

const inputCls = "min-h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"
const LANG: Record<string, string> = { tw: "Twi", gaa: "Ga", ee: "Ewe", ha: "Hausa", en: "English" }

function tomorrow9() {
  const d = new Date(Date.now() + 86400_000)
  d.setHours(9, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`
}

export function LeadsPanel({ garageId, garageSlug, leads }: { garageId: string; garageSlug: string; leads: GarageLead[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [form, setForm] = useState<{ requestId: string; min: string; max: string; fee: string; at: string; message: string } | null>(null)

  const open = leads.filter((l) => l.status !== "booked")
  const won = leads.filter((l) => l.status === "booked")

  function startOffer(l: GarageLead) {
    setForm({
      requestId: l.requestId,
      min: l.myOffer?.priceMin != null ? String(l.myOffer.priceMin / 100) : l.triage ? String(l.triage.costRangeGhs.min) : "",
      max: l.myOffer?.priceMax != null ? String(l.myOffer.priceMax / 100) : l.triage ? String(l.triage.costRangeGhs.max) : "",
      fee: l.myOffer ? String(l.myOffer.inspectionFee / 100) : "0",
      at: l.myOffer ? l.myOffer.earliestAt.slice(0, 16) : tomorrow9(),
      message: l.myOffer?.message ?? "",
    })
  }

  function submit() {
    if (!form) return
    const toP = (v: string) => (v.trim() === "" ? null : Math.round((parseFloat(v) || 0) * 100))
    startTransition(async () => {
      const r = await sendRepairOffer({
        garageId,
        requestId: form.requestId,
        priceMin: toP(form.min),
        priceMax: toP(form.max),
        inspectionFee: toP(form.fee) ?? 0,
        earliestAt: new Date(form.at).toISOString(),
        message: form.message || undefined,
      })
      setMsg(r.ok ? "Offer sent — the driver gets an SMS." : r.error)
      if (r.ok) setForm(null)
      router.refresh()
    })
  }

  function decline(requestId: string) {
    startTransition(async () => {
      const r = await declineLead({ garageId, requestId })
      setMsg(r.ok ? "Lead hidden." : r.error)
      router.refresh()
    })
  }

  return (
    <div className="mt-6 space-y-6">
      {msg && <p className="rounded-lg bg-info/10 px-3 py-2 text-sm">{msg}</p>}
      {open.length === 0 && (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          No new leads right now. Tip: set your specialties in Settings so the right jobs find you.
        </CardContent></Card>
      )}
      {open.map((l) => (
        <Card key={l.requestId}>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold">{l.number}</span>
                  {l.urgency === "stop_driving" && <StatusPill tone="danger"><AlertTriangle className="size-3" /> Urgent</StatusPill>}
                  {l.isPreferred && <StatusPill tone="accent"><Star className="size-3" /> Chose you</StatusPill>}
                  {l.myOffer && <StatusPill tone="info">Offer sent</StatusPill>}
                  {l.offerCount > (l.myOffer ? 1 : 0) && <span className="text-xs text-muted-foreground">{l.offerCount - (l.myOffer ? 1 : 0)} other offer(s)</span>}
                </div>
                <p className="mt-1 font-semibold">{l.vehicle ?? "Car"}</p>
                <p className="text-sm">{l.complaint}</p>
                {l.complaintOriginal && l.complaintLanguage !== "en" && (
                  <p className="text-xs text-muted-foreground">Said in {LANG[l.complaintLanguage] ?? l.complaintLanguage}: “{l.complaintOriginal}”</p>
                )}
                <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {(l.distanceKm != null || l.area) && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {l.distanceKm != null ? `${l.distanceKm} km away` : l.area}</span>}
                  {l.warningLights.length > 0 && <span>Lights: {l.warningLights.join(", ").replace(/_/g, " ")}</span>}
                  <span>{new Date(l.createdAt).toLocaleString("en-GH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </p>
                {l.obdCodes.length > 0 && (
                  <ul className="mt-2 space-y-0.5 rounded-lg bg-surface-sunken px-3 py-2 text-xs">
                    <li className="font-semibold">Driver&apos;s scanner codes</li>
                    {l.obdCodes.map((c) => (
                      <li key={c.code}><span className="font-mono font-semibold">{c.code}</span>{c.kind !== "stored" ? ` (${c.kind})` : ""}{c.title ? ` — ${c.title}` : ""}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={pending} onClick={() => startOffer(l)}>{l.myOffer ? "Update offer" : "Send offer"}</Button>
                {!l.myOffer && <Button size="sm" variant="ghost" disabled={pending} onClick={() => decline(l.requestId)}>Not for us</Button>}
              </div>
            </div>
            <MediaStrip media={l.media} />
            {l.triage && (
              <details className="rounded-xl bg-surface-muted/50 p-3">
                <summary className="flex cursor-pointer items-center gap-1 text-xs font-semibold"><Sparkles className="size-3.5" /> FixAm AI triage</summary>
                <div className="mt-2"><TriageCard triage={l.triage} compact /></div>
              </details>
            )}
            {form?.requestId === l.requestId && (
              <div className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-muted-foreground">Price from (GH₵)<input className={inputCls} inputMode="decimal" value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} /></label>
                <label className="text-xs font-semibold text-muted-foreground">Price to (GH₵)<input className={inputCls} inputMode="decimal" value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} /></label>
                <label className="text-xs font-semibold text-muted-foreground">Inspection fee (GH₵, 0 = free)<input className={inputCls} inputMode="decimal" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} /></label>
                <label className="text-xs font-semibold text-muted-foreground">Earliest time you can see the car<input className={inputCls} type="datetime-local" value={form.at} onChange={(e) => setForm({ ...form, at: e.target.value })} /></label>
                <label className="text-xs font-semibold text-muted-foreground sm:col-span-2">Message to the driver<textarea className={`${inputCls} py-2`} rows={2} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="e.g. We'll confirm the cause in 30 min. Genuine pads in stock." /></label>
                <div className="flex gap-2 sm:col-span-2">
                  <Button disabled={pending} onClick={submit}>Send offer</Button>
                  <Button variant="secondary" disabled={pending} onClick={() => setForm(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      {won.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold">Won — booked</h2>
          <div className="mt-2 divide-y rounded-xl border border-border">
            {won.map((l) => (
              <div key={l.requestId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="truncate">{l.number} · {l.vehicle ?? "Car"}{l.plate ? ` · ${l.plate}` : ""} — {l.complaint}</span>
                <Link href={`/g/${garageSlug}/bookings`} className="shrink-0 text-xs font-semibold underline">Bookings</Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
