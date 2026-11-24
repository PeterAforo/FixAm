"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Car, Clock, Search, User, X } from "lucide-react"
import { Button } from "@/components/brand/button"
import { CarAvatar, type VehicleType } from "@/components/brand/car-avatar"
import { PlateChip } from "@/components/brand/plate-chip"
import { StatusPill } from "@/components/brand/status-pill"
import { updateJobStatus } from "@/lib/jobs/actions"
import { canTransitionJob, type JobStatus } from "@/lib/jobs/transitions"
import { createClient } from "@/lib/auth/supabase/client"

const COLUMN_LABEL: Record<JobStatus, string> = {
  booked: "Booked",
  checked_in: "Checked in",
  diagnosing: "Diagnosing",
  estimate_sent: "Estimate sent",
  approved: "Approved",
  declined: "Declined",
  in_progress: "In progress",
  waiting_parts: "Waiting parts",
  quality_check: "QC",
  ready: "Ready",
  delivered: "Delivered",
  closed: "Closed",
  cancelled: "Cancelled",
}

const BODY_TO_TYPE: Record<string, VehicleType> = {
  sedan: "sedan", hatchback: "hatchback", suv: "suv", pickup: "pickup",
  van: "van", bus: "bus", truck: "truck", motorbike: "motorbike", other: "other",
}

type BoardJob = {
  id: string
  number: string
  status: JobStatus
  priority: string
  complaint: string | null
  promisedAt: string | null
  plateNumber: string
  vehicleLabel: string
  bodyType: string | null
  colorHex: string | null
  customerName: string
  customerId: string
  branchId: string
  bayId: string | null
  assignees: { userId: string; name: string; isLead: boolean }[]
}

function countdown(promisedAt: string | null): { text: string; tone: "ok" | "warn" | "late" } | null {
  if (!promisedAt) return null
  const diff = new Date(promisedAt).getTime() - Date.now()
  const abs = Math.abs(diff)
  const h = Math.floor(abs / 3_600_000)
  const m = Math.floor((abs % 3_600_000) / 60_000)
  const text = h > 0 ? `${h}h ${m}m` : `${m}m`
  if (diff < 0) return { text: `-${text}`, tone: "late" }
  if (diff < 3_600_000) return { text, tone: "warn" }
  return { text, tone: "ok" }
}

const COLUMN_TINT: Partial<Record<JobStatus, string>> = {
  waiting_parts: "bg-warning/10",
  quality_check: "bg-info-subtle",
  ready: "bg-success/10",
  declined: "bg-danger/10",
  cancelled: "bg-muted/60",
}

const inputCls =
  "min-h-10 rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

export function JobsBoard({
  garageSlug,
  garageId,
  statuses,
  jobs,
  branches,
  mechanics,
  bays,
  filters,
  canStatusUpdate,
}: {
  garageSlug: string
  garageId: string
  statuses: JobStatus[]
  jobs: BoardJob[]
  branches: { id: string; name: string }[]
  mechanics: { userId: string; name: string }[]
  bays: { id: string; name: string; branchId: string }[]
  filters: { mechanic: string; priority: string; branch: string; swimlane: string; q: string }
  canStatusUpdate: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [dragOver, setDragOver] = useState<JobStatus | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [q, setQ] = useState(filters.q)
  const [optimistic, setOptimistic] = useState<Map<string, JobStatus>>(new Map())
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Realtime: any jobs change for this garage refreshes the board.
  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null
    try {
      const supabase = createClient()
      channel = supabase
        .channel(`jobs-${garageId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "jobs", filter: `garage_id=eq.${garageId}` },
          () => router.refresh()
        )
        .subscribe()
    } catch {
      // Realtime unavailable — board still works via manual refresh/polling below.
    }
    const poll = setInterval(() => router.refresh(), 30_000)
    return () => {
      channel?.unsubscribe()
      clearInterval(poll)
    }
  }, [garageId, router])

  const [prevQ, setPrevQ] = useState(filters.q)
  if (filters.q !== prevQ) {
    setPrevQ(filters.q)
    setQ(filters.q)
  }

  function pushParams(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v)
      else params.delete(k)
    }
    const qs = params.toString()
    router.replace(`/g/${garageSlug}/jobs${qs ? `?${qs}` : ""}`)
  }

  function onSearch(value: string) {
    setQ(value)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => pushParams({ q: value }), 300)
  }

  // Apply optimistic status overrides until server data catches up
  const effectiveJobs = useMemo(
    () =>
      jobs.map((j) =>
        optimistic.has(j.id) ? { ...j, status: optimistic.get(j.id)! } : j
      ),
    [jobs, optimistic]
  )

  // Swimlanes: branch | bay | none
  const swimKey = filters.swimlane // "branch" | "bay" | ""
  const swimlanes = useMemo(() => {
    if (!swimKey) return [{ key: "all", label: "All", jobs: effectiveJobs }]
    if (swimKey === "branch") {
      return branches.map((b) => ({
        key: b.id,
        label: b.name,
        jobs: effectiveJobs.filter((j) => j.branchId === b.id),
      }))
    }
    return bays.map((b) => ({
      key: b.id,
      label: b.name,
      jobs: effectiveJobs.filter((j) => j.bayId === b.id),
    }))
  }, [swimKey, branches, bays, effectiveJobs])

  function showToast(text: string) {
    setToast(text)
    setTimeout(() => setToast(null), 3500)
  }

  function onDrop(jobId: string, toStatus: JobStatus) {
    setDragOver(null)
    const job = effectiveJobs.find((j) => j.id === jobId)
    if (!job || job.status === toStatus) return
    if (!canTransitionJob(job.status, toStatus)) {
      showToast(`Can't move ${COLUMN_LABEL[job.status]} → ${COLUMN_LABEL[toStatus]}.`)
      return
    }
    // optimistic move
    setOptimistic((m) => new Map(m).set(jobId, toStatus))
    startTransition(async () => {
      const res = await updateJobStatus({ garageId, jobId, toStatus })
      if (!res.ok) {
        setOptimistic((m) => {
          const n = new Map(m)
          n.delete(jobId)
          return n
        })
        showToast(res.error.message)
      }
      router.refresh()
    })
  }

  const activeFilters = Boolean(filters.mechanic || filters.priority || filters.branch || filters.swimlane || filters.q)

  return (
    <div className="space-y-4">
      {/* Header + filters */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em]">Job board</h1>
          <p className="text-muted-foreground">{effectiveJobs.length} active jobs</p>
        </div>
        <Button asChild>
          <Link href={`/g/${garageSlug}/check-in`}>+ Check in</Link>
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className={`${inputCls} w-full pl-9`}
            placeholder="Search job #, plate, customer…"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        <select className={inputCls} value={filters.mechanic} onChange={(e) => pushParams({ mechanic: e.target.value })} aria-label="Filter by mechanic">
          <option value="">All mechanics</option>
          {mechanics.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
        </select>
        <select className={inputCls} value={filters.priority} onChange={(e) => pushParams({ priority: e.target.value })} aria-label="Filter by priority">
          <option value="">All priorities</option>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <select className={inputCls} value={filters.branch} onChange={(e) => pushParams({ branch: e.target.value })} aria-label="Filter by branch">
          <option value="">All branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className={inputCls} value={filters.swimlane} onChange={(e) => pushParams({ swimlane: e.target.value })} aria-label="Swimlanes">
          <option value="">No lanes</option>
          <option value="branch">By branch</option>
          <option value="bay">By bay</option>
        </select>
        {activeFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setQ(""); router.replace(`/g/${garageSlug}/jobs`) }}>
            <X className="size-4" /> Clear
          </Button>
        )}
      </div>

      {toast && (
        <div className="rounded-lg border border-warning bg-warning/10 px-4 py-2.5 text-sm font-semibold text-warning-foreground">
          {toast}
        </div>
      )}

      {/* Board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex min-w-max gap-3">
          {statuses.map((status) => {
            const colJobs = swimlanes.flatMap((l) => l.jobs).filter((j) => j.status === status)
            return (
              <div
                key={status}
                className={`flex w-64 shrink-0 flex-col rounded-xl border bg-surface-muted/40 transition-colors ${COLUMN_TINT[status] ?? ""} ${
                  dragOver === status ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-transparent"
                }`}
                onDragOver={(e) => {
                  if (!canStatusUpdate) return
                  e.preventDefault()
                  setDragOver(status)
                }}
                onDragLeave={() => setDragOver((d) => (d === status ? null : d))}
                onDrop={(e) => {
                  e.preventDefault()
                  const jobId = e.dataTransfer.getData("text/job-id")
                  if (jobId) onDrop(jobId, status)
                }}
              >
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {COLUMN_LABEL[status]}
                  </span>
                  <span className="rounded-pill bg-surface px-2 py-0.5 text-xs font-semibold">{colJobs.length}</span>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2" style={{ maxHeight: "calc(100dvh - 320px)", minHeight: 120 }}>
                  {colJobs.map((j) => (
                    <JobCard
                      key={j.id}
                      job={j}
                      garageSlug={garageSlug}
                      swimlanes={swimlanes}
                      swimKey={swimKey}
                      canDrag={canStatusUpdate}
                    />
                  ))}
                  {colJobs.length === 0 && (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">Drop jobs here</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Swimlane view (optional second axis): renders lanes × statuses when enabled */}
      {swimKey && (
        <div className="space-y-6">
          {swimlanes.map((lane) => (
            <div key={lane.key}>
              <h2 className="mb-2 text-[15px] font-semibold">{lane.label}</h2>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {statuses.map((status) => {
                  const laneJobs = lane.jobs.filter((j) => j.status === status)
                  if (laneJobs.length === 0 && swimlanes.length > 3) return null
                  return (
                    <div key={status} className="w-56 shrink-0 rounded-lg border border-dashed border-border p-2">
                      <p className="mb-2 text-[10px] font-semibold text-muted-foreground">
                        {COLUMN_LABEL[status]} · {laneJobs.length}
                      </p>
                      <div className="space-y-2">
                        {laneJobs.map((j) => (
                          <JobCard key={j.id} job={j} garageSlug={garageSlug} swimlanes={swimlanes} swimKey={swimKey} canDrag={canStatusUpdate} compact />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function JobCard({
  job,
  garageSlug,
  swimlanes,
  swimKey,
  canDrag,
  compact,
}: {
  job: BoardJob
  garageSlug: string
  swimlanes: { key: string; label: string; jobs: BoardJob[] }[]
  swimKey: string
  canDrag: boolean
  compact?: boolean
}) {
  const cd = countdown(job.promisedAt)
  const vtype = BODY_TO_TYPE[job.bodyType ?? ""] ?? "sedan"
  // find lane label for this job
  const lane = swimKey
    ? swimlanes.find((l) =>
        swimKey === "branch" ? job.branchId === l.key : job.bayId === l.key
      )
    : null

  return (
    <Link
      href={`/g/${garageSlug}/jobs/${job.id}`}
      draggable={canDrag}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/job-id", job.id)
        e.dataTransfer.effectAllowed = "move"
      }}
      className={`block rounded-lg border border-border bg-card p-2.5 shadow-1 transition-all hover:shadow-pop ${job.priority === "urgent" ? "border-l-4 border-l-danger" : ""} ${compact ? "text-xs" : ""}`}
    >
      <div className="flex items-start gap-2">
        <CarAvatar type={vtype} color={job.colorHex ?? undefined} className="h-8 w-14 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-semibold">{job.number}</span>
            {job.priority !== "normal" && (
              <StatusPill tone={job.priority === "urgent" ? "danger" : "warning"}>{job.priority}</StatusPill>
            )}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold">
            <PlateChip plate={job.plateNumber} />
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            <User className="mr-0.5 inline size-3" />
            {job.customerName}
          </p>
        </div>
      </div>
      {job.complaint && !compact && (
        <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{job.complaint}</p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <span className="flex items-center gap-1 text-muted-foreground">
          <Car className="size-3" /> {job.vehicleLabel}
        </span>
        {cd && (
          <span className={`flex items-center gap-1 font-semibold ${cd.tone === "late" ? "text-danger" : cd.tone === "warn" ? "text-warning" : "text-muted-foreground"}`}>
            <Clock className="size-3" /> {cd.text}
          </span>
        )}
      </div>
      {(job.assignees.length > 0 || lane) && (
        <div className="mt-1.5 flex items-center gap-1">
          {job.assignees.slice(0, 3).map((a) => (
            <span key={a.userId} className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${a.isLead ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
              {a.name.split(" ")[0]}
            </span>
          ))}
          {lane && <span className="ml-auto text-[10px] text-muted-foreground">{lane.label}</span>}
        </div>
      )}
    </Link>
  )
}
