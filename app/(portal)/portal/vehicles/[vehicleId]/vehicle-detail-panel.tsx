"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { portalUpdateMileage } from "@/lib/portal/actions"

const inputCls = "min-h-10 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" }) : "—")

type Data = {
  vehicle: { id: string; plateNumber: string; make: string; model: string; year: number | null; garageName: string; lastOdometerKm: number | null; lastOdometerAt: string | null }
  jobs: { id: string; number: string; status: string; complaint: string | null; createdAt: string; promisedAt: string | null; deliveredAt: string | null }[]
  odometer: { id: string; readingKm: number; readAt: string; source: string }[]
  documents: { id: string; type: string; fileName: string | null; expiresOn: string | null }[]
  dueItems: { id: string; type: string; title: string; effectiveDueDate: string; status: string; dueMileageKm: number | null }[]
  insurance: { id: string; insurerName: string; policyType: string; endDate: string; policyNumber: string | null }[]
  dvla: { id: string; type: string; expiryDate: string; referenceNumber: string | null }[]
}

export function VehicleDetailPanel({ data }: { data: Data }) {
  const [pending, startTransition] = useTransition()
  const [mileage, setMileage] = useState("")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const v = data.vehicle

  function submitMileage(e: React.FormEvent) {
    e.preventDefault()
    const km = Math.round(Number(mileage))
    if (!km || km <= 0) { setMsg({ ok: false, text: "Enter a valid odometer reading" }); return }
    setMsg(null)
    startTransition(async () => {
      const res = await portalUpdateMileage({ vehicleId: v.id, readingKm: km })
      if (!res.ok) { setMsg({ ok: false, text: res.error.message }); return }
      setMsg({ ok: true, text: "Mileage updated — thanks!" })
      setMileage("")
      window.location.reload()
    })
  }

  return (
    <div className="mt-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">{v.make} {v.model}{v.year ? ` ${v.year}` : ""}</h1>
        <p className="text-sm text-muted-foreground">
          {v.plateNumber} · {v.garageName}
          {v.lastOdometerKm != null ? ` · ${v.lastOdometerKm.toLocaleString()} km (${fmtDate(v.lastOdometerAt)})` : ""}
        </p>
      </div>

      {/* Mileage update */}
      <Card><CardContent className="p-4">
        <h2 className="font-display text-base font-bold">Update mileage</h2>
        <form onSubmit={submitMileage} className="mt-2 flex gap-2">
          <input className={inputCls} type="number" min={1} placeholder="Current odometer (km)" value={mileage} onChange={(e) => setMileage(e.target.value)} />
          <Button type="submit" disabled={pending}>Save</Button>
        </form>
        {msg && <p className={`mt-2 text-sm font-semibold ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
      </CardContent></Card>

      {/* Upcoming due items */}
      <Card><CardContent className="p-4">
        <h2 className="font-display text-base font-bold">Coming up</h2>
        {data.dueItems.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nothing due.</p> : (
          <ul className="mt-2 space-y-2">
            {data.dueItems.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <div>
                  <p className="font-semibold">{d.title}</p>
                  <p className="text-xs text-muted-foreground">due {fmtDate(d.effectiveDueDate)}{d.dueMileageKm ? ` or ${d.dueMileageKm.toLocaleString()} km` : ""}</p>
                </div>
                <StatusPill status={d.status.replace(/_/g, " ")} />
              </li>
            ))}
          </ul>
        )}
      </CardContent></Card>

      {/* Insurance & DVLA */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card><CardContent className="p-4">
          <h2 className="font-display text-base font-bold">Insurance</h2>
          {data.insurance.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No active policy.</p> : (
            <ul className="mt-2 space-y-2 text-sm">
              {data.insurance.map((p) => (
                <li key={p.id} className="rounded-lg border border-border p-2">
                  <p className="font-semibold">{p.insurerName}</p>
                  <p className="text-xs text-muted-foreground">{p.policyType.replace(/_/g, " ")}{p.policyNumber ? ` · ${p.policyNumber}` : ""}</p>
                  <p className="text-xs">Expires {fmtDate(p.endDate)}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <h2 className="font-display text-base font-bold">DVLA records</h2>
          {data.dvla.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No records.</p> : (
            <ul className="mt-2 space-y-2 text-sm">
              {data.dvla.map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <p className="font-semibold">{r.type.replace(/_/g, " ")}</p>
                  <span className="text-xs">{fmtDate(r.expiryDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>
      </div>

      {/* Job history */}
      <Card><CardContent className="p-4">
        <h2 className="font-display text-base font-bold">Service history</h2>
        {data.jobs.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No jobs yet.</p> : (
          <ul className="mt-2 divide-y divide-border text-sm">
            {data.jobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="font-semibold">{j.number}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(j.createdAt)}{j.complaint ? ` · ${j.complaint.slice(0, 60)}` : ""}</p>
                </div>
                <StatusPill status={j.status.replace(/_/g, " ")} />
              </li>
            ))}
          </ul>
        )}
      </CardContent></Card>

      {/* Documents */}
      {data.documents.length > 0 && (
        <Card><CardContent className="p-4">
          <h2 className="font-display text-base font-bold">Documents</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {data.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span>{d.type.replace(/_/g, " ")}{d.fileName ? ` — ${d.fileName}` : ""}</span>
                <span className="text-xs text-muted-foreground">{d.expiresOn ? `expires ${fmtDate(d.expiresOn)}` : ""}</span>
              </li>
            ))}
          </ul>
        </CardContent></Card>
      )}

      {/* Odometer history */}
      {data.odometer.length > 0 && (
        <Card><CardContent className="p-4">
          <h2 className="font-display text-base font-bold">Mileage history</h2>
          <ul className="mt-2 divide-y divide-border text-sm">
            {data.odometer.slice(0, 8).map((o) => (
              <li key={o.id} className="flex justify-between py-1.5">
                <span>{o.readingKm.toLocaleString()} km</span>
                <span className="text-xs text-muted-foreground">{fmtDate(o.readAt)}</span>
              </li>
            ))}
          </ul>
        </CardContent></Card>
      )}
    </div>
  )
}
