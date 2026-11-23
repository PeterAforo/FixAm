"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { SPECIALTIES } from "@/lib/repair-requests/core"
import { saveGarageSpecialties } from "@/lib/repair-requests/actions"

/** Which repair-request leads reach this garage. None selected = general garage (all leads nearby). */
export function SpecialtiesPanel({ garageId, initial }: { garageId: string; initial: string[] }) {
  const [picked, setPicked] = useState<string[]>(initial)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap gap-1.5">
        {SPECIALTIES.map((s) => (
          <button key={s.id} type="button" onClick={() => setPicked((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))}
            className={`rounded-full border px-3 py-1 text-xs ${picked.includes(s.id) ? "border-foreground bg-foreground text-background" : "border-border"}`}>
            {s.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Leave all off to receive every nearby request. Vehicle coverage above also filters by make.</p>
      <div className="flex items-center gap-3">
        <Button variant="secondary" disabled={pending} onClick={() => startTransition(async () => {
          const r = await saveGarageSpecialties({ garageId, specialties: picked })
          setMsg(r.ok ? "Saved" : r.error)
        })}>Save specialties</Button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>
    </div>
  )
}
