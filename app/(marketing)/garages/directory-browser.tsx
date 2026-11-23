"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { ArrowRight, BadgeCheck, CalendarCheck, Car, Loader2, MapPin, Navigation, Search, Star, X } from "lucide-react"
import type { DirectoryEntry } from "@/lib/discovery/directory"

const fieldCls =
  "h-12 w-full rounded-xl border border-input bg-card px-3.5 text-[15px] text-foreground outline-none transition-shadow placeholder:text-[#8C857B] focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15 disabled:opacity-50"

function GarageAvatar({ name, logoUrl, brandColor, size = "md" }: { name: string; logoUrl: string | null; brandColor: string | null; size?: "md" | "lg" }) {
  const dim = size === "lg" ? "size-20 rounded-[22px] text-3xl" : "size-12 rounded-[14px] text-lg"
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden font-display font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] ${dim}`}
      style={{ background: brandColor ? brandColor : "linear-gradient(140deg,#FF7A3D,#D4430F)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary garage logo URL */}
      {logoUrl ? <img src={logoUrl} alt="" className="size-full object-cover" /> : name.charAt(0).toUpperCase()}
    </span>
  )
}
export { GarageAvatar }

export function DirectoryResultsSkeleton() {
  return (
    <div className="mx-auto max-w-[1200px] px-6 md:px-8">
      <div className="-mt-20 h-[92px] animate-pulse rounded-[22px] border border-border bg-card shadow-3" />
      <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[260px] animate-pulse rounded-[22px] border border-border bg-card" />
        ))}
      </div>
    </div>
  )
}

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
  const makeName = makes.find((m) => m.id === initial.make)?.name
  const modelName = models.find((m) => m.id === initial.model)?.name
  const filtered = Boolean(initial.lat || initial.q || initial.make || initial.model)

  function push(next: { q?: string; make?: string; model?: string; lat?: string; lng?: string }) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v)
      else params.delete(k)
    }
    const qs = params.toString()
    router.push(`/garages${qs ? `?${qs}` : ""}`, { scroll: false })
  }

  function locate() {
    if (!navigator.geolocation) {
      setGeoError("Location isn't supported on this device.")
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
        setGeoError("We couldn't get your location. Check your browser permissions and try again.")
      },
      { timeout: 10000 }
    )
  }

  function clearAll() {
    setQ("")
    setMake("")
    setModel("")
    router.push("/garages", { scroll: false })
  }

  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-24 md:px-8">
      {/* Search card overlapping the hero */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          push({ q, make, model })
        }}
        className="relative z-10 -mt-20 rounded-[22px] border border-border bg-card p-3 shadow-[0_30px_60px_-30px_rgba(11,15,26,0.45),0_0_0_1px_rgba(22,19,15,0.02)] md:p-4"
      >
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="relative block">
            <span className="sr-only">Garage name or city</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
            <input className={`${fieldCls} pl-10`} placeholder="Garage name, area or city" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="block">
            <span className="sr-only">Vehicle make</span>
            <select
              className={fieldCls}
              value={make}
              onChange={(e) => {
                setMake(e.target.value)
                setModel("")
                push({ make: e.target.value, model: "" })
              }}
            >
              <option value="">Any make</option>
              {makes.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Vehicle model</span>
            <select
              className={fieldCls}
              value={model}
              onChange={(e) => {
                setModel(e.target.value)
                push({ model: e.target.value })
              }}
              disabled={!make}
            >
              <option value="">{make ? "Any model" : "Choose a make first"}</option>
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[15px] font-semibold text-primary-foreground shadow-glow-primary transition-colors hover:bg-primary-hover md:flex-none"
            >
              <Search className="size-4" /> Search
            </button>
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border-strong bg-card px-4 text-[15px] font-medium transition-colors hover:bg-surface-sunken disabled:opacity-60"
            >
              {locating ? <Loader2 className="size-4 animate-spin" /> : <Navigation className="size-4" />}
              <span className="hidden sm:inline">{locating ? "Locating…" : "Near me"}</span>
            </button>
          </div>
        </div>
      </form>
      {geoError && (
        <p role="alert" className="mt-3 rounded-xl border border-[#FFC2CC] bg-[#FFF1F3] px-4 py-3 text-sm font-medium text-[#B3122F]">
          {geoError}
        </p>
      )}

      {/* Results toolbar */}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-[-0.02em]">
            {filtered ? `${garages.length} garage${garages.length === 1 ? "" : "s"} found` : "Garages on FixAm"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {initial.lat ? "Sorted by distance from you" : "Every garage here runs its workshop on FixAm"}
          </p>
        </div>
        {filtered && (
          <div className="flex flex-wrap items-center gap-2">
            {initial.q && <FilterChip label={`“${initial.q}”`} onClear={() => { setQ(""); push({ q: "" }) }} />}
            {makeName && <FilterChip label={makeName} onClear={() => { setMake(""); setModel(""); push({ make: "", model: "" }) }} />}
            {modelName && <FilterChip label={modelName} onClear={() => { setModel(""); push({ model: "" }) }} />}
            {initial.lat && <FilterChip label="Near me" onClear={() => push({ lat: "", lng: "" })} />}
            <button type="button" onClick={clearAll} className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Clear all
            </button>
          </div>
        )}
      </div>

      {garages.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-4 rounded-[22px] border border-dashed border-border-strong bg-card/60 px-6 py-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-surface-muted text-muted-foreground">
            <MapPin className="size-6" />
          </span>
          <div>
            <p className="font-display text-xl font-semibold tracking-[-0.02em]">No garages match that search</p>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Try a nearby town, remove a filter, or search by your car&apos;s make only.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={clearAll} className="inline-flex h-10 items-center rounded-full border border-border-strong bg-card px-4 text-sm font-medium hover:bg-surface-sunken">
              Show all garages
            </button>
            <Link href="/signup/garage" className="inline-flex h-10 items-center rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90">
              List your garage
            </Link>
          </div>
        </div>
      ) : (
        <ul className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {garages.map((g) => (
            <li key={g.id}>
              <article className="group relative flex h-full flex-col rounded-[22px] border border-border bg-card p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-[0_20px_40px_-24px_rgba(11,15,26,0.35)]">
                <div className="flex items-start gap-4">
                  <GarageAvatar name={g.name} logoUrl={g.logoUrl} brandColor={g.brandColor} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[17px] font-semibold">
                      <Link href={`/garages/${g.slug}`} className="after:absolute after:inset-0 focus:outline-none">
                        {g.name}
                      </Link>
                    </h3>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" />
                      {[g.city, g.region].filter(Boolean).join(", ") || "Ghana"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  {g.ratingAvg != null ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF5DC] px-2.5 py-1 font-semibold text-[#7A5400]">
                      <Star className="size-3.5 fill-[#FFB020] text-[#FFB020]" /> {g.ratingAvg.toFixed(1)}
                      <span className="font-normal">· {g.reviewCount} review{g.reviewCount === 1 ? "" : "s"}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1 font-medium text-muted-foreground">New on FixAm</span>
                  )}
                  {g.distanceKm != null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#E3F9F7] px-2.5 py-1 font-semibold text-[#0B6B66]">
                      <Navigation className="size-3" />
                      {g.distanceKm < 1 ? `${Math.round(g.distanceKm * 1000)} m` : `${g.distanceKm.toFixed(1)} km`} away
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1 font-medium text-muted-foreground">
                    <CalendarCheck className="size-3" /> Online booking
                  </span>
                </div>

                {g.services.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-muted-foreground">Services</p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {g.services.slice(0, 3).map((s) => (
                        <li key={s} className="rounded-lg border border-border px-2 py-1 text-xs">{s}</li>
                      ))}
                      {g.services.length > 3 && (
                        <li className="rounded-lg px-1 py-1 text-xs text-muted-foreground">+{g.services.length - 3} more</li>
                      )}
                    </ul>
                  </div>
                )}

                {g.coverage.length > 0 && (
                  <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Car className="mt-px size-3.5 shrink-0" />
                    <span className="line-clamp-1">
                      {g.coverage.slice(0, 5).join(" · ")}
                      {g.coverage.length > 5 ? ` +${g.coverage.length - 5}` : ""}
                    </span>
                  </p>
                )}

                <div className="mt-auto pt-5"><div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-4">
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-foreground">
                    View garage <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <BadgeCheck className="size-3.5 text-[#4E6B07]" /> On FixAm
                  </span>
                </div></div>
              </article>
            </li>
          ))}
        </ul>
      )}

      {/* Garage owner CTA */}
      <div className="mt-16 flex flex-wrap items-center justify-between gap-6 rounded-[22px] border border-border bg-card p-8 md:p-10">
        <div className="max-w-xl">
          <p className="text-[13px] font-semibold text-[#B8390A]">Run a workshop?</p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.02em] md:text-3xl">Get your garage in front of drivers nearby</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            Every garage on FixAm gets a public profile with online booking, reviews and directions — free with every plan.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/signup/garage" className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-glow-primary hover:bg-primary-hover">
            List your garage
          </Link>
          <Link href="/pricing" className="inline-flex h-11 items-center rounded-full border border-border-strong bg-card px-5 text-sm font-medium hover:bg-surface-sunken">
            See pricing
          </Link>
        </div>
      </div>
    </div>
  )
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card py-1 pl-3 pr-1 text-sm">
      {label}
      <button type="button" onClick={onClear} aria-label={`Remove ${label}`} className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-muted hover:text-foreground">
        <X className="size-3.5" />
      </button>
    </span>
  )
}
