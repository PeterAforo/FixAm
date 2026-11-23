"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { MapPin, Navigation, Phone } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { acceptTowJob, declineTowJob, getTowJob, markTowCashReceived, moveTowJob, type OperatorJob } from "@/lib/towing/actions"
import { STATUS_LABEL, directionsLink, etaMinutes, problemLabel, type SosStatus } from "@/lib/towing/core"
import { useLiveLocation } from "../../use-live-location"

const ghs = (p: number) => `GH₵${(p / 100).toLocaleString("en-GH", { maximumFractionDigits: 0 })}`

const NEXT_STEP: Partial<Record<SosStatus, { to: "en_route" | "arrived" | "towing" | "completed"; label: string }[]>> = {
  assigned: [{ to: "en_route", label: "I'm on my way" }],
  en_route: [{ to: "arrived", label: "I've arrived" }],
  arrived: [{ to: "towing", label: "Start towing to the garage" }, { to: "completed", label: "Fixed on the spot — finish" }],
  towing: [{ to: "completed", label: "Delivered to the garage — finish" }],
}

export function TowJobPanel({ initial }: { initial: OperatorJob }) {
  const router = useRouter()
  const [job, setJob] = useState(initial)
  const [price, setPrice] = useState(String(Math.round(initial.suggestedQuote / 100) || ""))
  const [eta, setEta] = useState(String(initial.distanceKm != null ? etaMinutes(initial.distanceKm) : 20))
  const [note, setNote] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const active = job.isMine && ["assigned", "en_route", "arrived", "towing"].includes(job.status)
  useLiveLocation(active)

  useEffect(() => {
    const t = setInterval(async () => {
      const j = await getTowJob(job.id).catch(() => null)
      if (j) setJob(j)
    }, 5000)
    return () => clearInterval(t)
  }, [job.id])

  const refresh = async () => { const j = await getTowJob(job.id); if (j) setJob(j) }
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok?: string) => start(async () => {
    setMsg(null)
    const r = await fn()
    if (!r.ok) setMsg(r.error)
    else { if (ok) setMsg(ok); await refresh(); router.refresh() }
  })

  const taken = !job.isMine && job.status !== "searching"
  return (
    <div className="mt-4 space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-red-600">{job.number}</p>
        <h1 className="font-display text-2xl font-semibold">{problemLabel(job.problem)}{job.vehicle ? ` · ${job.vehicle}` : ""}</h1>
        <p className="text-sm text-muted-foreground">{job.isMine ? STATUS_LABEL[job.status as SosStatus] : taken ? "Taken by another operator" : "Waiting for someone to accept"}</p>
      </div>

      <Card>
        <CardContent className="space-y-2 p-4 text-sm">
          {job.notes && <p>“{job.notes}”</p>}
          {job.landmark && <p className="text-muted-foreground">Landmark: {job.landmark}</p>}
          <p className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1"><MapPin className="size-4" /> {job.distanceKm != null ? `${job.distanceKm} km from you` : "Location shared"}</span>
            <a className="inline-flex items-center gap-1 font-semibold text-primary underline" href={directionsLink(job.lat, job.lng)} target="_blank" rel="noreferrer"><Navigation className="size-4" /> Directions to the driver</a>
          </p>
          {job.destination ? (
            <p>Tow to: <strong>{job.destination.name}</strong>{job.destination.lat != null && job.destination.lng != null && (
              <> · <a className="text-primary underline" href={directionsLink(job.destination.lat, job.destination.lng)} target="_blank" rel="noreferrer">directions</a></>
            )}</p>
          ) : <p className="text-muted-foreground">The driver hasn&apos;t picked a garage yet.</p>}
          {job.photoCount > 0 && <p className="text-xs text-muted-foreground">{job.photoCount} photo(s) attached — you&apos;ll see them in the app after accepting.</p>}
        </CardContent>
      </Card>

      {job.status === "searching" && !job.isMine && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-semibold">Take this job</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">Your price (GH₵)
                <input className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-lg font-semibold tabular-nums" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} />
              </label>
              <label className="text-sm">Minutes to reach them
                <input className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-lg font-semibold tabular-nums" inputMode="numeric" value={eta} onChange={(e) => setEta(e.target.value.replace(/\D/g, ""))} />
              </label>
            </div>
            <input className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" placeholder="Note for the driver (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
            <p className="text-xs text-muted-foreground">Suggested from your rates: {ghs(job.suggestedQuote)}. The first operator to accept gets the job.</p>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={pending || !Number(price) || !Number(eta)} onClick={() => run(() => acceptTowJob({ sosId: job.id, priceGhs: Number(price), etaMinutes: Number(eta), note: note || undefined }), "You've got the job — the driver has your number.")}>
                {pending ? "Accepting…" : "Accept job"}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => run(() => declineTowJob({ sosId: job.id }).then((r) => { if (r.ok) router.push("/tow"); return r }))}>Not this one</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {job.isMine && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{job.driverName ?? "Driver"}{job.plate ? ` · ${job.plate}` : ""}</p>
                <p className="text-xs text-muted-foreground">Agreed price {job.quote != null ? ghs(job.quote) : "—"}</p>
              </div>
              {job.driverPhone && <a href={`tel:${job.driverPhone}`} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold"><Phone className="size-4" /> Call</a>}
            </div>
            <p className="text-sm">
              Payment: {job.paymentStatus === "paid" ? "✓ Paid by MoMo (FixAm pays you after the job)" : job.paymentStatus === "cash" ? "✓ Cash received" : job.paymentStatus === "pending" ? "MoMo payment in progress…" : job.paymentMethod === "cash" ? "Driver will pay cash" : "Not paid yet"}
            </p>
            {active && (job.paymentStatus === "unpaid" || job.paymentStatus === "failed") && (
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => markTowCashReceived({ sosId: job.id }), "Cash recorded.")}>I&apos;ve received cash</Button>
            )}
            <div className="flex flex-wrap gap-2">
              {(NEXT_STEP[job.status as SosStatus] ?? []).map((s) => (
                <Button key={s.to} disabled={pending} variant={s.to === "completed" ? "success" : "primary"} onClick={() => run(() => moveTowJob({ sosId: job.id, to: s.to }))}>{s.label}</Button>
              ))}
            </div>
            {job.status === "completed" && <p className="text-sm text-emerald-700">Job finished. {job.destination ? `${job.destination.name} has the car's repair request.` : ""}</p>}
          </CardContent>
        </Card>
      )}
      {msg && <p className="rounded-lg bg-surface-sunken p-3 text-sm">{msg}</p>}
    </div>
  )
}
