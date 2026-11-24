"use client"

import { useState } from "react"
import { Loader2, MapPin, Navigation } from "lucide-react"
import { AREAS, RADIUS_OPTIONS } from "@/lib/discovery/near-me"
import { cn } from "@/lib/utils"

export type LocationState = { lat: string; lng: string; radius: string; areaLabel: string | null }

/**
 * "Near you" controls shared by /parts and /brokers: GPS button, area picker
 * fallback, and radius chips. Changes are pushed to the URL by the caller.
 */
export function LocationBar({
  state,
  onChange,
  allLabel = "All Ghana",
}: {
  state: LocationState
  onChange: (next: Partial<{ lat: string; lng: string; radius: string }>) => void
  allLabel?: string
}) {
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const located = Boolean(state.lat && state.lng)

  function locate() {
    if (!("geolocation" in navigator)) {
      setGeoError("This browser can't share your location. Pick your area instead.")
      return
    }
    setLocating(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        onChange({ lat: pos.coords.latitude.toFixed(4), lng: pos.coords.longitude.toFixed(4) })
      },
      () => {
        setLocating(false)
        setGeoError("We couldn't get your location. Allow location for FixAm in your browser, or pick your area.")
      },
      { timeout: 10000, maximumAge: 5 * 60 * 1000 }
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2.5">
        {located ? (
          <span className="inline-flex h-10 items-center gap-2 rounded-full bg-success-subtle px-3.5 text-sm font-semibold text-success">
            <MapPin className="size-4 fill-current" /> {state.areaLabel ? `Showing ${state.areaLabel}` : "Showing near you"}
          </span>
        ) : (
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-70"
          >
            {locating ? <Loader2 className="size-4 animate-spin" /> : <Navigation className="size-4" />} Use my location
          </button>
        )}
        {located && (
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-sm font-medium hover:bg-surface-muted disabled:opacity-70"
          >
            {locating ? <Loader2 className="size-4 animate-spin" /> : <Navigation className="size-4" />} Update
          </button>
        )}
        <label className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card pl-3.5 pr-2 text-sm">
          <span className="text-muted-foreground">{located ? "Or" : "Or pick"}</span>
          <select
            aria-label="Pick an area"
            className="bg-transparent font-medium outline-none"
            value=""
            onChange={(e) => {
              const a = AREAS.find((x) => x.slug === e.target.value)
              if (a) onChange({ lat: String(a.lat), lng: String(a.lng) })
            }}
          >
            <option value="">an area…</option>
            {AREAS.map((a) => (
              <option key={a.slug} value={a.slug}>{a.label}</option>
            ))}
          </select>
        </label>
        {located && (
          <div role="group" aria-label="How far" className="flex flex-wrap gap-1 rounded-full border border-border bg-card p-1">
            {RADIUS_OPTIONS.map((r) => {
              const value = r.km == null ? "all" : String(r.km)
              const on = state.radius === value
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange({ radius: value })}
                  className={cn(
                    "h-8 rounded-full px-3 text-[13px] font-medium transition-colors",
                    on ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-surface-muted"
                  )}
                >
                  {r.km == null ? allLabel : r.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
      {geoError && <p role="alert" className="text-sm font-medium text-danger">{geoError}</p>}
      {!located && !geoError && (
        <p className="text-[13px] text-muted-foreground">We only use your location to sort results by distance. We don&apos;t store it.</p>
      )}
    </div>
  )
}

/**
 * A simple "around you" plot: you in the middle, each result placed by its
 * real direction and distance. Not a street map — it shows what's closest.
 */
export function AroundYou({
  pins,
  radiusKm,
  center,
}: {
  pins: { id: string; label: string; lat: number; lng: number; km: number; highlight?: boolean }[]
  radiusKm: number | null
  center: { lat: number; lng: number }
}) {
  const maxKm = radiusKm ?? Math.max(5, ...pins.map((p) => p.km))
  const kmPerDegLat = 111
  const kmPerDegLng = 111 * Math.cos((center.lat * Math.PI) / 180)
  return (
    <figure className="relative aspect-square w-full overflow-hidden rounded-[18px] border border-border bg-[radial-gradient(circle_at_center,rgba(36,87,197,0.08),transparent_70%)] bg-card">
      <svg viewBox="-110 -110 220 220" className="absolute inset-0 size-full" aria-hidden="true">
        {[1, 0.66, 0.33].map((f) => (
          <circle key={f} r={100 * f} fill="none" stroke="currentColor" strokeOpacity={0.12} strokeDasharray={f === 1 ? "4 4" : undefined} className="text-foreground" />
        ))}
        <circle r="5" className="fill-[#2457C5]" stroke="#fff" strokeWidth="2.5" />
      </svg>
      {pins.slice(0, 12).map((p) => {
        const dx = ((p.lng - center.lng) * kmPerDegLng) / maxKm
        const dy = ((p.lat - center.lat) * kmPerDegLat) / maxKm
        const x = 50 + Math.max(-1, Math.min(1, dx)) * 45
        const y = 50 - Math.max(-1, Math.min(1, dy)) * 45
        return (
          <span
            key={p.id}
            title={p.label}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold shadow-sm",
              p.highlight ? "bg-secondary text-secondary-foreground" : "border border-border bg-card"
            )}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            {p.km < 10 ? p.km.toFixed(1) : Math.round(p.km)} km
          </span>
        )
      })}
      <figcaption className="absolute bottom-3 left-3 rounded-lg bg-card/90 px-2 py-1 text-[11px] text-muted-foreground">
        You are in the middle · outer ring {Math.round(maxKm)} km
      </figcaption>
    </figure>
  )
}
