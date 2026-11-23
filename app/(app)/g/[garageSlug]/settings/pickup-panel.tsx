"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { savePickupSettings } from "@/lib/pickups/actions"

/** P8-16: offer car pickup & drop-off on the booking page. */
export function PickupPanel({ garageId, initial }: { garageId: string; initial: { enabled: boolean; fee: number; radiusKm: number } }) {
  const [enabled, setEnabled] = useState(initial.enabled)
  const [fee, setFee] = useState(String(initial.fee / 100))
  const [radius, setRadius] = useState(String(initial.radiusKm))
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const save = () => start(async () => {
    const r = await savePickupSettings({ garageId, enabled, feeGhs: Number(fee) || 0, radiusKm: Number(radius) || 10 })
    setMsg(r.ok ? "Saved" : r.error)
  })
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border bg-card p-4">
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>
          <span className="block text-sm font-semibold">Offer car pickup & drop-off</span>
          <span className="block text-xs text-muted-foreground">Customers can ask you to collect their car when they book online. Your driver records photos of every side, fuel, mileage and warning lights, and the customer signs — at pickup and at return. Add drivers in Staff with the &ldquo;garage driver&rdquo; role.</span>
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Fee each way (GH₵)<input className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} /></label>
        <label className="text-sm">How far you&apos;ll go (km)<input className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" inputMode="numeric" value={radius} onChange={(e) => setRadius(e.target.value)} /></label>
      </div>
      <div className="flex items-center gap-3"><Button size="sm" disabled={pending} onClick={save}>Save</Button>{msg && <span className="text-xs">{msg}</span>}</div>
    </div>
  )
}
