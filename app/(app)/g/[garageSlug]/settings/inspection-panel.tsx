"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { saveInspectionSettingsAction } from "@/lib/inspections/actions"

const ghs = (p: number) => `GH₵${(p / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`

export function InspectionSettingsPanel(props: {
  garageId: string
  offers: boolean
  pricePesewas: number
}) {
  const [pending, start] = useTransition()
  const [offers, setOffers] = useState(props.offers)
  const [cedis, setCedis] = useState(String(props.pricePesewas / 100))
  const [msg, setMsg] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function save(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      const price = Math.round(Number(cedis) * 100)
      if (!Number.isFinite(price) || price < 0) { setMsg("Enter a valid price"); return }
      const r = await saveInspectionSettingsAction({ garageId: props.garageId, offersInspections: offers, inspectionPrice: price })
      if (!r.ok) { setMsg(r.error); return }
      setMsg(null); setSaved(true)
    })
  }

  return (
    <form onSubmit={save} className="mt-3 space-y-4 rounded-2xl border border-border bg-card p-5">
      <label className="flex items-start gap-3 rounded-xl border border-border p-3.5">
        <input type="checkbox" checked={offers} onChange={(e) => { setOffers(e.target.checked); setSaved(false) }} className="mt-0.5 size-4 accent-primary" />
        <span>
          <span className="block text-sm font-semibold">Offer pre-purchase inspections</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">Drivers can book and pay for a ~120-point inspection from their portal.</span>
        </span>
      </label>
      <label className="block max-w-xs">
        <span className="text-sm font-semibold">Inspection fee (GH₵)</span>
        <input value={cedis} onChange={(e) => { setCedis(e.target.value); setSaved(false) }} inputMode="decimal" className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none focus:border-foreground" />
        <span className="mt-1 block text-xs text-muted-foreground">Drivers pay this upfront via MoMo or card. Current: {ghs(props.pricePesewas)}</span>
      </label>
      {msg && <p className="rounded-xl border border-danger/30 bg-danger-subtle px-4 py-3 text-sm font-medium text-danger">{msg}</p>}
      {saved && <p className="text-sm font-semibold text-success">Saved.</p>}
      <Button type="submit" loading={pending}>Save inspection settings</Button>
    </form>
  )
}
