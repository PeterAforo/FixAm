"use client"

import { useCallback, useEffect, useRef, useState, useTransition, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/brand/card"
import { Button } from "@/components/brand/button"
import { PlateChip } from "@/components/brand/plate-chip"
import { StatusPill } from "@/components/brand/status-pill"
import { addJobFinding, toggleJobTask, updateJobStatus } from "@/lib/jobs/actions"
import { getOpenTimer, startTimeLog, stopTimeLog } from "@/lib/jobs/time-actions"
import { enqueue, isOnline, newClientId, readQueue, removeFromQueue, writeQueue } from "@/lib/offline/queue"

type Task = { id: string; title: string; isDone: boolean; required: boolean; checklistItem: boolean }
type Finding = { id: string; title: string; description: string | null; severity: string | null }
type Item = { id: string; description: string; type: string; quantity: number }

type Props = {
  garageSlug: string
  garageId: string
  job: {
    id: string
    number: string
    status: string
    complaint: string | null
    checkInOdometerKm: number | null
    checkInItems: unknown
    promisedAt: string | null
  }
  vehicle: { id: string; plateNumber: string; make: string; model: string } | null
  customer: { id: string; name: string } | null
  assignees: { name: string; isLead: boolean }[]
  tasks: Task[]
  findings: Finding[]
  items: Item[]
  openTimer: { id: string; startedAt: string } | null
}

function fmtElapsed(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

export function MechanicJobPanel(p: Props) {
  const router = useRouter()
  const [tasks, setTasks] = useState(p.tasks)
  const [findings, setFindings] = useState(p.findings)
  const [timerStart, setTimerStart] = useState<string | null>(p.openTimer?.startedAt ?? null)
  const [timerId, setTimerId] = useState<string | null>(p.openTimer?.id ?? null)
  const [elapsed, setElapsed] = useState(0)
  const [pending, startTransition] = useTransition()
  const [findingTitle, setFindingTitle] = useState("")
  const [findingDesc, setFindingDesc] = useState("")
  const [offlineCount, setOfflineCount] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refreshQueueCount = useCallback(() => setOfflineCount(readQueue(p.garageId).length), [p.garageId])

  async function flushQueue() {
    if (!isOnline()) return
    const items = readQueue(p.garageId)
    for (const q of items) {
      try {
        switch (q.kind) {
          case "toggleTask":
            await toggleJobTask({ garageId: p.garageId, taskId: q.payload.taskId as string, isDone: q.payload.isDone as boolean })
            break
          case "startTimer":
            await startTimeLog({ garageId: p.garageId, jobId: p.job.id, clientId: q.payload.clientId as string })
            break
          case "stopTimer":
            await stopTimeLog({ garageId: p.garageId, timeLogId: q.payload.timeLogId as string })
            break
          case "addFinding":
            await addJobFinding({ garageId: p.garageId, jobId: p.job.id, title: q.payload.title as string, description: (q.payload.description as string) || undefined })
            break
          case "jobStatus":
            await updateJobStatus({ garageId: p.garageId, jobId: p.job.id, toStatus: q.payload.status as never })
            break
        }
        removeFromQueue(p.garageId, q.id)
      } catch {
        // leave queued; bump attempts
        const all = readQueue(p.garageId)
        writeQueue(p.garageId, all.map((x) => (x.id === q.id ? { ...x, attempts: x.attempts + 1 } : x)))
        break
      }
    }
    refreshQueueCount()
  }

  useEffect(() => {
    const init = setTimeout(refreshQueueCount, 0)
    const onOnline = () => { void flushQueue().finally(refreshQueueCount) }
    window.addEventListener("online", onOnline)
    return () => {
      clearTimeout(init)
      window.removeEventListener("online", onOnline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.garageId])

  useEffect(() => {
    if (!timerStart) return
    const t0 = new Date(timerStart).getTime()
    const update = () => setElapsed(Date.now() - t0)
    const first = setTimeout(update, 0)
    tickRef.current = setInterval(update, 1000)
    return () => {
      clearTimeout(first)
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [timerStart])

  function toggleTask(task: Task) {
    const next = !task.isDone
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, isDone: next } : t)))
    if (isOnline()) {
      startTransition(async () => {
        const res = await toggleJobTask({ garageId: p.garageId, taskId: task.id, isDone: next })
        if (!res.ok) { setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, isDone: task.isDone } : t))); setMsg(res.error.message) }
      })
    } else {
      enqueue(p.garageId, "toggleTask", { taskId: task.id, isDone: next })
      refreshQueueCount()
      setMsg("Saved offline — will sync")
    }
  }

  async function startTimer() {
    const clientId = timerId ? `resume-${timerId}` : newClientId()
    if (isOnline()) {
      const res = await startTimeLog({ garageId: p.garageId, jobId: p.job.id, clientId })
      if (res.ok) {
        const opened = await getOpenTimer({ garageId: p.garageId, jobId: p.job.id })
        if (opened.ok && opened.data) {
          setTimerId(opened.data.timeLogId)
          setTimerStart(opened.data.startedAt)
        } else {
          setTimerStart(new Date().toISOString())
        }
      } else setMsg(res.error.message)
    } else {
      enqueue(p.garageId, "startTimer", { clientId })
      setTimerStart(new Date().toISOString())
      refreshQueueCount()
      setMsg("Timer started offline")
    }
  }

  async function stopTimer() {
    if (!timerId) return
    if (isOnline()) {
      const res = await stopTimeLog({ garageId: p.garageId, timeLogId: timerId })
      if (res.ok) { setTimerStart(null); setTimerId(null) }
      else setMsg(res.error.message)
    } else {
      enqueue(p.garageId, "stopTimer", { timeLogId: timerId })
      setTimerStart(null)
      setTimerId(null)
      refreshQueueCount()
      setMsg("Timer stopped — will sync")
    }
  }

  function submitFinding() {
    if (!findingTitle.trim()) return
    const title = findingTitle.trim()
    const desc = findingDesc.trim() || undefined
    const optimistic: Finding = { id: `tmp-${Date.now()}`, title, description: desc ?? null, severity: null }
    setFindings((f) => [...f, optimistic])
    setFindingTitle(""); setFindingDesc("")
    if (isOnline()) {
      startTransition(async () => {
        const res = await addJobFinding({ garageId: p.garageId, jobId: p.job.id, title, description: desc })
        if (!res.ok) { setFindings((f) => f.filter((x) => x.id !== optimistic.id)); setMsg(res.error.message) }
        else router.refresh()
      })
    } else {
      enqueue(p.garageId, "addFinding", { title, description: desc })
      refreshQueueCount()
      setMsg("Finding saved offline")
    }
  }

  function moveToQc() {
    if (!isOnline()) {
      enqueue(p.garageId, "jobStatus", { status: "quality_check" })
      refreshQueueCount()
      setMsg("Will move to QC when back online")
      return
    }
    startTransition(async () => {
      const res = await updateJobStatus({ garageId: p.garageId, jobId: p.job.id, toStatus: "quality_check" })
      if (res.ok) { setMsg("Moved to quality check"); router.refresh() }
      else setMsg(res.error.message)
    })
  }

  const canQc = ["in_progress", "waiting_parts", "approved"].includes(p.job.status)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em]">{p.job.number}</h1>
          <p className="text-sm text-muted-foreground">
            {p.vehicle && <><PlateChip plate={p.vehicle.plateNumber} /> {p.vehicle.make} {p.vehicle.model}</>}
            {p.customer && <> · {p.customer.name}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={p.job.status} />
          {!isOnline() && <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-600">Offline</span>}
          {offlineCount > 0 && <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">{offlineCount} queued</span>}
        </div>
      </header>

      {msg && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{msg}</p>}

      {p.job.complaint && (
        <Card><CardContent className="p-4"><p className="text-sm font-medium">Complaint</p><p className="text-sm text-muted-foreground">{p.job.complaint}</p></CardContent></Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Timer</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-4">
          <span className="font-mono text-3xl font-semibold tabular-nums">{fmtElapsed(elapsed)}</span>
          {timerStart ? (
            <Button onClick={stopTimer} disabled={pending}>Stop</Button>
          ) : (
            <Button onClick={startTimer}>Start timer</Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Checklist</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {tasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks for this job.</p>}
          {tasks.map((t) => (
            <button
              key={t.id}
              onClick={() => toggleTask(t)}
              disabled={pending}
              className="flex min-h-[48px] w-full items-center gap-3 rounded-lg border px-3 text-left text-sm transition-colors hover:bg-muted/50"
            >
              <span className={`flex h-6 w-6 items-center justify-center rounded border text-xs ${t.isDone ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/40"}`}>
                {t.isDone ? "✓" : ""}
              </span>
              <span className={t.isDone ? "text-muted-foreground line-through" : ""}>{t.title}</span>
              {t.required && <span className="ml-auto text-[10px] font-semibold text-muted-foreground">required</span>}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Findings</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {findings.map((f) => (
            <div key={f.id} className="rounded-lg border p-3 text-sm">
              <p className="font-semibold">{f.title}</p>
              {f.description && <p className="mt-1 text-muted-foreground">{f.description}</p>}
            </div>
          ))}
          <div className="space-y-2 border-t pt-3">
            <input
              value={findingTitle}
              onChange={(e) => setFindingTitle(e.target.value)}
              placeholder="Finding title"
              className="min-h-[48px] w-full rounded-lg border bg-background px-3 text-sm"
            />
            <textarea
              value={findingDesc}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setFindingDesc(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
            <Button onClick={submitFinding} disabled={pending || !findingTitle.trim()} className="min-h-[48px]">Add finding</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Job items</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {p.items.length === 0 && <p className="text-muted-foreground">No items yet.</p>}
          {p.items.map((i) => (
            <div key={i.id} className="flex justify-between gap-2">
              <span>{i.description}</span>
              <span className="text-muted-foreground">{i.type} ×{i.quantity}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {canQc && (
        <Button onClick={moveToQc} disabled={pending} className="min-h-[48px] w-full">
          Mark done — send to quality check
        </Button>
      )}
    </div>
  )
}
