"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Camera, PackageCheck, Phone, Truck } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill, statusTone } from "@/components/brand/status-pill"
import { formatGHS } from "@/lib/money"
import { confirmIncomingPart, type IncomingPart } from "@/lib/parts-shop/garage-actions"

export function IncomingPartsPanel({ garageId, parts, canReceive }: { garageId: string; parts: IncomingPart[]; canReceive: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [target, setTarget] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const waiting = parts.filter((p) => p.status !== "received")
  const received = parts.filter((p) => p.status === "received")

  function pick(orderId: string) {
    setTarget(orderId)
    fileRef.current?.click()
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !target) return
    const fd = new FormData()
    fd.set("garageId", garageId)
    fd.set("orderId", target)
    fd.set("photo", file)
    startTransition(async () => {
      const r = await confirmIncomingPart(fd)
      setMsg(r.ok ? "Received — the seller is being paid and the customer has been told." : r.error)
      setTarget(null)
      router.refresh()
    })
  }

  return (
    <div className="mt-6 space-y-6">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      {msg && <p className="rounded-lg bg-info/10 px-3 py-2 text-sm">{msg}</p>}

      {waiting.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          <PackageCheck className="mx-auto mb-2 size-8 text-muted-foreground" />
          No parts on the way. When a customer buys a part on FixAm and picks your garage, it shows up here.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {waiting.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold">{p.number}</span>
                    <StatusPill status={p.status} tone={statusTone(p.status)} />
                    {!p.paid && <StatusPill status="awaiting payment" tone="warning" />}
                  </div>
                  <p className="font-semibold">{p.items.map((i) => `${i.description}${i.quantity > 1 ? ` × ${i.quantity}` : ""}`).join(", ")}</p>
                  <p className="text-sm text-muted-foreground">
                    From {p.vendorName}{p.vehicle ? ` · for ${p.vehicle}` : ""}{p.fittingFee > 0 ? ` · fitting fee ${formatGHS(p.fittingFee)} (paid)` : ""}
                  </p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {p.riderName && <span className="inline-flex items-center gap-1"><Truck className="size-3.5" /> {p.riderName}{p.riderPhone ? ` · ${p.riderPhone}` : ""}</span>}
                    {p.buyerPhone && <a href={`tel:${p.buyerPhone}`} className="inline-flex items-center gap-1 underline"><Phone className="size-3.5" /> Customer {p.buyerPhone}</a>}
                    {p.expectedDeliveryAt && <span>Expected {new Date(p.expectedDeliveryAt).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}</span>}
                  </div>
                </div>
                {canReceive && p.paid && (
                  <Button disabled={pending} onClick={() => pick(p.id)}>
                    <Camera className="size-4" /> {pending && target === p.id ? "Uploading…" : "It's here — take photo"}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {received.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold">Received</h2>
          <div className="mt-2 divide-y rounded-xl border border-border">
            {received.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="truncate">{p.number} · {p.items.map((i) => i.description).join(", ")}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{p.receivedAt ? new Date(p.receivedAt).toLocaleDateString("en-GH", { day: "numeric", month: "short" }) : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
