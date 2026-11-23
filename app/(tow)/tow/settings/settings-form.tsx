"use client"

import { useState, useTransition } from "react"
import { Crosshair } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { updateTowProfile, type OperatorView } from "@/lib/towing/actions"
import { SERVICES } from "@/lib/towing/core"

const field = "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"

export function TowSettingsForm({ operator: o }: { operator: OperatorView }) {
  const [f, setF] = useState({
    businessName: o.businessName, phone: o.phone, city: o.city ?? "", region: o.region ?? "",
    serviceRadiusKm: String(o.serviceRadiusKm), baseFeeGhs: String(o.baseFee / 100), perKmFeeGhs: String(o.perKmFee / 100),
    momoPhone: "", momoName: "",
  })
  const [services, setServices] = useState(o.services)
  const [base, setBase] = useState(o.baseLat != null && o.baseLng != null ? { lat: o.baseLat, lng: o.baseLng } : null)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  const save = () => start(async () => {
    const r = await updateTowProfile({
      businessName: f.businessName, phone: f.phone, city: f.city, region: f.region,
      serviceRadiusKm: Number(f.serviceRadiusKm) || 25, baseFeeGhs: Number(f.baseFeeGhs) || 0, perKmFeeGhs: Number(f.perKmFeeGhs) || 0,
      services, baseLat: base?.lat ?? null, baseLng: base?.lng ?? null,
      ...(f.momoPhone ? { momoPhone: f.momoPhone, momoName: f.momoName || f.businessName } : {}),
    })
    setMsg(r.ok ? "Saved" : r.error)
  })

  return (
    <Card className="mt-4">
      <CardContent className="space-y-4 p-5">
        <label className="block text-sm">Business name<input className={field} value={f.businessName} onChange={set("businessName")} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">Phone (SOS SMS go here)<input className={field} value={f.phone} onChange={set("phone")} /></label>
          <label className="block text-sm">City<input className={field} value={f.city} onChange={set("city")} /></label>
        </div>
        <div>
          <p className="text-sm">Services</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SERVICES.map((s) => (
              <button key={s.id} type="button" onClick={() => setServices((v) => (v.includes(s.id) ? v.filter((x) => x !== s.id) : [...v, s.id]))}
                className={`rounded-full border px-3 py-1.5 text-sm ${services.includes(s.id) ? "border-foreground bg-foreground text-background" : "border-border"}`}>{s.label}</button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">Call-out fee (GH₵)<input className={field} inputMode="decimal" value={f.baseFeeGhs} onChange={set("baseFeeGhs")} /></label>
          <label className="block text-sm">Per km (GH₵)<input className={field} inputMode="decimal" value={f.perKmFeeGhs} onChange={set("perKmFeeGhs")} /></label>
          <label className="block text-sm">Radius (km)<input className={field} inputMode="numeric" value={f.serviceRadiusKm} onChange={set("serviceRadiusKm")} /></label>
        </div>
        <div className="text-sm">
          <p>Base location</p>
          <Button type="button" size="sm" variant="secondary" className="mt-1" onClick={() => navigator.geolocation?.getCurrentPosition((p) => setBase({ lat: p.coords.latitude, lng: p.coords.longitude }), () => setMsg("Couldn't get your location"))}>
            <Crosshair className="size-4" /> {base ? `Set (${base.lat.toFixed(4)}, ${base.lng.toFixed(4)}) — update to here` : "Use my current location"}
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">MoMo payout number<input className={field} placeholder={o.payoutMasked ?? "024 123 4567"} value={f.momoPhone} onChange={set("momoPhone")} /></label>
          <label className="block text-sm">Name on MoMo account<input className={field} value={f.momoName} onChange={set("momoName")} /></label>
        </div>
        {o.payoutMasked && <p className="text-xs text-muted-foreground">Current payout account: {o.payoutMasked}. Leave blank to keep it.</p>}
        <div className="flex items-center gap-3">
          <Button disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</Button>
          {msg && <span className="text-sm">{msg}</span>}
        </div>
      </CardContent>
    </Card>
  )
}
