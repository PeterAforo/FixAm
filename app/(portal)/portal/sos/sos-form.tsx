"use client"

import Link from "next/link"
import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Camera, Crosshair, Siren } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { sendSos } from "@/lib/towing/actions"
import { PROBLEMS, STATUS_LABEL, problemLabel, type SosStatus } from "@/lib/towing/core"
import { searchDestinationGarages, type DestGarage, type DriverCar } from "@/lib/parts-shop/actions"
import { shrinkPhoto } from "@/components/part-photo/shrink"

const field = "min-h-11 w-full rounded-xl border border-input bg-card px-3.5 text-sm"

/** P8-15: one screen to call for a tow — location, what happened, (optional) garage. */
export function SosForm({ cars, myGarages, recent }: { cars: DriverCar[]; myGarages: DestGarage[]; recent: { id: string; number: string; status: string; problem: string; createdAt: string }[] }) {
  const router = useRouter()
  const [loc, setLoc] = useState<{ lat: number; lng: number; acc: number } | null>(null)
  const [locMsg, setLocMsg] = useState<string | null>(null)
  const [problem, setProblem] = useState<string>("wont_start")
  const [notes, setNotes] = useState("")
  const [landmark, setLandmark] = useState("")
  const [carKey, setCarKey] = useState(cars[0]?.key ?? "")
  const [garageId, setGarageId] = useState<string>(myGarages[0]?.id ?? "")
  const [garageQ, setGarageQ] = useState("")
  const [hits, setHits] = useState<DestGarage[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const live = recent.find((r) => ["searching", "assigned", "en_route", "arrived", "towing"].includes(r.status))

  function locate() {
    setLocMsg("Finding you…")
    if (!navigator.geolocation) return setLocMsg("This phone can't share location — describe where you are below")
    navigator.geolocation.getCurrentPosition(
      (p) => { setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }); setLocMsg(null) },
      () => setLocMsg("Location is blocked — allow it for FixAm in your browser settings and try again"),
      { enableHighAccuracy: true, timeout: 15_000 },
    )
  }

  function findGarage(v: string) {
    setGarageQ(v)
    if (v.trim().length < 2) return setHits([])
    start(async () => setHits(await searchDestinationGarages(v)))
  }

  function submit() {
    setErr(null)
    if (!loc) return setErr("Share your location first so tow trucks can find you")
    start(async () => {
      const car = cars.find((c) => c.key === carKey)
      const fd = new FormData()
      fd.set("lat", String(loc.lat)); fd.set("lng", String(loc.lng)); fd.set("problem", problem)
      if (notes.trim()) fd.set("notes", notes.trim())
      if (landmark.trim()) fd.set("landmark", landmark.trim())
      if (car) { fd.set("make", car.make); fd.set("model", car.model); if (car.year) fd.set("year", String(car.year)) }
      if (garageId) fd.set("destinationGarageId", garageId)
      for (const f of files) fd.append("photos", await shrinkPhoto(f))
      const r = await sendSos(fd)
      if (!r.ok) return setErr(r.error)
      router.push(`/portal/sos/${r.sosId}`)
    })
  }

  return (
    <div className="mt-6 space-y-4">
      {live && (
        <Link href={`/portal/sos/${live.id}`} className="block rounded-xl border border-red-300 bg-red-50 p-4 text-sm dark:bg-red-950/30">
          <strong>{live.number}</strong> — {STATUS_LABEL[live.status as SosStatus]}. Tap to follow.
        </Link>
      )}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">1. Where are you?</p>
            <Button type="button" variant={loc ? "secondary" : "primary"} className="mt-1 w-full" onClick={locate}>
              <Crosshair className="size-4" /> {loc ? `Location found (±${Math.round(loc.acc)} m) — update` : "Share my location"}
            </Button>
            {locMsg && <p className="mt-1 text-xs text-muted-foreground">{locMsg}</p>}
            <input className={`${field} mt-2`} placeholder="Landmark (e.g. near Shell, Tetteh Quarshie)" value={landmark} onChange={(e) => setLandmark(e.target.value)} />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">2. What happened?</p>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PROBLEMS.map((p) => (
                <button key={p.id} type="button" onClick={() => setProblem(p.id)}
                  className={`rounded-xl border px-2 py-2.5 text-sm ${problem === p.id ? "border-red-500 bg-red-50 font-semibold dark:bg-red-950/30" : "border-border"}`}>{p.label}</button>
              ))}
            </div>
            <textarea className={`${field} mt-2 py-2`} rows={2} placeholder="Anything else? (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 3))} />
            <button type="button" className="mt-2 inline-flex items-center gap-1 text-sm text-muted-foreground underline" onClick={() => fileRef.current?.click()}>
              <Camera className="size-4" /> {files.length ? `${files.length} photo(s) added` : "Add photos (optional)"}
            </button>
          </div>
          {cars.length > 0 && (
            <label className="block text-xs font-semibold text-muted-foreground">3. Which car?
              <select className={`${field} mt-1 font-normal text-foreground`} value={carKey} onChange={(e) => setCarKey(e.target.value)}>
                {cars.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                <option value="">Another car</option>
              </select>
            </label>
          )}
          <div>
            <p className="text-xs font-semibold text-muted-foreground">4. Tow to which garage? <span className="font-normal">(you can choose later)</span></p>
            <select className={`${field} mt-1`} value={garageId} onChange={(e) => setGarageId(e.target.value)}>
              <option value="">Decide later</option>
              {[...myGarages, ...hits.filter((h) => !myGarages.some((g) => g.id === h.id))].map((g) => <option key={g.id} value={g.id}>{g.name}{g.city ? ` — ${g.city}` : ""}</option>)}
            </select>
            <input className={`${field} mt-2`} placeholder="Search another garage…" value={garageQ} onChange={(e) => findGarage(e.target.value)} />
          </div>
          {err && <p className="text-sm text-red-700">{err}</p>}
          <button type="button" disabled={pending || !loc} onClick={submit}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 py-4 text-lg font-bold text-white shadow-lg disabled:opacity-50">
            <Siren className="size-6" /> {pending ? "Calling tow trucks…" : "Send SOS"}
          </button>
          <p className="text-center text-xs text-muted-foreground">Nearby tow trucks get an SMS straight away. The first to accept is assigned; you&apos;ll see their price and arrival time before paying.</p>
        </CardContent>
      </Card>
      {recent.length > 0 && !live && (
        <div className="text-sm">
          <p className="font-semibold">Past calls</p>
          <ul className="mt-1 space-y-1">{recent.map((r) => <li key={r.id}><Link className="underline" href={`/portal/sos/${r.id}`}>{r.number}</Link> · {problemLabel(r.problem)} · {STATUS_LABEL[r.status as SosStatus]}</li>)}</ul>
        </div>
      )}
    </div>
  )
}
