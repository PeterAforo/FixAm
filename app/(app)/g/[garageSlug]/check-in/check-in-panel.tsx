"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, ChevronLeft, ChevronRight, Eraser, Plus } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { checkInJob } from "@/lib/jobs/actions"
import { createCustomer } from "@/lib/customers/actions"
import { createVehicle } from "@/lib/vehicles/actions"

const inputCls =
  "min-h-11 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
const labelCls = "text-xs font-bold uppercase tracking-wide text-muted-foreground"

type CustomerOpt = { id: string; name: string; phone: string; type: string }
type VehicleOpt = {
  id: string
  plate: string
  label: string
  ownerId: string | null
  lastOdometerKm: number | null
}
type TemplateOpt = { id: string; name: string; estimatedMinutes: number | null; createsDueItemType: string | null }
type StaffOpt = { userId: string; name: string; role: string; branchId: string | null }

export function CheckInPanel({
  garageSlug,
  garageId,
  defaultBranchId,
  prefill,
  branches,
  bays,
  customers,
  vehicles,
  templates,
  staff,
}: {
  garageSlug: string
  garageId: string
  defaultBranchId: string | null
  prefill: {
    bookingId: string
    branchId: string
    customerId: string | null
    vehicleId: string | null
    serviceType: string
    jobTemplateId: string | null
  } | null
  branches: { id: string; name: string; code: string }[]
  bays: { id: string; name: string; branchId: string }[]
  customers: CustomerOpt[]
  vehicles: VehicleOpt[]
  templates: TemplateOpt[]
  staff: StaffOpt[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  const [customerId, setCustomerId] = useState(prefill?.customerId ?? "")
  const [customerQ, setCustomerQ] = useState("")
  const [vehicleId, setVehicleId] = useState(prefill?.vehicleId ?? "")
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [ncName, setNcName] = useState("")
  const [ncPhone, setNcPhone] = useState("")
  const [showNewVehicle, setShowNewVehicle] = useState(false)
  const [nv, setNv] = useState({ plate: "", make: "", model: "", year: "" })

  const [branchId, setBranchId] = useState(prefill?.branchId ?? defaultBranchId ?? branches[0]?.id ?? "")
  const [bayId, setBayId] = useState("")
  const [templateId, setTemplateId] = useState(prefill?.jobTemplateId ?? "")
  const [mechanicIds, setMechanicIds] = useState<string[]>([])
  const [complaint, setComplaint] = useState(prefill?.serviceType ?? "")
  const [odometer, setOdometer] = useState("")
  const [fuel, setFuel] = useState(50)
  const [itemsInCar, setItemsInCar] = useState("")
  const [promisedAt, setPromisedAt] = useState("")
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal")
  const [sigEmpty, setSigEmpty] = useState(true)
  const [step, setStep] = useState(0)

  const STEPS = ["Customer & vehicle", "Job details", "Assignment", "Signature"]

  function validateStep(s: number): string | null {
    if (s === 0) {
      if (!customerId) return "Pick a customer"
      if (!vehicleId) return "Pick a vehicle"
    }
    if (s === 1) {
      if (!complaint.trim()) return "Describe the complaint"
      const odo = Number(odometer)
      if (!Number.isInteger(odo) || odo < 0) return "Enter the odometer reading (required)"
    }
    if (s === 2 && !branchId) return "Pick a branch"
    return null
  }

  function next() {
    setError(null)
    const e = validateStep(step)
    if (e) { setError(e); return }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }
  function back() {
    setError(null)
    setStep((s) => Math.max(s - 1, 0))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  const filteredCustomers = useMemo(() => {
    const q = customerQ.trim().toLowerCase()
    if (!q) return customers.slice(0, 50)
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)).slice(0, 50)
  }, [customers, customerQ])

  const customerVehicles = useMemo(
    () => vehicles.filter((v) => v.ownerId === customerId || !v.ownerId),
    [vehicles, customerId]
  )

  const branchBays = bays.filter((b) => b.branchId === branchId)
  const mechanics = staff.filter((s) => ["mechanic", "service_advisor", "manager", "owner"].includes(s.role))

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId)

  function canvasPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height }
  }
  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true
    const c = canvasRef.current!
    const ctx = c.getContext("2d")!
    const p = canvasPos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    c.setPointerCapture(e.pointerId)
  }
  function draw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext("2d")!
    const p = canvasPos(e)
    ctx.lineWidth = 2.5
    ctx.lineCap = "round"
    ctx.strokeStyle = "#1a1a2e"
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    setSigEmpty(false)
  }
  function endDraw() {
    drawing.current = false
  }
  function clearSig() {
    const c = canvasRef.current!
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height)
    setSigEmpty(true)
  }

  async function quickAddCustomer() {
    setError(null)
    const res = await createCustomer({
      garageId,
      customer: {
        type: "individual",
        fullName: ncName,
        phone: ncPhone,
        whatsappOptIn: true,
        marketingOptIn: false,
        preferredChannels: ["whatsapp", "sms"],
        tags: [],
      },
    })
    if (!res.ok) {
      setError(res.error.message)
      return
    }
    const id = res.data.customerId
    // reload page data is simplest — but we can optimistically select; refresh anyway
    setCustomerId(id)
    setShowNewCustomer(false)
    setNcName("")
    setNcPhone("")
    router.refresh()
  }

  async function quickAddVehicle() {
    if (!customerId) {
      setError("Pick a customer first")
      return
    }
    setError(null)
    const res = await createVehicle({
      garageId,
      vehicle: {
        customerId,
        plateNumber: nv.plate,
        make: nv.make,
        model: nv.model,
        year: nv.year ? Number(nv.year) : null,
        bodyType: "sedan",
        usage: "private",
      },
    })
    if (!res.ok) {
      setError(res.error.message)
      return
    }
    if (res.data.duplicate) {
      setError(`Plate already registered — opening existing vehicle.`)
      setVehicleId(res.data.duplicate.id)
      setShowNewVehicle(false)
      return
    }
    setVehicleId(res.data.vehicleId)
    setShowNewVehicle(false)
    setNv({ plate: "", make: "", model: "", year: "" })
    router.refresh()
  }

  function submit() {
    setError(null)
    setFieldErrors({})
    const odo = Number(odometer)
    if (!customerId) return setError("Pick a customer")
    if (!vehicleId) return setError("Pick a vehicle")
    if (!branchId) return setError("Pick a branch")
    if (!complaint.trim()) return setError("Describe the complaint")
    if (!Number.isInteger(odo) || odo < 0) return setError("Enter the odometer reading (required)")

    const sig = sigEmpty || !canvasRef.current ? undefined : canvasRef.current.toDataURL("image/png")

    startTransition(async () => {
      const res = await checkInJob({
        garageId,
        branchId,
        bookingId: prefill?.bookingId,
        customerId,
        vehicleId,
        jobTemplateId: templateId || undefined,
        bayId: bayId || undefined,
        mechanicIds,
        complaint: complaint.trim(),
        checkInOdometerKm: odo,
        checkInFuelLevel: fuel,
        checkInItems: itemsInCar || undefined,
        promisedAt: promisedAt ? new Date(promisedAt).toISOString() : undefined,
        priority,
        signatureDataUrl: sig,
      })
      if (!res.ok) {
        setError(res.error.message)
        setFieldErrors(res.error.fieldErrors ?? {})
        return
      }
      const url = res.data.trackerUrl
        ? `/g/${garageSlug}/jobs/${res.data.jobId}?tracker=${encodeURIComponent(res.data.trackerUrl)}`
        : `/g/${garageSlug}/jobs/${res.data.jobId}`
      router.push(url)
    })
  }

  const ferr = (k: string) => fieldErrors[k]?.[0]

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Check in vehicle</h1>
        <p className="text-muted-foreground">Fast intake — customer, vehicle, complaint, odometer, assignment.</p>
        {/* Stepper */}
        <ol className="mt-4 flex items-center gap-2">
          {STEPS.map((label, i) => (
            <li key={label} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => i < step && setStep(i)}
                className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${
                  i < step ? "border-success bg-success text-success-foreground"
                  : i === step ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-muted-foreground"
                }`}
                aria-label={`Step ${i + 1}: ${label}`}
                aria-current={i === step ? "step" : undefined}
              >
                {i < step ? <CheckCircle2 className="size-4" /> : i + 1}
              </button>
              <span className={`hidden text-xs font-bold sm:block ${i === step ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
              {i < STEPS.length - 1 && <span className={`h-0.5 flex-1 rounded ${i < step ? "bg-success" : "bg-border"}`} />}
            </li>
          ))}
        </ol>
      </header>

      {error && <p className="rounded-lg border-2 border-danger bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">{error}</p>}

      {/* 1. Customer & vehicle */}
      {step === 0 && (
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-display text-lg font-bold">1 · Customer &amp; vehicle</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Customer *</label>
              <input
                className={inputCls}
                placeholder="Search name or phone…"
                value={customerQ}
                onChange={(e) => setCustomerQ(e.target.value)}
              />
              <select
                className={`${inputCls} mt-2`}
                value={customerId}
                onChange={(e) => { setCustomerId(e.target.value); setVehicleId("") }}
              >
                <option value="">Select customer…</option>
                {filteredCustomers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>
                ))}
              </select>
              {ferr("customerId") && <p className="mt-1 text-xs font-semibold text-danger">{ferr("customerId")}</p>}
              <button className="mt-2 text-sm font-semibold text-primary hover:underline" onClick={() => setShowNewCustomer(!showNewCustomer)}>
                <Plus className="mr-1 inline size-4" /> New customer
              </button>
            </div>

            <div>
              <label className={labelCls}>Vehicle *</label>
              <select className={inputCls} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} disabled={!customerId}>
                <option value="">{customerId ? "Select vehicle…" : "Pick a customer first"}</option>
                {customerVehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
              {ferr("vehicleId") && <p className="mt-1 text-xs font-semibold text-danger">{ferr("vehicleId")}</p>}
              {selectedVehicle && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Last reading: {selectedVehicle.lastOdometerKm?.toLocaleString() ?? "—"} km
                </p>
              )}
              <button className="mt-2 text-sm font-semibold text-primary hover:underline" onClick={() => setShowNewVehicle(!showNewVehicle)} disabled={!customerId}>
                <Plus className="mr-1 inline size-4" /> Register vehicle
              </button>
            </div>
          </div>

          {showNewCustomer && (
            <div className="grid gap-3 rounded-xl border-2 border-dashed border-border p-4 sm:grid-cols-3">
              <input className={inputCls} placeholder="Full name *" value={ncName} onChange={(e) => setNcName(e.target.value)} />
              <input className={inputCls} placeholder="Phone *" value={ncPhone} onChange={(e) => setNcPhone(e.target.value)} />
              <Button size="sm" onClick={quickAddCustomer} disabled={pending || !ncName.trim() || !ncPhone.trim()}>
                Add customer
              </Button>
            </div>
          )}

          {showNewVehicle && (
            <div className="grid gap-3 rounded-xl border-2 border-dashed border-border p-4 sm:grid-cols-5">
              <input className={`${inputCls} font-mono uppercase`} placeholder="Plate *" value={nv.plate} onChange={(e) => setNv({ ...nv, plate: e.target.value })} />
              <input className={inputCls} placeholder="Make *" value={nv.make} onChange={(e) => setNv({ ...nv, make: e.target.value })} />
              <input className={inputCls} placeholder="Model *" value={nv.model} onChange={(e) => setNv({ ...nv, model: e.target.value })} />
              <input className={inputCls} placeholder="Year" value={nv.year} onChange={(e) => setNv({ ...nv, year: e.target.value })} />
              <Button size="sm" onClick={quickAddVehicle} disabled={pending || !nv.plate.trim() || !nv.make.trim() || !nv.model.trim()}>
                Add vehicle
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* 2. Job details */}
      {step === 1 && (
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-display text-lg font-bold">2 · Job details</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Template</label>
              <select className={inputCls} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">No template — custom job</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.estimatedMinutes ? ` (~${Math.round(t.estimatedMinutes / 60 * 10) / 10}h)` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Complaint / work requested *</label>
            <textarea className={`${inputCls} min-h-20 py-2`} placeholder="e.g. Grinding noise when braking, steering pulls left…" value={complaint} onChange={(e) => setComplaint(e.target.value)} />
            {ferr("complaint") && <p className="mt-1 text-xs font-semibold text-danger">{ferr("complaint")}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Odometer (km) *</label>
              <input className={inputCls} type="number" min={0} placeholder={selectedVehicle?.lastOdometerKm?.toLocaleString() ?? "0"} value={odometer} onChange={(e) => setOdometer(e.target.value)} />
              {ferr("checkInOdometerKm") && <p className="mt-1 text-xs font-semibold text-danger">{ferr("checkInOdometerKm")}</p>}
            </div>
            <div>
              <label className={labelCls}>Fuel level — {fuel}%</label>
              <input type="range" min={0} max={100} step={5} value={fuel} onChange={(e) => setFuel(Number(e.target.value))} className="mt-3 w-full accent-primary" />
            </div>
            <div>
              <label className={labelCls}>Promised by</label>
              <input className={inputCls} type="datetime-local" value={promisedAt} onChange={(e) => setPromisedAt(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Items left in car</label>
            <input className={inputCls} placeholder="Phone, laptop, tools…" value={itemsInCar} onChange={(e) => setItemsInCar(e.target.value)} />
          </div>
        </CardContent>
      </Card>
      )}

      {/* 3. Assignment */}
      {step === 2 && (
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-display text-lg font-bold">3 · Assignment</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Branch *</label>
              <select className={inputCls} value={branchId} onChange={(e) => { setBranchId(e.target.value); setBayId("") }}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Bay</label>
              <select className={inputCls} value={bayId} onChange={(e) => setBayId(e.target.value)}>
                <option value="">Unassigned</option>
                {branchBays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Mechanics</label>
              <div className="mt-1 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-lg border-2 border-border p-2">
                {mechanics.length === 0 && <span className="text-xs text-muted-foreground">No staff</span>}
                {mechanics.map((m) => {
                  const on = mechanicIds.includes(m.userId)
                  const branchOk = !m.branchId || m.branchId === branchId || !branchId
                  return (
                    <button
                      key={m.userId}
                      type="button"
                      disabled={!branchOk}
                      onClick={() => setMechanicIds(on ? mechanicIds.filter((x) => x !== m.userId) : [...mechanicIds, m.userId])}
                      className={`rounded-pill border-2 px-2.5 py-1 text-xs font-bold ${on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"} disabled:opacity-40`}
                    >
                      {m.name}
                    </button>
                  )
                })}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">First selected is lead.</p>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* 4. Signature + submit */}
      {step === 3 && (
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-display text-lg font-bold">4 · Customer signature</h2>
          <div className="rounded-xl border-2 border-border bg-white">
            <canvas
              ref={canvasRef}
              width={640}
              height={180}
              className="h-36 w-full touch-none"
              onPointerDown={startDraw}
              onPointerMove={draw}
              onPointerUp={endDraw}
              onPointerLeave={endDraw}
            />
          </div>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={clearSig}>
              <Eraser className="size-4" /> Clear signature
            </Button>
            <Button size="lg" disabled={pending} onClick={submit}>
              {pending ? "Checking in…" : <><CheckCircle2 className="size-5" /> Complete check-in</>}
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Wizard nav */}
      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={back} disabled={step === 0}>
          <ChevronLeft className="size-4" /> Back
        </Button>
        <span className="text-xs font-bold text-muted-foreground">Step {step + 1} of {STEPS.length}</span>
        {step < STEPS.length - 1 ? (
          <Button onClick={next}>
            Next <ChevronRight className="size-4" />
          </Button>
        ) : (
          <span />
        )}
      </div>
    </div>
  )
}
