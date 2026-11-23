"use client"

import Link from "next/link"
import { useEffect, useState, useTransition } from "react"
import { MapPin, Power, PowerOff } from "lucide-react"
import { Card, CardContent } from "@/components/brand/card"
import { Button } from "@/components/brand/button"
import { StatusPill } from "@/components/brand/status-pill"
import { acceptRiderJob, declineRiderJob, listRiderJobs, setRiderOnline, type RiderView } from "@/lib/riders/actions"
import { DELIVERY_STATUS_LABEL, type DeliveryStatus } from "@/lib/riders/core"
import { useRiderLocation } from "./use-live-location"

export type RiderJob = {
  id: string
  number: string
  kind: string
  status: string
  pickup: { name?: string; city?: string | null; address?: string | null; phone?: string | null }
  dropoff: { name?: string; city?: string | null; address?: string | null; phone?: string | null }
  fee: number
  riderEarning: number | null
  createdAt: string
  deliveredAt: string | null
}

const ghs = (p: number | null | undefined) => (p == null ? "—" : `GH₵${(p / 100).toLocaleString("en-GH", { maximumFractionDigits: 0 })}`)
const place = (p: RiderJob["pickup"]) => [p?.name, p?.city].filter(Boolean).join(", ") || "Location"

function JobCard({ j, mode }: { j: RiderJob; mode: "offer" | "active" | "done" }) {
  return (
    <Link href={`/rider/jobs/${j.id}`} className="block rounded-xl border border-border bg-card p-4 hover:border-foreground/30">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{j.number} · {place(j.pickup)} → {place(j.dropoff)}</p>
        <StatusPill status={j.status}>{DELIVERY_STATUS_LABEL[j.status as DeliveryStatus] ?? j.status}</StatusPill>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {j.kind === "document" ? "Documents" : "Parts"}</span>
        <span>{ghs(j.riderEarning ?? j.fee)}</span>
        {mode === "done" && j.deliveredAt && <span>{new Date(j.deliveredAt).toLocaleDateString("en-GH")}</span>}
      </p>
    </Link>
  )
}

/** P8-18: rider home — go online, take nearby deliveries, track earnings. */
export function RiderDashboard({ rider, initialJobs }: { rider: RiderView; initialJobs: { available: RiderJob[]; active: RiderJob[]; recent: RiderJob[] } }) {
  const [online, setOnline] = useState(rider.isOnline)
  const [jobs, setJobs] = useState(initialJobs)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  useRiderLocation(online || jobs.active.length > 0)

  // Refresh offers/active jobs every ~10 s while the tab is open.
  useEffect(() => {
    let alive = true
    const t = setInterval(async () => {
      const j = await listRiderJobs().catch(() => null)
      if (alive && j) setJobs(j as unknown as typeof jobs)
    }, 10_000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  function toggle() {
    start(async () => {
      const res = await setRiderOnline({ online: !online })
      if (!res.ok) { setMsg(res.error); return }
      setMsg(null); setOnline(res.isOnline)
    })
  }

  function act(id: string, fn: (x: unknown) => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const res = await fn({ deliveryId: id })
      if (!res.ok) { setMsg(res.error ?? "Couldn't do that"); return }
      setMsg(null)
      const j = await listRiderJobs().catch(() => null)
      if (j) setJobs(j as unknown as typeof jobs)
    })
  }

  const total = jobs.recent.reduce((s, j) => s + (j.riderEarning ?? 0), 0)

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="font-display text-xl font-semibold">{rider.fullName ?? "Rider"}</p>
            <p className="text-sm text-muted-foreground">
              {rider.bikePlate ? `Bike ${rider.bikePlate} · ` : ""}
              {rider.canTakeJobs ? "Verified — ready for jobs" : rider.status === "pending" ? "Waiting for FixAm approval" : "Account suspended"}
              {rider.payoutMasked ? ` · ${rider.payoutMasked}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lifetime earnings</p>
              <p className="font-display text-lg font-semibold">{ghs(total)}</p>
            </div>
            <Button variant={online ? "secondary" : "primary"} onClick={toggle} loading={pending} disabled={!rider.canTakeJobs}>
              {online ? <PowerOff /> : <Power />}
              {online ? "Go offline" : "Go online"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {!rider.canTakeJobs && (
        <p className="rounded-xl border border-warning/30 bg-warning-subtle px-4 py-3 text-sm">
          {rider.status === "pending" ? "FixAm is checking your details — you'll get an SMS when you're cleared to take jobs." : "This account can't take jobs right now. Contact FixAm support."}
        </p>
      )}
      {msg && <p className="rounded-xl border border-danger/30 bg-danger-subtle px-4 py-3 text-sm font-medium text-danger">{msg}</p>}

      {jobs.active.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold">Active deliveries</h2>
          <div className="mt-3 space-y-2">
            {jobs.active.map((j) => <JobCard key={j.id} j={j} mode="active" />)}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-display text-lg font-semibold">{online ? "Jobs near you" : "Jobs for you"}</h2>
        {jobs.available.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {online ? "Nothing nearby right now — we'll SMS you when a delivery lands." : "Go online to see jobs near you."}
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {jobs.available.map((j) => (
              <div key={j.id} className="space-y-2">
                <JobCard j={j} mode="offer" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => act(j.id, acceptRiderJob)}>Accept</Button>
                  <Button size="sm" variant="ghost" onClick={() => act(j.id, declineRiderJob)}>Pass</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {jobs.recent.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold">Recent</h2>
          <div className="mt-3 space-y-2">
            {jobs.recent.map((j) => <JobCard key={j.id} j={j} mode="done" />)}
          </div>
        </section>
      )}
    </div>
  )
}
