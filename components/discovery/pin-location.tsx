"use client"

import { useState, useTransition } from "react"
import { Loader2, MapPin } from "lucide-react"

/**
 * "Pin my shop/office here" — reads the browser's GPS and saves it through
 * the server action passed in. Used by parts sellers and brokers so drivers
 * searching "near me" (/parts, /brokers) find them by distance.
 */
export function PinLocation({
  lat,
  lng,
  what,
  save,
}: {
  lat: number | null
  lng: number | null
  what: "shop" | "office"
  save: (p: { gpsLat: number; gpsLng: number }) => Promise<{ ok: boolean; error?: { message: string } }>
}) {
  const [pin, setPin] = useState(lat != null && lng != null ? { lat, lng } : null)
  const [busy, setBusy] = useState(false)
  const [saving, startSave] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function locate() {
    setMsg(null)
    if (!("geolocation" in navigator)) return setMsg({ ok: false, text: "This browser can't share your location." })
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false)
        const next = { lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) }
        startSave(async () => {
          const res = await save({ gpsLat: next.lat, gpsLng: next.lng })
          if (res.ok) {
            setPin(next)
            setMsg({ ok: true, text: "Saved. Drivers nearby will see you first." })
          } else setMsg({ ok: false, text: res.error?.message ?? "Couldn't save your location." })
        })
      },
      () => {
        setBusy(false)
        setMsg({ ok: false, text: `Couldn't get your location. Allow location for this site and try again while you're at your ${what}.` })
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  return (
    <div className="rounded-xl border border-dashed border-border-strong p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Your {what} on the map</p>
          <p className="text-xs text-muted-foreground">
            {pin
              ? `Pinned at ${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)}.`
              : `Not pinned yet. Drivers searching “near me” only see pinned ${what === "shop" ? "sellers" : "brokers"} by distance. Tap the button while you're at your ${what}.`}
          </p>
        </div>
        <button
          type="button"
          onClick={locate}
          disabled={busy || saving}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold hover:bg-surface-muted disabled:opacity-60"
        >
          {busy || saving ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
          {pin ? "Re-pin here" : `Pin my ${what} here`}
        </button>
      </div>
      {msg && <p className={msg.ok ? "mt-2 text-xs font-medium text-success" : "mt-2 text-xs font-medium text-danger"}>{msg.text}</p>}
    </div>
  )
}
