"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { navForRole, type NavItem } from "@/lib/nav"
import type { StaffRole } from "@/lib/auth/permissions"
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
}: {
  open: boolean
  onClose: () => void
  role: StaffRole
  garageSlug: string
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
  return <PaletteDialog role={role} garageSlug={garageSlug} onClose={onClose} />
}

function PaletteDialog({
  role,
  garageSlug,
  onClose,
}: {
  role: StaffRole
  garageSlug: string
  onClose: () => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const items = useMemo<NavItem[]>(() => {
    const nav = navForRole(role)
    const q = query.trim().toLowerCase()
    if (!q) return nav
    return nav.filter((i) => i.label.toLowerCase().includes(q))
  }, [role, query])

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
          placeholder="Search pages… (vehicle/customer/job search lands in P1)"
          className="w-full border-b-2 border-border bg-transparent px-4 py-3 text-base outline-none placeholder:text-muted-foreground"
          aria-label="Command palette search"
        />
        <ul className="max-h-80 overflow-y-auto p-2">
          {items.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              No matches. Record search arrives with customers &amp; vehicles (P1).
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
