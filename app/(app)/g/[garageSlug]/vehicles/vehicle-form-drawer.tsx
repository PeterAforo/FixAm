"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"
import { Button } from "@/components/brand/button"
import { createVehicle, updateVehicle } from "@/lib/vehicles/actions"

export type VehicleFormValues = {
  id?: string
  customerId: string
  plateNumber: string
  vin: string
  make: string
  model: string
  year: string
  color: string
  colorHex: string
  bodyType: string
  fuelType: string
  transmission: string
  engineSize: string
  usage: string
  notes: string
}

const EMPTY: VehicleFormValues = {
  customerId: "",
  plateNumber: "",
  vin: "",
  make: "",
  model: "",
  year: "",
  color: "",
  colorHex: "",
  bodyType: "sedan",
  fuelType: "",
  transmission: "",
  engineSize: "",
  usage: "private",
  notes: "",
}

export type CatalogueEntry = {
  id: string
  name: string
  models: { id: string; name: string; yearStart: number | null; yearEnd: number | null }[]
}

const COLORS = ["White", "Black", "Silver", "Grey", "Red", "Blue", "Gold", "Brown", "Green", "Yellow", "Orange", "Maroon"]

const inputCls =
  "min-h-11 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"
const labelCls = "text-xs font-semibold text-muted-foreground"

export function VehicleFormDrawer({
  garageId,
  garageSlug,
  open,
  onClose,
  onSaved,
  initial,
  customerOptions,
  catalogue = [],
}: {
  garageId: string
  garageSlug: string
  open: boolean
  onClose: () => void
  onSaved?: (vehicleId: string) => void
  initial?: VehicleFormValues
  customerOptions: { id: string; name: string; phone: string }[]
  catalogue?: CatalogueEntry[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState<VehicleFormValues>(initial ?? EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [duplicate, setDuplicate] = useState<{ id: string; plate: string } | null>(null)

  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setForm(initial ?? EMPTY)
      setError(null)
      setFieldErrors({})
      setDuplicate(null)
    }
  }

  const matchedMake = catalogue.find((m) => m.name.toLowerCase() === form.make.trim().toLowerCase())
  const models = matchedMake?.models.map((m) => m.name) ?? []

  function set<K extends keyof VehicleFormValues>(key: K, value: VehicleFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function submit() {
    setError(null)
    setFieldErrors({})
    setDuplicate(null)
    const vehicle = {
      customerId: form.customerId,
      plateNumber: form.plateNumber,
      vin: form.vin || undefined,
      make: form.make,
      model: form.model,
      year: form.year ? Number(form.year) : null,
      color: form.color || undefined,
      colorHex: form.colorHex || undefined,
      bodyType: form.bodyType as "sedan",
      fuelType: (form.fuelType || null) as "petrol" | null,
      transmission: (form.transmission || null) as "manual" | null,
      engineSize: form.engineSize || undefined,
      usage: form.usage as "private",
      notes: form.notes || undefined,
    }
    startTransition(async () => {
      const res = initial?.id
        ? await updateVehicle({ garageId, vehicleId: initial.id, vehicle })
        : await createVehicle({ garageId, vehicle })
      if (!res.ok) {
        setError(res.error.message)
        setFieldErrors(res.error.fieldErrors ?? {})
        return
      }
      if (res.data.duplicate) {
        setDuplicate(res.data.duplicate)
        return
      }
      onSaved?.(res.data.vehicleId)
      if (!onSaved) router.refresh()
    })
  }

  const ferr = (k: string) => fieldErrors[k]?.[0]

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={initial ? "Edit vehicle" : "New vehicle"}>
          <button className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
          <div className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-1">
            <header className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-display text-xl font-semibold">{initial ? "Edit vehicle" : "New vehicle"}</h2>
              <button onClick={onClose} className="rounded-lg p-2 hover:bg-surface-muted" aria-label="Close">
                <X className="size-5" />
              </button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {error && <p className="rounded-lg border border-danger bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
              {duplicate && (
                <div className="rounded-lg border border-warning bg-warning/10 px-3 py-2 text-sm">
                  <p className="font-semibold">This plate is already registered.</p>
                  <a className="font-semibold text-primary underline" href={`/g/${garageSlug}/vehicles/${duplicate.id}`}>
                    Open {duplicate.plate} →
                  </a>
                </div>
              )}

              <div>
                <label className={labelCls}>Owner *</label>
                <select className={inputCls} value={form.customerId} onChange={(e) => set("customerId", e.target.value)}>
                  <option value="">Select customer…</option>
                  {customerOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>
                  ))}
                </select>
                {ferr("customerId") && <p className="mt-1 text-xs font-semibold text-danger">{ferr("customerId")}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Plate number *</label>
                  <input className={`${inputCls} font-mono`} placeholder="GR 1234-24" value={form.plateNumber} onChange={(e) => set("plateNumber", e.target.value)} />
                  {ferr("plateNumber") && <p className="mt-1 text-xs font-semibold text-danger">{ferr("plateNumber")}</p>}
                </div>
                <div>
                  <label className={labelCls}>Year</label>
                  <input className={inputCls} type="number" min={1950} max={2100} placeholder="2019" value={form.year} onChange={(e) => set("year", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Make *</label>
                  <input className={inputCls} list="vehicle-makes" placeholder="Toyota" value={form.make} onChange={(e) => { set("make", e.target.value); set("model", "") }} />
                  <datalist id="vehicle-makes">{catalogue.map((m) => <option key={m.id} value={m.name} />)}</datalist>
                  {ferr("make") && <p className="mt-1 text-xs font-semibold text-danger">{ferr("make")}</p>}
                </div>
                <div>
                  <label className={labelCls}>Model *</label>
                  <input className={inputCls} list="vehicle-models" placeholder="Corolla" value={form.model} onChange={(e) => set("model", e.target.value)} />
                  <datalist id="vehicle-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
                  {ferr("model") && <p className="mt-1 text-xs font-semibold text-danger">{ferr("model")}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Colour</label>
                  <input className={inputCls} list="vehicle-colors" placeholder="White" value={form.color} onChange={(e) => set("color", e.target.value)} />
                  <datalist id="vehicle-colors">{COLORS.map((c) => <option key={c} value={c} />)}</datalist>
                </div>
                <div>
                  <label className={labelCls}>Body type</label>
                  <select className={inputCls} value={form.bodyType} onChange={(e) => set("bodyType", e.target.value)}>
                    <option value="sedan">Sedan</option>
                    <option value="hatchback">Hatchback</option>
                    <option value="suv">SUV</option>
                    <option value="pickup">Pickup</option>
                    <option value="van">Van</option>
                    <option value="bus">Bus</option>
                    <option value="truck">Truck</option>
                    <option value="motorbike">Motorbike</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Fuel</label>
                  <select className={inputCls} value={form.fuelType} onChange={(e) => set("fuelType", e.target.value)}>
                    <option value="">—</option>
                    <option value="petrol">Petrol</option>
                    <option value="diesel">Diesel</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="electric">Electric</option>
                    <option value="lpg">LPG</option>
                    <option value="cng">CNG</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Gearbox</label>
                  <select className={inputCls} value={form.transmission} onChange={(e) => set("transmission", e.target.value)}>
                    <option value="">—</option>
                    <option value="manual">Manual</option>
                    <option value="automatic">Automatic</option>
                    <option value="cvt">CVT</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Usage</label>
                  <select className={inputCls} value={form.usage} onChange={(e) => set("usage", e.target.value)}>
                    <option value="private">Private</option>
                    <option value="commercial">Commercial</option>
                    <option value="taxi">Taxi</option>
                    <option value="ride_hailing">Ride-hailing</option>
                    <option value="fleet">Fleet</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>VIN</label>
                  <input className={`${inputCls} font-mono text-xs`} placeholder="Optional" value={form.vin} onChange={(e) => set("vin", e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Engine size</label>
                  <input className={inputCls} placeholder="2.0L" value={form.engineSize} onChange={(e) => set("engineSize", e.target.value)} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Notes</label>
                <textarea className={`${inputCls} min-h-20 py-2`} placeholder="Condition, quirks, keys held…" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
              </div>
            </div>

            <footer className="border-t border-border px-5 py-4">
              <Button className="w-full" disabled={pending} onClick={submit}>
                {pending ? "Saving…" : initial ? "Save changes" : "Register vehicle"}
              </Button>
            </footer>
          </div>
        </div>
      )}
    </>
  )
}
