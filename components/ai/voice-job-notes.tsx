"use client"

import { useState, useTransition } from "react"
import { Sparkles, Trash2 } from "lucide-react"
import { Button } from "@/components/brand/button"
import { VoiceNoteButton } from "./voice-note-button"
import { draftJobFromNotes, saveJobDraft, type JobDraft } from "@/lib/jobs/voice-actions"

const inputCls = "min-h-9 w-full rounded-lg border border-input bg-surface px-2.5 text-sm outline-none focus:border-foreground"

/**
 * Mechanic speaks (or types) job notes → AI drafts findings, tasks, parts and
 * labour → mechanic edits/ticks → only confirmed entries are saved.
 */
export function VoiceJobNotes({ garageId, jobId, onSaved }: { garageId: string; jobId: string; onSaved?: (msg: string) => void }) {
  const [notes, setNotes] = useState("")
  const [draft, setDraft] = useState<JobDraft | null>(null)
  const [keep, setKeep] = useState<Record<string, boolean>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function makeDraft() {
    setMsg(null)
    startTransition(async () => {
      const r = await draftJobFromNotes({ garageId, jobId, notes })
      if (!r.ok) return setMsg(r.error)
      if (!r.draft.findings.length && !r.draft.tasks.length && !r.draft.parts.length && !r.draft.labour.length) return setMsg("Nothing to add from that note — try describing what you found and what needs doing.")
      setDraft(r.draft)
      const k: Record<string, boolean> = {}
      r.draft.findings.forEach((_, i) => (k[`f${i}`] = true))
      r.draft.tasks.forEach((_, i) => (k[`t${i}`] = true))
      r.draft.parts.forEach((_, i) => (k[`p${i}`] = true))
      r.draft.labour.forEach((_, i) => (k[`l${i}`] = true))
      setKeep(k)
    })
  }

  function save() {
    if (!draft) return
    startTransition(async () => {
      const r = await saveJobDraft({
        garageId,
        jobId,
        findings: draft.findings.filter((_, i) => keep[`f${i}`]),
        tasks: draft.tasks.filter((_, i) => keep[`t${i}`]),
        parts: draft.parts.filter((_, i) => keep[`p${i}`]).map((p) => ({ description: p.description, quantity: p.quantity, partTypeId: p.partTypeId })),
        labour: draft.labour.filter((_, i) => keep[`l${i}`]),
      })
      if (!r.ok) return setMsg(r.error)
      const text = `Saved ${r.saved} item${r.saved === 1 ? "" : "s"} to the job card. Parts are added at GH₵0 for the advisor to price.`
      setDraft(null)
      setNotes("")
      setMsg(text)
      onSaved?.(text)
    })
  }

  const row = (key: string, children: React.ReactNode, onRemove: () => void) => (
    <li key={key} className={`flex items-start gap-2 rounded-lg border px-2 py-1.5 ${keep[key] ? "border-border bg-card" : "border-dashed border-border opacity-50"}`}>
      <input type="checkbox" className="mt-2" checked={Boolean(keep[key])} onChange={(e) => setKeep({ ...keep, [key]: e.target.checked })} aria-label="Keep" />
      <div className="min-w-0 flex-1">{children}</div>
      <button type="button" className="mt-1.5 text-muted-foreground" onClick={onRemove} aria-label="Skip"><Trash2 className="size-4" /></button>
    </li>
  )

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="size-4" /> Talk through the job</p>
      {!draft && (
        <>
          <VoiceNoteButton garageId={garageId} defaultLanguage="tw" onResult={(v) => setNotes((n) => (n ? `${n} ${v.english}` : v.english))} />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputCls} py-2`}
            placeholder="e.g. Front brake pads worn, replace both. Brake fluid low, bleed the brakes. Rear shock leaking. About 2 hours labour." />
          <Button size="sm" disabled={pending || notes.trim().length < 5} onClick={makeDraft}>{pending ? "Drafting…" : "Draft job card"}</Button>
        </>
      )}
      {draft && (
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">Check and edit — nothing is saved until you tap Save.</p>
          {draft.findings.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Findings</p>
              <ul className="mt-1 space-y-1">
                {draft.findings.map((f, i) =>
                  row(`f${i}`, (
                    <div className="grid gap-1 sm:grid-cols-[1fr_120px_120px]">
                      <input className={inputCls} value={f.title} onChange={(e) => setDraft({ ...draft, findings: draft.findings.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                      <select className={inputCls} value={f.severity} onChange={(e) => setDraft({ ...draft, findings: draft.findings.map((x, j) => (j === i ? { ...x, severity: e.target.value as typeof f.severity } : x)) })}>
                        <option value="urgent">Urgent</option><option value="recommended">Recommended</option><option value="can_wait">Can wait</option>
                      </select>
                      <select className={inputCls} value={f.recommendation} onChange={(e) => setDraft({ ...draft, findings: draft.findings.map((x, j) => (j === i ? { ...x, recommendation: e.target.value as typeof f.recommendation } : x)) })}>
                        <option value="replace">Replace</option><option value="repair">Repair</option><option value="monitor">Monitor</option>
                      </select>
                    </div>
                  ), () => setKeep((k) => ({ ...k, [`f${i}`]: false })))
                )}
              </ul>
            </div>
          )}
          {draft.tasks.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Tasks</p>
              <ul className="mt-1 space-y-1">
                {draft.tasks.map((t, i) =>
                  row(`t${i}`, <input className={inputCls} value={t.title} onChange={(e) => setDraft({ ...draft, tasks: draft.tasks.map((x, j) => (j === i ? { title: e.target.value } : x)) })} />, () => setKeep((k) => ({ ...k, [`t${i}`]: false })))
                )}
              </ul>
            </div>
          )}
          {draft.parts.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Parts</p>
              <ul className="mt-1 space-y-1">
                {draft.parts.map((p, i) =>
                  row(`p${i}`, (
                    <div className="grid gap-1 sm:grid-cols-[1fr_80px]">
                      <input className={inputCls} value={p.description} onChange={(e) => setDraft({ ...draft, parts: draft.parts.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} />
                      <input className={inputCls} type="number" min={0.25} step="0.25" value={p.quantity} onChange={(e) => setDraft({ ...draft, parts: draft.parts.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) || 1 } : x)) })} />
                      {p.partTypeName && <span className="text-[11px] text-muted-foreground">Matched: {p.partTypeName} — offers will show on the job card</span>}
                    </div>
                  ), () => setKeep((k) => ({ ...k, [`p${i}`]: false })))
                )}
              </ul>
            </div>
          )}
          {draft.labour.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Labour</p>
              <ul className="mt-1 space-y-1">
                {draft.labour.map((l, i) =>
                  row(`l${i}`, (
                    <div className="grid gap-1 sm:grid-cols-[1fr_80px]">
                      <input className={inputCls} value={l.description} onChange={(e) => setDraft({ ...draft, labour: draft.labour.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} />
                      <input className={inputCls} type="number" min={0} step="0.25" value={l.hours} onChange={(e) => setDraft({ ...draft, labour: draft.labour.map((x, j) => (j === i ? { ...x, hours: Number(e.target.value) || 0 } : x)) })} />
                    </div>
                  ), () => setKeep((k) => ({ ...k, [`l${i}`]: false })))
                )}
              </ul>
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={pending || !Object.values(keep).some(Boolean)} onClick={save}>Save selected</Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => setDraft(null)}>Discard</Button>
          </div>
        </div>
      )}
      {msg && <p className="text-xs font-medium">{msg}</p>}
    </div>
  )
}
