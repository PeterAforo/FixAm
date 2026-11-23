"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Camera, KeyRound, MapPin, Navigation } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { confirmDropoff, confirmPickup } from "@/lib/riders/actions"
import { DELIVERY_STATUS_LABEL, type DeliveryStatus } from "@/lib/riders/core"
import { useRiderLocation } from "../../use-live-location"

type Job = {
  id: string
  number: string
  kind: string
  status: string
  pickup: { name?: string; phone?: string | null; address?: string | null; city?: string | null; lat?: number | null; lng?: number | null }
  dropoff: { name?: string; phone?: string | null; address?: string | null; city?: string | null; lat?: number | null; lng?: number | null }
  fee: number
  riderEarning: number | null
  pickupPin: string | null
}

const ghs = (p: number | null | undefined) => (p == null ? "—" : `GH₵${(p / 100).toLocaleString("en-GH", { maximumFractionDigits: 0 })}`)
const maps = (p: { lat?: number | null; lng?: number | null }, q: string) =>
  p.lat != null && p.lng != null ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&destination_place_id=` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`

const inputCls =
  "min-h-11 w-full rounded-lg border border-input bg-surface px-3 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-foreground"

export function RiderJobPanel({ job }: { job: Job }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [pickupPin, setPickupPin] = useState("")
  const [dropPin, setDropPin] = useState("")
  const [photo, setPhoto] = useState<File | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  useRiderLocation(["assigned", "picked_up"].includes(job.status))

  const status = job.status as DeliveryStatus

  function submitPickup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await confirmPickup({ deliveryId: job.id, pin: pickupPin })
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  function submitDropoff(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!photo) { setError("Add a photo of the handover first"); return }
    const form = new FormData()
    form.set("deliveryId", job.id)
    form.set("pin", dropPin)
    form.set("photo", photo)
    start(async () => {
      const res = await confirmDropoff(form)
      if (!res.ok) { setError(res.error); return }
      router.push("/rider")
    })
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em]">{job.number}</h1>
          <p className="text-sm text-muted-foreground">{ghs(job.riderEarning ?? job.fee)} earning{job.kind === "document" ? " · documents" : ""}</p>
        </div>
        <StatusPill status={job.status}>{DELIVERY_STATUS_LABEL[status] ?? job.status}</StatusPill>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1 · Collect from</p>
            <p className="mt-1 font-semibold">{job.pickup.name ?? "Pickup"}{job.pickup.city ? ` · ${job.pickup.city}` : ""}</p>
            {job.pickup.address && <p className="text-sm text-muted-foreground">{job.pickup.address}</p>}
            {job.pickup.phone && <p className="text-sm text-muted-foreground">{job.pickup.phone}</p>}
            <a className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary" href={maps(job.pickup, job.pickup.name ?? "")} target="_blank" rel="noreferrer">
              <Navigation className="size-4" /> Directions
            </a>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2 · Deliver to</p>
            <p className="mt-1 font-semibold">{job.dropoff.name ?? "Drop-off"}{job.dropoff.city ? ` · ${job.dropoff.city}` : ""}</p>
            {job.dropoff.address && <p className="text-sm text-muted-foreground">{job.dropoff.address}</p>}
            {job.dropoff.phone && <p className="text-sm text-muted-foreground">{job.dropoff.phone}</p>}
            <a className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary" href={maps(job.dropoff, job.dropoff.name ?? "")} target="_blank" rel="noreferrer">
              <Navigation className="size-4" /> Directions
            </a>
          </div>
        </CardContent>
      </Card>

      {status === "assigned" && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><KeyRound className="size-5" /> Pickup</h2>
            <p className="text-sm text-muted-foreground">The sender shows you a 4-digit PIN. Enter it to confirm you collected the package.</p>
            <form onSubmit={submitPickup} className="space-y-3">
              <input className={inputCls} inputMode="numeric" autoComplete="one-time-code" maxLength={4} placeholder="••••" value={pickupPin} onChange={(e) => setPickupPin(e.target.value.replace(/\D/g, ""))} />
              <Button type="submit" className="w-full" size="lg" loading={pending} disabled={pickupPin.length !== 4}>Confirm pickup</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {status === "picked_up" && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><MapPin className="size-5" /> Drop-off</h2>
            <p className="text-sm text-muted-foreground">The receiver gives you a 4-digit PIN. Take a photo of the handover, then enter the PIN to finish.</p>
            <form onSubmit={submitDropoff} className="space-y-3">
              <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { setPhoto(e.target.files?.[0] ?? null); e.target.value = "" }} />
              <button type="button" onClick={() => photoRef.current?.click()} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border p-3 text-left hover:border-foreground/40">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={URL.createObjectURL(photo)} alt="Handover" className="size-14 rounded-xl object-cover" />
                ) : (
                  <span className="flex size-14 items-center justify-center rounded-xl bg-surface-sunken text-muted-foreground"><Camera className="size-6" /></span>
                )}
                <span className="text-sm font-semibold">{photo ? photo.name : "Photo of the handover *"}</span>
              </button>
              <input className={inputCls} inputMode="numeric" autoComplete="one-time-code" maxLength={4} placeholder="••••" value={dropPin} onChange={(e) => setDropPin(e.target.value.replace(/\D/g, ""))} />
              <Button type="submit" className="w-full" size="lg" loading={pending} disabled={dropPin.length !== 4 || !photo}>Confirm delivery</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {(status === "delivered" || status === "failed" || status === "cancelled") && (
        <p className="rounded-xl bg-surface-muted px-4 py-3 text-sm text-muted-foreground">
          {status === "delivered" ? `Delivered — ${ghs(job.riderEarning)} is on its way to your MoMo.` : `This delivery is ${DELIVERY_STATUS_LABEL[status]?.toLowerCase() ?? status}.`}
        </p>
      )}

      {error && <p className="rounded-xl border border-danger/30 bg-danger-subtle px-4 py-3 text-sm font-medium text-danger">{error}</p>}
    </div>
  )
}
