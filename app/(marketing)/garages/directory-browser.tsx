"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { MapPin, Navigation, Search, Star } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import type { DirectoryEntry } from "@/lib/discovery/directory"

const inputCls =
  "min-h-11 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function DirectoryBrowser({
  garages,
  makes,
  models,
  initial,
}: {
  garages: DirectoryEntry[]
  makes: { id: string; name: string }[]
  models: { id: string; name: string; makeId: string }[]
  initial: { q: string; make: string; model: string; lat: string; lng: string }
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [q, setQ] = useState(initial.q)
  const [make, setMake] = useState(initial.make)
  const [model, setModel] = useState(initial.model)
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)

  const modelOptions = models.filter((m) => !make || m.makeId === make)

  function push(next: { q?: string; make?: string; model?: string; lat?: string; lng?: string }) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v)
      else params.delete(k)
    }
    router.push(`/garages?${params.toString()}`)
  }

  function locate() {
    if (!navigator.geolocation) {
      setGeoError("Location not supported on this device")
      return
    }
    setLocating(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        push({ lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5) })
      },
      () => {
        setLocating(false)
        setGeoError("Could not get your location")
      },
      { timeout: 10000 }
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="text-center">
        <h1 className="font-display text-4xl font-extrabold">Find a garage near you</h1>
        <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
          Search verified workshops by location, service or the car you drive.
        </p>
      </div>

      <div className="mx-auto mt-8 grid max-w-4xl gap-3 rounded-2xl border-2 border-border bg-card p-4 sm:grid-cols-[1fr_auto]">
        <div className="grid gap-3 sm:grid-cols-[1fr_140px_140px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className={`${inputCls} pl-9`}
              placeholder="Garage name or city…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && push({ q })}
            />
          </div>
          <select className={inputCls} value={make} onChange={(e) => { setMake(e.target.value); setModel(""); push({ make: e.target.value, model: "" }) }}>
            <option value="">Any make</option>
            {makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select className={inputCls} value={model} onChange={(e) => { setModel(e.target.value); push({ model: e.target.value }) }} disabled={!make}>
            <option value="">Any model</option>
            {modelOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => push({ q, make, model })}>Search</Button>
          <Button type="button" variant="secondary" onClick={locate} disabled={locating}>
            <Navigation className="size-4" /> {locating ? "Locating…" : "Near me"}
          </Button>
        </div>
      </div>
      {geoError && <p className="mt-2 text-center text-sm font-semibold text-danger">{geoError}</p>}
      {(initial.lat || initial.q || initial.make) && (
        <p className="mt-3 text-center text-sm text-muted-foreground">
          {garages.length} garage{garages.length === 1 ? "" : "s"} found
          {initial.lat ? " near you" : ""}
        </p>
      )}

      {garages.length === 0 ? (
        <div className="mx-auto mt-10 max-w-md rounded-2xl border-2 border-dashed border-border p-10 text-center">
          <MapPin className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-bold">No garages match</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a different search — or list your own garage on FixAm.
          </p>
          <Link href="/onboarding" className="mt-4 inline-block text-sm font-bold text-primary underline">List your garage →</Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {garages.map((g) => (
            <Link key={g.id} href={`/garages/${g.slug}`}>
              <Card className="h-full transition-transform hover:-translate-y-0.5">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex size-11 items-center justify-center rounded-xl border-2 border-border font-display text-lg font-bold"
                        style={{ backgroundColor: g.brandColor ?? "hsl(var(--primary) / 0.15)" }}
                      >
                        {g.name.charAt(0)}
                      </span>
                      <div>
                        <p className="font-bold leading-tight">{g.name}</p>
                        <p className="text-xs text-muted-foreground">{[g.city, g.region].filter(Boolean).join(", ") || "Ghana"}</p>
                      </div>
                    </div>
                    {g.ratingAvg != null && (
                      <span className="flex items-center gap-1 rounded-pill border border-border bg-surface-muted px-2 py-0.5 text-xs font-bold">
                        <Star className="size-3 fill-warning text-warning" /> {g.ratingAvg}
                        <span className="font-normal text-muted-foreground">({g.reviewCount})</span>
                      </span>
                    )}
                  </div>
                  {g.distanceKm != null && (
                    <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                      <MapPin className="size-3" /> {g.distanceKm < 1 ? `${Math.round(g.distanceKm * 1000)} m` : `${g.distanceKm.toFixed(1)} km`} away
                    </p>
                  )}
                  {g.coverage.length > 0 && (
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      Services: {g.coverage.slice(0, 4).join(" · ")}{g.coverage.length > 4 ? "…" : ""}
                    </p>
                  )}
                  {g.services.length > 0 && (
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      {g.services.slice(0, 3).join(" · ")}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
