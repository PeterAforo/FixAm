"use client"

import Link from "next/link"
import { useEffect, useState, useTransition } from "react"
import { MapPin, Radio, Siren } from "lucide-react"
import { Card, CardContent } from "@/components/brand/card"
import { listTowJobs, setTowAvailability, type OperatorJob, type OperatorView } from "@/lib/towing/actions"
import { STATUS_LABEL, problemLabel, type SosStatus } from "@/lib/towing/core"
import { useLiveLocation } from "./use-live-location"

const ghs = (p: number) => `GH₵${(p / 100).toLocaleString("en-GH", { maximumFractionDigits: 0 })}`
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
}

function JobCard({ j, highlight }: { j: OperatorJob; highlight?: boolean }) {
  return (
    <Link href={`/tow/jobs/${j.id}`} className={`block rounded-xl border p-4 hover:bg-surface-muted ${highlight ? "border-red-300 bg-red-50/60 dark:bg-red-950/20" : "border-border bg-card"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{problemLabel(j.problem)}{j.vehicle ? ` · ${j.vehicle}` : ""}</p>
        <span className="text-xs text-muted-foreground">{ago(j.createdAt)}</span>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
        {j.distanceKm != null && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {j.distanceKm} km away</span>}
        {j.destination && <span>→ {j.destination.name}</span>}
        <span>{j.isMine ? STATUS_LABEL[j.status as SosStatus] : `Suggested ${ghs(j.suggestedQuote)}`}</span>
      </p>
    </Link>
  )
}

/** P8-15: tow operator home — go available, share location, see and take SOS jobs. */
export function TowDashboard({ operator, initialJobs }: { operator: OperatorView; initialJobs: { open: OperatorJob[]; active: OperatorJob[]; recent: OperatorJob[] } }) {
  const [available, setAvailable] = useState(operator.isAvailable)
  const [jobs, setJobs] = useState(initialJobs)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const sharing = useLiveLocation(available || jobs.active.length > 0)

  // New SOS calls show up within a few seconds.
  useEffect(() => {
    let alive = true
    const t = setInterval(async () => {
      const j = await listTowJobs().catch(() => null)
      if (alive && j) setJobs(j)
    }, 5000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const toggle = () => start(async () => {
    const r = await setTowAvailability({ available: !available })
    if (r.ok) { setAvailable(r.available); setMsg(null) } else setMsg(r.error)
  })

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em]">{operator.businessName}</h1>
          <p className="text-sm text-muted-foreground">{operator.completedJobs} jobs done{operator.isVerified ? " · Verified" : ""}{!operator.payoutMasked ? " · add a MoMo number in Settings to get MoMo payments" : ""}</p>
        </div>
        <button type="button" onClick={toggle} disabled={pending}
          className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold shadow-sm transition ${available ? "bg-emerald-600 text-white" : "bg-surface-muted text-foreground"}`}>
          <Radio className="size-4" /> {available ? "Available — taking jobs" : "Offline — tap to go available"}
        </button>
      </div>
      {msg && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{msg}</p>}
      {(available || jobs.active.length > 0) && (
        <p className="text-xs text-muted-foreground">
          Live location: {sharing === "on" ? "sharing ✓" : sharing === "denied" ? "blocked — allow location for FixAm in your browser" : sharing === "unavailable" ? "not available on this device" : "starting…"}. Keep this page open while you work.
        </p>
      )}

      {jobs.active.length > 0 && (
        <section>
          <h2 className="text-[15px] font-semibold">Your current job</h2>
          <div className="mt-2 space-y-2">{jobs.active.map((j) => <JobCard key={j.id} j={j} />)}</div>
        </section>
      )}

      <section>
        <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Siren className="size-4 text-red-600" /> New SOS calls</h2>
        {jobs.open.length === 0 ? (
          <Card className="mt-2"><CardContent className="p-6 text-center text-sm text-muted-foreground">
            {available ? "No calls right now. New ones appear here and by SMS." : "Go available to receive breakdown calls near you."}
          </CardContent></Card>
        ) : (
          <div className="mt-2 space-y-2">{jobs.open.map((j) => <JobCard key={j.id} j={j} highlight />)}</div>
        )}
      </section>

      {jobs.recent.length > 0 && (
        <section>
          <h2 className="text-[15px] font-semibold">Recent</h2>
          <div className="mt-2 space-y-2">{jobs.recent.map((j) => <JobCard key={j.id} j={j} />)}</div>
        </section>
      )}
    </div>
  )
}
