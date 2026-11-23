"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { cancelMyInspectionAction, linkInspectionToVehicleAction, myVehiclesForLinkingAction } from "@/lib/inspections/actions"

type Row = {
  id: string
  number: string
  status: string
  price: number
  paymentStatus: string | null
  garageName: string
  garageSlug: string
  scheduledAt: string | null
  createdAt: string
  hasReport: boolean
}

const STATUS: Record<string, string> = {
  awaiting_payment: "Awaiting payment",
  booked: "Booked",
  in_progress: "Inspection under way",
  completed: "Report ready",
  cancelled: "Cancelled",
  no_show: "No-show",
}

const ghs = (p: number) => `GH₵${(p / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`
const day = (d: string | null) => (d ? new Date(d).toLocaleString("en-GH", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—")

export function MyInspections({ rows }: { rows: Row[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [linkFor, setLinkFor] = useState<string | null>(null)
  const [vehicles, setVehicles] = useState<{ id: string; plate: string; label: string }[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  function cancel(id: string) {
    start(async () => {
      const r = await cancelMyInspectionAction(id)
      setMsg(r.ok ? null : r.error)
      router.refresh()
    })
  }

  function openLink(id: string) {
    if (linkFor === id) { setLinkFor(null); return }
    setLinkFor(id); setVehicles(null)
    start(async () => { setVehicles(await myVehiclesForLinkingAction()) })
  }

  function link(id: string, vehicleId: string) {
    start(async () => {
      const r = await linkInspectionToVehicleAction({ inspectionId: id, vehicleId })
      setMsg(r.ok ? "Report attached to that car's passport." : r.error)
      setLinkFor(null)
      router.refresh()
    })
  }

  if (!rows.length) {
    return <p className="mt-4 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">No inspections yet.</p>
  }
  return (
    <ul className="mt-4 space-y-3">
      {msg && <li className="rounded-xl border border-border bg-surface-sunken px-4 py-2 text-sm">{msg}</li>}
      {rows.map((r) => (
        <li key={r.id} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{r.number} · {r.garageName}</p>
              <p className="text-xs text-muted-foreground">Booked {day(r.createdAt)}{r.scheduledAt ? ` · visit ${day(r.scheduledAt)}` : ""} · {ghs(r.price)}</p>
            </div>
            <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold">{STATUS[r.status] ?? r.status}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {r.status === "completed" && (
              <Button size="sm" variant="secondary" asChild><a href={`/portal/inspections/${r.id}`}>View report</a></Button>
            )}
            {["awaiting_payment", "booked"].includes(r.status) && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => cancel(r.id)}>Cancel</Button>
            )}
            {r.status === "completed" && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => openLink(r.id)}>Bought the car? Attach to passport</Button>
            )}
          </div>
          {linkFor === r.id && vehicles && (
            <div className="mt-3 rounded-xl border border-border p-3">
              <p className="mb-2 text-xs font-semibold">Which car is it now?</p>
              {vehicles.length === 0 && <p className="text-xs text-muted-foreground">Add the car under My vehicles first, then attach the report.</p>}
              <ul className="space-y-1">
                {vehicles.map((v) => (
                  <li key={v.id}>
                    <button type="button" className="text-sm font-medium text-primary underline" onClick={() => link(r.id, v.id)}>{v.label} · {v.plate}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

