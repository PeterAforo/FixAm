"use client"

import { useEffect, useState, useTransition } from "react"
import { BadgeCheck, Boxes, Clock, ShieldCheck, Truck } from "lucide-react"
import { Button } from "@/components/brand/button"
import { getJobPartOffers, orderOfferToGarage, assignStockToJobItem, type JobPartOffers } from "@/lib/part-offers/actions"

const ghs = (p: number) => `GH₵ ${(p / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`
const COND: Record<string, string> = { genuine: "Genuine", aftermarket: "Aftermarket", home_used: "Home-used" }

/**
 * Instant part offers for a finding or estimate line: own stock first, then
 * the best vendor offers for this car, with one-tap "order to garage".
 */
export function PartOffersPanel(props: {
  garageId: string
  jobId: string
  partTypeId: string
  jobItemId?: string
  canOrder: boolean
  onAddLine?: (offer: { name: string; total: number; partTypeId: string }) => void
  onDone?: (message: string) => void
}) {
  const [data, setData] = useState<JobPartOffers | null | undefined>(undefined)
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getJobPartOffers({ garageId: props.garageId, jobId: props.jobId, partTypeId: props.partTypeId }).then((r) => {
      if (alive) setData(r)
    })
    return () => {
      alive = false
    }
  }, [props.garageId, props.jobId, props.partTypeId])

  function order(productId: string) {
    startTransition(async () => {
      const r = await orderOfferToGarage({ garageId: props.garageId, jobId: props.jobId, productId, quantity: 1, jobItemId: props.jobItemId })
      const text = r.ok ? `Ordered ${r.orderNumber} — it's linked to this job.` : r.error
      setMsg(text)
      if (r.ok) props.onDone?.(text)
    })
  }

  function takeFromStock(partId: string) {
    if (!props.jobItemId) return
    startTransition(async () => {
      const r = await assignStockToJobItem({ garageId: props.garageId, jobItemId: props.jobItemId, partId })
      const text = r.ok ? "Using the part from your stock." : r.error
      setMsg(text)
      if (r.ok) props.onDone?.(text)
    })
  }

  if (data === undefined) return <div className="mt-2 h-20 animate-pulse rounded-lg bg-muted" />
  if (data === null) return <p className="mt-2 text-xs text-muted-foreground">Couldn&apos;t load offers.</p>

  return (
    <div className="mt-2 space-y-2 rounded-xl bg-surface-muted/50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{data.partType.name} — where to get it</p>
      {data.stock.length > 0 && (
        <ul className="space-y-1">
          {data.stock.map((s) => (
            <li key={s.partId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card px-3 py-2 text-sm">
              <span className="flex items-center gap-2"><Boxes className="size-4 text-emerald-700" /> <b>In your stock:</b> {s.name} <span className="text-xs text-muted-foreground">({s.available} available · {ghs(s.sellingPrice)})</span></span>
              {props.jobItemId && s.available > 0 && <Button size="sm" variant="secondary" disabled={pending} onClick={() => takeFromStock(s.partId)}>Use this</Button>}
            </li>
          ))}
        </ul>
      )}
      {data.offers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sellers have this part for this car yet.</p>
      ) : (
        <ul className="space-y-1">
          {data.offers.map((o, i) => (
            <li key={o.productId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium">
                  {i === 0 && <span className="mr-1 rounded bg-[#FF5A1F] px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Best</span>}
                  {o.name}{o.brand ? ` · ${o.brand}` : ""}{o.condition ? ` · ${COND[o.condition] ?? o.condition}` : ""}
                </p>
                <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">{o.vendorName}{o.vendorVerified && <BadgeCheck className="size-3.5 text-[#0B5CAD]" />}</span>
                  {o.etaHours != null && <span className="inline-flex items-center gap-1"><Clock className="size-3.5" /> ~{o.etaHours} h</span>}
                  <span className="inline-flex items-center gap-1"><Truck className="size-3.5" /> {o.deliverable ? (o.deliveryFee ? ghs(o.deliveryFee) : "free delivery") : "doesn't deliver to you"}</span>
                  {o.warrantyDays ? <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3.5" /> {o.warrantyDays} d</span> : null}
                  {o.fitLevel >= 2 && <span>exact fit</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold tabular-nums">{ghs(o.total)}</span>
                {props.onAddLine && (
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => props.onAddLine!({ name: o.name, total: o.total, partTypeId: data.partType.id })}>Add to estimate</Button>
                )}
                {props.canOrder && o.deliverable && <Button size="sm" disabled={pending} onClick={() => order(o.productId)}>Order to garage</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="text-xs font-medium">{msg}</p>}
    </div>
  )
}
