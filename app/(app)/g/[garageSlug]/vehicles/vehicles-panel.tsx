"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus, Search, X } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { CarAvatar, type VehicleType } from "@/components/brand/car-avatar"
import { EmptyState } from "@/components/brand/empty-state"
import { PlateChip } from "@/components/brand/plate-chip"
import { VehicleFormDrawer, type VehicleFormValues } from "./vehicle-form-drawer"

export type VehicleRow = {
  id: string
  plateNumber: string
  make: string
  model: string
  year: number | null
  color: string | null
  colorHex: string | null
  bodyType: string | null
  usage: string | null
  lastOdometerKm: number | null
  lastOdometerAt: Date | string | null
  kmPerDay: string | null
  kmPerDayConfidence: string | null
  ownerName: string | null
  ownerPhone: string | null
}

const inputCls =
  "min-h-11 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

const BODY_TO_TYPE: Record<string, VehicleType> = {
  sedan: "sedan",
  hatchback: "hatchback",
  suv: "suv",
  pickup: "pickup",
  van: "van",
  bus: "bus",
  truck: "truck",
  motorbike: "motorbike",
  other: "other",
}

export function VehiclesPanel({
  garageSlug,
  garageId,
  vehicles,
  total,
  filters,
  canCreate,
  customerOptions,
}: {
  garageSlug: string
  garageId: string
  vehicles: VehicleRow[]
  total: number
  filters: { q: string }
  canCreate: boolean
  canUpdate: boolean
  customerOptions: { id: string; name: string; phone: string }[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [q, setQ] = useState(filters.q)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<VehicleFormValues | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [prevQ, setPrevQ] = useState(filters.q)
  if (filters.q !== prevQ) {
    setPrevQ(filters.q)
    setQ(filters.q)
  }

  function pushParams(next: { q?: string }) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v)
      else params.delete(k)
    }
    const qs = params.toString()
    router.replace(`/g/${garageSlug}/vehicles${qs ? `?${qs}` : ""}`)
  }

  function onSearch(value: string) {
    setQ(value)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => pushParams({ q: value }), 300)
  }

  const activeFilters = Boolean(filters.q)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Vehicles</h1>
          <p className="text-muted-foreground">{total} registered</p>
        </div>
        {canCreate && (
          <Button onClick={() => { setEditing(null); setDrawerOpen(true) }}>
            <Plus className="size-4" /> New vehicle
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Search plate, make, model or VIN…"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            aria-label="Search vehicles"
          />
        </div>
        {activeFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setQ(""); router.replace(`/g/${garageSlug}/vehicles`) }}>
            <X className="size-4" /> Clear
          </Button>
        )}
      </div>

      {vehicles.length === 0 ? (
        <EmptyState
          title={activeFilters ? "No vehicles match" : "No vehicles yet"}
          description={
            activeFilters
              ? "Try a different plate, make or model."
              : "Register a vehicle to track mileage, documents and service history."
          }
          action={
            canCreate && !activeFilters ? (
              <Button onClick={() => { setEditing(null); setDrawerOpen(true) }}>
                <Plus className="size-4" /> New vehicle
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {vehicles.map((v) => {
                const vtype = BODY_TO_TYPE[v.bodyType ?? ""] ?? "sedan"
                return (
                  <li key={v.id}>
                    <Link
                      href={`/g/${garageSlug}/vehicles/${v.id}`}
                      className="flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-muted/60"
                    >
                      <CarAvatar type={vtype} color={v.colorHex ?? v.color ?? undefined} className="h-10 w-20 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 font-bold">
                          <PlateChip plate={v.plateNumber} />
                          <span className="truncate">
                            {v.make} {v.model}
                            {v.year ? ` · ${v.year}` : ""}
                          </span>
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {v.ownerName ?? "No owner"}
                          {v.ownerPhone ? ` · ${v.ownerPhone}` : ""}
                          {v.lastOdometerKm != null ? ` · ${v.lastOdometerKm.toLocaleString()} km` : ""}
                        </p>
                      </div>
                      {v.kmPerDay && (
                        <span className="rounded-pill border border-border bg-surface-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                          ≈{Number(v.kmPerDay).toFixed(0)} km/day · {v.kmPerDayConfidence ?? "?"}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
            {vehicles.length === 200 && (
              <p className="border-t border-border px-5 py-3 text-center text-xs text-muted-foreground">
                Showing first 200 results — refine your search for more.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <VehicleFormDrawer
        garageId={garageId}
        garageSlug={garageSlug}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditing(null) }}
        initial={editing ?? undefined}
        customerOptions={customerOptions}
        onSaved={(vehicleId) => {
          setDrawerOpen(false)
          setEditing(null)
          router.push(`/g/${garageSlug}/vehicles/${vehicleId}`)
        }}
      />
    </div>
  )
}
