"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { bookAndPayInspectionAction } from "@/lib/inspections/actions"

type Garage = { id: string; name: string; city: string | null; address: string | null; phone: string | null; price: number }

const ghs = (p: number) => `GH₵${(p / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`
const input = "min-h-11 w-full rounded-xl border border-input bg-card px-3.5 text-sm outline-none focus:border-foreground"

export function InspectionBookingForm({ garages }: { garages: Garage[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [garageId, setGarageId] = useState(garages[0]?.id ?? "")
  const [locationKind, setLocationKind] = useState<"seller" | "garage">("garage")
  const [channel, setChannel] = useState<"card" | "momo">("momo")
  const [network, setNetwork] = useState<"mtn" | "telecel" | "airteltigo">("mtn")
  const [f, setF] = useState({
    make: "", model: "", year: "", plate: "", vin: "", mileageKm: "",
    sellerName: "", sellerPhone: "", sellerAddress: "", scheduledAt: "", notes: "",
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }))

  const garage = garages.find((g) => g.id === garageId)

  function pay(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    start(async () => {
      const res = await bookAndPayInspectionAction({
        garageId,
        locationKind,
        vehicle: {
          make: f.make || undefined, model: f.model || undefined, year: f.year || undefined,
          plate: f.plate || undefined, vin: f.vin || undefined,
          mileageKm: f.mileageKm ? Number(f.mileageKm) : undefined,
        },
        sellerName: f.sellerName || undefined,
        sellerPhone: f.sellerPhone || undefined,
        sellerAddress: f.sellerAddress || undefined,
        scheduledAt: f.scheduledAt ? new Date(f.scheduledAt).toISOString() : undefined,
        notes: f.notes || undefined,
      }, channel, channel === "momo" ? network : undefined)
      if (!res.ok) { setMsg(res.error); return }
      if ("checkoutUrl" in res && res.checkoutUrl) { window.location.href = res.checkoutUrl; return }
      setMsg(res.displayText ?? "Check your phone to approve the MoMo prompt.")
      router.refresh()
    })
  }

  if (!garages.length) {
    return <p className="mt-4 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No garages are offering inspections yet — check back soon.</p>
  }

  return (
    <form onSubmit={pay} className="mt-4 space-y-5 rounded-2xl border border-border bg-card p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-sm font-semibold">Garage</span>
          <select value={garageId} onChange={(e) => setGarageId(e.target.value)} className={input}>
            {garages.map((g) => <option key={g.id} value={g.id}>{g.name}{g.city ? ` — ${g.city}` : ""} · {ghs(g.price)}</option>)}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-semibold">Where should the inspector come?</span>
          <select value={locationKind} onChange={(e) => setLocationKind(e.target.value as "seller" | "garage")} className={input}>
            <option value="garage">The garage (you bring the car)</option>
            <option value="seller">The seller&apos;s location (inspector travels to the car)</option>
          </select>
        </label>
      </div>

      <fieldset className="space-y-3 rounded-xl border border-border p-4">
        <legend className="px-1 text-sm font-semibold">The car</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <input className={input} placeholder="Make (e.g. Toyota)" value={f.make} onChange={set("make")} />
          <input className={input} placeholder="Model (e.g. Corolla)" value={f.model} onChange={set("model")} />
          <input className={input} placeholder="Year" value={f.year} onChange={set("year")} inputMode="numeric" />
          <input className={input} placeholder="Plate (if known)" value={f.plate} onChange={set("plate")} />
          <input className={input} placeholder="Mileage (km, if known)" value={f.mileageKm} onChange={set("mileageKm")} inputMode="numeric" />
          <input className={input} placeholder="VIN (optional)" value={f.vin} onChange={set("vin")} />
        </div>
      </fieldset>

      {locationKind === "seller" && (
        <fieldset className="space-y-3 rounded-xl border border-border p-4">
          <legend className="px-1 text-sm font-semibold">Seller details</legend>
          <input className={input} placeholder="Seller's name" value={f.sellerName} onChange={set("sellerName")} />
          <input className={input} placeholder="Seller's phone" value={f.sellerPhone} onChange={set("sellerPhone")} inputMode="tel" />
          <textarea className={`${input} min-h-20 py-2`} placeholder="Where is the car? (area, landmark, directions)" value={f.sellerAddress} onChange={set("sellerAddress")} />
        </fieldset>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold">Preferred date & time (optional)</span>
          <input type="datetime-local" className={input} value={f.scheduledAt} onChange={set("scheduledAt")} />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Anything the inspector should know? (optional)</span>
          <input className={input} placeholder="e.g. seller says new clutch fitted" value={f.notes} onChange={set("notes")} />
        </label>
      </div>

      <fieldset className="rounded-xl border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Pay {garage ? ghs(garage.price) : ""}</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" checked={channel === "momo"} onChange={() => setChannel("momo")} /> MoMo</label>
          <label className="flex items-center gap-2"><input type="radio" checked={channel === "card"} onChange={() => setChannel("card")} /> Card</label>
        </div>
        {channel === "momo" && (
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            {(["mtn", "telecel", "airteltigo"] as const).map((n) => (
              <label key={n} className="flex items-center gap-2 capitalize"><input type="radio" checked={network === n} onChange={() => setNetwork(n)} /> {n === "airteltigo" ? "AT" : n}</label>
            ))}
          </div>
        )}
      </fieldset>

      {msg && <p className="rounded-xl border border-border bg-surface-sunken px-4 py-3 text-sm">{msg}</p>}
      <Button type="submit" loading={pending} className="w-full sm:w-auto">Book &amp; pay</Button>
    </form>
  )
}
