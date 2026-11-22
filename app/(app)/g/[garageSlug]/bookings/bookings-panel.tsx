"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { createBooking, updateBookingStatus } from "@/lib/bookings/actions"

const inputCls = "min-h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

type Booking = {
  id: string
  branchName: string
  customerName: string | null
  phone: string | null
  serviceType: string
  jobTemplateId: string | null
  startsAt: string
  endsAt: string
  status: string
  source: string | null
  jobId: string | null
  vehicleLabel: string | null
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GH", { hour: "numeric", minute: "2-digit" })
}

export function BookingsPanel(props: {
  garageSlug: string
  garageId: string
  day: string
  canManage: boolean
  branches: { id: string; name: string }[]
  services: { id: string; name: string }[]
  customers: { id: string; name: string }[]
  bookings: Booking[]
}) {
  const { garageSlug, garageId, day, canManage, branches, services, customers, bookings } = props
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    branchId: branches[0]?.id ?? "",
    customerId: "",
    serviceType: services[0]?.name ?? "",
    jobTemplateId: "",
    date: day,
    time: "09:00",
    guestName: "",
    guestPhone: "",
    guestPlate: "",
    notes: "",
  })

  const shift = (delta: number) => {
    const d = new Date(`${day}T00:00:00`)
    d.setDate(d.getDate() + delta)
    router.push(`/g/${garageSlug}/bookings?date=${d.toISOString().slice(0, 10)}`)
  }

  function setStatus(id: string, status: "confirmed" | "cancelled" | "no_show") {
    startTransition(async () => {
      const res = await updateBookingStatus({ garageId, bookingId: id, status })
      if (res.ok) router.refresh()
      else setMsg(res.error.message)
    })
  }

  function submit() {
    setMsg(null)
    const start = new Date(`${form.date}T${form.time}:00`)
    const end = new Date(start.getTime() + 60 * 60_000)
    if (!form.branchId || !form.serviceType) { setMsg("Branch and service are required"); return }
    if (!form.customerId && form.guestName.trim().length < 2) { setMsg("Pick a customer or enter a guest name"); return }
    startTransition(async () => {
      const res = await createBooking({
        garageId,
        branchId: form.branchId,
        customerId: form.customerId || undefined,
        serviceType: form.serviceType,
        jobTemplateId: form.jobTemplateId || undefined,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        guestName: form.customerId ? undefined : form.guestName || undefined,
        guestPhone: form.guestPhone || undefined,
        guestPlate: form.guestPlate || undefined,
        notes: form.notes || undefined,
        confirm: true,
      })
      if (res.ok) { setShowForm(false); setMsg("Booking created"); router.refresh() }
      else setMsg(res.error.message)
    })
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em]">Bookings</h1>
          <p className="text-muted-foreground">
            {new Date(`${day}T00:00:00`).toLocaleDateString("en-GH", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => shift(-1)}>← Prev</Button>
          <Button variant="secondary" onClick={() => shift(1)}>Next →</Button>
          {canManage && <Button onClick={() => setShowForm((s) => !s)}>{showForm ? "Close" : "New booking"}</Button>}
        </div>
      </header>

      {msg && <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">{msg}</p>}

      {showForm && canManage && (
        <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <select className={inputCls} value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className={inputCls} value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
            <option value="">Guest / walk-in…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className={inputCls} value={form.serviceType} onChange={(e) => {
            const svc = services.find((s) => s.name === e.target.value)
            setForm({ ...form, serviceType: e.target.value, jobTemplateId: svc ? form.jobTemplateId : "" })
          }}>
            {services.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            <option value="Other">Other</option>
          </select>
          <select className={inputCls} value={form.jobTemplateId} onChange={(e) => setForm({ ...form, jobTemplateId: e.target.value })}>
            <option value="">No template</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input className={inputCls} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <input className={inputCls} type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          {!form.customerId && (
            <>
              <input className={inputCls} placeholder="Guest name" value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} />
              <input className={inputCls} placeholder="Guest phone" value={form.guestPhone} onChange={(e) => setForm({ ...form, guestPhone: e.target.value })} />
              <input className={inputCls} placeholder="Plate (optional)" value={form.guestPlate} onChange={(e) => setForm({ ...form, guestPlate: e.target.value })} />
            </>
          )}
          <input className={inputCls} placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="sm:col-span-2 lg:col-span-3">
            <Button onClick={submit} disabled={pending}>Create booking</Button>
          </div>
        </CardContent></Card>
      )}

      {bookings.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No bookings for this day.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {bookings.map((b) => (
            <Card key={b.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="w-20 shrink-0">
                  <p className="font-mono text-sm font-semibold">{fmtTime(b.startsAt)}</p>
                  <p className="text-xs text-muted-foreground">{fmtTime(b.endsAt)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{b.customerName ?? "Guest"} · {b.serviceType}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {b.branchName}{b.vehicleLabel ? ` · ${b.vehicleLabel}` : ""}{b.phone ? ` · ${b.phone}` : ""}
                    {b.source === "public_page" ? " · online" : ""}
                  </p>
                </div>
                <StatusPill status={b.status} />
                <div className="flex gap-1">
                  {canManage && b.status === "requested" && (
                    <Button size="sm" onClick={() => setStatus(b.id, "confirmed")} disabled={pending}>Confirm</Button>
                  )}
                  {canManage && b.status !== "checked_in" && b.status !== "cancelled" && (
                    <Button size="sm" variant="secondary" onClick={() => setStatus(b.id, "cancelled")} disabled={pending}>Cancel</Button>
                  )}
                  {!b.jobId && b.status !== "cancelled" && (
                    <Link href={`/g/${garageSlug}/check-in?booking=${b.id}`}>
                      <Button size="sm" variant="secondary">Check in</Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
