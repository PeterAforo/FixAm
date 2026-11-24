"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BadgeCheck } from "lucide-react"
import { PinLocation } from "@/components/discovery/pin-location"
import { Button } from "@/components/brand/button"
import { setBrokerLocation, updateBrokerProfile, type BrokerView } from "@/lib/brokers/actions"
import { INSURERS } from "@/lib/brokers/catalog"
import { Chips, Segmented } from "@/app/(auth)/onboarding/chips"
import { GH_REGIONS } from "@/app/(auth)/onboarding/options"

const inputCls =
  "h-11 w-full rounded-xl border border-input bg-card px-3.5 text-[15px] outline-none transition-shadow placeholder:text-[#8C857B] focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15 disabled:opacity-60"

type Kind = "insurance" | "dvla" | "both"

export function BrokerSettingsForm({ broker: b, canEdit }: { broker: BrokerView; canEdit: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [f, setF] = useState({
    businessName: b.businessName,
    kind: (b.kind as Kind) ?? "insurance",
    phone: b.phone.replace("+233", "0"),
    email: b.email ?? "",
    address: b.address ?? "",
    city: b.city ?? "",
    region: b.region ?? "Greater Accra",
    about: b.about ?? "",
    nicLicenceNumber: b.nicLicenceNumber ?? "",
    dvlaAgentNumber: b.dvlaAgentNumber ?? "",
    insurers: b.insurers ?? [],
    fee: b.defaultServiceFee != null ? String(b.defaultServiceFee / 100) : "",
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))

  function save(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    start(async () => {
      const res = await updateBrokerProfile({
        ...f,
        defaultServiceFee: f.fee ? Number(f.fee) : null,
      })
      setMsg(res.ok ? { ok: true, text: "Saved" } : { ok: false, text: res.error.message })
      if (res.ok) router.refresh()
    })
  }

  const card = "rounded-[18px] border border-border bg-card p-5"

  return (
    <form onSubmit={save} className="space-y-5">
      <fieldset disabled={!canEdit} className="space-y-5">
        <section className={card}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Business</h2>
            {b.isVerified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF8D6] px-2.5 py-1 text-xs font-semibold text-[#4E6B07]"><BadgeCheck className="size-3.5" /> Verified</span>
            ) : (
              <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">Verification pending</span>
            )}
          </div>
          <div className="mt-4 space-y-4">
            <Segmented
              options={[{ value: "insurance", label: "Insurance" }, { value: "dvla", label: "DVLA" }, { value: "both", label: "Both" }]}
              value={f.kind}
              onChange={(v) => set("kind", v)}
            />
            <label className="block space-y-1.5"><span className="text-sm font-medium">Business name</span>
              <input className={inputCls} value={f.businessName} onChange={(e) => set("businessName", e.target.value)} /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5"><span className="text-sm font-medium">Phone (gets new-request SMS)</span>
                <input className={inputCls} inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></label>
              <label className="block space-y-1.5"><span className="text-sm font-medium">E-mail</span>
                <input className={inputCls} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></label>
            </div>
            <label className="block space-y-1.5"><span className="text-sm font-medium">Office address</span>
              <input className={inputCls} value={f.address} onChange={(e) => set("address", e.target.value)} /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5"><span className="text-sm font-medium">City or town</span>
                <input className={inputCls} value={f.city} onChange={(e) => set("city", e.target.value)} /></label>
              <label className="block space-y-1.5"><span className="text-sm font-medium">Region</span>
                <select className={inputCls} value={f.region} onChange={(e) => set("region", e.target.value)}>
                  {GH_REGIONS.map((r) => <option key={r}>{r}</option>)}
                </select></label>
            </div>
            <PinLocation what="office" lat={b.gpsLat as number | null} lng={b.gpsLng as number | null} save={(p) => setBrokerLocation(p)} />
            <label className="block space-y-1.5"><span className="text-sm font-medium">About</span>
              <textarea className={`${inputCls} h-24 resize-none py-2.5`} value={f.about} onChange={(e) => set("about", e.target.value)} /></label>
          </div>
        </section>

        <section className={card}>
          <h2 className="font-semibold">Licences & fees</h2>
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {f.kind !== "dvla" && (
                <label className="block space-y-1.5"><span className="text-sm font-medium">NIC licence number</span>
                  <input className={inputCls} value={f.nicLicenceNumber} onChange={(e) => set("nicLicenceNumber", e.target.value)} /></label>
              )}
              {f.kind !== "insurance" && (
                <label className="block space-y-1.5"><span className="text-sm font-medium">DVLA agent number</span>
                  <input className={inputCls} value={f.dvlaAgentNumber} onChange={(e) => set("dvlaAgentNumber", e.target.value)} /></label>
              )}
              <label className="block space-y-1.5"><span className="text-sm font-medium">Default service fee (GH₵)</span>
                <input className={inputCls} inputMode="decimal" value={f.fee} onChange={(e) => set("fee", e.target.value.replace(/[^\d.]/g, ""))} /></label>
            </div>
            {f.kind !== "dvla" && (
              <div>
                <p className="mb-2.5 text-sm font-medium">Insurers you place with</p>
                <Chips options={INSURERS} value={f.insurers} onChange={(v) => set("insurers", v)} />
              </div>
            )}
          </div>
        </section>
      </fieldset>

      <div className="flex items-center justify-end gap-3">
        {msg && <p className={msg.ok ? "text-sm font-medium text-[#4E6B07]" : "text-sm font-medium text-[#B3122F]"}>{msg.text}</p>}
        {canEdit ? <Button type="submit" loading={pending}>Save changes</Button> : <p className="text-sm text-muted-foreground">Only the owner can edit the profile.</p>}
      </div>
    </form>
  )
}
