"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { navForRole, type NavItem } from "@/lib/nav"
import type { StaffRole } from "@/lib/auth/permissions"
import { searchVehiclesAndCustomers } from "@/lib/vehicles/actions"
import { Card } from "@/components/brand/card"
import {
  BarChart3,
  BellRing,
  Calendar,
  Car,
  Gauge,
  KanbanSquare,
  Package,
  ScanBarcode,
  Settings,
  ShieldCheck,
  Store,
  Trophy,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react"

const ICONS: Record<string, LucideIcon> = {
  gauge: Gauge,
  "kanban-square": KanbanSquare,
  wrench: Wrench,
  calendar: Calendar,
  car: Car,
  users: Users,
  package: Package,
  "scan-barcode": ScanBarcode,
  store: Store,
  "bell-ring": BellRing,
  "shield-check": ShieldCheck,
  wallet: Wallet,
  "bar-chart-3": BarChart3,
  trophy: Trophy,
  settings: Settings,
}

export function CommandPalette({
  open,
  onClose,
  role,
  garageSlug,
  garageId,
}: {
  open: boolean
  onClose: () => void
  role: StaffRole
  garageSlug: string
  garageId: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null
  // Fresh mount each open → query state resets naturally
  return <PaletteDialog role={role} garageSlug={garageSlug} garageId={garageId} onClose={onClose} />
}

function PaletteDialog({
  role,
  garageSlug,
  garageId,
  onClose,
}: {
  role: StaffRole
  garageSlug: string
  garageId: string
  onClose: () => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const [records, setRecords] = useState<{
    q: string
    vehicles: { id: string; plate: string; label: string; path: string }[]
    customers: { id: string; name: string; phone: string; path: string }[]
  } | null>(null)

  const items = useMemo<NavItem[]>(() => {
    const nav = navForRole(role)
    const q = query.trim().toLowerCase()
    if (!q) return nav
    return nav.filter((i) => i.label.toLowerCase().includes(q))
  }, [role, query])

  // Debounced record search — plates ignore spaces/hyphens, phones match digits.
  // `records.q` lets render ignore stale results without syncing state in the effect.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    const t = setTimeout(async () => {
      const res = await searchVehiclesAndCustomers({ garageId, q })
      if (res.ok) setRecords({ q, ...res.data })
    }, 250)
    return () => clearTimeout(t)
  }, [query, garageId])

  const trimmed = query.trim()
  const current =
    records && records.q === trimmed && trimmed.length >= 2 ? records : null

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [])

  const base = `/g/${garageSlug}`
  const href = (route: string) => `${base}${route.replace("/g/[garageSlug]", "")}`

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[15vh]">
      <button
        className="absolute inset-0 cursor-default"
        aria-label="Close search"
        onClick={onClose}
      />
      <Card className="relative w-full max-w-lg overflow-hidden">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pages, plates, customers…"
          className="w-full border-b-2 border-border bg-transparent px-4 py-3 text-base outline-none placeholder:text-muted-foreground"
          aria-label="Command palette search"
        />
        <ul className="max-h-80 overflow-y-auto p-2">
          {current && (current.vehicles.length > 0 || current.customers.length > 0) && (
            <>
              {current.vehicles.length > 0 && (
                <li className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Vehicles
                </li>
              )}
              {current.vehicles.map((v) => (
                <li key={`v-${v.id}`}>
                  <button
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold hover:bg-surface-muted"
                    onClick={() => {
                      onClose()
                      router.push(`${base}${v.path}`)
                    }}
                  >
                    <Car className="size-4 shrink-0 text-muted-foreground" />
                    {v.label}
                  </button>
                </li>
              ))}
              {current.customers.length > 0 && (
                <li className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Customers
                </li>
              )}
              {current.customers.map((c) => (
                <li key={`c-${c.id}`}>
                  <button
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold hover:bg-surface-muted"
                    onClick={() => {
                      onClose()
                      router.push(`${base}${c.path}`)
                    }}
                  >
                    <Users className="size-4 shrink-0 text-muted-foreground" />
                    {c.name} <span className="font-normal text-muted-foreground">{c.phone}</span>
                  </button>
                </li>
              ))}
            </>
          )}
          {items.length === 0 && !(current && (current.vehicles.length > 0 || current.customers.length > 0)) && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              No matches.
            </li>
          )}
          {items.map((item) => {
            const Icon = ICONS[item.icon] ?? Wrench
            return (
              <li key={item.route}>
                <button
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold hover:bg-surface-muted"
                  onClick={() => {
                    onClose()
                    router.push(href(item.route))
                  }}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  {item.label}
                </button>
              </li>
            )
          })}
        </ul>
        <p className="border-t-2 border-border px-4 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          Esc to close
        </p>
      </Card>
    </div>
  )
}
