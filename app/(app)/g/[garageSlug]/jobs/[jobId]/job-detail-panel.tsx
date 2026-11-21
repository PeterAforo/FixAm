"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Camera, CheckCircle2, PartyPopper, Plus, ShieldCheck, Upload } from "lucide-react"
import { motion } from "framer-motion"
import { statusBounce } from "@/components/brand/motion"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { PlateChip } from "@/components/brand/plate-chip"
import {
  addJobFinding,
  addJobItem,
  signOffQc,
  toggleJobTask,
  updateJobStatus,
  uploadJobMedia,
} from "@/lib/jobs/actions"
import type { JobStatus } from "@/lib/jobs/transitions"

const inputCls =
  "min-h-10 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
const labelCls = "text-xs font-bold uppercase tracking-wide text-muted-foreground"

const TABS = ["overview", "findings", "items", "tasks", "media", "timeline"] as const
type Tab = (typeof TABS)[number]

const STATUS_LABEL: Record<string, string> = {
  booked: "Booked", checked_in: "Checked in", diagnosing: "Diagnosing",
  estimate_sent: "Estimate sent", approved: "Approved", declined: "Declined",
  in_progress: "In progress", waiting_parts: "Waiting parts",
  quality_check: "Quality check", ready: "Ready", delivered: "Delivered",
  closed: "Closed", cancelled: "Cancelled",
}

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—"
  return new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}
function ghs(pesewas: number) {
  return `GH₵ ${(pesewas / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`
}

export function JobDetailPanel(props: {
  garageSlug: string
  garageId: string
  job: {
    id: string
    number: string
    status: JobStatus
    priority: string
    complaint: string | null
    checkInOdometerKm: number | null
    checkInFuelLevel: number | null
    checkInItems: string | null
    promisedAt: string | null
    checkedInAt: string | null
    readyAt: string | null
    deliveredAt: string | null
    internalNotes: string | null
    qcSignedOff: boolean
    isWarranty: boolean
    warrantyParentNumber: string | null
  }
  vehicle: { id: string; plateNumber: string; make: string; model: string; year: number | null } | null
  customer: { id: string; name: string; phone: string } | null
  branchName: string | null
  bayName: string | null
  assignments: { userId: string; name: string; isLead: boolean }[]
  findings: { id: string; title: string; description: string | null; severity: string; customerVisible: boolean; createdAt: string }[]
  items: { id: string; type: string; description: string; quantity: number; unitPrice: number; labourHours: number | null; approvalStatus: string | null }[]
  tasks: { id: string; title: string; isDone: boolean; required: boolean; checklistItem: boolean; assignedTo: string | null }[]
  media: { id: string; kind: string; stage: string | null; caption: string | null; storagePath: string; customerVisible: boolean; createdAt: string }[]
  events: { id: string; fromStatus: JobStatus | null; toStatus: JobStatus; note: string | null; customerVisible: boolean; actorName: string | null; createdAt: string }[]
  nextStatuses: JobStatus[]
  canUpdate: boolean
  canQcSignoff: boolean
  canStatusUpdate: boolean
  canAssign: boolean
  canMediaUpload: boolean
  canTasksUpdate: boolean
  currentUserId: string
  trackerUrl: string | null
}) {
  const {
    garageSlug, garageId, job, vehicle, customer, branchName, bayName,
    assignments, findings, items, tasks, media, events, nextStatuses,
    canUpdate, canQcSignoff, canStatusUpdate, canMediaUpload, canTasksUpdate, currentUserId, trackerUrl,
  } = props

  const router = useRouter()
  const [tab, setTab] = useState<Tab>("overview")
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  // forms
  const [finding, setFinding] = useState({ title: "", description: "", severity: "recommended" })
  const [item, setItem] = useState({ type: "labour", description: "", quantity: "1", unitPrice: "", labourHours: "" })
  const [mediaStage, setMediaStage] = useState("diagnosis")
  const fileRef = useRef<HTMLInputElement>(null)

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)

  function transition(to: JobStatus) {
    const note = to === "cancelled" ? window.prompt("Cancellation reason (optional):") ?? undefined : undefined
    if (to === "cancelled" && note === null) return
    setMsg(null)
    startTransition(async () => {
      const res = await updateJobStatus({ garageId, jobId: job.id, toStatus: to, note })
      if (!res.ok) {
        setMsg(res.error.message)
        return
      }
      router.refresh()
    })
  }

  function qc() {
    startTransition(async () => {
      await signOffQc({ garageId, jobId: job.id })
      router.refresh()
    })
  }

  function submitFinding() {
    if (!finding.title.trim()) return
    startTransition(async () => {
      const res = await addJobFinding({
        garageId,
        jobId: job.id,
        title: finding.title.trim(),
        description: finding.description || undefined,
        severity: finding.severity as "urgent" | "recommended" | "can_wait",
      })
      if (res.ok) {
        setFinding({ title: "", description: "", severity: "recommended" })
        router.refresh()
      } else setMsg(res.error.message)
    })
  }

  function submitItem() {
    const price = Math.round(Number(item.unitPrice) * 100)
    if (!item.description.trim() || !Number.isFinite(price) || price < 0) {
      setMsg("Description and a valid price (GH₵) are required")
      return
    }
    startTransition(async () => {
      const res = await addJobItem({
        garageId,
        jobId: job.id,
        type: item.type as "labour" | "part" | "sundry" | "service_fee",
        description: item.description.trim(),
        quantity: Number(item.quantity) || 1,
        unitPrice: price,
        labourHours: item.labourHours ? Number(item.labourHours) : undefined,
      })
      if (res.ok) {
        setItem({ type: "labour", description: "", quantity: "1", unitPrice: "", labourHours: "" })
        router.refresh()
      } else setMsg(res.error.message)
    })
  }

  function toggleTask(taskId: string, isDone: boolean) {
    startTransition(async () => {
      await toggleJobTask({ garageId, taskId, isDone })
      router.refresh()
    })
  }

  function submitMedia() {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setMsg("Choose a file")
      return
    }
    startTransition(async () => {
      const fd = new FormData()
      fd.set("garageId", garageId)
      fd.set("jobId", job.id)
      fd.set("kind", file.type.startsWith("video/") ? "video" : "photo")
      fd.set("stage", mediaStage)
      fd.set("file", file)
      const res = await uploadJobMedia(fd)
      if (!res.ok) setMsg(res.error.message)
      else if (fileRef.current) fileRef.current.value = ""
      router.refresh()
    })
  }

  const mediaUrl = (path: string) => `/api/dev-storage/${encodeURIComponent(path)}`

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/g/${garageSlug}/jobs`} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
            ← Job board
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 font-display text-3xl font-bold">
            <span className="font-mono">{job.number}</span>
            <StatusPill status={job.status} />
            {job.priority !== "normal" && <StatusPill tone={job.priority === "urgent" ? "danger" : "warning"}>{job.priority}</StatusPill>}
            {job.isWarranty && <StatusPill tone="info">warranty</StatusPill>}
          </h1>
          {job.warrantyParentNumber && (
            <p className="mt-1 text-xs text-muted-foreground">
              Comeback of <Link href={`/g/${garageSlug}/jobs`} className="font-semibold text-foreground hover:underline">{job.warrantyParentNumber}</Link>
            </p>
          )}
          <p className="mt-1 text-muted-foreground">
            {vehicle && (
              <Link href={`/g/${garageSlug}/vehicles/${vehicle.id}`} className="font-semibold text-foreground hover:underline">
                <PlateChip plate={vehicle.plateNumber} /> {vehicle.make} {vehicle.model}
              </Link>
            )}
            {" · "}
            {customer && (
              <Link href={`/g/${garageSlug}/customers/${customer.id}`} className="hover:underline">
                {customer.name}
              </Link>
            )}
            {" · "}{branchName}{bayName ? ` · Bay ${bayName}` : ""}
          </p>
        </div>

        {canStatusUpdate && nextStatuses.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {nextStatuses.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === "cancelled" || s === "declined" ? "ghost" : s === "ready" || s === "delivered" || s === "closed" ? "secondary" : "primary"}
                disabled={pending}
                onClick={() => transition(s)}
              >
                {s === "ready" && !job.qcSignedOff ? "QC sign-off first" : `→ ${STATUS_LABEL[s] ?? s.replace(/_/g, " ")}`}
              </Button>
            ))}
          </div>
        )}
      </header>

      {trackerUrl && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-info bg-info/10 px-4 py-3">
          <p className="text-sm font-semibold">Customer tracker link:</p>
          <code className="break-all text-xs">{trackerUrl}</code>
          <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(trackerUrl)}>Copy</Button>
        </div>
      )}

      {msg && <p className="rounded-lg border-2 border-danger bg-danger/10 px-4 py-2 text-sm font-semibold text-danger">{msg}</p>}

      {job.status === "ready" && (
        <motion.div
          variants={statusBounce}
          initial="initial"
          animate="animate"
          className="flex items-center gap-3 rounded-xl border-2 border-success bg-success/10 px-4 py-3"
        >
          <PartyPopper className="size-5 text-success" />
          <p className="text-sm font-bold text-success">Ready for pickup — the customer has been notified.</p>
        </motion.div>
      )}

      {job.status === "quality_check" && !job.qcSignedOff && canQcSignoff && (
        <div className="flex items-center justify-between rounded-xl border-2 border-warning bg-warning/10 px-4 py-3">
          <p className="text-sm text-muted-foreground">Run through the QC checklist, then sign off to unlock <b>Ready</b>.</p>
          <Button size="sm" variant="secondary" disabled={pending} onClick={qc}>
            <ShieldCheck className="size-4" /> Sign off QC
          </Button>
        </div>
      )}

      {!job.qcSignedOff && ["quality_check", "ready"].includes(job.status) === false && canQcSignoff && job.status !== "closed" && job.status !== "cancelled" && job.status !== "delivered" && (
        <div className="flex items-center justify-between rounded-xl border-2 border-border bg-surface-muted/50 px-4 py-3">
          <p className="text-sm text-muted-foreground">QC sign-off unlocks the <b>Ready</b> transition.</p>
          <Button size="sm" variant="secondary" disabled={pending} onClick={qc}>
            <ShieldCheck className="size-4" /> Sign off QC
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b-2 border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-bold capitalize ${tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="font-display text-lg font-bold">Complaint</h2>
              <p className="text-sm">{job.complaint ?? "—"}</p>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Odometer in</dt><dd className="font-semibold">{job.checkInOdometerKm?.toLocaleString() ?? "—"} km</dd>
                <dt className="text-muted-foreground">Fuel</dt><dd className="font-semibold">{job.checkInFuelLevel != null ? `${job.checkInFuelLevel}%` : "—"}</dd>
                <dt className="text-muted-foreground">Checked in</dt><dd className="font-semibold">{fmtDate(job.checkedInAt)}</dd>
                <dt className="text-muted-foreground">Promised</dt><dd className="font-semibold">{fmtDate(job.promisedAt)}</dd>
                <dt className="text-muted-foreground">Items in car</dt><dd className="font-semibold">{job.checkInItems ?? "—"}</dd>
              </dl>
              {assignments.length > 0 && (
                <div>
                  <p className={labelCls}>Assigned</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {assignments.map((a) => (
                      <span key={a.userId} className="rounded-pill border-2 border-border bg-surface-muted px-2.5 py-1 text-xs font-bold">
                        {a.name}{a.isLead ? " ★" : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h2 className="font-display text-lg font-bold">Estimate ({items.length} lines)</h2>
              {items.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No items yet — add parts, labour and fees on the Items tab.</p>
              ) : (
                <ul className="mt-3 space-y-1.5 text-sm">
                  {items.slice(0, 8).map((i) => (
                    <li key={i.id} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">{i.description} <span className="text-muted-foreground">×{i.quantity}</span></span>
                      <span className="font-semibold">{ghs(i.unitPrice * i.quantity)}</span>
                    </li>
                  ))}
                  {items.length > 8 && <li className="text-xs text-muted-foreground">+{items.length - 8} more</li>}
                  <li className="flex justify-between border-t-2 border-border pt-2 font-bold">
                    <span>Subtotal</span><span>{ghs(subtotal)}</span>
                  </li>
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "findings" && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="font-display text-lg font-bold">Findings</h2>
            {canUpdate && (
              <div className="grid gap-2 rounded-xl border-2 border-dashed border-border p-3 sm:grid-cols-[1fr_1fr_auto]">
                <input className={inputCls} placeholder="Finding title *" value={finding.title} onChange={(e) => setFinding({ ...finding, title: e.target.value })} />
                <input className={inputCls} placeholder="Details" value={finding.description} onChange={(e) => setFinding({ ...finding, description: e.target.value })} />
                <div className="flex gap-2">
                  <select className={inputCls} value={finding.severity} onChange={(e) => setFinding({ ...finding, severity: e.target.value })}>
                    <option value="urgent">Urgent</option>
                    <option value="recommended">Recommended</option>
                    <option value="can_wait">Can wait</option>
                  </select>
                  <Button size="sm" disabled={pending} onClick={submitFinding}><Plus className="size-4" /></Button>
                </div>
              </div>
            )}
            {findings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No findings recorded.</p>
            ) : (
              <ul className="space-y-2">
                {findings.map((f) => (
                  <li key={f.id} className="rounded-lg border-2 border-border p-3">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{f.title}</p>
                      <StatusPill tone={f.severity === "urgent" ? "danger" : f.severity === "recommended" ? "warning" : "neutral"}>{f.severity.replace(/_/g, " ")}</StatusPill>
                      {!f.customerVisible && <StatusPill tone="neutral">internal</StatusPill>}
                    </div>
                    {f.description && <p className="mt-1 text-sm text-muted-foreground">{f.description}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "items" && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Job items</h2>
              <span className="text-sm font-bold">{ghs(subtotal)}</span>
            </div>
            {canUpdate && (
              <div className="grid gap-2 rounded-xl border-2 border-dashed border-border p-3 sm:grid-cols-[110px_1fr_80px_110px_90px_auto]">
                <select className={inputCls} value={item.type} onChange={(e) => setItem({ ...item, type: e.target.value })}>
                  <option value="labour">Labour</option>
                  <option value="part">Part</option>
                  <option value="sundry">Sundry</option>
                  <option value="service_fee">Service fee</option>
                </select>
                <input className={inputCls} placeholder="Description *" value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} />
                <input className={inputCls} type="number" min={0} step="0.25" placeholder="Qty" value={item.quantity} onChange={(e) => setItem({ ...item, quantity: e.target.value })} />
                <input className={inputCls} type="number" min={0} step="0.01" placeholder="Price GH₵" value={item.unitPrice} onChange={(e) => setItem({ ...item, unitPrice: e.target.value })} />
                <input className={inputCls} type="number" min={0} step="0.25" placeholder="Hours" value={item.labourHours} onChange={(e) => setItem({ ...item, labourHours: e.target.value })} />
                <Button size="sm" disabled={pending} onClick={submitItem}><Plus className="size-4" /></Button>
              </div>
            )}
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No items yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2">Item</th><th>Type</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Total</th><th>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td className="py-2 pr-3">{i.description}</td>
                      <td className="text-muted-foreground">{i.type.replace(/_/g, " ")}</td>
                      <td className="text-right">{i.quantity}</td>
                      <td className="text-right">{ghs(i.unitPrice)}</td>
                      <td className="text-right font-semibold">{ghs(i.unitPrice * i.quantity)}</td>
                      <td><StatusPill status={i.approvalStatus ?? "pending"} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "tasks" && (
        <Card>
          <CardContent className="p-5">
            <h2 className="font-display text-lg font-bold">Tasks &amp; checklist</h2>
            {tasks.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No tasks — pick a template at check-in to generate the checklist.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {tasks.map((t) => {
                  const canToggle = canTasksUpdate || (t.assignedTo === currentUserId)
                  return (
                    <li key={t.id}>
                      <button
                        className="flex w-full items-center gap-3 rounded-lg border-2 border-border px-3 py-2.5 text-left hover:bg-surface-muted/60 disabled:opacity-60"
                        disabled={!canToggle || pending}
                        onClick={() => toggleTask(t.id, !t.isDone)}
                      >
                        <span className={`flex size-6 shrink-0 items-center justify-center rounded-md border-2 ${t.isDone ? "border-success bg-success text-success-foreground" : "border-border"}`}>
                          {t.isDone && <CheckCircle2 className="size-4" />}
                        </span>
                        <span className={`flex-1 text-sm font-semibold ${t.isDone ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
                        {t.required && <StatusPill tone="warning">required</StatusPill>}
                        {t.checklistItem && <StatusPill tone="neutral">checklist</StatusPill>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "media" && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="font-display text-lg font-bold">Photos &amp; media</h2>
            {canMediaUpload && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-dashed border-border p-3">
                <select className={`${inputCls} w-auto`} value={mediaStage} onChange={(e) => setMediaStage(e.target.value)}>
                  <option value="check_in">Check-in</option>
                  <option value="diagnosis">Diagnosis</option>
                  <option value="repair">Repair</option>
                  <option value="qc">QC</option>
                  <option value="delivery">Delivery</option>
                </select>
                <input ref={fileRef} type="file" accept="image/*,video/*" className="min-w-0 flex-1 text-xs" aria-label="Media file" />
                <Button size="sm" variant="secondary" disabled={pending} onClick={submitMedia}>
                  <Upload className="size-4" /> Upload
                </Button>
              </div>
            )}
            {media.length === 0 ? (
              <p className="text-sm text-muted-foreground">No media yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {media.map((m) => (
                  <figure key={m.id} className="overflow-hidden rounded-lg border-2 border-border">
                    {m.kind === "photo" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl(m.storagePath)} alt={m.caption ?? "Job photo"} className="aspect-[4/3] w-full object-cover" />
                    ) : (
                      <div className="flex aspect-[4/3] items-center justify-center bg-surface-muted text-xs text-muted-foreground">{m.kind}</div>
                    )}
                    <figcaption className="px-2 py-1.5 text-[11px] text-muted-foreground">
                      {m.stage?.replace(/_/g, " ")}{m.caption ? ` · ${m.caption}` : ""}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "timeline" && (
        <Card>
          <CardContent className="p-5">
            <h2 className="font-display text-lg font-bold">Status timeline</h2>
            {events.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No events.</p>
            ) : (
              <ol className="mt-4 space-y-0">
                {events.map((e, i) => (
                  <li key={e.id} className="flex gap-3 pb-4 last:pb-0">
                    <div className="flex flex-col items-center">
                      <span className="mt-1 size-2.5 rounded-full bg-primary" />
                      {i < events.length - 1 && <span className="w-0.5 flex-1 bg-border" />}
                    </div>
                    <div className="min-w-0 flex-1 pb-1">
                      <p className="text-sm font-semibold">
                        {e.fromStatus ? `${STATUS_LABEL[e.fromStatus] ?? e.fromStatus} → ` : ""}
                        {STATUS_LABEL[e.toStatus] ?? e.toStatus.replace(/_/g, " ")}
                      </p>
                      {e.note && <p className="text-xs text-muted-foreground">{e.note}</p>}
                      <p className="text-[11px] text-muted-foreground">
                        {fmtDate(e.createdAt)}{e.actorName ? ` · ${e.actorName}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      )}

      {/* internal notes quick add could go here; kept minimal */}
      <p className="sr-only"><Camera className="size-4" /></p>
    </div>
  )
}
