"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { updatePassport } from "@/lib/passport/actions"
import type { PassportSettings } from "@/lib/passport/service"

function Toggle({ on, label, hint, disabled, onChange }: { on: boolean; label: string; hint?: string; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 py-2">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-primary" : "bg-border-strong"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </button>
    </label>
  )
}

/**
 * P8-10: owner controls for the car's public passport page — on/off, what
 * shows, share, print a QR sticker, and regenerate the link.
 */
export function PassportCard({ vehicleId, initial, plate }: { vehicleId: string; initial: PassportSettings; plate: string }) {
  const [s, setS] = useState(initial)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [confirmRegen, setConfirmRegen] = useState(false)

  const apply = (patch: { enabled?: boolean; showMileage?: boolean; showGarageNames?: boolean; regenerate?: boolean }, done?: string) => {
    setMsg(null)
    start(async () => {
      const res = await updatePassport({ vehicleId, ...patch })
      if (res.ok) { setS(res.data); if (done) setMsg(done) }
      else setMsg(res.error.message)
    })
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(s.url); setMsg("Link copied") } catch { setMsg(s.url) }
  }
  const wa = `https://wa.me/?text=${encodeURIComponent(`Service history for ${plate} on FixAm: ${s.url}`)}`

  return (
    <Card className="mt-6">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Vehicle passport</p>
            <h2 className="mt-0.5 font-display text-lg font-semibold">Show this car&apos;s service history</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A public page with the work done at FixAm garages, mileage and whether road papers are current. Great when you sell the car.
              Your name, phone number and prices are never shown.
            </p>
          </div>
        </div>

        <div className="mt-3 divide-y divide-border">
          <Toggle on={s.enabled} disabled={pending} label="Passport page is on" hint={s.enabled ? "Anyone with the link or QR sticker can see it" : "Nobody can see it right now"} onChange={(v) => apply({ enabled: v })} />
          <Toggle on={s.showMileage} disabled={pending} label="Show mileage" hint="Readings over time and whether they only went up" onChange={(v) => apply({ showMileage: v })} />
          <Toggle on={s.showGarageNames} disabled={pending} label="Show garage names" hint="Off shows only the city of each visit" onChange={(v) => apply({ showGarageNames: v })} />
        </div>

        {s.enabled && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-sunken px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{s.url}</span>
              <Button size="sm" variant="secondary" onClick={copy}>Copy</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="tonal" asChild><a href={wa} target="_blank" rel="noreferrer">Share on WhatsApp</a></Button>
              <Button size="sm" variant="secondary" asChild><Link href={`/print/passport/${vehicleId}`}>Print QR sticker</Link></Button>
              <Button size="sm" variant="ghost" asChild><a href={s.url} target="_blank" rel="noreferrer">Open page</a></Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Viewed {s.viewCount} {s.viewCount === 1 ? "time" : "times"}{s.lastViewedAt ? ` · last ${new Date(s.lastViewedAt).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}` : ""}
            </p>
          </div>
        )}

        <div className="mt-4 border-t border-border pt-3">
          {!confirmRegen ? (
            <button type="button" className="text-xs font-medium text-muted-foreground underline" onClick={() => setConfirmRegen(true)}>
              Get a new link
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span>Old links and printed stickers will stop working.</span>
              <Button size="sm" variant="danger" disabled={pending} onClick={() => { setConfirmRegen(false); apply({ regenerate: true }, "New link ready — print a new sticker") }}>New link</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRegen(false)}>Cancel</Button>
            </div>
          )}
        </div>
        {msg && <p className="mt-2 text-xs text-muted-foreground" role="status">{msg}</p>}
      </CardContent>
    </Card>
  )
}
