"use client"

import { useRef, useState, useTransition } from "react"
import { Camera, Check, RotateCcw } from "lucide-react"
import { Button } from "@/components/brand/button"
import { confirmPhotoPart, identifyPartFromPhoto } from "@/lib/part-photo/actions"
import type { PartPhotoResult } from "@/lib/part-photo/service"
import { shrinkPhoto } from "./shrink"

type Picked = { id: string; name: string }

const COND: Record<PartPhotoResult["condition"], string | null> = {
  good: "Looks in good condition",
  worn: "Looks worn",
  damaged: "Looks damaged",
  unclear: null,
}

/**
 * P8-12: snap a part → FixAm suggests what it is. Sure → one tap to confirm;
 * unsure → pick from the top 5 or from the full list.
 */
export function PartPhotoScanner(props: {
  /** Garage job card: the car is taken from the job. */
  garageId?: string
  jobId?: string
  /** Driver: e.g. "2015 Toyota Corolla". */
  vehicle?: string
  allParts: { id: string; name: string }[]
  compact?: boolean
  onPicked: (part: Picked) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [result, setResult] = useState<PartPhotoResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [other, setOther] = useState("")
  const [pending, start] = useTransition()

  const reset = () => {
    setResult(null); setErr(null); setOther("")
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  const identify = (file: File) => {
    setErr(null); setResult(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(file))
    start(async () => {
      const small = await shrinkPhoto(file)
      const fd = new FormData()
      fd.set("photo", small)
      if (note.trim()) fd.set("note", note.trim())
      if (props.vehicle) fd.set("vehicle", props.vehicle)
      if (props.garageId) fd.set("garageId", props.garageId)
      if (props.jobId) fd.set("jobId", props.jobId)
      const r = await identifyPartFromPhoto(fd)
      if (r.ok) setResult(r.result)
      else setErr(r.error)
    })
  }

  const pick = (p: Picked) => {
    if (result?.scanId) void confirmPhotoPart({ scanId: result.scanId, partTypeId: p.id })
    props.onPicked(p)
    reset()
  }

  const top = result?.candidates[0]
  const condition = result ? COND[result.condition] : null

  return (
    <div className={props.compact ? "space-y-2" : "space-y-3"}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) identify(f) }}
      />

      {!result && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm"
            placeholder="Optional: what is it / where from? (e.g. front left, makes noise)"
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button size={props.compact ? "sm" : "md"} variant={props.compact ? "secondary" : "primary"} disabled={pending} onClick={() => fileRef.current?.click()}>
            <Camera className="size-4" /> {pending ? "Looking at it…" : "Snap the part"}
          </Button>
        </div>
      )}

      {preview && (pending || result) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Your photo" className={`rounded-lg border border-border object-cover ${props.compact ? "h-20 w-20" : "h-32 w-32"}`} />
      )}

      {err && <p className="text-sm text-red-700">{err}</p>}

      {result && (
        <div className="rounded-xl border border-border bg-card p-3">
          {result.notAPart ? (
            <p className="text-sm">That doesn&apos;t look like a car part. Try a closer, well-lit photo of the part on its own.</p>
          ) : result.sure && top ? (
            <>
              <p className="text-sm">This looks like <strong>{top.name}</strong> <span className="text-xs text-muted-foreground">({Math.round(top.confidence * 100)}% sure)</span></p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => pick({ id: top.id, name: top.name })}><Check className="size-4" /> Yes, that&apos;s it</Button>
                <Button size="sm" variant="ghost" onClick={() => setResult({ ...result, sure: false })}>No, something else</Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">{result.candidates.length ? "Which one is it?" : "We couldn't tell from the photo. Pick the part:"}</p>
              {result.candidates.length > 0 && (
                <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {result.candidates.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-surface-muted" onClick={() => pick({ id: c.id, name: c.name })}>
                        <span>{c.name}</span>
                        <span className="text-[11px] text-muted-foreground">{Math.round(c.confidence * 100)}%</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <label className="mt-2 block text-xs text-muted-foreground">
                None of these?
                <select className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm text-foreground" value={other}
                  onChange={(e) => { const p = props.allParts.find((x) => x.id === e.target.value); if (p) pick(p) }}>
                  <option value="">Choose from the full parts list…</option>
                  {props.allParts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            </>
          )}

          {!result.notAPart && (condition || result.partNumber || result.fitmentHint) && (
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {condition && <li>{condition}{result.conditionNote ? ` — ${result.conditionNote}` : ""}</li>}
              {result.partNumber && <li>Number on the part: <span className="font-mono">{result.partNumber}</span></li>}
              {result.fitmentHint && <li>{result.fitmentHint}</li>}
            </ul>
          )}
          <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline" onClick={reset}>
            <RotateCcw className="size-3" /> Try another photo
          </button>
        </div>
      )}
    </div>
  )
}
