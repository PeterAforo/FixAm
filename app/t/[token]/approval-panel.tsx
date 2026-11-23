"use client"

import { useMemo, useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { Check, X } from "lucide-react"
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
  items: {
    id: string; type: string; description: string; quantity: number; unitPrice: number; discountAmount: number
    approvalStatus: string | null; severity?: string | null; supplyMode?: string
    buyOption?: { productId: string; vendorName: string; name: string; price: number; deliveryFee: number; total: number; etaHours: number | null } | null
  }[]
  fittingFee?: number
}

/** Spec estimate_approval: urgent pre-selected, severity chips, sticky summary. */
export function ApprovalPanel({ token, estimate }: { token: string; estimate: Estimate }) {
  const [decisions, setDecisions] = useState<Record<string, "approved" | "declined">>(() => {
    // Pre-select urgent items per spec.
    const init: Record<string, "approved" | "declined"> = {}
    for (const i of estimate.items) {
      if ((i.severity ?? "").toLowerCase() === "urgent") init[i.id] = "approved"
    }
    return init
  })
  const [supply, setSupply] = useState<Record<string, "garage" | "customer">>({})
  const [signer, setSigner] = useState("")
  const [signature, setSignature] = useState("")
  const [done, setDone] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const awaiting = estimate.status === "sent" || estimate.status === "partially_approved"
  const lineTotal = (i: Estimate["items"][number]) => Math.round(i.quantity * i.unitPrice - i.discountAmount)

  const buying = (i: Estimate["items"][number]) => decisions[i.id] === "approved" && supply[i.id] === "customer" && Boolean(i.buyOption)
  const approvedTotal = useMemo(
    () => estimate.items.filter((i) => decisions[i.id] === "approved" && !buying(i)).reduce((s, i) => s + lineTotal(i), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [decisions, supply, estimate.items]
  )
  const buyNowTotal = useMemo(() => {
    const picked = estimate.items.filter(buying)
    if (picked.length === 0) return 0
    return picked.reduce((s, i) => s + (i.buyOption?.total ?? 0) * Math.max(1, Math.round(i.quantity)), 0) + (estimate.fittingFee ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisions, supply, estimate.items, estimate.fittingFee])

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
    const list = Object.entries(decisions).map(([itemId, decision]) => ({
      itemId,
      decision,
      supply: decision === "approved" && supply[itemId] === "customer" ? ("customer" as const) : undefined,
    }))
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
      if (!res.ok) return setErr(res.error.message)
      if (res.data.checkoutUrl) {
        window.location.href = res.data.checkoutUrl
        return
      }
      setDone(res.data.status)
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

  const SEVERITY_CHIP: Record<string, string> = {
    urgent: "bg-danger-subtle text-danger",
    recommended: "bg-warning-subtle text-foreground",
    optional: "bg-muted text-muted-foreground",
    informational: "bg-info-subtle text-foreground",
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Findings as cards with severity chips */}
      <div className="space-y-3">
        {estimate.items.map((i) => {
          const d = decisions[i.id]
          const sev = (i.severity ?? "").toLowerCase()
          return (
            <Card key={i.id} variant="interactive">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{i.description}</p>
                      {sev && sev !== "informational" && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${SEVERITY_CHIP[sev] ?? SEVERITY_CHIP.optional}`}>
                          {sev === "optional" ? "can wait" : sev}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{i.type} ×{i.quantity}</p>
                  </div>
                  <span className="text-sm font-bold tabular-nums">{ghs(lineTotal(i))}</span>
                </div>
                {awaiting ? (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => decide(i.id, "approved")}
                      aria-pressed={d === "approved"}
                      className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors ${
                        d === "approved" ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Check className="size-4" /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(i.id, "declined")}
                      aria-pressed={d === "declined"}
                      className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors ${
                        d === "declined" ? "bg-danger text-danger-foreground" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <X className="size-4" /> Decline
                    </button>
                  </div>
                ) : (
                  <div className="mt-3"><StatusPill status={i.approvalStatus ?? "pending"} /></div>
                )}
                {awaiting && d === "approved" && i.buyOption && (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-left">
                    <button type="button" onClick={() => setSupply((p) => ({ ...p, [i.id]: "garage" }))} aria-pressed={supply[i.id] !== "customer"}
                      className={`rounded-xl border px-3 py-2 text-xs ${supply[i.id] !== "customer" ? "border-foreground bg-card font-semibold" : "border-border text-muted-foreground"}`}>
                      Garage supplies it<br /><span className="tabular-nums">{ghs(lineTotal(i))}</span>
                    </button>
                    <button type="button" onClick={() => setSupply((p) => ({ ...p, [i.id]: "customer" }))} aria-pressed={supply[i.id] === "customer"}
                      className={`rounded-xl border px-3 py-2 text-xs ${supply[i.id] === "customer" ? "border-foreground bg-card font-semibold" : "border-border text-muted-foreground"}`}>
                      I&apos;ll buy it on FixAm<br /><span className="tabular-nums">{ghs(i.buyOption.total * Math.max(1, Math.round(i.quantity)))}</span>
                      <span className="block text-[10px] font-normal text-muted-foreground">{i.buyOption.vendorName}{i.buyOption.etaHours ? ` · ~${i.buyOption.etaHours} h` : ""} · delivered to the garage</span>
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Sticky summary + sign */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto max-w-lg">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Approved total</span>
            <span className="font-display text-lg font-bold tabular-nums">{ghs(approvedTotal)}</span>
          </div>
          {buyNowTotal > 0 && (
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Parts you&apos;re buying on FixAm (pay now{estimate.fittingFee ? `, incl. ${ghs(estimate.fittingFee)} fitting` : ""})</span>
              <span className="font-semibold tabular-nums text-foreground">{ghs(buyNowTotal)}</span>
            </div>
          )}
          {awaiting ? (
            <details className="mb-2 rounded-xl border border-border bg-surface-sunken p-3">
              <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-muted-foreground">Sign to approve</summary>
              <div className="mt-3 space-y-3">
                <input
                  value={signer}
                  onChange={(e) => setSigner(e.target.value)}
                  placeholder="Full name (signature)"
                  aria-label="Full name"
                  className="min-h-11 w-full rounded-lg border-2 border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <canvas
                  width={600}
                  height={140}
                  className="w-full rounded-lg border border-border bg-white"
                  aria-label="Signature pad"
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
                <button type="button" onClick={(e) => { const c = (e.currentTarget.previousSibling as HTMLCanvasElement); c.getContext("2d")?.clearRect(0, 0, c.width, c.height); setSignature("") }} className="text-xs text-muted-foreground underline">Clear signature</button>
              </div>
            </details>
          ) : null}
          {err && <p className="mb-2 text-sm font-semibold text-danger">{err}</p>}
          {awaiting ? (
            <Button onClick={submit} loading={pending} size="lg" className="w-full">
              {buyNowTotal > 0 ? `Sign & pay ${ghs(buyNowTotal)} for parts` : <>Sign &amp; approve {ghs(approvedTotal)}</>}
            </Button>
          ) : (
            <div className="space-y-1 rounded-xl bg-surface-sunken p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{ghs(estimate.subtotal)}</span></div>
              {estimate.discountTotal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>−{ghs(estimate.discountTotal)}</span></div>}
              {estimate.taxTotal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{ghs(estimate.taxTotal)}</span></div>}
              <div className="flex justify-between border-t border-border pt-1 font-bold"><span>Total</span><span>{ghs(estimate.total)}</span></div>
              {estimate.depositRequired > 0 && (
                <p className="pt-1 text-xs text-muted-foreground">Deposit required: {ghs(estimate.depositRequired)} — payable at the garage.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
