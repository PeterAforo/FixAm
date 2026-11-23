"use client"

import { useEffect, useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { confirmPublicBooking, getPublicAvailability, requestPublicBooking } from "@/lib/bookings/actions"

const inputCls = "min-h-12 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

type Branch = { id: string; name: string; bayCount: number }
type Service = { id: string; name: string; description: string | null; estimatedMinutes: number | null }
type Slot = { start: string; end: string; label: string; available: boolean }

export function BookingForm(props: {
  garageId: string
  garageName: string
  garagePhone: string
  branches: Branch[]
  services: Service[]
  pickup?: { enabled: boolean; fee: number; radiusKm: number }
}) {
  const { garageId, garageName, garagePhone, branches, services } = props
  const pickupOffer = props.pickup?.enabled ? props.pickup : null
  const [wantPickup, setWantPickup] = useState(false)
  const [wantReturn, setWantReturn] = useState(true)
  const [pickupAddress, setPickupAddress] = useState("")
  const [pickupLoc, setPickupLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [pending, startTransition] = useTransition()
  const [step, setStep] = useState<"form" | "otp" | "done">("form")
  const [err, setErr] = useState<string | null>(null)

  const [branchId, setBranchId] = useState(branches[0]?.id ?? "")
  const [service, setService] = useState<Service | null>(services[0] ?? null)
  const [serviceName, setServiceName] = useState(services[0]?.name ?? "")
  const [date, setDate] = useState(() => new Date(Date.now() + 86400_000).toISOString().slice(0, 10))
  const [slots, setSlots] = useState<Slot[]>([])
  const [slot, setSlot] = useState<Slot | null>(null)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [plate, setPlate] = useState("")
  const [notes, setNotes] = useState("")
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [confirmToken, setConfirmToken] = useState<string | null>(null)
  const [code, setCode] = useState("")

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
    if (!serviceName.trim()) { setErr("Pick a service"); return }
    if (!slot) { setErr("Pick a time slot"); return }
    if (name.trim().length < 2) { setErr("Enter your name"); return }
    if (phone.trim().length < 9) { setErr("Enter a valid phone number"); return }
    startTransition(async () => {
      const res = await requestPublicBooking({
        garageId,
        branchId,
        serviceType: serviceName.trim(),
        jobTemplateId: service?.id,
        guestName: name.trim(),
        guestPhone: phone.trim(),
        guestPlate: plate.trim() || undefined,
        notes: notes.trim() || undefined,
        ...(wantPickup && pickupAddress.trim().length >= 5
          ? { pickupAddress: pickupAddress.trim(), pickupLat: pickupLoc?.lat, pickupLng: pickupLoc?.lng, wantsReturn: wantReturn }
          : {}),
        startsAt: slot!.start,
        endsAt: slot!.end,
      })
      if (res.ok) {
        setBookingId(res.data.bookingId)
        setConfirmToken(res.data.confirmToken)
        setStep("otp")
      } else setErr(res.error.message)
    })
  }

  function confirm() {
    setErr(null)
    if (!bookingId || !confirmToken) return
    startTransition(async () => {
      const res = await confirmPublicBooking({ bookingId, confirmToken, code: code.trim() })
      if (res.ok) setStep("done")
      else setErr(res.error.message)
    })
  }

  if (step === "done") {
    return (
      <Card><CardContent className="p-6 text-center">
        <h2 className="font-display text-xl font-bold">Booking confirmed!</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          See you at {garageName}. We&rsquo;ll send a reminder the day before.
        </p>
        <p className="mt-3 text-sm">Questions? Call <a className="font-semibold underline" href={`tel:${garagePhone}`}>{garagePhone}</a></p>
      </CardContent></Card>
    )
  }

  if (step === "otp") {
    return (
      <Card><CardContent className="space-y-4 p-6">
        <h2 className="font-display text-xl font-bold">Check your phone</h2>
        <p className="text-sm text-muted-foreground">
          We sent a 6-digit code by SMS to <b>{phone}</b>. Enter it to confirm your booking.
        </p>
        <input
          className={`${inputCls} text-center font-mono text-2xl tracking-[0.5em]`}
          inputMode="numeric"
          maxLength={6}
          placeholder="••••••"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <Button onClick={confirm} disabled={pending || code.length !== 6} className="min-h-[48px] w-full">
          {pending ? "Confirming…" : "Confirm booking"}
        </Button>
      </CardContent></Card>
    )
  }

  return (
    <Card><CardContent className="space-y-4 p-5">
      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Branch</label>
        <select className={`${inputCls} mt-1`} value={branchId} onChange={(e) => { setBranchId(e.target.value); setSlot(null) }}>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.bayCount ? ` (${b.bayCount} bays)` : ""}</option>)}
        </select>
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Service</label>
        <select className={`${inputCls} mt-1`} value={service?.id ?? ""} onChange={(e) => {
          const s = services.find((x) => x.id === e.target.value) ?? null
          setService(s); setServiceName(s?.name ?? "")
        }}>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Date</label>
        <input className={`${inputCls} mt-1`} type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => { setDate(e.target.value); setSlot(null) }} />
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Time</label>
        {slots.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading availability…</p>
        ) : (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {slots.map((s) => (
              <button
                key={s.start}
                disabled={!s.available}
                onClick={() => setSlot(s)}
                className={`min-h-[44px] rounded-lg border-2 text-sm font-semibold ${
                  slot?.start === s.start
                    ? "border-accent bg-accent/15 text-accent-foreground"
                    : s.available
                      ? "border-border bg-surface hover:border-accent/50"
                      : "border-border bg-muted text-muted-foreground/50 line-through"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        {slots.length > 0 && slots.every((s) => !s.available) && (
          <p className="mt-2 text-sm text-muted-foreground">Fully booked this day — try another date.</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Your name</label>
          <input className={`${inputCls} mt-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Kwame Mensah" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Phone (WhatsApp)</label>
          <input className={`${inputCls} mt-1`} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+233…" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Plate (optional)</label>
          <input className={`${inputCls} mt-1`} value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="GR 1234-24" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Notes (optional)</label>
          <input className={`${inputCls} mt-1`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. grinding noise when braking" />
        </div>
      </div>

      {pickupOffer && (
        <div className="rounded-xl border border-border p-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={wantPickup} onChange={(e) => setWantPickup(e.target.checked)} />
            <span>
              <span className="font-semibold">Collect my car</span>{" "}
              <span className="text-muted-foreground">— our driver picks it up{pickupOffer.fee > 0 ? ` (GH₵${(pickupOffer.fee / 100).toFixed(0)} each way)` : ""}, within {pickupOffer.radiusKm} km. You&apos;ll get photos of the car and sign on handover.</span>
            </span>
          </label>
          {wantPickup && (
            <div className="mt-2 space-y-2">
              <input className={inputCls} value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} placeholder="Pickup address or landmark" />
              <button type="button" className="text-xs underline" onClick={() => navigator.geolocation?.getCurrentPosition((p) => setPickupLoc({ lat: p.coords.latitude, lng: p.coords.longitude }))}>
                {pickupLoc ? "Location added ✓" : "Use my current location"}
              </button>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={wantReturn} onChange={(e) => setWantReturn(e.target.checked)} /> Bring it back when it&apos;s ready
              </label>
            </div>
          )}
        </div>
      )}

      {err && <p className="text-sm text-red-600">{err}</p>}
      <Button onClick={submit} disabled={pending} className="min-h-[48px] w-full">
        {pending ? "Sending code…" : "Request booking"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">No payment needed now — pay at the garage.</p>
    </CardContent></Card>
  )
}
