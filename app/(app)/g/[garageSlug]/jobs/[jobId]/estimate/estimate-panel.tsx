"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { approveEstimateOnBehalf, createEstimate, sendEstimate } from "@/lib/estimates/actions"

const ghs = (p: number) => `GH₵ ${(p / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`
const inputCls = "min-h-10 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

type EstimateRow = {
  id: string
  number: string
  version: number
  status: string
  subtotal: number
  discountTotal: number
  taxTotal: number
  total: number
  depositRequired: number
  validUntil: string | null
  sentAt: string | null
}
type Item = {
  id: string
  type: string
  description: string
  quantity: number
  unitPrice: number
  discountAmount: number
  estimateId: string | null
  approvalStatus: string | null
}

export function EstimatePanel(props: {
  garageSlug: string
  garageId: string
  job: { id: string; number: string; status: string }
  estimates: EstimateRow[]
  items: Item[]
  canCreate: boolean
  canSend: boolean
  canBehalf: boolean
}) {
  const { garageSlug, garageId, job, estimates, items, canCreate, canSend, canBehalf } = props
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [depositPct, setDepositPct] = useState("0")
  const [behalf, setBehalf] = useState<{ estimateId: string; approved: Set<string>; declined: Set<string>; reason: string } | null>(null)

  const latest = estimates[0] ?? null

  function create() {
    setMsg(null)
    startTransition(async () => {
      const res = await createEstimate({
        garageId,
        jobId: job.id,
        depositPercent: Number(depositPct) || 0,
      })
      if (res.ok) { setMsg(`Estimate ${res.data.number} v${res.data.version} created`); router.refresh() }
      else setMsg(res.error.message)
    })
  }

  function send(estimateId: string) {
    setMsg(null); setLink(null)
    startTransition(async () => {
      const res = await sendEstimate({ garageId, estimateId })
      if (res.ok) {
        const base = typeof window !== "undefined" ? window.location.origin : ""
        setLink(`${base}/t/${res.data.token}`)
        setMsg(`Sent via ${res.data.channel}`)
        router.refresh()
      } else setMsg(res.error.message)
    })
  }

  function toggleBehalf(id: string, kind: "approved" | "declined") {
    setBehalf((b) => {
      if (!b) return b
      const approved = new Set(b.approved); const declined = new Set(b.declined)
      if (kind === "approved") { if (approved.has(id)) approved.delete(id); else { approved.add(id); declined.delete(id) } }
      else { if (declined.has(id)) declined.delete(id); else { declined.add(id); approved.delete(id) } }
      return { ...b, approved, declined }
    })
  }

  function submitBehalf() {
    if (!behalf) return
    startTransition(async () => {
      const res = await approveEstimateOnBehalf({
        garageId,
        estimateId: behalf.estimateId,
        approvedItemIds: [...behalf.approved],
        declinedItemIds: [...behalf.declined],
        reason: behalf.reason,
      })
      if (res.ok) { setMsg(`Recorded — estimate ${res.data.status}`); setBehalf(null); router.refresh() }
      else setMsg(res.error.message)
    })
  }

  const estimateItems = items.filter((i) => latest && i.estimateId === latest.id)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/g/${garageSlug}/jobs/${job.id}`} className="text-sm text-muted-foreground hover:underline">← {job.number}</Link>
          <h1 className="font-display text-2xl font-bold">Estimate</h1>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-muted-foreground">Deposit %
              <input value={depositPct} onChange={(e) => setDepositPct(e.target.value)} inputMode="decimal" className={`${inputCls} ml-2 w-20`} />
            </label>
            <Button onClick={create} disabled={pending}>{latest ? "Revise estimate" : "Create estimate"}</Button>
          </div>
        )}
      </header>

      {msg && <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">{msg}</p>}
      {link && (
        <Card><CardContent className="flex flex-wrap items-center gap-2 p-3 text-sm">
          <span className="font-semibold">Approval link:</span>
          <code className="break-all text-xs">{link}</code>
          <Button variant="secondary" onClick={() => navigator.clipboard.writeText(link)}>Copy</Button>
        </CardContent></Card>
      )}

      {latest && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base">
            {latest.number} <span className="text-muted-foreground">v{latest.version}</span> <StatusPill status={latest.status} />
          </CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1 text-sm">
              {estimateItems.map((i) => (
                <div key={i.id} className="flex justify-between gap-2">
                  <span className="truncate">{i.description} <span className="text-muted-foreground">×{i.quantity}</span></span>
                  <span className="shrink-0">{ghs(Math.round(i.quantity * i.unitPrice - i.discountAmount))}</span>
                </div>
              ))}
              <div className="border-t pt-2 text-xs text-muted-foreground">
                Subtotal {ghs(latest.subtotal)} · Discount {ghs(latest.discountTotal)} · Tax {ghs(latest.taxTotal)}
                {latest.depositRequired > 0 && <> · Deposit {ghs(latest.depositRequired)}</>}
              </div>
              <p className="text-lg font-bold">Total {ghs(latest.total)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canSend && ["draft", "superseded"].includes(latest.status) && (
                <Button onClick={() => send(latest.id)} disabled={pending}>Send to customer</Button>
              )}
              {canBehalf && ["sent", "partially_approved", "draft"].includes(latest.status) && !behalf && (
                <Button variant="secondary" onClick={() => setBehalf({ estimateId: latest.id, approved: new Set(), declined: new Set(), reason: "" })}>
                  Approve on behalf
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {estimates.length > 1 && (
        <Card><CardContent className="p-3 text-sm">
          <p className="mb-1 font-semibold">Versions</p>
          {estimates.map((e) => (
            <div key={e.id} className="flex justify-between py-1">
              <span>v{e.version} · {ghs(e.total)}</span><StatusPill status={e.status} />
            </div>
          ))}
        </CardContent></Card>
      )}

      {!latest && <p className="text-sm text-muted-foreground">No estimate yet — create one from the job&rsquo;s pending items.</p>}

      {behalf && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Approve on behalf</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {estimateItems.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{i.description}</span>
                <div className="flex gap-1">
                  <Button variant={behalf.approved.has(i.id) ? "primary" : "secondary"} onClick={() => toggleBehalf(i.id, "approved")}>Approve</Button>
                  <Button variant={behalf.declined.has(i.id) ? "primary" : "secondary"} onClick={() => toggleBehalf(i.id, "declined")}>Decline</Button>
                </div>
              </div>
            ))}
            <input
              value={behalf.reason}
              onChange={(e) => setBehalf({ ...behalf, reason: e.target.value })}
              placeholder="Reason (required, e.g. customer approved by phone)"
              className={inputCls}
            />
            <div className="flex gap-2">
              <Button onClick={submitBehalf} disabled={pending || behalf.reason.trim().length < 3}>Record approval</Button>
              <Button variant="secondary" onClick={() => setBehalf(null)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
