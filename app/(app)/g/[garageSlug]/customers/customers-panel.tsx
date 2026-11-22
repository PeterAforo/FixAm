"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Search, UserPlus, X } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { EmptyState } from "@/components/brand/empty-state"
import { StatusPill } from "@/components/brand/status-pill"
import { CustomerFormDrawer } from "./customer-form-drawer"

export type CustomerRow = {
  id: string
  fullName: string
  companyName: string | null
  type: "individual" | "business" | "fleet"
  phone: string
  email: string | null
  tags: string[] | null
  preferredChannels: string[] | null
  createdAt: Date | string
}

const inputCls =
  "min-h-11 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

const TYPE_LABEL: Record<string, string> = {
  individual: "Individual",
  business: "Business",
  fleet: "Fleet",
}

export function CustomersPanel({
  garageSlug,
  garageId,
  customers,
  totals,
  filters,
  canCreate,
}: {
  garageSlug: string
  garageId: string
  customers: CustomerRow[]
  totals: { total: number; fleet: number; business: number }
  filters: { q: string; type: string; tag: string }
  canCreate: boolean
  canUpdate: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [q, setQ] = useState(filters.q)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync the box when filters change via navigation (back/forward, clear).
  const [prevQ, setPrevQ] = useState(filters.q)
  if (filters.q !== prevQ) {
    setPrevQ(filters.q)
    setQ(filters.q)
  }

  function pushParams(next: { q?: string; type?: string; tag?: string }) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v)
      else params.delete(k)
    }
    const qs = params.toString()
    router.replace(`/g/${garageSlug}/customers${qs ? `?${qs}` : ""}`)
  }

  function onSearch(value: string) {
    setQ(value)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => pushParams({ q: value }), 300)
  }

  const activeFilters = Boolean(filters.q || filters.type || filters.tag)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em] text-foreground">Customers</h1>
          <p className="text-muted-foreground">
            {totals.total} total · {totals.business} business · {totals.fleet} fleet
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setDrawerOpen(true)}>
            <UserPlus className="size-4" /> New customer
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Search name, phone or email…"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            aria-label="Search customers"
          />
        </div>
        <select
          className={`${inputCls} w-auto`}
          value={filters.type}
          onChange={(e) => pushParams({ type: e.target.value })}
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          <option value="individual">Individual</option>
          <option value="business">Business</option>
          <option value="fleet">Fleet</option>
        </select>
        <input
          className={`${inputCls} w-40`}
          placeholder="Tag…"
          defaultValue={filters.tag}
          onBlur={(e) => pushParams({ tag: e.target.value.trim() })}
          onKeyDown={(e) => {
            if (e.key === "Enter") pushParams({ tag: (e.target as HTMLInputElement).value.trim() })
          }}
          aria-label="Filter by tag"
        />
        {activeFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setQ(""); router.replace(`/g/${garageSlug}/customers`) }}>
            <X className="size-4" /> Clear
          </Button>
        )}
      </div>

      {customers.length === 0 ? (
        <EmptyState
          pose={activeFilters ? "magnifier" : "wave"}
          title={activeFilters ? "No customers match" : "No customers yet"}
          description={
            activeFilters
              ? "Try a different search or clear the filters."
              : "Add your first customer to start tracking vehicles, jobs and reminders."
          }
          action={
            canCreate && !activeFilters ? (
              <Button onClick={() => setDrawerOpen(true)}>
                <UserPlus className="size-4" /> New customer
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {customers.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/g/${garageSlug}/customers/${c.id}`}
                    className="flex flex-wrap items-center gap-3 px-5 py-4 transition-colors hover:bg-surface-muted/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{c.fullName}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {c.companyName && c.companyName !== c.fullName ? `${c.companyName} · ` : ""}
                        {c.phone}
                        {c.email ? ` · ${c.email}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(c.tags ?? []).slice(0, 3).map((t) => (
                        <span
                          key={t}
                          className="rounded-pill border border-border bg-surface-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"
                        >
                          {t}
                        </span>
                      ))}
                      <StatusPill tone={c.type === "individual" ? "info" : c.type === "business" ? "warning" : "ok"}>
                        {TYPE_LABEL[c.type]}
                      </StatusPill>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {customers.length === 200 && (
              <p className="border-t border-border px-5 py-3 text-center text-xs text-muted-foreground">
                Showing first 200 results — refine your search for more.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <CustomerFormDrawer
        garageId={garageId}
        garageSlug={garageSlug}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => {
          setDrawerOpen(false)
          router.refresh()
        }}
      />
    </div>
  )
}
