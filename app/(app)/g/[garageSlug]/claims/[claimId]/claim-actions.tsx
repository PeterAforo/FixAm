"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { garageAuthoriseRepair, garageSetClaimEstimate } from "@/lib/claims/actions"
import { formatGHS } from "@/lib/money"

const inputCls =
  "min-h-11 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"

export function GarageClaimActions({
  garageId,
  claimId,
  status,
  estimateAmount,
  approvedAmount,
  jobId,
  jobs,
}: {
  garageId: string
  claimId: string
  status: string
  estimateAmount: number | null
  approvedAmount: number | null
  jobId: string | null
  jobs: { id: string; label: string }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [amount, setAmount] = useState(estimateAmount != null ? String(estimateAmount / 100) : "")
  const [selJob, setSelJob] = useState(jobId ?? "")
  const closed = ["rejected", "settled", "repair_authorised"].includes(status)
  const canEstimate = ["submitted", "assessing", "approved", "partially_approved"].includes(status)
  const canAuthorise = ["approved", "partially_approved"].includes(status)

  function saveEstimate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await garageSetClaimEstimate({
        garageId,
        claimId,
        jobId: selJob || undefined,
        amountGhs: amount ? Number(amount) : undefined,
      })
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  function authorise() {
    setError(null)
    startTransition(async () => {
      const res = await garageAuthoriseRepair({ garageId, claimId })
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div>
          <h2 className="font-display text-lg font-semibold">Amounts</h2>
          {estimateAmount != null && <p className="mt-1 text-sm">Your estimate: <strong>{formatGHS(BigInt(estimateAmount))}</strong></p>}
          {approvedAmount != null && <p className="text-sm">Insurer approved: <strong>{formatGHS(BigInt(approvedAmount))}</strong>{status === "partially_approved" ? " — the rest is customer-pay" : ""}</p>}
        </div>

        {!closed && (
          <form onSubmit={saveEstimate} className="space-y-3">
            <div>
              <label className={labelCls} htmlFor="claimAmount">Repair estimate (GH₵)</label>
              <input id="claimAmount" type="number" min="0" step="0.01" inputMode="decimal" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={!canEstimate} />
            </div>
            <div>
              <label className={labelCls} htmlFor="claimJob">Link a job</label>
              <select id="claimJob" className={inputCls} value={selJob} onChange={(e) => setSelJob(e.target.value)} disabled={!canEstimate}>
                <option value="">— not linked —</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
              </select>
            </div>
            {canEstimate && (
              <Button type="submit" variant="secondary" loading={pending} className="w-full">Save estimate</Button>
            )}
          </form>
        )}

        {canAuthorise && (
          <Button onClick={authorise} loading={pending} className="w-full">
            {pending && <Loader2 className="animate-spin" />} Authorise repair
          </Button>
        )}
        {status === "repair_authorised" && (
          <p className="rounded-xl bg-success-subtle px-4 py-3 text-sm font-medium text-success">Repair authorised — the linked job and estimate are approved.</p>
        )}
        {error && <p className="rounded-xl border border-danger/30 bg-danger-subtle px-4 py-3 text-sm font-medium text-danger">{error}</p>}
      </CardContent>
    </Card>
  )
}
