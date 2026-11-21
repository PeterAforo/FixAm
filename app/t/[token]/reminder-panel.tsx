"use client"

import { useEffect, useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { getPublicAvailability } from "@/lib/bookings/actions"
import {
  confirmReminderBooking,
  requestReminderBooking,
  startReminderRenewal,
  submitReminderDone,
  submitReminderMileage,
} from "@/lib/reminders/public-actions"
import {
  acceptRenewalQuote,
  getPublicRenewal,
  submitRenewalDetails,
} from "@/lib/renewals/public-actions"

const inputCls = "min-h-11 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
const labelCls = "text-xs font-bold uppercase tracking-wide text-muted-foreground"

type Item = {
  id: string
  type: string
  title: string
  dueDate: string | null
  predictedDueDate: string | null
  effectiveDueDate: string
  dueMileageKm: number | null
  vehicleId: string
  plate: string | null
  vehicleLabel: string
  primaryAction: string
  sourceType: string | null
  sourceId: string | null
  payUrl: string | null
}

type Slot = { start: string; end: string; label: string; available: boolean }

export function ReminderPanel(props: {
  token: string
  garageId: string
  garageName: string
  garageSlug: string
  garagePhone: string | null
  customerName: string | null
  customerPhone: string | null
  branches: { id: string; name: string }[]
  items: Item[]
}) {
  const { token, garageId, garageName, garagePhone, customerName, customerPhone, branches, items } = props
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())

  function markDone(id: string) {
    setDoneIds((s) => new Set(s).add(id))
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        if (doneIds.has(item.id)) {
          return (
            <Card key={item.id}><CardContent className="p-5 text-center">
              <StatusPill status="completed" tone="ok" />
              <p className="mt-2 text-sm text-muted-foreground">Thanks â€” {garageName} has been notified.</p>
            </CardContent></Card>
          )
        }
        return (
          <ReminderCard
            key={item.id}
            token={token}
            garageId={garageId}
            item={item}
            garageName={garageName}
            garagePhone={garagePhone}
            customerName={customerName}
            customerPhone={customerPhone}
            branches={branches}
            pending={pending}
            setMsg={setMsg}
            onDone={() => markDone(item.id)}
            startTransition={startTransition}
          />
        )
      })}
      {msg && <p className={`rounded-lg px-3 py-2 text-sm font-semibold ${msg.ok ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>{msg.text}</p>}
    </div>
  )
}

function ReminderCard(props: {
  token: string
  garageId: string
  item: Item
  garageName: string
  garagePhone: string | null
  customerName: string | null
  customerPhone: string | null
  branches: { id: string; name: string }[]
  pending: boolean
  startTransition: (fn: () => void) => void
  setMsg: (m: { ok: boolean; text: string } | null) => void
  onDone: () => void
}) {
  const { token, garageId, item, garageName, garagePhone, customerName, customerPhone, branches, pending, startTransition, setMsg, onDone } = props
  const [mode, setMode] = useState<"idle" | "book" | "mileage" | "done" | "renewed">("idle")
  const [renewalId, setRenewalId] = useState<string | null>(null)
  const action = item.primaryAction

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">{item.title}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {item.vehicleLabel}
              {item.dueMileageKm ? ` Â· due at ${item.dueMileageKm.toLocaleString()} km` : ""}
            </p>
            <p className="mt-1 text-sm">
              {item.effectiveDueDate <= new Date().toISOString().slice(0, 10) ? "Due now" : `Due around ${item.effectiveDueDate}`}
              {item.predictedDueDate && item.predictedDueDate !== item.dueDate ? " (by mileage)" : ""}
            </p>
          </div>
          <StatusPill status={item.type.replace(/_/g, " ")} />
        </div>

        {mode === "idle" && (
          <div className="mt-4 flex flex-wrap gap-2">
            {(action === "book_now" || item.type === "roadworthy") && (
              <Button onClick={() => setMode("book")}>
                {item.type === "roadworthy" ? "Book pre-inspection" : "Book now"}
              </Button>
            )}
            {(action === "book_now" || item.type === "oil_change" || item.type === "general_service") && (
              <Button variant="secondary" onClick={() => setMode("mileage")}>Update mileage</Button>
            )}
            {action === "renew_with_garage" && (
              <Button onClick={() => {
                startTransition(async () => {
                  const res = await startReminderRenewal({ token, dueItemId: item.id })
                  if (res.ok) { setRenewalId(res.data.renewalId); setMode("renewed"); setMsg({ ok: true, text: "Renewal request sent â€” the garage will confirm shortly." }) }
                  else setMsg({ ok: false, text: res.error.message })
                })
              }} disabled={pending}>
                Renew with {garageName}
              </Button>
            )}
            {action === "pay_now" && item.payUrl && (
              <Button asChild><a href={item.payUrl}>Pay now</a></Button>
            )}
            {action === "pay_now" && !item.payUrl && (
              <p className="text-sm text-muted-foreground">Contact {garageName}{garagePhone ? ` on ${garagePhone}` : ""} to settle this.</p>
            )}
            <Button variant="ghost" onClick={() => setMode("done")}>Already done</Button>
          </div>
        )}

        {mode === "renewed" && renewalId && (
          <RenewalTracker token={token} renewalId={renewalId} garageName={garageName} pending={pending} startTransition={startTransition} setMsg={setMsg} />
        )}

        {mode === "book" && (
          <BookingForm
            token={token} garageId={garageId} item={item} branches={branches}
            defaultName={customerName ?? ""} defaultPhone={customerPhone ?? ""}
            pending={pending} startTransition={startTransition}
            onBooked={() => { setMode("idle"); onDone() }}
          />
        )}

        {mode === "mileage" && (
          <MileageForm
            token={token} vehicleId={item.vehicleId}
            pending={pending} startTransition={startTransition}
            onSaved={() => { setMode("idle"); onDone() }}
            setMsg={setMsg}
          />
        )}

        {mode === "done" && (
          <DoneForm
            token={token} item={item}
            pending={pending} startTransition={startTransition}
            onSaved={() => { setMode("idle"); onDone() }}
            setMsg={setMsg}
          />
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------

function BookingForm(props: {
  token: string
  garageId: string
  item: Item
  branches: { id: string; name: string }[]
  defaultName: string
  defaultPhone: string
  pending: boolean
  startTransition: (fn: () => void) => void
  onBooked: () => void
}) {
  const { token, garageId, item, branches, defaultName, defaultPhone, pending, startTransition, onBooked } = props
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "")
  const [service, setService] = useState(item.title)
  const [date, setDate] = useState(() => new Date(Date.now() + 86400_000).toISOString().slice(0, 10))
  const [slots, setSlots] = useState<Slot[]>([])
  const [slot, setSlot] = useState<Slot | null>(null)
  const [name, setName] = useState(defaultName)
  const [phone, setPhone] = useState(defaultPhone)
  const [notes, setNotes] = useState("")
  const [step, setStep] = useState<"form" | "otp" | "done">("form")
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [confirmToken, setConfirmToken] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!branchId || !date) return
    let cancelled = false
    getPublicAvailability({ garageId, branchId, date }).then((res) => {
      if (!cancelled && res.ok) setSlots(res.data)
    })
    return () => { cancelled = true }
  }, [garageId, branchId, date])

  function submit() {
    setErr(null)
    if (!service.trim()) { setErr("Enter the service needed"); return }
    if (!slot) { setErr("Pick a time slot"); return }
    if (name.trim().length < 2) { setErr("Enter your name"); return }
    if (phone.trim().length < 9) { setErr("Enter a valid phone number"); return }
    startTransition(async () => {
      const res = await requestReminderBooking({
        token, dueItemId: item.id, branchId,
        serviceType: service.trim(), guestName: name.trim(), guestPhone: phone.trim(),
        guestPlate: item.plate ?? undefined, notes: notes.trim() || undefined,
        startsAt: slot!.start, endsAt: slot!.end,
      })
      if (res.ok) {
        setBookingId(res.data.bookingId)
        setConfirmToken(res.data.confirmToken)
        setStep("otp")
      } else setErr(res.error.message)
    })
  }

  function confirm() {
    if (!bookingId) return
    startTransition(async () => {
      const res = await confirmReminderBooking({ bookingId, confirmToken: confirmToken ?? "", code })
      if (res.ok) setStep("done")
      else setErr(res.error.message)
    })
  }

  if (step === "done") {
    return (
      <div className="mt-4 space-y-3">
        <p className="rounded-lg bg-success/10 p-3 text-sm text-success">Booking confirmed â€” see you soon!</p>
        <Button variant="secondary" className="w-full" onClick={onBooked}>Done</Button>
      </div>
    )
  }
  if (step === "otp") {
    return (
      <div className="mt-4 space-y-3">
        <p className="text-sm text-muted-foreground">We sent a 6-digit code by SMS to <b>{phone}</b>.</p>
        <input className={`${inputCls} text-center font-mono text-xl tracking-[0.4em]`} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <Button className="w-full" disabled={pending || code.length !== 6} onClick={confirm}>{pending ? "Confirmingâ€¦" : "Confirm booking"}</Button>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-3">
      <div>
        <label className={labelCls}>Branch</label>
        <select className={`${inputCls} mt-1`} value={branchId} onChange={(e) => { setBranchId(e.target.value); setSlot(null) }}>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Service</label>
        <input className={`${inputCls} mt-1`} value={service} onChange={(e) => setService(e.target.value)} />
      </div>
      <div>
        <label className={labelCls}>Date</label>
        <input className={`${inputCls} mt-1`} type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => { setDate(e.target.value); setSlot(null) }} />
      </div>
      <div>
        <label className={labelCls}>Time</label>
        {slots.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">Loadingâ€¦</p> : (
          <div className="mt-1 grid grid-cols-3 gap-2">
            {slots.map((s) => (
              <button key={s.start} disabled={!s.available} onClick={() => setSlot(s)}
                className={`min-h-[44px] rounded-lg border-2 text-sm font-semibold ${slot?.start === s.start ? "border-accent bg-accent/15" : s.available ? "border-border bg-surface" : "border-border bg-muted text-muted-foreground/50 line-through"}`}>
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={labelCls}>Name</label><input className={`${inputCls} mt-1`} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className={labelCls}>Phone</label><input className={`${inputCls} mt-1`} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      </div>
      <div><label className={labelCls}>Notes (optional)</label><input className={`${inputCls} mt-1`} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <Button className="w-full" disabled={pending} onClick={submit}>{pending ? "Sending codeâ€¦" : "Request booking"}</Button>
    </div>
  )
}

// ---------------------------------------------------------------------------

function MileageForm(props: {
  token: string
  vehicleId: string
  pending: boolean
  startTransition: (fn: () => void) => void
  setMsg: (m: { ok: boolean; text: string } | null) => void
  onSaved: () => void
}) {
  const { token, vehicleId, pending, startTransition, setMsg, onSaved } = props
  const [km, setKm] = useState("")

  function submit() {
    const n = Number(km)
    if (!Number.isInteger(n) || n <= 0) { setMsg({ ok: false, text: "Enter a valid mileage" }); return }
    startTransition(async () => {
      const res = await submitReminderMileage({ token, vehicleId, km: n })
      if (res.ok) {
        setMsg({ ok: true, text: `Thanks! Recorded ${n.toLocaleString()} km â€” reminder dates updated.` })
        onSaved()
      } else setMsg({ ok: false, text: res.error.message })
    })
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-muted-foreground">Current odometer reading in km:</p>
      <div className="flex gap-2">
        <input className={inputCls} type="number" min={1} placeholder="e.g. 112300" value={km} onChange={(e) => setKm(e.target.value)} />
        <Button disabled={pending} onClick={submit}>Save</Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function DoneForm(props: {
  token: string
  item: Item
  pending: boolean
  startTransition: (fn: () => void) => void
  setMsg: (m: { ok: boolean; text: string } | null) => void
  onSaved: () => void
}) {
  const { token, item, pending, startTransition, setMsg, onSaved } = props
  const [reason, setReason] = useState<"done_elsewhere" | "sold_vehicle" | "not_needed">("done_elsewhere")
  const [newDate, setNewDate] = useState("")

  function submit() {
    startTransition(async () => {
      const res = await submitReminderDone({ token, dueItemId: item.id, reason, newDate: newDate || undefined })
      if (res.ok) { setMsg({ ok: true, text: "Got it â€” reminders stopped for this item." }); onSaved() }
      else setMsg({ ok: false, text: res.error.message })
    })
  }

  return (
    <div className="mt-4 space-y-3">
      <div>
        <label className={labelCls}>Reason</label>
        <select className={`${inputCls} mt-1`} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
          <option value="done_elsewhere">Done elsewhere</option>
          <option value="sold_vehicle">Vehicle sold</option>
          <option value="not_needed">Not needed</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Next due date (optional)</label>
        <input className={`${inputCls} mt-1`} type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
      </div>
      <Button variant="secondary" disabled={pending} onClick={submit}>Confirm</Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Renewal tracker — customer view of an in-flight renewal request
// ---------------------------------------------------------------------------

type PublicRenewal = {
  id: string
  number: string
  kind: string
  status: string
  dvlaRecordType: string | null
  officialFee: number | null
  serviceFee: number | null
  total: number | null
  requiredDocuments: string[]
  vehicleLabel: string
  garageName: string
  payUrl: string | null
  invoiceBalance: number | null
}

const RENEWAL_STEPS: Record<string, string> = {
  requested: "Request received",
  documents_pending: "Documents needed",
  quote_pending: "Preparing your quote",
  quote_sent: "Quote ready — review & pay",
  awaiting_payment: "Awaiting payment",
  paid: "Payment received",
  processing: "Processing with provider",
}

function RenewalTracker(props: {
  token: string
  renewalId: string
  garageName: string
  pending: boolean
  startTransition: (fn: () => void) => void
  setMsg: (m: { ok: boolean; text: string } | null) => void
}) {
  const { token, renewalId, garageName, pending, startTransition, setMsg } = props
  const [r, setR] = useState<PublicRenewal | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [docNotes, setDocNotes] = useState("")

  useEffect(() => {
    let alive = true
    getPublicRenewal({ token, renewalId }).then((res) => {
      if (!alive) return
      if (res.ok) setR(res.data)
      setLoaded(true)
    })
    return () => { alive = false }
  }, [token, renewalId])

  if (!loaded) return <p className="mt-3 text-sm text-muted-foreground">Loading renewal…</p>
  if (!r) return <p className="mt-3 rounded-lg bg-success/10 p-3 text-sm text-success">Renewal request received — {garageName} will be in touch. No further reminders for this item.</p>

  const gh = (p: number | null) => (p != null ? `GH? ${(p / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}` : "—")

  return (
    <div className="mt-3 space-y-3 rounded-lg border-2 border-border p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">{r.number} · {r.vehicleLabel}</p>
        <StatusPill status={r.status.replace(/_/g, " ")} />
      </div>
      <p className="text-sm text-muted-foreground">{RENEWAL_STEPS[r.status] ?? r.status}</p>

      {r.requiredDocuments.length > 0 && ["requested", "documents_pending"].includes(r.status) && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Needed: {r.requiredDocuments.join(", ").replace(/_/g, " ")}</p>
          <textarea className={`${inputCls} mt-1`} rows={2} placeholder="Share policy/certificate details or attach via the garage" value={docNotes} onChange={(e) => setDocNotes(e.target.value)} />
          <Button size="sm" variant="secondary" className="mt-2" disabled={pending} onClick={() => {
            startTransition(async () => {
              const res = await submitRenewalDetails({ token, renewalId, documentNotes: docNotes || undefined })
              if (res.ok) { setMsg({ ok: true, text: "Details sent to the garage." }); getPublicRenewal({ token, renewalId }).then((x) => x.ok && setR(x.data)) }
              else setMsg({ ok: false, text: res.error.message })
            })
          }}>Submit details</Button>
        </div>
      )}

      {r.status === "quote_sent" && r.total != null && (
        <div className="rounded-lg bg-surface-muted p-3 text-sm">
          <div className="flex justify-between"><span>Official fee</span><span>{gh(r.officialFee)}</span></div>
          <div className="flex justify-between"><span>Service fee</span><span>{gh(r.serviceFee)}</span></div>
          <div className="mt-1 flex justify-between border-t border-border pt-1 font-bold"><span>Total</span><span>{gh(r.total)}</span></div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => {
              startTransition(async () => {
                const res = await acceptRenewalQuote({ token, renewalId })
                if (res.ok) { setMsg({ ok: true, text: "Quote accepted — please pay to proceed." }); getPublicRenewal({ token, renewalId }).then((x) => x.ok && setR(x.data)) }
                else setMsg({ ok: false, text: res.error.message })
              })
            }}>Accept quote</Button>
          </div>
        </div>
      )}

      {(r.status === "awaiting_payment" || (r.status === "quote_sent")) && r.payUrl && (
        <Button asChild><a href={r.payUrl}>Pay {gh(r.total ?? r.invoiceBalance)}</a></Button>
      )}
      {r.status === "paid" || r.status === "processing" ? (
        <p className="text-sm text-muted-foreground">{RENEWAL_STEPS[r.status]} — we&apos;ll notify you when the new document is ready.</p>
      ) : null}
    </div>
  )
}
