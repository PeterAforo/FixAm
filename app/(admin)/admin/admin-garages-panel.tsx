"use client"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { Loader2, MoreHorizontal, Search, ShieldCheck } from "lucide-react"
import { adminSetGarageStatus, startImpersonation } from "@/lib/admin/actions"
import { cn } from "@/lib/utils"

export type GarageRow = {
  id: string
  name: string
  slug: string
  status: string
  createdAt: Date | string
  planCode: string | null
  planName: string | null
  subStatus: string | null
  isComplimentary: boolean | null
  staffCount: number
  branchCount: number
}

type Filter = "all" | "active" | "trialing" | "past_due" | "suspended"
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "trialing", label: "On trial" },
  { key: "past_due", label: "Past due" },
  { key: "suspended", label: "Suspended" },
]

const TINTS = ["bg-primary/10 text-primary", "bg-[#E6F8F6] text-[#00756F]", "bg-[#EFE9FF] text-[#5B3CC4]", "bg-[#FFF4D6] text-[#8A5A00]", "bg-[#E6F4FF] text-[#0B5CAD]"]

function initials(name: string) {
  return name.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w[0] ?? "")).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "G"
}

function statusPill(g: GarageRow) {
  if (g.status === "suspended") return { label: "Suspended", cls: "bg-danger-subtle text-danger" }
  if (g.subStatus === "past_due") return { label: "Past due", cls: "bg-warning-subtle text-warning-foreground" }
  if (g.subStatus === "trialing") return { label: "Trial", cls: "bg-primary/10 text-primary" }
  if (g.subStatus === "cancelled") return { label: "Cancelled", cls: "bg-surface-muted text-muted-foreground" }
  return { label: "Active", cls: "bg-success-subtle text-success" }
}

/** Garages table: search, status filter, "View as owner" and a ⋯ menu with a confirmed Suspend. */
export function AdminGaragesPanel({ garages, compact = false }: { garages: GarageRow[]; compact?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [confirmFor, setConfirmFor] = useState<GarageRow | null>(null)

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return garages.filter((g) => {
      if (term && !`${g.name} ${g.slug}`.toLowerCase().includes(term)) return false
      if (filter === "all") return true
      if (filter === "suspended") return g.status === "suspended"
      if (g.status === "suspended") return false
      if (filter === "active") return !g.subStatus || g.subStatus === "active"
      return g.subStatus === filter
    })
  }, [garages, q, filter])

  const setStatus = (g: GarageRow, status: "active" | "suspended") => {
    setMsg(null)
    setBusyId(g.id)
    startTransition(async () => {
      const res = await adminSetGarageStatus({ garageId: g.id, status })
      setBusyId(null)
      setConfirmFor(null)
      if (!res.ok) setMsg(res.error?.message ?? "Action failed")
      else router.refresh()
    })
  }

  const impersonate = (g: GarageRow) => {
    setMsg(null)
    setBusyId(g.id)
    startTransition(async () => {
      const res = await startImpersonation({ garageId: g.id })
      if (res.ok) {
        router.push(`/g/${res.data.garageSlug}`)
        router.refresh()
      } else {
        setBusyId(null)
        setMsg(res.error?.message ?? "Could not open the garage")
      }
    })
  }

  const shown = compact ? rows.slice(0, 5) : rows

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold">
          Garages <span className="font-normal text-muted-foreground">· {garages.length}</span>
        </h2>
        {compact ? (
          <Link href="/admin/garages" className="text-[13px] font-medium text-primary hover:underline">All garages</Link>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
              <Search className="size-4" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search garages"
                aria-label="Search garages"
                className="w-44 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
            <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1 rounded-xl border border-border p-1">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "h-8 rounded-lg px-3 text-[13px] font-medium transition-colors",
                    filter === f.key ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-surface-muted"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {msg && <p className="mx-5 mt-4 rounded-lg bg-danger-subtle px-3 py-2 text-sm font-medium text-danger">{msg}</p>}

      {shown.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">{garages.length === 0 ? "No garages yet." : "No garages match."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-cards w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.06em] text-muted-foreground">
                <th className="px-5 py-3 font-semibold">Garage</th>
                <th className="px-3 py-3 font-semibold">Plan</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 text-right font-semibold">Staff</th>
                <th className="px-3 py-3 text-right font-semibold">Branches</th>
                <th className="px-3 py-3 font-semibold">Joined</th>
                <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((g, i) => {
                const pill = statusPill(g)
                const busy = pending && busyId === g.id
                return (
                  <tr key={g.id} className="border-t border-border/70 hover:bg-surface-muted/40">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-semibold", TINTS[i % TINTS.length])}>{initials(g.name)}</span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{g.name}</p>
                          <p className="truncate text-[13px] text-muted-foreground">/{g.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5">
                      {g.planName ?? "No plan"}
                      {g.isComplimentary && <span className="text-muted-foreground"> · complimentary</span>}
                    </td>
                    <td className="px-3 py-3.5">
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", pill.cls)}>{pill.label}</span>
                    </td>
                    <td className="px-3 py-3.5 text-right tabular-nums">{g.staffCount}</td>
                    <td className="px-3 py-3.5 text-right tabular-nums">{g.branchCount}</td>
                    <td className="px-3 py-3.5 text-muted-foreground">
                      {new Date(g.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="relative flex items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => impersonate(g)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 text-[13px] font-medium hover:bg-surface-muted disabled:opacity-60"
                        >
                          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                          View as owner
                        </button>
                        <button
                          type="button"
                          aria-label={`More actions for ${g.name}`}
                          aria-expanded={menuFor === g.id}
                          onClick={() => setMenuFor(menuFor === g.id ? null : g.id)}
                          className="flex size-9 items-center justify-center rounded-xl border border-border bg-card hover:bg-surface-muted"
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                        {menuFor === g.id && (
                          <>
                            <button className="fixed inset-0 z-40 cursor-default" aria-label="Close menu" onClick={() => setMenuFor(null)} />
                            <div className="absolute right-0 top-11 z-50 w-48 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-[0_18px_40px_-16px_rgba(22,19,15,0.35)]">
                              <Link href={`/g/${g.slug}`} className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-muted" onClick={() => setMenuFor(null)}>
                                Open garage page
                              </Link>
                              {g.status === "suspended" ? (
                                <button
                                  type="button"
                                  className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-muted"
                                  onClick={() => { setMenuFor(null); setStatus(g, "active") }}
                                >
                                  Reactivate garage
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-danger hover:bg-danger-subtle"
                                  onClick={() => { setMenuFor(null); setConfirmFor(g) }}
                                >
                                  Suspend garage…
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="flex items-center gap-2 border-t border-border px-5 py-3 text-[13px] text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0" />
        &ldquo;View as owner&rdquo; and suspending are recorded in the audit log.
      </p>

      {confirmFor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="suspend-title">
          <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto w-full max-w-md rounded-[22px] border border-border bg-card p-6 shadow-2xl">
            <h3 id="suspend-title" className="font-display text-xl font-bold">Suspend {confirmFor.name}?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Its staff are locked out (they see a “suspended” notice) and the garage disappears from the public directory and breakdown matching until you reactivate it. You can still open it with “View as owner”. Undo from the ⋯ menu; both steps are recorded in the audit log.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmFor(null)}
                className="h-10 rounded-full border border-border px-4 text-sm font-medium hover:bg-surface-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setStatus(confirmFor, "suspended")}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-danger px-4 text-sm font-semibold text-danger-foreground disabled:opacity-60"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Suspend garage
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
