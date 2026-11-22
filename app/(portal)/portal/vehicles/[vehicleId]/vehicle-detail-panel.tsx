"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { portalUpdateMileage, submitGarageReview } from "@/lib/portal/actions"
import { VehicleHealthCard, type RingStatus } from "@/components/brand/vehicle-health-card"
import type { VehicleType } from "@/components/brand/car-avatar"

const inputCls = "min-h-10 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" }) : "—")

type Ring = { status: RingStatus; nextDue?: string }

type Data = {
  vehicle: { id: string; plateNumber: string; make: string; model: string; year: number | null; garageName: string; lastOdometerKm: number | null; lastOdometerAt: string | null; catalogMakeId?: string | null; catalogModelId?: string | null; color?: string | null; colorHex?: string | null; bodyType?: string | null }
  rings: { oil: Ring; insurance: Ring; dvla: Ring; issues: Ring }
  fixamScore: { score: number; tips: string[] }
  jobs: { id: string; number: string; status: string; complaint: string | null; createdAt: string; promisedAt: string | null; deliveredAt: string | null }[]
  odometer: { id: string; readingKm: number; readAt: string; source: string }[]
  documents: { id: string; type: string; fileName: string | null; expiresOn: string | null }[]
  dueItems: { id: string; type: string; title: string; effectiveDueDate: string; status: string; dueMileageKm: number | null }[]
  insurance: { id: string; insurerName: string; policyType: string; endDate: string; policyNumber: string | null }[]
  dvla: { id: string; type: string; expiryDate: string; referenceNumber: string | null }[]
}

type MatchingGarage = { id: string; slug: string; name: string; city: string | null; region: string | null; ratingAvg: number | null; reviewCount: number }

export function VehicleDetailPanel({
  data,
  matchingGarages = [],
  garageId,
  garageName,
  existingReview = null,
}: {
  data: Data
  matchingGarages?: MatchingGarage[]
  garageId: string
  garageName: string
  existingReview?: { rating: number; comment: string | null } | null
}) {
  const [pending, startTransition] = useTransition()
  const [mileage, setMileage] = useState("")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [rating, setRating] = useState(existingReview?.rating ?? 0)
  const [reviewText, setReviewText] = useState(existingReview?.comment ?? "")
  const [reviewMsg, setReviewMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const v = data.vehicle
  const vtype = ({ sedan: "sedan", hatchback: "hatchback", suv: "suv", pickup: "pickup", van: "van", bus: "bus", truck: "truck", motorbike: "motorbike" } as Record<string, VehicleType>)[v.bodyType ?? ""] ?? "sedan"

  function submitReview(e: React.FormEvent) {
    e.preventDefault()
    if (rating < 1) { setReviewMsg({ ok: false, text: "Pick a star rating" }); return }
    setReviewMsg(null)
    startTransition(async () => {
      const res = await submitGarageReview({ garageId, rating, comment: reviewText })
      if (!res.ok) { setReviewMsg({ ok: false, text: res.error.message }); return }
      setReviewMsg({ ok: true, text: "Thanks — your review was posted." })
    })
  }

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
      <VehicleHealthCard
        plate={v.plateNumber}
        nickname={`${v.make} ${v.model}${v.year ? ` ${v.year}` : ""}`}
        type={vtype}
        color={v.colorHex ?? v.color ?? undefined}
        oil={data.rings.oil}
        insurance={data.rings.insurance}
        dvla={data.rings.dvla}
        issues={data.rings.issues}
        score={data.fixamScore}
      />
      <p className="-mt-3 text-sm text-muted-foreground">
        {v.garageName}
        {v.lastOdometerKm != null ? ` · ${v.lastOdometerKm.toLocaleString()} km (${fmtDate(v.lastOdometerAt)})` : ""}
      </p>

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

      {/* Rate this garage */}
      <Card><CardContent className="p-4">
        <h2 className="font-display text-base font-bold">Rate {garageName}</h2>
        <form onSubmit={submitReview} className="mt-2 space-y-2">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className={`text-2xl leading-none ${n <= rating ? "text-warning" : "text-muted-foreground/40"}`}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            className={`${inputCls} min-h-20`}
            placeholder="How was your experience? (optional)"
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            maxLength={1000}
          />
          <Button type="submit" disabled={pending || rating === 0}>{existingReview ? "Update review" : "Post review"}</Button>
        </form>
        {reviewMsg && <p className={`mt-2 text-sm font-semibold ${reviewMsg.ok ? "text-success" : "text-danger"}`}>{reviewMsg.text}</p>}
      </CardContent></Card>

      {/* Garages that service this car */}
      {(data.vehicle.catalogMakeId || data.vehicle.catalogModelId) && matchingGarages.length > 0 && (
        <Card><CardContent className="p-4">
          <h2 className="font-display text-base font-bold">Other garages that service this car</h2>
          <ul className="mt-2 space-y-2">
            {matchingGarages.map((g) => (
              <li key={g.id}>
                <Link href={`/garages/${g.slug}`} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-muted">
                  <div>
                    <p className="font-semibold">{g.name}</p>
                    <p className="text-xs text-muted-foreground">{[g.city, g.region].filter(Boolean).join(", ") || "Ghana"}</p>
                  </div>
                  {g.ratingAvg != null && <span className="text-xs font-bold">★ {g.ratingAvg}</span>}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/garages" className="mt-2 inline-block text-xs font-semibold text-primary underline">Search all garages →</Link>
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
