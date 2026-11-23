"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Camera, Crosshair, MapPin, Send, Star } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { VoiceNoteButton, type VoiceNoteValue } from "@/components/ai/voice-note-button"
import { TriageCard, MediaStrip } from "@/components/repair-requests/triage-card"
import { WARNING_LIGHTS } from "@/lib/repair-requests/core"
import { acceptRepairOffer, cancelRepairRequest, submitRepairRequest, type MyRepairRequest, type SubmitResult } from "@/lib/repair-requests/actions"
import { searchDestinationGarages, type DestGarage, type DriverCar } from "@/lib/parts-shop/actions"
import { shrinkPhoto } from "@/components/part-photo/shrink"

const inputCls = "min-h-11 w-full rounded-xl border border-input bg-card px-3.5 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"
const REGIONS = ["Greater Accra", "Ashanti", "Western", "Central", "Eastern", "Volta", "Northern", "Upper East", "Upper West", "Bono", "Bono East", "Ahafo", "Western North", "Oti", "Savannah", "North East"]
const ghs = (p: number) => `GH₵ ${(p / 100).toLocaleString("en-GH", { maximumFractionDigits: 0 })}`

export function RequestsPanel(props: { cars: DriverCar[]; myGarages: DestGarage[]; requests: MyRepairRequest[]; startOpen: boolean; attachedScan?: { id: string; codes: string[]; summary: string | null } | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(props.startOpen)
  const [result, setResult] = useState<Extract<SubmitResult, { ok: true }> | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const [complaint, setComplaint] = useState(props.attachedScan?.codes.length ? `Check-engine light / scanner found ${props.attachedScan.codes.join(", ")}. ` : "")
  const [scan, setScan] = useState(props.attachedScan ?? null)
  const [voice, setVoice] = useState<VoiceNoteValue | null>(null)
  const [carKey, setCarKey] = useState(props.cars[0]?.key ?? "other")
  const [other, setOther] = useState({ make: "", model: "", year: "", plate: "" })
  const [lights, setLights] = useState<string[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [mode, setMode] = useState<"broadcast" | "preferred">(props.myGarages.length ? "preferred" : "broadcast")
  const [garageId, setGarageId] = useState<string | null>(props.myGarages[0]?.id ?? null)
  const [garageQ, setGarageQ] = useState("")
  const [garageHits, setGarageHits] = useState<DestGarage[]>([])
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [area, setArea] = useState({ region: "Greater Accra", city: "" })
  const [radius, setRadius] = useState("15")
  const fileRef = useRef<HTMLInputElement>(null)

  function locate() {
    if (!navigator.geolocation) return setMsg("Location isn't available on this device — pick your area instead")
    navigator.geolocation.getCurrentPosition(
      (p) => setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setMsg("Couldn't get your location — pick your area instead"),
      { enableHighAccuracy: true, timeout: 10_000 }
    )
  }

  function findGarages(v: string) {
    setGarageQ(v)
    if (v.trim().length < 2) return setGarageHits([])
    startTransition(async () => setGarageHits(await searchDestinationGarages(v)))
  }

  function submit() {
    setMsg(null)
    const car = props.cars.find((c) => c.key === carKey)
    const fd = new FormData()
    fd.set("complaint", complaint)
    if (voice && voice.language !== "en") {
      fd.set("complaintOriginal", voice.transcript)
      fd.set("language", voice.language)
    }
    if (car) {
      fd.set("make", car.make)
      fd.set("model", car.model)
      if (car.year) fd.set("year", String(car.year))
      const plate = car.label.split(" · ")[1]
      if (plate) fd.set("plate", plate)
    } else {
      if (other.make) fd.set("make", other.make)
      if (other.model) fd.set("model", other.model)
      if (other.year) fd.set("year", other.year)
      if (other.plate) fd.set("plate", other.plate)
    }
    lights.forEach((l) => fd.append("warningLights", l))
    if (scan) fd.set("obdScanId", scan.id)
    fd.set("mode", mode)
    if (mode === "preferred" && garageId) fd.set("preferredGarageId", garageId)
    if (loc) {
      fd.set("lat", String(loc.lat))
      fd.set("lng", String(loc.lng))
    }
    fd.set("region", area.region)
    if (area.city) fd.set("city", area.city)
    fd.set("radiusKm", radius)
    startTransition(async () => {
      // Photos are shrunk on the phone so uploads stay small (videos go as they are).
      for (const f of files) fd.append("media", f.type.startsWith("image/") ? await shrinkPhoto(f) : f)
      const r = await submitRepairRequest(fd)
      if (!r.ok) return setMsg(r.error)
      setResult(r)
      setOpen(false)
      setComplaint("")
      setVoice(null)
      setFiles([])
      setLights([])
      setScan(null)
      router.refresh()
    })
  }

  function accept(offerId: string) {
    startTransition(async () => {
      const r = await acceptRepairOffer(offerId)
      setMsg(r.ok ? `Booked at ${r.garageName} for ${new Date(r.at).toLocaleString("en-GH", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. They'll expect you.` : r.error)
      router.refresh()
    })
  }

  function cancel(id: string) {
    startTransition(async () => {
      const r = await cancelRepairRequest(id)
      setMsg(r.ok ? "Request cancelled." : r.error)
      router.refresh()
    })
  }

  return (
    <div className="mt-6 space-y-5">
      {msg && <p className="rounded-lg bg-info/10 px-3 py-2 text-sm">{msg}</p>}

      {result && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{result.number} · sent to {result.sentTo} garage{result.sentTo === 1 ? "" : "s"}</p>
            <TriageCard triage={result.triage} partsHref={(id) => `/portal/parts?part=${id}`} />
            {result.sentTo === 0 && <p className="text-sm text-amber-800">No matching garages in that area yet — try a bigger distance or choose a garage.</p>}
          </CardContent>
        </Card>
      )}

      {!open ? (
        <Button onClick={() => { setOpen(true); setResult(null) }}><Send className="size-4" /> Report a car problem</Button>
      ) : (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">What&apos;s wrong?</label>
              <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} rows={4} className={`${inputCls} py-2`}
                placeholder="e.g. The car makes a grinding noise when I brake, and the brake light came on this morning" />
              <VoiceNoteButton className="mt-2" onResult={(v) => { setVoice(v); setComplaint(v.english) }} />
              {voice && voice.language !== "en" && <p className="mt-1 text-xs text-muted-foreground">We heard: “{voice.transcript}” — translated above. Fix the English if needed.</p>}
              {scan && (
                <p className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-surface-sunken px-3 py-2 text-xs">
                  <span>Scanner codes attached: <strong className="font-mono">{scan.codes.join(", ") || "none"}</strong> — garages will see the full scan.</span>
                  <button type="button" className="underline" onClick={() => setScan(null)}>Remove</button>
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">Car</span>
                <select value={carKey} onChange={(e) => setCarKey(e.target.value)} className={inputCls}>
                  {props.cars.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  <option value="other">Another car…</option>
                </select>
              </label>
              {carKey === "other" && (
                <div className="grid grid-cols-2 gap-2">
                  <input value={other.make} onChange={(e) => setOther({ ...other, make: e.target.value })} placeholder="Make" className={inputCls} />
                  <input value={other.model} onChange={(e) => setOther({ ...other, model: e.target.value })} placeholder="Model" className={inputCls} />
                  <input value={other.year} onChange={(e) => setOther({ ...other, year: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="Year" className={inputCls} />
                  <input value={other.plate} onChange={(e) => setOther({ ...other, plate: e.target.value.toUpperCase() })} placeholder="Plate" className={inputCls} />
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground">Any warning lights on the dashboard?</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {WARNING_LIGHTS.map((l) => (
                  <button key={l.id} type="button" onClick={() => setLights((p) => (p.includes(l.id) ? p.filter((x) => x !== l.id) : [...p, l.id]))}
                    className={`rounded-full border px-3 py-1 text-xs ${lights.includes(l.id) ? "border-foreground bg-foreground text-background" : "border-border"}`}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 5))} />
              <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}><Camera className="size-4" /> Add photos or a short video</Button>
              {files.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{files.map((f) => f.name).join(", ")} <button type="button" className="underline" onClick={() => setFiles([])}>clear</button></p>}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Who should see it?</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${mode === "preferred" ? "border-foreground" : "border-border"}`}>
                  <input type="radio" checked={mode === "preferred"} onChange={() => setMode("preferred")} /> <Star className="size-4" /> My garage
                </label>
                <label className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${mode === "broadcast" ? "border-foreground" : "border-border"}`}>
                  <input type="radio" checked={mode === "broadcast"} onChange={() => setMode("broadcast")} /> <MapPin className="size-4" /> Garages near me
                </label>
              </div>
              {mode === "preferred" ? (
                <div className="space-y-2">
                  {props.myGarages.length > 0 && (
                    <select value={garageId ?? ""} onChange={(e) => setGarageId(e.target.value)} className={inputCls}>
                      {props.myGarages.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  )}
                  <input value={garageQ} onChange={(e) => findGarages(e.target.value)} placeholder="…or search a garage by name or town" className={inputCls} />
                  {garageHits.map((g) => (
                    <button key={g.id} type="button" onClick={() => setGarageId(g.id)} className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${garageId === g.id ? "border-foreground" : "border-border"}`}>
                      {g.name} <span className="text-xs text-muted-foreground">{[g.city, g.region].filter(Boolean).join(", ")}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-[auto_1fr_1fr_110px]">
                  <Button type="button" variant="secondary" size="sm" onClick={locate}><Crosshair className="size-4" /> {loc ? "Location set" : "Use my location"}</Button>
                  <select value={area.region} onChange={(e) => setArea({ ...area, region: e.target.value })} className={inputCls}>{REGIONS.map((r) => <option key={r}>{r}</option>)}</select>
                  <input value={area.city} onChange={(e) => setArea({ ...area, city: e.target.value })} placeholder="Town / area" className={inputCls} />
                  <select value={radius} onChange={(e) => setRadius(e.target.value)} className={inputCls} aria-label="Distance">
                    {["5", "10", "15", "25", "50"].map((r) => <option key={r} value={r}>{r} km</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button disabled={pending || complaint.trim().length < 5} onClick={submit}>{pending ? "Checking…" : "Send & get advice"}</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {props.requests.map((r) => (
        <Card key={r.id}>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold">{r.number}</span>
                  <StatusPill status={r.expired ? "expired" : r.status} />
                  <span className="text-xs text-muted-foreground">sent to {r.sentTo} garage{r.sentTo === 1 ? "" : "s"}</span>
                </div>
                <p className="mt-1 font-semibold">{r.vehicle ?? "My car"}</p>
                <p className="text-sm">{r.complaint}</p>
              </div>
              {["open", "offered"].includes(r.status) && !r.expired && <Button size="sm" variant="ghost" disabled={pending} onClick={() => cancel(r.id)}>Cancel</Button>}
            </div>
            <MediaStrip media={r.media} />
            {r.triage && (
              <details className="rounded-xl bg-surface-muted/50 p-3">
                <summary className="cursor-pointer text-xs font-semibold">What FixAm thinks</summary>
                <div className="mt-2"><TriageCard triage={r.triage} compact partsHref={(id) => `/portal/parts?part=${id}`} /></div>
              </details>
            )}
            {r.offers.length === 0 ? (
              ["open", "offered"].includes(r.status) && !r.expired && <p className="text-sm text-muted-foreground">Waiting for garages to reply — you&apos;ll get an SMS.</p>
            ) : (
              <ul className="space-y-2">
                {r.offers.map((o) => (
                  <li key={o.id} className={`rounded-xl border p-3 ${o.status === "accepted" ? "border-emerald-600" : "border-border"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{o.garageName}</p>
                        <p className="text-xs text-muted-foreground">
                          {[o.garageCity, o.distanceKm != null ? `${o.distanceKm} km` : null, o.rating != null ? `★ ${o.rating} (${o.reviewCount})` : null].filter(Boolean).join(" · ")}
                        </p>
                        <p className="mt-1 text-sm">
                          {o.priceMin != null ? `${ghs(o.priceMin)}${o.priceMax != null && o.priceMax !== o.priceMin ? ` – ${ghs(o.priceMax)}` : ""}` : "Price after inspection"}
                          {o.inspectionFee > 0 ? ` · inspection ${ghs(o.inspectionFee)}` : " · free inspection"}
                        </p>
                        <p className="text-xs text-muted-foreground">Can see you {new Date(o.earliestAt).toLocaleString("en-GH", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                        {o.message && <p className="mt-1 text-sm italic">“{o.message}”</p>}
                      </div>
                      {o.status === "accepted" ? (
                        <StatusPill tone="ok">Booked</StatusPill>
                      ) : ["open", "offered"].includes(r.status) && o.status === "sent" ? (
                        <Button size="sm" disabled={pending} onClick={() => accept(o.id)}>Book this</Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
