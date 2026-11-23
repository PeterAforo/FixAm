"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { MapPin, Plus } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { createPickupRun, updatePickupRun, type RunRow } from "@/lib/pickups/actions"
import { RUN_LABEL } from "@/lib/pickups/core"

type Sources = {
  bookings: { id: string; label: string; name: string | null; phone: string | null; plate: string | null; vehicle: string | null; at: string }[]
  jobs: { id: string; label: string; name: string | null; phone: string | null; plate: string | null; vehicle: string | null; address: string | null }[]
}
const field = "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
const when = (iso: string) => new Date(iso).toLocaleString("en-GH", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)

function RunCard({ r, garageId, garageSlug, drivers, canManage }: { r: RunRow; garageId: string; garageSlug: string; drivers: { userId: string; name: string; role: string }[]; canManage: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const upd = (patch: Record<string, unknown>) => start(async () => {
    const res = await updatePickupRun({ garageId, runId: r.id, ...patch })
    if (!res.ok) setMsg(res.error)
    router.refresh()
  })
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Link href={`/g/${garageSlug}/pickups/${r.id}`} className="min-w-0">
            <p className="font-semibold">{r.kind === "pickup" ? "Pickup" : "Return"} · {r.contactName ?? "Customer"}{r.plate ? ` · ${r.plate}` : ""}</p>
            <p className="text-sm text-muted-foreground">{when(r.scheduledAt)} · {RUN_LABEL[r.kind][r.status]}</p>
            <p className="flex items-center gap-1 text-sm"><MapPin className="size-3.5" /> {r.address}</p>
          </Link>
          <Link href={`/g/${garageSlug}/pickups/${r.id}`} className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold">Open</Link>
        </div>
        {canManage && !["done", "cancelled"].includes(r.status) && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select className="rounded-lg border border-border bg-surface px-2 py-1.5" value={r.driverUserId ?? ""} disabled={pending} onChange={(e) => upd({ driverUserId: e.target.value || null })}>
              <option value="">No driver yet</option>
              {drivers.map((d) => <option key={d.userId} value={d.userId}>{d.name}{d.role === "garage_driver" ? "" : ` (${d.role.replace(/_/g, " ")})`}</option>)}
            </select>
            <input type="datetime-local" className="rounded-lg border border-border bg-surface px-2 py-1" defaultValue={localInput(new Date(r.scheduledAt))} onBlur={(e) => e.target.value && upd({ scheduledAt: new Date(e.target.value).toISOString() })} />
            <button type="button" className="text-xs text-muted-foreground underline" disabled={pending} onClick={() => confirm("Cancel this run?") && upd({ cancel: true })}>Cancel</button>
          </div>
        )}
        {msg && <p className="text-xs text-red-700">{msg}</p>}
      </CardContent>
    </Card>
  )
}

export function PickupsPanel({ garageId, garageSlug, initial, drivers, sources, defaultFee }: {
  garageId: string; garageSlug: string; initial: { upcoming: RunRow[]; done: RunRow[]; canManage: boolean }
  drivers: { userId: string; name: string; role: string }[]; sources: Sources; defaultFee: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<"pickup" | "dropoff">("pickup")
  const [sourceId, setSourceId] = useState("")
  const [f, setF] = useState(() => ({ contactName: "", contactPhone: "", address: "", scheduledAt: localInput(new Date(Date.now() + 3600_000)), feeGhs: String(defaultFee / 100), driverUserId: "", notes: "" }))
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const list = kind === "pickup" ? sources.bookings : sources.jobs

  const pick = (id: string) => {
    setSourceId(id)
    const s = list.find((x) => x.id === id)
    if (!s) return
    setF((v) => ({
      ...v, contactName: s.name ?? "", contactPhone: s.phone ?? "",
      address: "address" in s && s.address ? s.address : v.address,
      scheduledAt: "at" in s ? localInput(new Date(new Date(s.at).getTime() - 45 * 60_000)) : v.scheduledAt,
    }))
  }
  const create = () => start(async () => {
    setErr(null)
    const r = await createPickupRun({
      garageId, kind, ...(kind === "pickup" ? (sourceId ? { bookingId: sourceId } : {}) : sourceId ? { jobId: sourceId } : {}),
      contactName: f.contactName || undefined, contactPhone: f.contactPhone, address: f.address,
      scheduledAt: new Date(f.scheduledAt).toISOString(), feeGhs: Number(f.feeGhs) || 0, notes: f.notes || undefined,
      driverUserId: f.driverUserId || undefined,
    })
    if (!r.ok) return setErr(r.error)
    setOpen(false); setSourceId("")
    router.refresh()
  })

  return (
    <div className="mt-6 space-y-6">
      {initial.canManage && (
        !open ? <Button onClick={() => setOpen(true)}><Plus className="size-4" /> New pickup or return</Button> : (
          <Card><CardContent className="space-y-3 p-4">
            <div className="flex gap-2">
              {(["pickup", "dropoff"] as const).map((k) => (
                <button key={k} type="button" onClick={() => { setKind(k); setSourceId("") }} className={`rounded-full border px-3 py-1.5 text-sm ${kind === k ? "border-foreground bg-foreground text-background" : "border-border"}`}>{k === "pickup" ? "Pick up a car" : "Return a car"}</button>
              ))}
            </div>
            <label className="block text-sm">{kind === "pickup" ? "For which booking?" : "For which job?"}
              <select className={field} value={sourceId} onChange={(e) => pick(e.target.value)}>
                <option value="">{kind === "pickup" ? "No booking (walk-in)" : "Choose a job…"}</option>
                {list.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Customer name<input className={field} value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></label>
              <label className="text-sm">Customer phone<input className={field} value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} /></label>
            </div>
            <label className="block text-sm">Address / landmark<input className={field} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm">When<input type="datetime-local" className={field} value={f.scheduledAt} onChange={(e) => setF({ ...f, scheduledAt: e.target.value })} /></label>
              <label className="text-sm">Fee (GH₵)<input className={field} inputMode="decimal" value={f.feeGhs} onChange={(e) => setF({ ...f, feeGhs: e.target.value })} /></label>
              <label className="text-sm">Driver
                <select className={field} value={f.driverUserId} onChange={(e) => setF({ ...f, driverUserId: e.target.value })}>
                  <option value="">Assign later</option>
                  {drivers.map((d) => <option key={d.userId} value={d.userId}>{d.name}</option>)}
                </select>
              </label>
            </div>
            <input className={field} placeholder="Notes for the driver (optional)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
            {err && <p className="text-sm text-red-700">{err}</p>}
            <div className="flex gap-2"><Button disabled={pending} onClick={create}>Create</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
            <p className="text-xs text-muted-foreground">The customer gets an SMS with a link to follow the run and see the handover photos. The fee is added to the job as a line.</p>
          </CardContent></Card>
        )
      )}

      <section>
        <h2 className="text-[15px] font-semibold">{initial.canManage ? "Coming up" : "My runs"}</h2>
        {initial.upcoming.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nothing scheduled.</p> : (
          <div className="mt-2 space-y-2">{initial.upcoming.map((r) => <RunCard key={r.id} r={r} garageId={garageId} garageSlug={garageSlug} drivers={drivers} canManage={initial.canManage} />)}</div>
        )}
      </section>
      {initial.done.length > 0 && (
        <section>
          <h2 className="text-[15px] font-semibold">Recent</h2>
          <div className="mt-2 space-y-2">{initial.done.map((r) => <RunCard key={r.id} r={r} garageId={garageId} garageSlug={garageSlug} drivers={drivers} canManage={false} />)}</div>
        </section>
      )}
    </div>
  )
}
