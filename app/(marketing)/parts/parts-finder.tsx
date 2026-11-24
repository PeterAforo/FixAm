"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { BadgeCheck, Navigation, Phone, Search, Star, Truck } from "lucide-react"
import type { SellerResult } from "@/lib/discovery/finders"
import { roundKm } from "@/lib/discovery/near-me"
import { formatGHS } from "@/lib/money"
import { AroundYou, LocationBar } from "@/components/discovery/location-bar"
import { cn } from "@/lib/utils"

const fieldCls =
  "h-12 w-full rounded-xl border border-input bg-card px-3.5 text-[15px] text-foreground outline-none transition-shadow placeholder:text-[#8C857B] focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

const CONDITION: Record<string, string> = { genuine: "Genuine", aftermarket: "Aftermarket", home_used: "Home-used" }
const POPULAR = ["Brake pads", "Oil filter", "Battery", "Shock absorber", "Spark plugs", "Headlamp", "Radiator", "Tyre"]
const TINTS = ["bg-[#E6F8F6] text-[#00756F]", "bg-[#EFE9FF] text-[#5B3CC4]", "bg-primary/10 text-primary", "bg-[#FFF4D6] text-[#8A5A00]", "bg-[#E6F4FF] text-[#0B5CAD]"]

type Initial = {
  q: string; make: string; model: string; year: string
  lat: string; lng: string; radius: string; areaLabel: string | null
  verified: boolean; delivers: boolean; sort: "nearest" | "cheapest"
}

export function FinderSkeleton() {
  return (
    <div className="mx-auto max-w-[1200px] px-6 md:px-8">
      <div className="-mt-20 h-[92px] animate-pulse rounded-[22px] border border-border bg-card" />
      <div className="mt-8 space-y-4">
        {[0, 1, 2].map((i) => <div key={i} className="h-[180px] animate-pulse rounded-[18px] border border-border bg-card" />)}
      </div>
    </div>
  )
}

export function PartsFinder({ sellers, searched, makes, initial }: {
  sellers: SellerResult[]
  searched: boolean
  makes: { name: string; models: string[] }[]
  initial: Initial
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [q, setQ] = useState(initial.q)
  const [make, setMake] = useState(initial.make)
  const [model, setModel] = useState(initial.model)
  const [year, setYear] = useState(initial.year)
  const models = makes.find((m) => m.name.toLowerCase() === make.trim().toLowerCase())?.models ?? []
  const located = Boolean(initial.lat && initial.lng)

  function push(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v)
      else params.delete(k)
    }
    const qs = params.toString()
    router.push(`/parts${qs ? `?${qs}` : ""}`, { scroll: false })
  }

  const carLabel = [initial.make, initial.model, initial.year].filter(Boolean).join(" ")
  const center = located ? { lat: Number(initial.lat), lng: Number(initial.lng) } : null
  const pins = sellers.filter((s) => s.lat != null && s.lng != null && s.distanceKm != null)
    .map((s, i) => ({ id: s.id, label: s.name, lat: s.lat!, lng: s.lng!, km: s.distanceKm!, highlight: i === 0 }))

  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-24 md:px-8">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          push({ q: q.trim(), make: make.trim(), model: model.trim(), year: year.trim() })
        }}
        className="relative z-10 -mt-20 rounded-[22px] border border-border bg-card p-3 shadow-[0_30px_60px_-30px_rgba(11,15,26,0.45)] md:p-4"
      >
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_110px_auto]">
          <label className="relative block">
            <span className="sr-only">Part you need</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
            <input className={`${fieldCls} pl-10`} placeholder="What part do you need?" value={q} onChange={(e) => setQ(e.target.value)} required minLength={2} />
          </label>
          <label className="block">
            <span className="sr-only">Car make</span>
            <input className={fieldCls} list="pf-makes" placeholder="Make (e.g. Toyota)" value={make} onChange={(e) => { setMake(e.target.value); setModel("") }} />
            <datalist id="pf-makes">{makes.map((m) => <option key={m.name} value={m.name} />)}</datalist>
          </label>
          <label className="block">
            <span className="sr-only">Car model</span>
            <input className={fieldCls} list="pf-models" placeholder="Model" value={model} onChange={(e) => setModel(e.target.value)} />
            <datalist id="pf-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
          </label>
          <label className="block">
            <span className="sr-only">Year</span>
            <input className={fieldCls} inputMode="numeric" maxLength={4} placeholder="Year" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))} />
          </label>
          <button type="submit" className="h-12 rounded-xl bg-primary px-6 text-[15px] font-semibold text-primary-foreground hover:bg-primary-hover">
            Search parts
          </button>
        </div>
      </form>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
        <LocationBar
          state={{ lat: initial.lat, lng: initial.lng, radius: initial.radius, areaLabel: initial.areaLabel }}
          onChange={(n) => push(n as Record<string, string>)}
        />
        <div className="flex flex-wrap gap-2">
          <Toggle on={initial.delivers} onClick={() => push({ delivers: initial.delivers ? "" : "1" })}>Delivers</Toggle>
          <Toggle on={initial.verified} onClick={() => push({ verified: initial.verified ? "" : "1" })}>Verified sellers</Toggle>
          <Toggle on={initial.sort === "cheapest"} onClick={() => push({ sort: initial.sort === "cheapest" ? "" : "cheapest" })}>Cheapest first</Toggle>
        </div>
      </div>

      {!searched ? (
        <section className="mt-10 rounded-[22px] border border-border bg-card p-6 md:p-8">
          <h2 className="font-display text-xl font-bold">What do you need?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Type the part above{located ? "" : " and share your location"} — we&apos;ll show sellers {located ? "closest to you" : "near you"} with parts that fit your car.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {POPULAR.map((p) => (
              <button key={p} type="button" onClick={() => { setQ(p); push({ q: p }) }} className="h-10 rounded-full border border-border px-4 text-sm font-medium hover:border-border-strong hover:bg-surface-muted">
                {p}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div className="mt-6 flex flex-wrap items-start gap-6">
          <div className="min-w-0 flex-[999_1_560px] space-y-4">
            <p className="text-sm text-muted-foreground">
              {sellers.length === 0 ? (
                <>No sellers found for <strong className="text-foreground">{initial.q}</strong>{carLabel ? ` for a ${carLabel}` : ""}{located && initial.radius !== "all" ? ` within ${initial.radius} km` : ""}.</>
              ) : (
                <><strong className="text-foreground">{sellers.length} seller{sellers.length === 1 ? "" : "s"}</strong>{located && initial.radius !== "all" ? ` within ${initial.radius} km` : ""} have <strong className="text-foreground">{initial.q}</strong>{carLabel ? ` for a ${carLabel}` : ""}</>
              )}
            </p>
            {sellers.length === 0 && (
              <div className="rounded-[18px] border border-dashed border-border-strong bg-card p-6 text-sm text-muted-foreground">
                {located && initial.radius !== "all" ? (
                  <>Try a wider area: <button type="button" className="font-semibold text-primary hover:underline" onClick={() => push({ r: initial.radius === "5" ? "10" : initial.radius === "10" ? "25" : "all" })}>search further</button>, or use a simpler name (e.g. &ldquo;brake pads&rdquo;).</>
                ) : (
                  <>Try a simpler name (e.g. &ldquo;brake pads&rdquo;) or remove the car details. More sellers join FixAm every week.</>
                )}
              </div>
            )}
            {sellers.map((s, i) => <SellerCard key={s.id} s={s} tint={TINTS[i % TINTS.length]!} />)}
          </div>
          {center && pins.length > 0 && (
            <aside className="flex-[1_1_300px] md:sticky md:top-24">
              <AroundYou pins={pins} radiusKm={initial.radius === "all" ? null : Number(initial.radius)} center={center} />
            </aside>
          )}
        </div>
      )}
    </div>
  )
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "h-10 rounded-full border px-4 text-sm font-medium transition-colors",
        on ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card hover:bg-surface-muted"
      )}
    >
      {on ? "✓ " : ""}{children}
    </button>
  )
}

function SellerCard({ s, tint }: { s: SellerResult; tint: string }) {
  const initials = s.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("")
  const facts = [
    s.distanceKm != null ? roundKm(s.distanceKm) : null,
    s.city,
    s.rating != null && s.ratingCount > 0 ? `★ ${s.rating.toFixed(1)} (${s.ratingCount})` : null,
    s.delivery
      ? `Delivers${s.delivery.etaHours != null ? ` in ~${s.delivery.etaHours}h` : ""}${s.delivery.feePesewas > 0 ? ` from ${formatGHS(s.delivery.feePesewas)}` : " free"}`
      : "Pickup only",
  ].filter(Boolean)
  return (
    <article className="rounded-[18px] border border-border bg-card p-4 transition-colors hover:border-border-strong md:p-5">
      <div className="flex items-start gap-3.5">
        <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl font-bold", tint)}>{initials || "S"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[17px] font-semibold">{s.name}</h2>
            {s.verified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#E8F0FF] px-2 py-0.5 text-xs font-semibold text-[#2457C5]">
                <BadgeCheck className="size-3.5" /> Verified
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {facts.map((f, i) => (
              <span key={i}>{i > 0 && " · "}{i === 0 && s.distanceKm != null ? <strong className="text-foreground">{f}</strong> : f}</span>
            ))}
          </p>
        </div>
        {s.delivery && <Truck className="mt-1 hidden size-5 shrink-0 text-muted-foreground sm:block" aria-hidden />}
      </div>

      <ul className="mt-4 space-y-2">
        {s.offers.map((o, i) => (
          <li key={o.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-muted/50 p-3">
            <div className="min-w-[180px] flex-1">
              <p className="text-sm font-semibold">{o.name}{o.brand ? ` — ${o.brand}` : ""}</p>
              <p className="text-xs text-muted-foreground">
                {[o.condition ? CONDITION[o.condition] ?? o.condition : null, o.fitLevel >= 2 ? "Fits your car" : o.fitLevel === 0 ? "Universal" : null, o.stockStatus === "low" ? "Low stock" : o.stockStatus === "on_order" ? "On order" : null, o.warrantyDays ? `${o.warrantyDays}-day warranty` : null].filter(Boolean).join(" · ")}
              </p>
            </div>
            <p className="font-display text-base font-bold tabular-nums">{formatGHS(o.price)}</p>
            <Link
              href={`/portal/parts?q=${encodeURIComponent(o.name)}`}
              className={cn(
                "inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold",
                i === 0 ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "border border-border bg-card hover:bg-surface-muted"
              )}
            >
              Order
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] font-medium">
        <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1.5 hover:text-primary"><Phone className="size-4" /> Call seller</a>
        {s.lat != null && s.lng != null && (
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-primary">
            <Navigation className="size-4" /> Directions
          </a>
        )}
        {s.rating != null && s.ratingCount > 0 && <span className="inline-flex items-center gap-1 text-muted-foreground sm:hidden"><Star className="size-3.5" /> {s.rating.toFixed(1)}</span>}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Order through FixAm and your money is held until the part arrives.</p>
    </article>
  )
}
