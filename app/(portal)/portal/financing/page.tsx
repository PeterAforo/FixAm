import { Suspense } from "react"
import { connection } from "next/server"
import { listMyFinancing } from "@/lib/financing/actions"
import { Card, CardContent } from "@/components/brand/card"

const ghs = (p: number) => `GH₵${(p / 100).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

const STATUS: Record<string, string> = {
  pending: "Waiting for the lender", approved: "Approved — paid when your invoice is ready", disbursing: "Paying the garage",
  disbursed: "Repaying", completed: "Fully repaid", declined: "Not approved", cancelled: "Cancelled",
}

async function Plans() {
  await connection()
  const plans = await listMyFinancing()
  if (!plans.length) {
    return (
      <p className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No pay-later plans yet. When a garage sends you an estimate or invoice, you can choose to spread the cost over 1–6 months.
      </p>
    )
  }
  return (
    <ul className="mt-6 space-y-4">
      {plans.map((p) => {
        const next = p.repayments.find((r) => r.status !== "paid")
        const paid = p.repayments.reduce((s, r) => s + Math.min(r.paidAmount, r.amount), 0)
        return (
          <li key={p.id}>
            <Card>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{p.garageName}</p>
                    <p className="text-xs text-muted-foreground">Ref {p.reference} · {ghs(p.amount)} over {p.months} {p.months === 1 ? "month" : "months"}{p.rateLabel ? ` · ${p.rateLabel}` : ""}</p>
                  </div>
                  <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold">{STATUS[p.status] ?? p.status}</span>
                </div>
                {p.declineReason && <p className="mt-2 text-sm text-muted-foreground">{p.declineReason}</p>}
                {p.repayments.length > 0 && (
                  <>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted">
                      <div className="h-full bg-primary" style={{ width: `${p.totalRepayable ? Math.min(100, (paid / p.totalRepayable) * 100) : 0}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{ghs(paid)} of {ghs(p.totalRepayable ?? 0)} repaid</p>
                    <ul className="mt-3 divide-y divide-border text-sm">
                      {p.repayments.map((r) => (
                        <li key={r.sequence} className="flex items-center justify-between gap-2 py-2">
                          <span>{day(r.dueDate)}</span>
                          <span className="tabular-nums">{ghs(r.amount)}</span>
                          <span className={`text-xs font-semibold ${r.status === "paid" ? "text-emerald-700" : r.status === "overdue" ? "text-red-700" : "text-muted-foreground"}`}>
                            {r.status === "paid" ? "Paid" : r.status === "overdue" ? "Overdue" : "Upcoming"}
                          </span>
                          {r.payUrl && r === next ? (
                            <a href={r.payUrl} className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Pay</a>
                          ) : <span className="w-10" />}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}

export default function FinancingPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em]">Pay later</h1>
      <p className="mt-1 text-sm text-muted-foreground">Repairs you&apos;re paying for monthly. We&apos;ll text you before each repayment is due.</p>
      <Suspense fallback={<div className="mt-6 h-48 animate-pulse rounded-2xl bg-muted" />}>
        <Plans />
      </Suspense>
    </div>
  )
}
