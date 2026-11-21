"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { getTrackerData, type TrackerData } from "@/lib/tracker/actions"

const STAGES = [
  "Checked in", "Diagnosis", "Estimate", "Approved", "In progress",
  "Waiting parts", "Quality check", "Ready", "Delivered",
] as const

const STATUS_LABEL: Record<string, string> = {
  booked: "Booked", checked_in: "Checked in", diagnosing: "Diagnosing",
  estimate_sent: "Estimate sent", approved: "Approved", declined: "Declined",
  in_progress: "In progress", waiting_parts: "Waiting for parts",
  quality_check: "Quality check", ready: "Ready", delivered: "Delivered",
  closed: "Closed", cancelled: "Cancelled",
}

function fmt(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
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

  const g = data.garageName
  const mapsLink = data.garageAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.garageAddress)}`
    : null

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-lg px-4 py-8">
        <header className="mb-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{g}</p>
          <h1 className="mt-1 font-display text-3xl font-bold">Job {data.number}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[data.plate, data.vehicleLabel].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-3 flex justify-center"><StatusPill status={data.status} /></div>
          {data.mechanicFirstName && (
            <p className="mt-2 text-sm text-muted-foreground">Being worked on by <b className="text-foreground">{data.mechanicFirstName}</b></p>
          )}
        </header>

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
            <Card><CardContent className="p-4">
              <ol className="space-y-0">
                {STAGES.map((label, i) => {
                  const done = i < data.stageIndex
                  const current = i === data.stageIndex
                  return (
                    <li key={label} className="flex items-center gap-3 py-1.5">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        done ? "bg-emerald-600 text-white" : current ? "bg-accent text-accent-foreground ring-2 ring-accent/40" : "bg-muted text-muted-foreground"
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
              {data.promisedAt && !data.readyAt && (
                <p className="mt-3 border-t pt-3 text-sm">
                  <span className="text-muted-foreground">Expected ready by </span>
                  <b>{fmt(data.promisedAt)}</b>
                </p>
              )}
              {data.readyAt && <p className="mt-3 border-t pt-3 text-sm font-semibold text-success">Ready for pickup since {fmt(data.readyAt)}</p>}
            </CardContent></Card>

            {/* Findings */}
            {data.findings.length > 0 && (
              <Card className="mt-4"><CardContent className="p-4">
                <h2 className="mb-2 font-display text-base font-bold">What we found</h2>
                <ul className="space-y-2">
                  {data.findings.map((f) => (
                    <li key={f.id} className="text-sm">
                      <span className="font-semibold">{f.title}</span>
                      {f.severity === "urgent" && <span className="ml-2 rounded bg-red-600/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-600">urgent</span>}
                      {f.description && <p className="text-muted-foreground">{f.description}</p>}
                    </li>
                  ))}
                </ul>
              </CardContent></Card>
            )}

            {/* Photos */}
            {data.media.length > 0 && (
              <Card className="mt-4"><CardContent className="p-4">
                <h2 className="mb-2 font-display text-base font-bold">Photos</h2>
                <div className="grid grid-cols-3 gap-2">
                  {data.media.map((m) => (
                    m.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={m.id} src={m.url} alt={m.caption ?? "job photo"} className="aspect-square w-full rounded-lg object-cover" />
                    ) : (
                      <div key={m.id} className="flex aspect-square items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">{m.kind}</div>
                    )
                  ))}
                </div>
              </CardContent></Card>
            )}

            {/* Timeline notes */}
            {data.events.length > 0 && (
              <Card className="mt-4"><CardContent className="p-4">
                <h2 className="mb-2 font-display text-base font-bold">Updates</h2>
                <ul className="space-y-2">
                  {data.events.map((e) => (
                    <li key={e.id} className="text-sm">
                      <span className="text-muted-foreground">{fmt(e.createdAt)}</span>{" "}
                      <b>{STATUS_LABEL[e.toStatus] ?? e.toStatus}</b>
                      {e.note && <span className="text-muted-foreground"> — {e.note}</span>}
                    </li>
                  ))}
                </ul>
              </CardContent></Card>
            )}
          </>
        )}

        {/* Contact */}
        <Card className="mt-4"><CardContent className="grid grid-cols-3 gap-2 p-4 text-center">
          {data.garagePhone && (
            <a href={`tel:${data.garagePhone}`} className="rounded-lg bg-muted px-2 py-3 text-sm font-semibold">Call</a>
          )}
          {data.garagePhone && (
            <a
              href={`https://wa.me/${data.garagePhone.replace(/\D/g, "")}`}
              target="_blank" rel="noreferrer"
              className="rounded-lg bg-emerald-600/15 px-2 py-3 text-sm font-semibold text-emerald-700"
            >WhatsApp</a>
          )}
          {mapsLink && (
            <a href={mapsLink} target="_blank" rel="noreferrer" className="rounded-lg bg-muted px-2 py-3 text-sm font-semibold">Directions</a>
          )}
        </CardContent></Card>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">Live updates · refreshes every few seconds</p>
      </div>
    </main>
  )
}
