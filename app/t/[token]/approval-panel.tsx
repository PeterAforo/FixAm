"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { respondToEstimate } from "@/lib/estimates/actions"

const ghs = (p: number) => `GH₵ ${(p / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`

type Estimate = {
  number: string
  version: number
  status: string
  subtotal: number
  discountTotal: number
  taxTotal: number
  total: number
  depositRequired: number
  validUntil: string | null
  items: { id: string; type: string; description: string; quantity: number; unitPrice: number; discountAmount: number; approvalStatus: string | null }[]
}

export function ApprovalPanel({ token, estimate }: { token: string; estimate: Estimate }) {
  const [decisions, setDecisions] = useState<Record<string, "approved" | "declined">>({})
  const [signer, setSigner] = useState("")
  const [signature, setSignature] = useState("")
  const [done, setDone] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const awaiting = estimate.status === "sent" || estimate.status === "partially_approved"
  const lineTotal = (i: Estimate["items"][number]) => Math.round(i.quantity * i.unitPrice - i.discountAmount)

  function decide(id: string, d: "approved" | "declined") {
    setDecisions((prev) => {
      const next = { ...prev }
      if (prev[id] === d) delete next[id]
      else next[id] = d
      return next
    })
  }

  function submit() {
    setErr(null)
    const list = Object.entries(decisions).map(([itemId, decision]) => ({ itemId, decision }))
    if (list.length === 0) { setErr("Approve or decline at least one item"); return }
    if (signer.trim().length < 2) { setErr("Please type your full name to sign"); return }
    if (!signature.trim()) { setErr("Please draw or type your signature"); return }
    startTransition(async () => {
      const res = await respondToEstimate({
        token,
        decisions: list,
        signerName: signer.trim(),
        signatureDataUrl: signature.trim(),
      })
      if (res.ok) setDone(res.data.status)
      else setErr(res.error.message)
    })
  }

  if (done) {
    return (
      <Card><CardContent className="p-6 text-center">
        <h2 className="font-display text-xl font-bold">Thank you!</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your response was recorded — the garage will be in touch{estimate.depositRequired > 0 ? `. A deposit of ${ghs(estimate.depositRequired)} is payable at the garage or on collection.` : "."}
        </p>
        <div className="mt-4"><StatusPill status={done} /></div>
      </CardContent></Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="divide-y p-0">
          {estimate.items.map((i) => {
            const d = decisions[i.id]
            return (
              <div key={i.id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{i.description}</p>
                  <p className="text-xs text-muted-foreground">{i.type} ×{i.quantity}</p>
                </div>
                <span className="text-sm font-bold">{ghs(lineTotal(i))}</span>
                {awaiting ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => decide(i.id, "approved")}
                      className={`min-h-[44px] rounded-lg px-3 text-sm font-semibold ${d === "approved" ? "bg-emerald-600 text-white" : "bg-muted"}`}
                    >Approve</button>
                    <button
                      onClick={() => decide(i.id, "declined")}
                      className={`min-h-[44px] rounded-lg px-3 text-sm font-semibold ${d === "declined" ? "bg-red-600 text-white" : "bg-muted"}`}
                    >Decline</button>
                  </div>
                ) : (
                  <StatusPill status={i.approvalStatus ?? "pending"} />
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card><CardContent className="space-y-1 p-4 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{ghs(estimate.subtotal)}</span></div>
        {estimate.discountTotal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>−{ghs(estimate.discountTotal)}</span></div>}
        {estimate.taxTotal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{ghs(estimate.taxTotal)}</span></div>}
        <div className="flex justify-between border-t pt-2 text-base font-bold"><span>Total</span><span>{ghs(estimate.total)}</span></div>
        {estimate.depositRequired > 0 && (
          <p className="pt-1 text-xs text-muted-foreground">Deposit required: {ghs(estimate.depositRequired)} — payable at the garage (online payment coming soon).</p>
        )}
      </CardContent></Card>

      {awaiting && (
        <Card><CardContent className="space-y-3 p-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Full name (signature)</label>
            <input
              value={signer}
              onChange={(e) => setSigner(e.target.value)}
              placeholder="e.g. Kwame Mensah"
              className="mt-1 min-h-[48px] w-full rounded-lg border bg-background px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Signature</label>
            <canvas
              width={600}
              height={160}
              className="mt-1 w-full rounded-lg border bg-white"
              onPointerDown={(e) => {
                const c = e.currentTarget
                const ctx = c.getContext("2d")
                if (!ctx) return
                ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.lineCap = "round"
                const rect = c.getBoundingClientRect()
                const x = ((e.clientX - rect.left) / rect.width) * c.width
                const y = ((e.clientY - rect.top) / rect.height) * c.height
                ctx.beginPath(); ctx.moveTo(x, y)
                const move = (ev: PointerEvent) => {
                  const xx = ((ev.clientX - rect.left) / rect.width) * c.width
                  const yy = ((ev.clientY - rect.top) / rect.height) * c.height
                  ctx.lineTo(xx, yy); ctx.stroke()
                }
                const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); setSignature(c.toDataURL("image/png")) }
                window.addEventListener("pointermove", move); window.addEventListener("pointerup", up)
              }}
            />
            <button type="button" onClick={(e) => { const c = (e.currentTarget.previousSibling as HTMLCanvasElement); c.getContext("2d")?.clearRect(0, 0, c.width, c.height); setSignature("") }} className="mt-1 text-xs text-muted-foreground underline">Clear</button>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button onClick={submit} disabled={pending} className="min-h-[48px] w-full">
            {pending ? "Submitting…" : "Submit approval"}
          </Button>
        </CardContent></Card>
      )}
    </div>
  )
}
