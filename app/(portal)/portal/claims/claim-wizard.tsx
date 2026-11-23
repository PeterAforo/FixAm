"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Camera, FileText, Loader2, MapPin, Plus, X } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { saveClaimDraft, submitClaim } from "@/lib/claims/actions"
import { shrinkPhoto } from "@/components/part-photo/shrink"

type Vehicle = { id: string; plateNumber: string; make: string; model: string; year: number | null }
type Broker = { id: string; name: string; kind: string }
type Garage = { id: string; name: string; city: string | null }

type Draft = {
  occurredAt: string
  location: string
  lat: number | null
  lng: number | null
  policeReportNo: string
  otherPartyName: string
  otherPartyPhone: string
  otherPartyPlate: string
  otherPartyInsurer: string
  injuries: "" | "yes" | "no"
  description: string
  vehicleId: string
  vehicleRef: string
  garageId: string
  brokerId: string
}

const EMPTY: Draft = {
  occurredAt: "",
  location: "",
  lat: null,
  lng: null,
  policeReportNo: "",
  otherPartyName: "",
  otherPartyPhone: "",
  otherPartyPlate: "",
  otherPartyInsurer: "",
  injuries: "",
  description: "",
  vehicleId: "",
  vehicleRef: "",
  garageId: "",
  brokerId: "",
}

const inputCls =
  "min-h-11 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function ClaimWizard({ vehicles, brokers, garages, initialClaimId, initial }: { vehicles: Vehicle[]; brokers: Broker[]; garages: Garage[]; initialClaimId?: string; initial?: Partial<Draft> }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [claimId, setClaimId] = useState(initialClaimId ?? "")
  const [d, setD] = useState<Draft>({ ...EMPTY, ...initial })
  const [photos, setPhotos] = useState<File[]>([])
  const [doc, setDoc] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const docInput = useRef<HTMLInputElement>(null)

  const set = useCallback(<K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((prev) => ({ ...prev, [k]: v }))
  }, [])

  // Debounced autosave — keeps a draft so a half-finished claim survives.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      startTransition(async () => {
        const res = await saveClaimDraft({ ...d, claimId: claimId || undefined })
        if (res.ok) {
          setClaimId(res.claimId)
          setSavedAt(new Date().toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" }))
        }
      })
    }, 1200)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [d, claimId])

  function useMyLocation() {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        set("lat", Number(p.coords.latitude.toFixed(6)))
        set("lng", Number(p.coords.longitude.toFixed(6)))
        setLocating(false)
      },
      () => setLocating(false),
      { timeout: 10000 }
    )
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return
    const shrunk = await Promise.all(Array.from(files).slice(0, 6 - photos.length).map((f) => shrinkPhoto(f)))
    setPhotos((prev) => [...prev, ...shrunk].slice(0, 6))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!claimId) {
      setError("Still saving your draft — try again in a second")
      return
    }
    const form = new FormData()
    form.set("claimId", claimId)
    for (const [k, v] of Object.entries(d)) {
      if (k === "lat" || k === "lng") { if (v != null) form.set(k, String(v)) }
      else if (k === "injuries") { if (v) form.set(k, v === "yes" ? "yes" : "no") }
      else if (k === "occurredAt") { if (v) form.set(k, new Date(v).toISOString()) }
      else form.set(k, String(v))
    }
    for (const p of photos) form.append("photos", p)
    if (doc) form.set("policeReport", doc)
    startTransition(async () => {
      const res = await submitClaim(form)
      if (!res.ok) { setError(res.error); return }
      router.push(`/portal/claims/${res.claimId}`)
    })
  }

  const canSubmit = d.occurredAt && d.injuries && photos.length > 0 && !pending

  return (
    <form onSubmit={submit} className="mt-6 space-y-5">
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-display text-lg font-semibold">What happened</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="occurredAt">When did it happen? *</label>
              <input id="occurredAt" type="datetime-local" className={inputCls} value={d.occurredAt} max={toLocalInput(new Date())} onChange={(e) => set("occurredAt", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Location</label>
              <div className="flex gap-2">
                <input className={inputCls} placeholder="e.g. N1 near Madina barrier" value={d.location} onChange={(e) => set("location", e.target.value)} />
                <Button type="button" variant="secondary" onClick={useMyLocation} loading={locating} aria-label="Use my location">
                  <MapPin />
                </Button>
              </div>
              {d.lat != null && <p className="mt-1 text-xs text-muted-foreground">Location pinned ({d.lat}, {d.lng})</p>}
            </div>
          </div>
          <div>
            <label className={labelCls}>Photos of the damage *</label>
            <input ref={photoInput} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={(e) => { void addPhotos(e.target.files); e.target.value = "" }} />
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={URL.createObjectURL(p)} alt={`Damage photo ${i + 1}`} className="size-20 rounded-xl border border-border object-cover" />
                  <button type="button" aria-label="Remove photo" className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background" onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}>
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              {photos.length < 6 && (
                <button type="button" onClick={() => photoInput.current?.click()} className="flex size-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:border-foreground/40">
                  <Camera className="size-5" /> Add
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Wide shots of both cars, close-ups of the damage, the licence plates.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="policeReportNo">Police report number</label>
              <input id="policeReportNo" className={inputCls} placeholder="e.g. CR-2026-00412" value={d.policeReportNo} onChange={(e) => set("policeReportNo", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Upload the report</label>
              <input ref={docInput} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setDoc(f); e.target.value = "" }} />
              <button type="button" onClick={() => docInput.current?.click()} className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground hover:border-foreground/40">
                <FileText className="size-4" /> {doc ? doc.name : "Photo or PDF of the report"}
              </button>
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="description">What happened</label>
            <textarea id="description" rows={3} className={inputCls} placeholder="A sentence or two is enough — the assessor will ask for details." value={d.description} onChange={(e) => set("description", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-display text-lg font-semibold">The other driver</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={labelCls}>Name</label><input className={inputCls} value={d.otherPartyName} onChange={(e) => set("otherPartyName", e.target.value)} /></div>
            <div><label className={labelCls}>Phone</label><input className={inputCls} type="tel" value={d.otherPartyPhone} onChange={(e) => set("otherPartyPhone", e.target.value)} /></div>
            <div><label className={labelCls}>Vehicle plate</label><input className={inputCls} value={d.otherPartyPlate} onChange={(e) => set("otherPartyPlate", e.target.value)} /></div>
            <div><label className={labelCls}>Their insurer</label><input className={inputCls} value={d.otherPartyInsurer} onChange={(e) => set("otherPartyInsurer", e.target.value)} /></div>
          </div>
          <div>
            <label className={labelCls}>Was anyone injured? *</label>
            <div className="flex gap-2">
              {(["yes", "no"] as const).map((v) => (
                <button key={v} type="button" onClick={() => set("injuries", v)} className={`min-h-11 flex-1 rounded-lg border text-sm font-semibold capitalize ${d.injuries === v ? "border-foreground bg-foreground text-background" : "border-input bg-surface"}`}>
                  {v === "yes" ? "Yes — someone was hurt" : "No injuries"}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-display text-lg font-semibold">Your car &amp; where to fix it</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Vehicle</label>
              <select className={inputCls} value={d.vehicleId} onChange={(e) => {
                const v = vehicles.find((x) => x.id === e.target.value)
                set("vehicleId", e.target.value)
                set("vehicleRef", v ? `${v.plateNumber} ${v.make} ${v.model}` : "")
              }}>
                <option value="">— pick your car —</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.make} {v.model} {v.year ?? ""} · {v.plateNumber}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Preferred garage</label>
              <select className={inputCls} value={d.garageId} onChange={(e) => set("garageId", e.target.value)}>
                <option value="">— not sure yet —</option>
                {garages.map((g) => <option key={g.id} value={g.id}>{g.name}{g.city ? ` · ${g.city}` : ""}</option>)}
              </select>
            </div>
            {brokers.length > 0 && (
              <div className="sm:col-span-2">
                <label className={labelCls}>Send the claim to</label>
                <select className={inputCls} value={d.brokerId} onChange={(e) => set("brokerId", e.target.value)}>
                  <option value="">My usual broker / insurer contact</option>
                  {brokers.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.kind === "dvla" ? "DVLA" : "insurance"})</option>)}
                </select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {error && <p className="rounded-xl border border-danger/30 bg-danger-subtle px-4 py-3 text-sm font-medium text-danger">{error}</p>}

      <div className="flex items-center justify-between gap-3 pb-8">
        <p className="text-xs text-muted-foreground">
          {savedAt ? `Draft saved at ${savedAt}` : claimId ? "Saving…" : ""}
          {claimId && photos.length === 0 ? " · photos upload when you submit" : ""}
        </p>
        <Button type="submit" size="lg" loading={pending} disabled={!canSubmit}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />}
          Submit claim
        </Button>
      </div>
    </form>
  )
}
