"use client"

import { useState, useTransition } from "react"
import { saveWorkshopRules } from "@/lib/jobs/settings-actions"

export function WorkshopRulesPanel({ garageId, requireOldPartProof }: { garageId: string; requireOldPartProof: boolean }) {
  const [on, setOn] = useState(requireOldPartProof)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <label className="mt-3 flex items-start gap-3 rounded-xl border border-border bg-card p-4">
      <input type="checkbox" className="mt-1" checked={on} disabled={pending}
        onChange={(e) => {
          const v = e.target.checked
          setOn(v)
          startTransition(async () => {
            const r = await saveWorkshopRules({ garageId, requireOldPartProof: v })
            setMsg(r.ok ? "Saved" : r.error)
          })
        }} />
      <span>
        <span className="block text-sm font-semibold">Proof of replaced parts before invoicing</span>
        <span className="block text-xs text-muted-foreground">
          Each part line needs a photo of the old part, &ldquo;customer took it&rdquo;, or &ldquo;not a replacement&rdquo; before the invoice can be issued. Customers see the old-part photos on their tracker — it builds trust.
        </span>
        {msg && <span className="mt-1 block text-xs">{msg}</span>}
      </span>
    </label>
  )
}
