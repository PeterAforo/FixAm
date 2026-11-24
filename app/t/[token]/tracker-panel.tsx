"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { CarAvatar, type VehicleType } from "@/components/brand/car-avatar"
import { PlateChip } from "@/components/brand/plate-chip"
import { Avatar } from "@/components/brand/avatar"
import { getTrackerData, type TrackerData } from "@/lib/tracker/actions"
import { Phone, MessageCircle, Navigation } from "lucide-react"

const STAGES = [
  "Checked in", "Diagnosis", "Estimate", "Approved", "In progress",
  "Waiting parts", "Quality check", "Ready", "Delivered",
] as const

const HEADLINE: Record<string, string> = {
  booked: "Your booking is confirmed",
  checked_in: "Your car has arrived",
  diagnosing: "We're diagnosing your vehicle",
  estimate_sent: "Your estimate is ready",
  approved: "Work approved — repairs starting",
  in_progress: "Your car is being repaired",
  waiting_parts: "Waiting for parts",
  quality_check: "Final quality check",
  ready: "Your car is ready for pickup",
  delivered: "Job complete",
  closed: "Job complete",
  cancelled: "Job cancelled",
  declined: "Estimate declined",
}

function fmt(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

const SEVERITY_TONE: Record<string, string> = {
  urgent: "bg-danger-subtle text-danger",
  recommended: "bg-warning-subtle text-foreground",
  optional: "bg-muted text-muted-foreground",
}

export function TrackerPanel({ token, initial }: { token: string; initial: TrackerData }) {
  const [data, setData] = useState(initial)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    const res = await getTrackerData({ token })
    if (res.ok && res.data) setData(res.data)
  }, [token])

  useEffect(() => {
    timer.current = setInterval(refresh, 5000)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [refresh])

  const accent = data.garageBrandColor ?? "#FF5A1F"
  const mapsLink = data.garageAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.garageAddress)}`
    : null
  const bodyType = (data.vehicleBodyType ?? "sedan") as VehicleType

  return (
    <main
      className="min-h-dvh bg-background pb-28"
      style={{ ["--garage-accent" as string]: accent }}
    >
      {/* Hero — spec: large CarAvatar on soft gradient, status headline, ETA chip */}
      <div
        className="border-b border-border px-4 pb-8 pt-10 text-center"
        style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 14%, transparent), transparent)` }}
      >
        {data.garageLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- public customer page, arbitrary garage logo URL
          <img src={data.garageLogoUrl} alt={data.garageName} className="mx-auto mb-3 h-10 w-10 rounded-xl object-contain" />
        ) : null}
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: accent }}>{data.garageName}</p>
        <div className="mx-auto mt-4 w-56">
          <CarAvatar type={bodyType} color={data.colorHex ?? "var(--color-ignition-500)"} title={data.vehicleLabel ?? "vehicle"} />
        </div>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">
          {HEADLINE[data.status] ?? "Job update"}
        </h1>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <StatusPill status={data.status} />
          {data.plate ? <PlateChip plate={data.plate} /> : null}
          {data.promisedAt && !data.readyAt && !data.finished && (
            <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-bold">
              Expected {fmt(data.promisedAt)}
            </span>
          )}
        </div>
        {data.mechanicFirstName && (
          <p className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Avatar name={data.mechanicFirstName} size={22} />
            Working on it: <b className="text-foreground">{data.mechanicFirstName}</b>
          </p>
        )}
      </div>

      <div className="mx-auto max-w-lg space-y-4 px-4 pt-6">
        {data.finished ? (
          <Card><CardContent className="p-6 text-center">
            <h2 className="font-display text-xl font-bold">{data.status === "cancelled" ? "Job cancelled" : "Job complete"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {data.status === "cancelled"
                ? "This job was cancelled. Contact the garage for details."
                : "Thanks for choosing us! Your vehicle has been delivered."}
            </p>
          </CardContent></Card>
        ) : (
          <>
            {/* Stepper */}
            <Card><CardContent className="p-5">
              <ol>
                {STAGES.map((label, i) => {
                  const done = i < data.stageIndex
                  const current = i === data.stageIndex
                  return (
                    <li key={label} className="flex items-center gap-3 py-1.5">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        done ? "bg-success text-success-foreground" : current ? "bg-accent text-accent-foreground ring-2 ring-accent/40" : "bg-muted text-muted-foreground"
                      }`}>
                        {done ? "✓" : i + 1}
                      </span>
                      <span className={`text-sm ${current ? "font-bold" : done ? "text-foreground" : "text-muted-foreground"}`}>
                        {label}
                        {current && <span className="ml-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />}
                      </span>
                    </li>
                  )
                })}
              </ol>
              {data.readyAt && <p className="mt-3 border-t border-border pt-3 text-sm font-semibold text-success">Ready for pickup since {fmt(data.readyAt)}</p>}
            </CardContent></Card>

            {/* Findings — spec: severity chips */}
            {data.findings.length > 0 && (
              <Card><CardContent className="p-5">
                <h2 className="mb-3 font-display text-base font-bold">What we found</h2>
                <ul className="space-y-3">
                  {data.findings.map((f) => (
                    <li key={f.id} className="rounded-xl border border-border p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{f.title}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${SEVERITY_TONE[f.severity] ?? SEVERITY_TONE.optional}`}>
                          {f.severity === "optional" ? "can wait" : f.severity}
                        </span>
                      </div>
                      {f.description && <p className="mt-1 text-sm text-muted-foreground">{f.description}</p>}
                    </li>
                  ))}
                </ul>
              </CardContent></Card>
            )}

            {/* Photos & videos — before / after / old parts (P8-07) */}
            {data.media.length > 0 && (
              <Card><CardContent className="space-y-4 p-5">
                {([
                  ["Before", data.media.filter((m) => m.stage === "check_in" || m.stage === "diagnosis")],
                  ["After", data.media.filter((m) => m.stage === "repair" || m.stage === "qc" || m.stage === "delivery" || !m.stage)],
                  ["Old parts we replaced", data.media.filter((m) => m.stage === "old_part")],
                ] as const).filter(([, list]) => list.length > 0).map(([title, list]) => (
                  <div key={title}>
                    <h2 className="mb-2 font-display text-base font-bold">{title}</h2>
                    <div className="grid grid-cols-3 gap-2">
                      {list.map((m) =>
                        !m.url ? (
                          <div key={m.id} className="flex aspect-square items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">{m.kind}</div>
                        ) : m.kind === "video" ? (
                          <video key={m.id} src={m.url} controls playsInline className="aspect-square w-full rounded-lg border border-border bg-black object-cover" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={m.id} src={m.url} alt={m.caption ?? "job photo"} className="aspect-square w-full rounded-lg border border-border object-cover" />
                        )
                      )}
                    </div>
                  </div>
                ))}
              </CardContent></Card>
            )}

            {/* Updates timeline */}
            {data.events.length > 0 && (
              <Card><CardContent className="p-5">
                <h2 className="mb-3 font-display text-base font-bold">Updates</h2>
                <ul className="space-y-2.5">
                  {data.events.map((e) => (
                    <li key={e.id} className="flex gap-3 text-sm">
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                      <div>
                        <span className="text-muted-foreground">{fmt(e.createdAt)}</span>{" "}
                        <b>{e.toStatus.replace(/_/g, " ")}</b>
                        {e.note && <p className="text-muted-foreground">{e.note}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent></Card>
            )}
          </>
        )}

        <p className="pt-2 text-center text-[11px] text-muted-foreground">Live updates · refreshes every few seconds</p>
      </div>

      {/* Sticky actions — spec: Call / WhatsApp / Directions */}
      {(data.garagePhone || mapsLink) && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/90 px-4 py-3 backdrop-blur-md">
          <div className="mx-auto flex max-w-lg gap-2">
            {data.garagePhone && (
              <a href={`tel:${data.garagePhone}`} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-bold text-primary-foreground">
                <Phone className="size-4" /> Call
              </a>
            )}
            {data.garagePhone && (
              <a
                href={`https://wa.me/${data.garagePhone.replace(/\D/g, "")}`}
                target="_blank" rel="noreferrer"
                className="flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-border bg-surface py-3 text-sm font-bold"
              >
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            )}
            {mapsLink && (
              <a href={mapsLink} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-border bg-surface py-3 text-sm font-bold">
                <Navigation className="size-4" /> Directions
              </a>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
