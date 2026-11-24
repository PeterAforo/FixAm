"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/brand/card"
import { addPortalVehicle, deletePortalVehicle } from "@/lib/portal/profile-actions"

export type CatalogueEntry = {
  id: string
  name: string
  models: { id: string; name: string; yearStart: number | null; yearEnd: number | null }[]
}

export type ClaimedVehicle = {
  id: string
  make: string
  model: string
  year: number | null
  plateNumber: string | null
  color: string | null
  bodyType: string | null
}

const inputCls =
  "min-h-10 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function PortalVehiclesCard({
  vehicles,
  catalogue,
  title = "My cars",
  startOpen = false,
}: {
  vehicles: ClaimedVehicle[]
  catalogue: CatalogueEntry[]
  title?: string
  startOpen?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(startOpen)
  const [make, setMake] = useState("")
  const [model, setModel] = useState("")
  const [year, setYear] = useState("")
  const [plate, setPlate] = useState("")
  const [color, setColor] = useState("")
  const [error, setError] = useState<string | null>(null)

  const matchedMake = catalogue.find((m) => m.name.toLowerCase() === make.trim().toLowerCase())
  const models = matchedMake?.models.map((m) => m.name) ?? []

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await addPortalVehicle({
        make, model,
        year: year ? Number(year) : null,
        plateNumber: plate || undefined,
        color: color || undefined,
      })
      if (!res.ok) {
        setError(res.error.message)
        return
      }
      setOpen(false)
      setMake(""); setModel(""); setYear(""); setPlate(""); setColor("")
      router.refresh()
    })
  }

  function remove(id: string) {
    startTransition(async () => {
      await deletePortalVehicle({ vehicleId: id })
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-lg">{title}</CardTitle>
        <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)}>
          <Plus className="size-4" /> Add a car
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {open && (
          <form onSubmit={submit} className="grid gap-3 rounded-xl border-2 border-border bg-surface-muted/50 p-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase text-muted-foreground">Make *</span>
              <input className={inputCls} list="pv-makes" required value={make} onChange={(e) => { setMake(e.target.value); setModel("") }} />
              <datalist id="pv-makes">{catalogue.map((m) => <option key={m.id} value={m.name} />)}</datalist>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase text-muted-foreground">Model *</span>
              <input className={inputCls} list="pv-models" required value={model} onChange={(e) => setModel(e.target.value)} />
              <datalist id="pv-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase text-muted-foreground">Year</span>
              <input className={inputCls} type="number" min={1950} max={2100} value={year} onChange={(e) => setYear(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase text-muted-foreground">Plate</span>
              <input className={`${inputCls} font-mono uppercase`} placeholder="GR 1234-24" value={plate} onChange={(e) => setPlate(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold uppercase text-muted-foreground">Colour</span>
              <input className={inputCls} value={color} onChange={(e) => setColor(e.target.value)} />
            </label>
            {error && <p className="text-sm font-semibold text-danger sm:col-span-2">{error}</p>}
            <div className="sm:col-span-2">
              <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save car"}</Button>
            </div>
          </form>
        )}

        {vehicles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add the plate and model so garages recognise your car when you visit or book.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {vehicles.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="text-sm font-bold">
                    {v.make} {v.model}{v.year ? ` · ${v.year}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {v.plateNumber ?? "No plate"}{v.color ? ` · ${v.color}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => remove(v.id)}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                  aria-label="Remove vehicle"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
