"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Phone, Truck } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill, statusTone } from "@/components/brand/status-pill"
import { formatGHS } from "@/lib/money"
import { confirmMyPartReceived, disputeMyPartOrder, retryPartOrderPayment, type MyPartOrder } from "@/lib/parts-shop/actions"

const STEPS = ["placed", "accepted", "packed", "out_for_delivery", "delivered", "received"] as const
const STEP_LABEL: Record<string, string> = {
  placed: "Ordered", accepted: "Accepted", packed: "Packed", out_for_delivery: "On the way", delivered: "Delivered", received: "Received",
}

const NOTICE = {
  success: { cls: "bg-emerald-50 text-emerald-900", text: "Payment received — the seller has been told. We hold the money until your part arrives." },
  pending: { cls: "bg-amber-50 text-amber-900", text: "Waiting for your payment to confirm. This page updates within a few minutes." },
  failed: { cls: "bg-red-50 text-red-900", text: "The payment didn't go through. Tap “Pay now” on the order to try again." },
}

export function MyPartOrders({ orders, notice }: { orders: MyPartOrder[]; notice: "success" | "pending" | "failed" | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [disputing, setDisputing] = useState<{ id: string; text: string } | null>(null)

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok: string) {
    startTransition(async () => {
      const r = await fn()
      setMsg(r.ok ? ok : r.error)
      if (r.ok) setDisputing(null)
      router.refresh()
    })
  }

  function payAgain(id: string) {
    startTransition(async () => {
      const r = await retryPartOrderPayment(id)
      if (!r.ok) return setMsg(r.error)
      window.location.href = r.checkoutUrl
    })
  }

  return (
    <div className="mt-6 space-y-4">
      {notice && <p className={`rounded-xl px-4 py-3 text-sm font-medium ${NOTICE[notice].cls}`}>{NOTICE[notice].text}</p>}
      {msg && <p className="rounded-lg bg-info/10 px-3 py-2 text-sm">{msg}</p>}
      {orders.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No parts orders yet.</p>
      )}
      {orders.map((o) => {
        const stepIdx = STEPS.indexOf(o.status as (typeof STEPS)[number])
        return (
          <Card key={o.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold">{o.number}</span>
                    <StatusPill status={o.status.replace(/_/g, " ")} tone={statusTone(o.status)} />
                    {o.paymentStatus !== "paid" && !["cancelled", "rejected"].includes(o.status) && <StatusPill status="unpaid" tone="warning" />}
                    {o.holdStatus === "disputed" && <StatusPill status="problem reported" tone="danger" />}
                  </div>
                  <p className="mt-1 font-semibold">{o.items.map((i) => `${i.description}${i.quantity > 1 ? ` × ${i.quantity}` : ""}`).join(", ")}</p>
                  <p className="text-sm text-muted-foreground">{o.vendorName} · {o.destinationLabel}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-lg font-bold tabular-nums">{formatGHS(o.total)}</p>
                  {o.fittingFee > 0 && <p className="text-xs text-muted-foreground">incl. fitting {formatGHS(o.fittingFee)}</p>}
                </div>
              </div>

              {stepIdx >= 0 && (
                <ol className="flex gap-1">
                  {STEPS.map((s, i) => (
                    <li key={s} className="flex-1">
                      <div className={`h-1.5 rounded-full ${i <= stepIdx ? "bg-[#FF5A1F]" : "bg-muted"}`} />
                      <span className={`mt-1 block text-[10px] ${i <= stepIdx ? "font-semibold" : "text-muted-foreground"}`}>{STEP_LABEL[s]}</span>
                    </li>
                  ))}
                </ol>
              )}

              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {(o.riderName || o.courierReference) && <span className="inline-flex items-center gap-1"><Truck className="size-3.5" /> {o.riderName ?? `Courier ${o.courierReference}`}{o.riderPhone ? ` · ${o.riderPhone}` : ""}</span>}
                <a href={`tel:${o.vendorPhone}`} className="inline-flex items-center gap-1 underline"><Phone className="size-3.5" /> Call seller</a>
                {o.expectedDeliveryAt && !["received", "cancelled"].includes(o.status) && <span>Expected {new Date(o.expectedDeliveryAt).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}</span>}
              </div>

              <div className="flex flex-wrap gap-2">
                {o.canPay && <Button size="sm" disabled={pending} onClick={() => payAgain(o.id)}>Pay now</Button>}
                {o.canConfirm && <Button size="sm" disabled={pending} onClick={() => run(() => confirmMyPartReceived(o.id), "Thanks — the seller is being paid.")}>I&apos;ve got it</Button>}
                {o.canDispute && disputing?.id !== o.id && <Button size="sm" variant="secondary" disabled={pending} onClick={() => setDisputing({ id: o.id, text: "" })}>Report a problem</Button>}
              </div>

              {disputing?.id === o.id && (
                <div className="rounded-xl border border-border p-3">
                  <textarea value={disputing.text} onChange={(e) => setDisputing({ ...disputing, text: e.target.value })} rows={3}
                    placeholder="e.g. Wrong part — I ordered front pads and got rear ones"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" disabled={pending || disputing.text.trim().length < 10}
                      onClick={() => run(() => disputeMyPartOrder({ orderId: o.id, reason: disputing.text }), "Reported — the seller won't be paid until the FixAm team has sorted it out.")}>Send</Button>
                    <Button size="sm" variant="secondary" onClick={() => setDisputing(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
