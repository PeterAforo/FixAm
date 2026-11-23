"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Camera, Navigation, Phone } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { shareDriverLocation, stepPickupRun, submitConditionReport, type RunRow } from "@/lib/pickups/actions"
import { PHOTO_SIDES, RUN_LABEL, reportProblems, type PhotoSide } from "@/lib/pickups/core"
import { WARNING_LIGHTS } from "@/lib/repair-requests/core"
import { shrinkPhoto } from "@/components/part-photo/shrink"

/** Customer signs with a finger on this pad. */
function SignaturePad({ onChange }: { onChange: (blob: Blob | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current!
    const r = c.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height }
  }
  const export_ = () => ref.current?.toBlob((b) => onChange(dirty.current ? b : null), "image/png")
  return (
    <div>
      <canvas
        ref={ref} width={600} height={200}
        className="h-32 w-full touch-none rounded-lg border-2 border-dashed border-border bg-white"
        onPointerDown={(e) => { drawing.current = true; const ctx = ref.current!.getContext("2d")!; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); ref.current!.setPointerCapture(e.pointerId) }}
        onPointerMove={(e) => { if (!drawing.current) return; const ctx = ref.current!.getContext("2d")!; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.strokeStyle = "#0b1220"; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); dirty.current = true }}
        onPointerUp={() => { drawing.current = false; export_() }}
      />
      <button type="button" className="mt-1 text-xs underline" onClick={() => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); dirty.current = false; onChange(null) }}>Clear</button>
    </div>
  )
}

function ReportForm({ garageId, run, onDone }: { garageId: string; run: RunRow; onDone: () => void }) {
  const [photos, setPhotos] = useState<Partial<Record<PhotoSide, File>>>({})
  const [fuel, setFuel] = useState(50)
  const [fuelSet, setFuelSet] = useState(false)
  const [odo, setOdo] = useState("")
  const [lights, setLights] = useState<string[]>([])
  const [notes, setNotes] = useState("")
  const [name, setName] = useState(run.contactName ?? "")
  const [sig, setSig] = useState<Blob | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const missing = reportProblems({
    photos: Object.fromEntries(Object.keys(photos).map((k) => [k, "x"])), fuelLevel: fuelSet ? fuel : null,
    odometerKm: odo ? Number(odo) : null, signatureProvided: !!sig, signedByName: name,
  })
  const submit = () => start(async () => {
    setErr(null)
    const fd = new FormData()
    fd.set("garageId", garageId); fd.set("runId", run.id); fd.set("fuelLevel", String(fuel)); fd.set("odometerKm", odo)
    lights.forEach((l) => fd.append("warningLights", l))
    if (notes.trim()) fd.set("damageNotes", notes.trim())
    fd.set("signedByName", name)
    if (sig) fd.set("signature", new File([sig], "signature.png", { type: "image/png" }))
    for (const [side, f] of Object.entries(photos)) if (f) fd.set(`photo_${side}`, await shrinkPhoto(f, 1400, 0.8))
    const r = await submitConditionReport(fd)
    if (!r.ok) setErr(r.error)
    else onDone()
  })
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <p className="font-semibold">Condition report — {run.kind === "pickup" ? "collecting the car" : "returning the car"}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PHOTO_SIDES.map((s) => (
            <label key={s.id} className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border p-3 text-center text-xs ${photos[s.id] ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20" : "border-dashed border-border"}`}>
              <Camera className="size-5" />
              {s.label}{photos[s.id] ? " ✓" : ""}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhotos((p) => ({ ...p, [s.id]: f })) }} />
            </label>
          ))}
        </div>
        <label className="block text-sm">Fuel: <strong>{fuelSet ? `${fuel}%` : "set it"}</strong>
          <input type="range" min={0} max={100} step={5} value={fuel} onChange={(e) => { setFuel(Number(e.target.value)); setFuelSet(true) }} className="mt-1 w-full" />
        </label>
        <label className="block text-sm">Mileage (km)
          <input className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm tabular-nums" inputMode="numeric" value={odo} onChange={(e) => setOdo(e.target.value.replace(/\D/g, ""))} />
        </label>
        <div>
          <p className="text-sm">Warning lights on the dashboard</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {WARNING_LIGHTS.map((l) => (
              <button key={l.id} type="button" onClick={() => setLights((v) => (v.includes(l.id) ? v.filter((x) => x !== l.id) : [...v, l.id]))}
                className={`rounded-full border px-2.5 py-1 text-xs ${lights.includes(l.id) ? "border-amber-500 bg-amber-50 font-semibold dark:bg-amber-950/30" : "border-border"}`}>{l.label}</button>
            ))}
          </div>
        </div>
        <textarea className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" rows={2} placeholder="Scratches, dents or anything the customer pointed out" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div>
          <p className="text-sm">Customer signature</p>
          <SignaturePad onChange={setSig} />
          <input className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" placeholder="Name of the person signing" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {missing.length > 0 && <p className="text-xs text-muted-foreground">Still needed: {missing.join(" · ")}</p>}
        {err && <p className="text-sm text-red-700">{err}</p>}
        <Button className="w-full" disabled={pending || missing.length > 0} onClick={submit}>{pending ? "Saving…" : run.kind === "pickup" ? "Save & collect the car" : "Save & hand over the car"}</Button>
      </CardContent>
    </Card>
  )
}

export function RunPanel({ garageId, run }: { garageId: string; run: RunRow }) {
  const router = useRouter()
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const moving = run.status === "en_route" || run.status === "arrived"

  // Share location with the customer while on the way.
  useEffect(() => {
    if (!moving || !navigator.geolocation) return
    let last = 0
    const id = navigator.geolocation.watchPosition((p) => {
      if (Date.now() - last < 15_000) return
      last = Date.now()
      void shareDriverLocation({ lat: p.coords.latitude, lng: p.coords.longitude })
    }, () => undefined, { enableHighAccuracy: true, maximumAge: 10_000 })
    return () => navigator.geolocation.clearWatch(id)
  }, [moving])

  const step = (to: "en_route" | "arrived") => start(async () => {
    const r = await stepPickupRun({ garageId, runId: run.id, to })
    if (!r.ok) setMsg(r.error)
    router.refresh()
  })
  const maps = run.lat != null && run.lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${run.lat},${run.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(run.address)}`

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{run.kind === "pickup" ? "Pickup" : "Return"}</p>
        <h1 className="font-display text-2xl font-semibold">{RUN_LABEL[run.kind][run.status]}</h1>
      </div>
      <Card>
        <CardContent className="space-y-2 p-4 text-sm">
          <p><strong>{run.contactName ?? "Customer"}</strong>{run.vehicleLabel ? ` · ${run.vehicleLabel}` : ""}{run.plate ? ` · ${run.plate}` : ""}</p>
          <p>{run.address}</p>
          {run.notes && <p className="text-muted-foreground">{run.notes}</p>}
          <div className="flex flex-wrap gap-2">
            <a href={maps} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 font-semibold"><Navigation className="size-4" /> Directions</a>
            <a href={`tel:${run.contactPhone}`} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 font-semibold"><Phone className="size-4" /> Call</a>
          </div>
          {run.fee > 0 && <p className="text-xs text-muted-foreground">Fee GH₵{(run.fee / 100).toFixed(0)} — added to the job&apos;s invoice.</p>}
        </CardContent>
      </Card>
      {(run.status === "scheduled" || run.status === "assigned") && <Button className="w-full" disabled={pending} onClick={() => step("en_route")}>Start — I&apos;m on my way</Button>}
      {run.status === "en_route" && <Button className="w-full" disabled={pending} onClick={() => step("arrived")}>I&apos;ve arrived</Button>}
      {run.status === "arrived" && <ReportForm garageId={garageId} run={run} onDone={() => { setMsg("Saved — the customer has been sent the report."); router.refresh() }} />}
      {msg && <p className="rounded-lg bg-surface-sunken p-3 text-sm">{msg}</p>}
    </div>
  )
}
