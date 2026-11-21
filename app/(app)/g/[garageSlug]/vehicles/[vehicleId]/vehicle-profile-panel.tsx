"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeftRight, Camera, Check, FileText, Gauge, Upload, X } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { PlateChip } from "@/components/brand/plate-chip"
import { StatusPill } from "@/components/brand/status-pill"
import { VehicleHealthCard, type RingStatus } from "@/components/brand/vehicle-health-card"
import type { VehicleType } from "@/components/brand/car-avatar"
import {
  listInsurancePartners,
  upsertInsurancePolicy,
} from "@/lib/insurance/actions"
import { upsertDvlaRecord } from "@/lib/dvla/actions"
import {
  recordLastOilChange,
  recordOdometer,
  reviewOdometer,
  transferOwnership,
  uploadVehicleDocument,
} from "@/lib/vehicles/actions"
import { VehicleFormDrawer, type VehicleFormValues } from "../vehicle-form-drawer"

const inputCls =
  "min-h-10 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
const labelCls = "text-xs font-bold uppercase tracking-wide text-muted-foreground"

const BODY_TO_TYPE: Record<string, VehicleType> = {
  sedan: "sedan", hatchback: "hatchback", suv: "suv", pickup: "pickup",
  van: "van", bus: "bus", truck: "truck", motorbike: "motorbike", other: "other",
}

type Vehicle = {
  id: string
  plateNumber: string
  vin: string | null
  make: string
  model: string
  year: number | null
  color: string | null
  colorHex: string | null
  bodyType: string | null
  fuelType: string | null
  transmission: string | null
  engineSize: string | null
  usage: string | null
  notes: string | null
  lastOdometerKm: number | null
  lastOdometerAt: string | null
  kmPerDay: number | null
  kmPerDayConfidence: string | null
}

type Reading = {
  id: string
  readingKm: number
  readAt: string
  source: string
  status: string
  flagReason: string | null
  odometerReplaced: boolean | null
}

type Doc = {
  id: string
  type: string
  fileName: string | null
  mimeType: string | null
  expiresOn: string | null
  storagePath: string
  createdAt: string
}

const DOC_TYPES = [
  ["insurance_policy", "Insurance policy"],
  ["insurance_sticker", "Insurance sticker"],
  ["roadworthy_certificate", "Roadworthy certificate"],
  ["vehicle_registration", "Vehicle registration"],
  ["drivers_licence", "Driver's licence"],
  ["national_id", "National ID"],
  ["vehicle_photo", "Vehicle photo"],
  ["invoice_pdf", "Invoice PDF"],
  ["receipt_pdf", "Receipt PDF"],
  ["other", "Other"],
] as const

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

export function VehicleProfilePanel(props: {
  garageSlug: string
  garageId: string
  garageName: string
  vehicle: Vehicle
  owner: { id: string; name: string; phone: string } | null
  ownerships: { id: string; fromDate: string; toDate: string | null; isPrimary: boolean; customerName: string | null }[]
  readings: Reading[]
  documents: Doc[]
  dueItems: { id: string; type: string; title: string; effectiveDueDate: string; predictedDueDate: string | null; dueMileageKm: number | null; status: string }[]
  insurance: { id: string; insurerName: string; partnerName: string | null; policyType: string; policyNumber: string | null; stickerNumber: string | null; startDate: string; endDate: string; premium: number | null; isCurrent: boolean }[]
  dvla: { id: string; type: string; referenceNumber: string | null; expiryDate: string }[]
  jobs: { id: string; number: string; status: string; complaint: string | null; promisedAt: Date | string | null; createdAt: Date | string }[]
  timeline: { at: Date | string; kind: string; title: string; detail?: string; tone?: string }[]
  rings: {
    oil: { status: RingStatus; nextDue?: string }
    insurance: { status: RingStatus; nextDue?: string }
    dvla: { status: RingStatus; nextDue?: string }
    issues: { status: RingStatus; nextDue?: string }
  }
  mileage: {
    kmPerDay: number | null
    confidence: "high" | "medium" | "low" | null
    predictedOdometer: number | null
    lastValidKm: number | null
    lastValidAt: string | null
    nextDue: { title: string; effectiveDueDate: string; predictedDueDate: string | null; dueMileageKm: number | null } | null
  }
  customerOptions: { id: string; name: string; phone: string }[]
  canRecordOdometer: boolean
  canOverrideOdometer: boolean
  canUpdateVehicle: boolean
}) {
  const {
    garageSlug, garageId, vehicle, owner, ownerships, readings, documents,
    dueItems, insurance, dvla, jobs, timeline, rings, mileage,
    customerOptions, canRecordOdometer, canOverrideOdometer, canUpdateVehicle,
  } = props

  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [odoKm, setOdoKm] = useState("")
  const [odoReplaced, setOdoReplaced] = useState(false)
  const [odoMsg, setOdoMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [transferTo, setTransferTo] = useState("")
  const [transferDate, setTransferDate] = useState("")
  const [transferMsg, setTransferMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [docType, setDocType] = useState<string>("other")
  const [docExpires, setDocExpires] = useState("")
  const [docMsg, setDocMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [oilOpen, setOilOpen] = useState(false)
  const [oilForm, setOilForm] = useState({ performedOn: "", odometerKm: "", oilGrade: "", oilBrand: "", oilQuantityMl: "", oilFilters: "" })
  const [oilMsg, setOilMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [insOpen, setInsOpen] = useState(false)
  const [insForm, setInsForm] = useState({ insurerName: "", partnerId: "", policyType: "comprehensive", policyNumber: "", stickerNumber: "", startDate: "", endDate: "", premium: "" })
  const [insMsg, setInsMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [partners, setPartners] = useState<{ id: string; name: string }[]>([])
  const [dvlaOpen, setDvlaOpen] = useState(false)
  const [dvlaForm, setDvlaForm] = useState({ type: "roadworthy", referenceNumber: "", issueDate: "", expiryDate: "" })
  const [dvlaMsg, setDvlaMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [editOpen, setEditOpen] = useState(false)

  const flagged = readings.filter((r) => r.status === "flagged")
  const vtype = BODY_TO_TYPE[vehicle.bodyType ?? ""] ?? "sedan"

  function submitOdometer() {
    const km = Number(odoKm)
    if (!Number.isInteger(km) || km < 0) {
      setOdoMsg({ ok: false, text: "Enter a whole-number reading" })
      return
    }
    setOdoMsg(null)
    startTransition(async () => {
      const res = await recordOdometer({
        garageId,
        vehicleId: vehicle.id,
        readingKm: km,
        source: "staff_update",
        odometerReplaced: odoReplaced,
      })
      if (!res.ok) {
        setOdoMsg({ ok: false, text: res.error.message })
        return
      }
      setOdoMsg(
        res.data.status === "flagged"
          ? { ok: false, text: "Reading flagged for review — it won't count toward mileage until approved." }
          : { ok: true, text: `Recorded ${km.toLocaleString()} km.` }
      )
      setOdoKm("")
      setOdoReplaced(false)
      router.refresh()
    })
  }

  function review(readingId: string, decision: "approve" | "reject") {
    startTransition(async () => {
      const res = await reviewOdometer({ garageId, readingId, decision })
      if (!res.ok) setOdoMsg({ ok: false, text: res.error.message })
      router.refresh()
    })
  }

  function submitTransfer() {
    if (!transferTo) {
      setTransferMsg({ ok: false, text: "Pick the new owner" })
      return
    }
    setTransferMsg(null)
    startTransition(async () => {
      const res = await transferOwnership({
        garageId,
        vehicleId: vehicle.id,
        newCustomerId: transferTo,
        effectiveDate: transferDate || undefined,
      })
      if (!res.ok) {
        setTransferMsg({ ok: false, text: res.error.message })
        return
      }
      setTransferMsg({ ok: true, text: "Ownership transferred." })
      setTransferTo("")
      setTransferDate("")
      router.refresh()
    })
  }

  function submitOilChange(e: React.FormEvent) {
    e.preventDefault()
    if (!oilForm.performedOn) {
      setOilMsg({ ok: false, text: "Pick the service date" })
      return
    }
    setOilMsg(null)
    startTransition(async () => {
      const res = await recordLastOilChange({
        garageId,
        vehicleId: vehicle.id,
        performedOn: oilForm.performedOn,
        odometerKm: oilForm.odometerKm ? Number(oilForm.odometerKm) : null,
        oilGrade: oilForm.oilGrade,
        oilBrand: oilForm.oilBrand,
        oilQuantityMl: oilForm.oilQuantityMl ? Number(oilForm.oilQuantityMl) : null,
        oilFilters: oilForm.oilFilters,
      })
      if (!res.ok) {
        setOilMsg({ ok: false, text: res.error.message })
        return
      }
      setOilMsg({ ok: true, text: "Oil change recorded — next reminder scheduled." })
      setOilOpen(false)
      setOilForm({ performedOn: "", odometerKm: "", oilGrade: "", oilBrand: "", oilQuantityMl: "", oilFilters: "" })
      router.refresh()
    })
  }

  function openInsuranceForm() {
    setInsOpen(true)
    if (!partners.length) {
      listInsurancePartners().then((rows) => setPartners(rows.map((p) => ({ id: p.id, name: p.name }))))
    }
  }

  function submitInsurance(e: React.FormEvent) {
    e.preventDefault()
    if (!insForm.insurerName.trim() || !insForm.startDate || !insForm.endDate) {
      setInsMsg({ ok: false, text: "Insurer and dates are required" })
      return
    }
    setInsMsg(null)
    startTransition(async () => {
      const res = await upsertInsurancePolicy({
        garageId, vehicleId: vehicle.id,
        insurerName: insForm.insurerName.trim(),
        partnerId: insForm.partnerId || undefined,
        policyType: insForm.policyType as "third_party" | "third_party_fire_theft" | "comprehensive",
        policyNumber: insForm.policyNumber || undefined,
        stickerNumber: insForm.stickerNumber || undefined,
        startDate: insForm.startDate, endDate: insForm.endDate,
        premium: insForm.premium ? Math.round(Number(insForm.premium) * 100) : null,
      })
      if (!res.ok) { setInsMsg({ ok: false, text: res.error.message }); return }
      setInsMsg({ ok: true, text: "Policy saved — renewal reminder scheduled." })
      setInsOpen(false)
      router.refresh()
    })
  }

  function submitDvla(e: React.FormEvent) {
    e.preventDefault()
    if (!dvlaForm.expiryDate) { setDvlaMsg({ ok: false, text: "Expiry date is required" }); return }
    setDvlaMsg(null)
    startTransition(async () => {
      const res = await upsertDvlaRecord({
        garageId, vehicleId: vehicle.id,
        type: dvlaForm.type,
        referenceNumber: dvlaForm.referenceNumber || undefined,
        issueDate: dvlaForm.issueDate || undefined,
        expiryDate: dvlaForm.expiryDate,
      })
      if (!res.ok) { setDvlaMsg({ ok: false, text: res.error.message }); return }
      setDvlaMsg({ ok: true, text: "Record saved — renewal reminder scheduled." })
      setDvlaOpen(false)
      router.refresh()
    })
  }

  function submitDoc() {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setDocMsg({ ok: false, text: "Choose a file" })
      return
    }
    setDocMsg(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("garageId", garageId)
      fd.set("vehicleId", vehicle.id)
      fd.set("type", docType)
      fd.set("expiresOn", docExpires)
      fd.set("file", file)
      const res = await uploadVehicleDocument(fd)
      if (!res.ok) {
        setDocMsg({ ok: false, text: res.error.message })
        return
      }
      setDocMsg({ ok: true, text: `Uploaded ${file.name}` })
      if (fileRef.current) fileRef.current.value = ""
      router.refresh()
    })
  }

  const editInitial: VehicleFormValues = {
    id: vehicle.id,
    customerId: owner?.id ?? "",
    plateNumber: vehicle.plateNumber,
    vin: vehicle.vin ?? "",
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year?.toString() ?? "",
    color: vehicle.color ?? "",
    colorHex: vehicle.colorHex ?? "",
    bodyType: vehicle.bodyType ?? "sedan",
    fuelType: vehicle.fuelType ?? "",
    transmission: vehicle.transmission ?? "",
    engineSize: vehicle.engineSize ?? "",
    usage: vehicle.usage ?? "private",
    notes: vehicle.notes ?? "",
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/g/${garageSlug}/vehicles`} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
            ← Vehicles
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 font-display text-3xl font-bold">
            <PlateChip plate={vehicle.plateNumber} />
            <span>
              {vehicle.make} {vehicle.model}
              {vehicle.year ? ` · ${vehicle.year}` : ""}
            </span>
          </h1>
          <p className="mt-1 text-muted-foreground">
            {[vehicle.color, vehicle.fuelType, vehicle.transmission, vehicle.usage?.replace(/_/g, " ")]
              .filter(Boolean)
              .join(" · ") || "No details yet"}
          </p>
        </div>
        {canUpdateVehicle && (
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            Edit vehicle
          </Button>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-2">
          <VehicleHealthCard
            plate={vehicle.plateNumber}
            nickname={`${vehicle.make} ${vehicle.model}`}
            type={vtype}
            color={vehicle.colorHex ?? vehicle.color ?? undefined}
            oil={rings.oil}
            insurance={rings.insurance}
            dvla={rings.dvla}
            issues={rings.issues}
          />

          {/* Mileage estimate (P1-03) */}
          <Card>
            <CardContent className="p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                <Gauge className="size-5 text-primary" /> Mileage estimate
              </h2>
              {mileage.kmPerDay != null ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border-2 border-border bg-surface-muted/50 p-3">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Rate</p>
                    <p className="font-display text-xl font-bold">
                      ≈ {mileage.kmPerDay.toFixed(1)} km/day
                    </p>
                    <StatusPill tone={mileage.confidence === "high" ? "ok" : mileage.confidence === "medium" ? "info" : "warning"}>
                      {mileage.confidence ?? "low"} confidence
                    </StatusPill>
                  </div>
                  <div className="rounded-xl border-2 border-border bg-surface-muted/50 p-3">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Est. odometer now</p>
                    <p className="font-display text-xl font-bold">
                      {mileage.predictedOdometer?.toLocaleString() ?? "—"} km
                    </p>
                    <p className="text-xs text-muted-foreground">
                      last valid {mileage.lastValidKm?.toLocaleString() ?? "—"} km
                    </p>
                  </div>
                  <div className="rounded-xl border-2 border-border bg-surface-muted/50 p-3">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Next due</p>
                    <p className="font-display text-lg font-bold leading-tight">
                      {mileage.nextDue ? fmtDate(mileage.nextDue.effectiveDueDate) : "—"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {mileage.nextDue?.title ?? "no open mileage items"}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Not enough readings yet — record at least two odometer values to unlock predictions.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Odometer */}
          <Card>
            <CardContent className="p-5">
              <h2 className="font-display text-lg font-bold">Odometer</h2>
              {canRecordOdometer && (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="w-40">
                      <label className={labelCls}>Reading (km)</label>
                      <input
                        className={inputCls}
                        type="number"
                        min={0}
                        placeholder={vehicle.lastOdometerKm?.toLocaleString() ?? "0"}
                        value={odoKm}
                        onChange={(e) => setOdoKm(e.target.value)}
                      />
                    </div>
                    <label className="flex items-center gap-2 pb-2 text-sm font-semibold">
                      <input type="checkbox" checked={odoReplaced} onChange={(e) => setOdoReplaced(e.target.checked)} />
                      Odometer replaced
                    </label>
                    <Button size="sm" disabled={pending} onClick={submitOdometer}>
                      Record
                    </Button>
                  </div>
                  {odoMsg && (
                    <p className={`text-sm font-semibold ${odoMsg.ok ? "text-success" : "text-warning"}`}>{odoMsg.text}</p>
                  )}
                </div>
              )}

              {flagged.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-warning">Flagged readings</p>
                  {flagged.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-warning/50 bg-warning/10 px-3 py-2 text-sm">
                      <span className="font-bold">{r.readingKm.toLocaleString()} km</span>
                      <span className="text-muted-foreground">{fmtDate(r.readAt)}</span>
                      <span className="text-xs text-muted-foreground">{r.flagReason?.replace(/_/g, " ")}</span>
                      {canOverrideOdometer && (
                        <span className="ml-auto flex gap-2">
                          <Button size="sm" variant="secondary" disabled={pending} onClick={() => review(r.id, "approve")}>
                            <Check className="size-4" /> Approve
                          </Button>
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => review(r.id, "reject")}>
                            <X className="size-4" /> Reject
                          </Button>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <ul className="mt-4 divide-y divide-border">
                {readings.slice(0, 10).map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="font-bold">{r.readingKm.toLocaleString()} km</span>
                    <span className="text-muted-foreground">{fmtDate(r.readAt)}</span>
                    <span className="text-xs text-muted-foreground">{r.source.replace(/_/g, " ")}</span>
                    {r.status !== "valid" && <StatusPill tone={r.status === "flagged" ? "warning" : "danger"}>{r.status}</StatusPill>}
                  </li>
                ))}
                {readings.length === 0 && <li className="py-4 text-sm text-muted-foreground">No readings yet.</li>}
              </ul>
            </CardContent>
          </Card>

          {/* Due items */}
          <Card>
            <CardContent className="p-5">
              <h2 className="font-display text-lg font-bold">Open due items</h2>
              {dueItems.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nothing scheduled.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {dueItems.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 rounded-lg border-2 border-border px-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{d.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.type.replace(/_/g, " ")}
                          {d.predictedDueDate && d.predictedDueDate !== d.effectiveDueDate
                            ? ` · predicted ${fmtDate(d.predictedDueDate)}`
                            : ""}
                          {d.dueMileageKm ? ` · due at ${d.dueMileageKm.toLocaleString()} km` : ""}
                        </p>
                      </div>
                      <StatusPill status={d.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Record last oil change (manual entry) */}
          {canRecordOdometer && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold">Oil change</h2>
                  <Button size="sm" variant="secondary" onClick={() => setOilOpen((v) => !v)}>
                    {oilOpen ? "Close" : "Record last oil change"}
                  </Button>
                </div>
                {oilOpen && (
                  <form onSubmit={submitOilChange} className="mt-4 grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className={labelCls}>Service date *</label>
                      <input className={inputCls} type="date" required value={oilForm.performedOn} onChange={(e) => setOilForm({ ...oilForm, performedOn: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>Odometer (km)</label>
                      <input className={inputCls} type="number" min={0} placeholder={vehicle.lastOdometerKm?.toLocaleString() ?? "0"} value={oilForm.odometerKm} onChange={(e) => setOilForm({ ...oilForm, odometerKm: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>Oil grade</label>
                      <select className={inputCls} value={oilForm.oilGrade} onChange={(e) => setOilForm({ ...oilForm, oilGrade: e.target.value })}>
                        <option value="">—</option>
                        <option value="mineral">Mineral</option>
                        <option value="semi_synthetic">Semi-synthetic</option>
                        <option value="fully_synthetic">Fully synthetic</option>
                        <option value="diesel_commercial">Diesel / commercial</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Brand</label>
                      <input className={inputCls} value={oilForm.oilBrand} onChange={(e) => setOilForm({ ...oilForm, oilBrand: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>Quantity (ml)</label>
                      <input className={inputCls} type="number" min={0} value={oilForm.oilQuantityMl} onChange={(e) => setOilForm({ ...oilForm, oilQuantityMl: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>Filters</label>
                      <input className={inputCls} placeholder="oil, air…" value={oilForm.oilFilters} onChange={(e) => setOilForm({ ...oilForm, oilFilters: e.target.value })} />
                    </div>
                    <div className="flex items-end gap-2 sm:col-span-2">
                      <Button type="submit" disabled={pending}>Save</Button>
                      {oilMsg && <p className={`text-sm font-semibold ${oilMsg.ok ? "text-success" : "text-warning"}`}>{oilMsg.text}</p>}
                    </div>
                  </form>
                )}
                {!oilOpen && oilMsg && <p className={`mt-2 text-sm font-semibold ${oilMsg.ok ? "text-success" : "text-warning"}`}>{oilMsg.text}</p>}
              </CardContent>
            </Card>
          )}

          {/* Jobs */}
          <Card>
            <CardContent className="p-5">
              <h2 className="font-display text-lg font-bold">Jobs</h2>
              {jobs.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No jobs for this vehicle yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {jobs.map((j) => (
                    <li key={j.id}>
                      <Link href={`/g/${garageSlug}/jobs/${j.id}`} className="flex items-center gap-3 rounded-lg border-2 border-border px-3 py-2 text-sm hover:bg-surface-muted/60">
                        <span className="font-mono font-bold">{j.number}</span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">{j.complaint ?? "—"}</span>
                        <StatusPill status={j.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Owner */}
          <Card>
            <CardContent className="p-5">
              <h2 className="font-display text-lg font-bold">Owner</h2>
              {owner ? (
                <div className="mt-2">
                  <Link href={`/g/${garageSlug}/customers/${owner.id}`} className="font-semibold text-primary hover:underline">
                    {owner.name}
                  </Link>
                  <p className="text-sm text-muted-foreground">{owner.phone}</p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No owner assigned.</p>
              )}

              {ownerships.length > 0 && (
                <div className="mt-3">
                  <p className={labelCls}>Ownership history</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {ownerships.map((o) => (
                      <li key={o.id} className="flex justify-between gap-2">
                        <span>{o.customerName ?? "—"}</span>
                        <span className="text-muted-foreground">
                          {fmtDate(o.fromDate)} → {o.toDate ? fmtDate(o.toDate) : "now"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {canUpdateVehicle && owner && (
                <div className="mt-4 border-t-2 border-border pt-4">
                  <p className={labelCls}>Transfer ownership</p>
                  <div className="mt-2 space-y-2">
                    <select className={inputCls} value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                      <option value="">New owner…</option>
                      {customerOptions.filter((c) => c.id !== owner.id).map((c) => (
                        <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>
                      ))}
                    </select>
                    <input className={inputCls} type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} aria-label="Effective date" />
                    <Button size="sm" variant="secondary" className="w-full" disabled={pending} onClick={submitTransfer}>
                      <ArrowLeftRight className="size-4" /> Transfer
                    </Button>
                    {transferMsg && (
                      <p className={`text-sm font-semibold ${transferMsg.ok ? "text-success" : "text-danger"}`}>{transferMsg.text}</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Specs */}
          <Card>
            <CardContent className="p-5">
              <h2 className="font-display text-lg font-bold">Details</h2>
              <dl className="mt-3 space-y-1.5 text-sm">
                {[
                  ["VIN", vehicle.vin],
                  ["Engine", vehicle.engineSize],
                  ["Body", vehicle.bodyType?.replace(/_/g, " ")],
                  ["Fuel", vehicle.fuelType],
                  ["Gearbox", vehicle.transmission],
                  ["Usage", vehicle.usage?.replace(/_/g, " ")],
                  ["Colour", vehicle.color],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-semibold capitalize">{String(v)}</dd>
                  </div>
                ))}
              </dl>
              {vehicle.notes && <p className="mt-3 rounded-lg bg-surface-muted p-3 text-sm">{vehicle.notes}</p>}
            </CardContent>
          </Card>

          {/* Insurance */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">Insurance</h2>
                {canUpdateVehicle && (
                  <Button size="sm" variant="secondary" onClick={() => (insOpen ? setInsOpen(false) : openInsuranceForm())}>
                    {insOpen ? "Close" : insurance.length ? "Add policy" : "Add policy"}
                  </Button>
                )}
              </div>
              {insurance.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No active policy.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {insurance.map((p) => (
                    <li key={p.id} className="rounded-lg border-2 border-border p-3">
                      <p className="font-semibold">{p.insurerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.policyType.replace(/_/g, " ")}{p.partnerName ? ` · via ${p.partnerName}` : ""}
                        {p.policyNumber ? ` · ${p.policyNumber}` : ""}
                      </p>
                      {p.premium != null && <p className="text-xs text-muted-foreground">Premium GH₵ {(p.premium / 100).toLocaleString("en-GH")}</p>}
                      <p className="mt-1 text-xs">Expires {fmtDate(p.endDate)}</p>
                    </li>
                  ))}
                </ul>
              )}
              {insOpen && canUpdateVehicle && (
                <form onSubmit={submitInsurance} className="mt-4 grid gap-2 sm:grid-cols-2">
                  <input className={inputCls} placeholder="Insurer name *" value={insForm.insurerName} onChange={(e) => setInsForm({ ...insForm, insurerName: e.target.value })} />
                  <select className={inputCls} value={insForm.partnerId} onChange={(e) => setInsForm({ ...insForm, partnerId: e.target.value })}>
                    <option value="">Direct / no partner</option>
                    {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select className={inputCls} value={insForm.policyType} onChange={(e) => setInsForm({ ...insForm, policyType: e.target.value })}>
                    <option value="third_party">Third party</option>
                    <option value="third_party_fire_theft">Third party, fire &amp; theft</option>
                    <option value="comprehensive">Comprehensive</option>
                  </select>
                  <input className={inputCls} placeholder="Policy number" value={insForm.policyNumber} onChange={(e) => setInsForm({ ...insForm, policyNumber: e.target.value })} />
                  <input className={inputCls} placeholder="Sticker number" value={insForm.stickerNumber} onChange={(e) => setInsForm({ ...insForm, stickerNumber: e.target.value })} />
                  <input className={inputCls} type="number" min={0} step="0.01" placeholder="Premium GH₵" value={insForm.premium} onChange={(e) => setInsForm({ ...insForm, premium: e.target.value })} />
                  <div><label className={labelCls}>Start *</label><input className={inputCls} type="date" required value={insForm.startDate} onChange={(e) => setInsForm({ ...insForm, startDate: e.target.value })} /></div>
                  <div><label className={labelCls}>End *</label><input className={inputCls} type="date" required value={insForm.endDate} onChange={(e) => setInsForm({ ...insForm, endDate: e.target.value })} /></div>
                  <div className="flex items-end gap-2 sm:col-span-2">
                    <Button type="submit" disabled={pending}>Save policy</Button>
                    {insMsg && <p className={`text-sm font-semibold ${insMsg.ok ? "text-success" : "text-warning"}`}>{insMsg.text}</p>}
                  </div>
                </form>
              )}
              {!insOpen && insMsg && <p className={`mt-2 text-sm font-semibold ${insMsg.ok ? "text-success" : "text-warning"}`}>{insMsg.text}</p>}
            </CardContent>
          </Card>

          {/* DVLA */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">DVLA records</h2>
                {canUpdateVehicle && (
                  <Button size="sm" variant="secondary" onClick={() => setDvlaOpen(!dvlaOpen)}>
                    {dvlaOpen ? "Close" : "Add record"}
                  </Button>
                )}
              </div>
              {dvla.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No records.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {dvla.map((r) => (
                    <li key={r.id} className="flex items-center justify-between rounded-lg border-2 border-border px-3 py-2">
                      <div>
                        <p className="font-semibold">{r.type.replace(/_/g, " ")}</p>
                        {r.referenceNumber && <p className="text-xs text-muted-foreground">{r.referenceNumber}</p>}
                      </div>
                      <span className="text-xs">{fmtDate(r.expiryDate)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {dvlaOpen && canUpdateVehicle && (
                <form onSubmit={submitDvla} className="mt-4 grid gap-2 sm:grid-cols-2">
                  <select className={inputCls} value={dvlaForm.type} onChange={(e) => setDvlaForm({ ...dvlaForm, type: e.target.value })}>
                    <option value="roadworthy">Roadworthy certificate</option>
                    <option value="registration_licence">Registration / licence</option>
                    <option value="drivers_licence">Driver's licence</option>
                  </select>
                  <input className={inputCls} placeholder="Reference number" value={dvlaForm.referenceNumber} onChange={(e) => setDvlaForm({ ...dvlaForm, referenceNumber: e.target.value })} />
                  <div><label className={labelCls}>Issue date</label><input className={inputCls} type="date" value={dvlaForm.issueDate} onChange={(e) => setDvlaForm({ ...dvlaForm, issueDate: e.target.value })} /></div>
                  <div><label className={labelCls}>Expiry *</label><input className={inputCls} type="date" required value={dvlaForm.expiryDate} onChange={(e) => setDvlaForm({ ...dvlaForm, expiryDate: e.target.value })} /></div>
                  <div className="flex items-end gap-2 sm:col-span-2">
                    <Button type="submit" disabled={pending}>Save record</Button>
                    {dvlaMsg && <p className={`text-sm font-semibold ${dvlaMsg.ok ? "text-success" : "text-warning"}`}>{dvlaMsg.text}</p>}
                  </div>
                </form>
              )}
              {!dvlaOpen && dvlaMsg && <p className={`mt-2 text-sm font-semibold ${dvlaMsg.ok ? "text-success" : "text-warning"}`}>{dvlaMsg.text}</p>}
            </CardContent>
          </Card>

          {/* Documents */}
          <Card>
            <CardContent className="p-5">
              <h2 className="font-display text-lg font-bold">Documents</h2>
              {canUpdateVehicle && (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select className={inputCls} value={docType} onChange={(e) => setDocType(e.target.value)}>
                      {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <input className={inputCls} type="date" value={docExpires} onChange={(e) => setDocExpires(e.target.value)} aria-label="Expiry date" />
                  </div>
                  <div className="flex items-center gap-2">
                    <input ref={fileRef} type="file" className="min-w-0 flex-1 text-xs" aria-label="Document file" />
                    <Button size="sm" variant="secondary" disabled={pending} onClick={submitDoc}>
                      <Upload className="size-4" /> Upload
                    </Button>
                  </div>
                  {docMsg && <p className={`text-sm font-semibold ${docMsg.ok ? "text-success" : "text-danger"}`}>{docMsg.text}</p>}
                </div>
              )}
              {documents.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {documents.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 rounded-lg border-2 border-border px-3 py-2 text-sm">
                      {d.mimeType?.startsWith("image/") ? <Camera className="size-4 shrink-0 text-muted-foreground" /> : <FileText className="size-4 shrink-0 text-muted-foreground" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{d.fileName ?? d.type.replace(/_/g, " ")}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.type.replace(/_/g, " ")}{d.expiresOn ? ` · expires ${fmtDate(d.expiresOn)}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Timeline */}
      <Card>
        <CardContent className="p-5">
          <h2 className="font-display text-lg font-bold">Timeline</h2>
          {timeline.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ol className="mt-4 space-y-0">
              {timeline.map((t, i) => (
                <li key={i} className="flex gap-3 pb-4 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span className={`mt-1 size-2.5 rounded-full ${
                      t.tone === "warning" ? "bg-warning" : t.tone === "danger" ? "bg-danger" : "bg-primary"
                    }`} />
                    {i < timeline.length - 1 && <span className="w-0.5 flex-1 bg-border" />}
                  </div>
                  <div className="min-w-0 flex-1 pb-1">
                    <p className="text-sm font-semibold">{t.title}</p>
                    {t.detail && <p className="text-xs text-muted-foreground">{t.detail}</p>}
                    <p className="text-[11px] text-muted-foreground">{fmtDate(t.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <VehicleFormDrawer
        garageId={garageId}
        garageSlug={garageSlug}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={editInitial}
        customerOptions={customerOptions}
        onSaved={() => { setEditOpen(false); router.refresh() }}
      />
    </div>
  )
}
