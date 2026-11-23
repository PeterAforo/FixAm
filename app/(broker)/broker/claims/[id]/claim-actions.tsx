"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { brokerClaimAction } from "@/lib/claims/actions"

const inputCls =
  "min-h-11 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"

export function BrokerClaimActions({ claimId, status }: { claimId: string; status: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")

  const acts = ([
    { key: "assess", label: "Start assessing", show: status === "submitted" },
    { key: "approve", label: "Approve", show: ["assessing", "approved", "partially_approved"].includes(status), primary: true },
    { key: "partially_approve", label: "Partially approve", show: status === "assessing" },
    { key: "reject", label: "Reject", show: !["rejected", "settled", "repair_authorised"].includes(status) },
    { key: "settle", label: "Mark settled", show: status === "repair_authorised" },
  ] as const).filter((a) => a.show)

  function run(action: "assess" | "approve" | "partially_approve" | "reject" | "settle") {
    setError(null)
    const needsAmount = action === "approve" || action === "partially_approve"
    if (needsAmount && !amount) { setError("Enter the approved amount in GH₵"); return }
    startTransition(async () => {
      const res = await brokerClaimAction({ claimId, action, approvedAmount: needsAmount ? Number(amount) : undefined, note: note || undefined })
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  if (!acts.length && status !== "settled") return null

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h2 className="font-display text-lg font-semibold">Update claim</h2>
        <div>
          <label className={labelCls} htmlFor="approvedAmount">Approved amount (GH₵)</label>
          <input id="approvedAmount" type="number" min="0" step="0.01" inputMode="decimal" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="What the insurer will pay" />
          <p className="mt-1 text-xs text-muted-foreground">Partially approved = insurer covers this; the driver pays the rest at the garage.</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="claimNote">Note to driver &amp; garage</label>
          <input id="claimNote" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. assessor booked for Thursday" />
        </div>
        {acts.map((a) => (
          <Button key={a.key} variant={"primary" in a && a.primary ? "primary" : "secondary"} className="w-full" loading={pending} onClick={() => run(a.key)}>
            {pending && <Loader2 className="animate-spin" />} {a.label}
          </Button>
        ))}
        {status === "settled" && <p className="rounded-xl bg-success-subtle px-4 py-3 text-sm font-medium text-success">Claim settled.</p>}
        {error && <p className="rounded-xl border border-danger/30 bg-danger-subtle px-4 py-3 text-sm font-medium text-danger">{error}</p>}
      </CardContent>
    </Card>
  )
}
