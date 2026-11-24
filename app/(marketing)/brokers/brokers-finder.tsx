"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { BadgeCheck, FileText, Phone, ShieldCheck } from "lucide-react"
import type { BrokerKindFilter, BrokerResult } from "@/lib/discovery/finders"
import { roundKm } from "@/lib/discovery/near-me"
import { formatGHS } from "@/lib/money"
import { AroundYou, LocationBar } from "@/components/discovery/location-bar"
import { cn } from "@/lib/utils"

const MAX_PICK = 3

type Initial = {
  kind: BrokerKindFilter
  lat: string; lng: string; radius: string; areaLabel: string | null
  verified: boolean
  insurer: string
}

const TABS: { key: BrokerKindFilter; label: string }[] = [
  { key: "insurance", label: "Car insurance" },
  { key: "dvla", label: "DVLA renewals" },
  { key: "all", label: "Both" },
]

/** What a quote request to this broker is for, given the tab. */
function requestKindFor(b: BrokerResult, tab: BrokerKindFilter): "insurance" | "dvla" {
  if (tab === "dvla") return "dvla"
  if (tab === "insurance") return "insurance"
  return b.kind === "dvla" ? "dvla" : "insurance"
}

function askHref(kind: "insurance" | "dvla", ids: string[]) {
  return `/portal/renewals/ask/${kind}/${ids.join("~")}`
}

export function BrokersFinder({ near, unpinned, insurers, initial }: {
  near: BrokerResult[]
  unpinned: BrokerResult[]
  insurers: string[]
  initial: Initial
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [picked, setPicked] = useState<string[]>([])
  const located = Boolean(initial.lat && initial.lng)
  const pickKind: "insurance" | "dvla" = initial.kind === "dvla" ? "dvla" : "insurance"

  function push(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v)
      else params.delete(k)
    }
    setPicked([])
    const qs = params.toString()
    router.push(`/brokers${qs ? `?${qs}` : ""}`, { scroll: false })
  }

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_PICK ? p : [...p, id]))
  }

  const noun = initial.kind === "dvla" ? "DVLA agent" : initial.kind === "insurance" ? "insurance broker" : "broker or agent"
  const center = located ? { lat: Number(initial.lat), lng: Number(initial.lng) } : null
  const pins = near.filter((b) => b.distanceKm != null && b.lat != null && b.lng != null)
    .map((b, i) => ({ id: b.id, label: b.name, lat: b.lat!, lng: b.lng!, km: b.distanceKm!, highlight: i === 0 }))

  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-32 md:px-8">
      <div className="relative z-10 -mt-20 flex flex-wrap items-center gap-3 rounded-[22px] border border-border bg-card p-3 shadow-[0_30px_60px_-30px_rgba(11,15,26,0.45)] md:p-4">
        <div role="tablist" aria-label="What do you need?" className="flex flex-wrap gap-1 rounded-2xl bg-surface-muted p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={initial.kind === t.key}
              onClick={() => push({ kind: t.key === "insurance" ? "" : t.key, insurer: t.key === "dvla" ? "" : initial.insurer })}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm transition-colors",
                initial.kind === t.key ? "bg-card font-semibold shadow-1" : "font-medium text-muted-foreground hover:text-foreground"
              )}
            >
              {t.key === "insurance" && <ShieldCheck className="size-4 text-[#5B3CC4]" />}
              {t.key === "dvla" && <FileText className="size-4 text-[#8A5A00]" />}
              {t.label}
            </button>
          ))}
        </div>
        {initial.kind !== "dvla" && (
          <label className="flex h-12 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-input px-3.5 text-sm text-muted-foreground">
            Insurer
            <select
              aria-label="Insurer"
              className="flex-1 bg-transparent text-[15px] font-medium text-foreground outline-none"
              value={initial.insurer}
              onChange={(e) => push({ insurer: e.target.value })}
            >
              <option value="">Any insurer</option>
              {insurers.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </label>
        )}
        <button
          type="button"
          aria-pressed={initial.verified}
          onClick={() => push({ verified: initial.verified ? "" : "1" })}
          className={cn(
            "inline-flex h-12 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors",
            initial.verified ? "border-[#2457C5]/30 bg-[#E8F0FF] text-[#2457C5]" : "border-input hover:bg-surface-muted"
          )}
        >
          <BadgeCheck className="size-4" /> Licence verified only
        </button>
      </div>

      <div className="mt-6">
        <LocationBar
          state={{ lat: initial.lat, lng: initial.lng, radius: initial.radius, areaLabel: initial.areaLabel }}
          onChange={(n) => push(n as Record<string, string>)}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-[999_1_560px] space-y-3">
          <p className="text-sm text-muted-foreground">
            {near.length === 0 ? (
              located ? <>No {noun}s have pinned an office {initial.radius === "all" ? "on the map yet" : `within ${initial.radius} km`}.</> : <>No {noun}s match yet.</>
            ) : (
              <><strong className="text-foreground">{near.length} {noun}{near.length === 1 ? "" : "s"}</strong>{located ? (initial.radius === "all" ? " by distance" : ` within ${initial.radius} km`) : ""} · tick up to {MAX_PICK} and ask them all for a quote</>
            )}
          </p>
          {located && near.length === 0 && initial.radius !== "all" && (
            <button type="button" onClick={() => push({ r: initial.radius === "5" ? "10" : initial.radius === "10" ? "25" : "all" })} className="text-sm font-semibold text-primary hover:underline">
              Search further away
            </button>
          )}
          {near.map((b, i) => (
            <BrokerCard key={b.id} b={b} tab={initial.kind} pickKind={pickKind} picked={picked.includes(b.id)} onToggle={() => toggle(b.id)} tint={i} full={picked.length >= MAX_PICK} />
          ))}

          {unpinned.length > 0 && (
            <section className="pt-4">
              <h2 className="text-sm font-semibold">Not on the map yet</h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">These haven&apos;t pinned their office, so we can&apos;t tell how far they are. Check the town.</p>
              <div className="mt-3 space-y-3">
                {unpinned.map((b, i) => (
                  <BrokerCard key={b.id} b={b} tab={initial.kind} pickKind={pickKind} picked={picked.includes(b.id)} onToggle={() => toggle(b.id)} tint={i + 2} full={picked.length >= MAX_PICK} />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="flex flex-[1_1_300px] flex-col gap-4 md:sticky md:top-24">
          {center && pins.length > 0 && <AroundYou pins={pins} radiusKm={initial.radius === "all" ? null : Number(initial.radius)} center={center} />}
          <div className="hidden rounded-[18px] bg-secondary p-5 text-secondary-foreground md:block">
            <h2 className="text-[17px] font-semibold">Ask {picked.length > 1 ? `${picked.length} brokers` : "several brokers"} at once</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              Send your car and cover details once. Each broker replies with a price by SMS and in FixAm — you accept the one you like.
            </p>
            {picked.length > 0 ? (
              <Link href={askHref(pickKind, picked)} className="mt-4 flex h-12 items-center justify-center rounded-full bg-primary text-[15px] font-semibold text-primary-foreground hover:bg-primary-hover">
                Request {picked.length} quote{picked.length === 1 ? "" : "s"}
              </Link>
            ) : (
              <p className="mt-4 rounded-xl bg-white/10 px-3 py-2.5 text-sm">Tick the brokers you want quotes from.</p>
            )}
            <p className="mt-2 text-xs text-white/60">Free to ask. Nothing is charged until you accept a quote.</p>
          </div>
        </aside>
      </div>

      {picked.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur md:hidden">
          <Link href={askHref(pickKind, picked)} className="flex h-12 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground">
            Ask {picked.length} broker{picked.length === 1 ? "" : "s"} for quotes
          </Link>
          <p className="mt-1 text-center text-xs text-muted-foreground">Free to ask · replies by SMS and in FixAm</p>
        </div>
      )}
    </div>
  )
}

const TINTS = ["bg-[#EFE9FF] text-[#5B3CC4]", "bg-[#FFF4D6] text-[#8A5A00]", "bg-[#E6F8F6] text-[#00756F]", "bg-primary/10 text-primary", "bg-[#E6F4FF] text-[#0B5CAD]"]

function BrokerCard({ b, tab, pickKind, picked, onToggle, tint, full }: {
  b: BrokerResult
  tab: BrokerKindFilter
  pickKind: "insurance" | "dvla"
  picked: boolean
  onToggle: () => void
  tint: number
  full: boolean
}) {
  const initials = b.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("")
  const servesPick = b.kind === "both" || b.kind === pickKind
  const canPick = servesPick && (picked || !full)
  const licence = b.kind === "dvla" ? "DVLA agent verified" : "NIC licence verified"
  const tags = [
    b.kind === "both" ? "Insurance & DVLA" : b.kind === "dvla" ? "DVLA" : "Insurance",
    b.kind !== "dvla" && b.insurers.length ? `Sells ${b.insurers.slice(0, 3).join(", ")}${b.insurers.length > 3 ? ` +${b.insurers.length - 3}` : ""}` : null,
    b.feePesewas != null ? `Service fee from ${formatGHS(b.feePesewas)}` : null,
  ].filter(Boolean) as string[]

  return (
    <article className={cn("flex flex-wrap items-center gap-4 rounded-[18px] border bg-card p-4 transition-colors md:p-5", picked ? "border-primary shadow-[0_0_0_3px_rgba(255,90,31,0.12)]" : "border-border hover:border-border-strong")}>
      <input
        type="checkbox"
        checked={picked}
        disabled={!canPick}
        onChange={onToggle}
        aria-label={`Ask ${b.name} for a quote`}
        title={!servesPick ? `Doesn't do ${pickKind === "dvla" ? "DVLA" : "insurance"}` : !canPick ? `Up to ${MAX_PICK} at a time` : undefined}
        className="size-5 accent-[var(--primary)] disabled:opacity-40"
      />
      <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl font-bold", TINTS[tint % TINTS.length])}>{initials || "B"}</span>
      <div className="min-w-[220px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[17px] font-semibold">{b.name}</h3>
          {b.verified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#E8F0FF] px-2 py-0.5 text-xs font-semibold text-[#2457C5]"><BadgeCheck className="size-3.5" /> {licence}</span>
          ) : (
            <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-semibold text-warning-foreground">Licence check pending</span>
          )}
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {b.distanceKm != null && <><strong className="text-foreground">{roundKm(b.distanceKm)}</strong> · </>}
          {[b.city, b.region].filter(Boolean).join(", ") || "Location not set"}
          {b.rating != null && b.ratingCount > 0 ? ` · ★ ${b.rating.toFixed(1)} (${b.ratingCount})` : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((t) => <span key={t} className="rounded-md bg-surface-muted px-2 py-0.5 text-xs">{t}</span>)}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <a href={`tel:${b.phone}`} aria-label={`Call ${b.name}`} className="flex size-11 items-center justify-center rounded-full border border-border hover:bg-surface-muted">
          <Phone className="size-4" />
        </a>
        <Link
          href={askHref(requestKindFor(b, tab), [b.id])}
          className="inline-flex h-11 items-center rounded-full bg-secondary px-4 text-sm font-semibold text-secondary-foreground hover:opacity-90"
        >
          Get a quote
        </Link>
      </div>
    </article>
  )
}
