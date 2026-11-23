"use client"

import { useState, useTransition } from "react"
import { CalendarClock, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { applyPayLater, getPayLater, type PayLaterView } from "@/lib/financing/actions"

const ghs = (p: number) => `GH₵${(p / 100).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** P8-14: "Fix now, pay later" on the estimate approval and invoice pages. */
export function PayLaterCard({ token, initial }: { token: string; initial: PayLaterView }) {
  const [view, setView] = useState(initial)
  const [open, setOpen] = useState(false)
  const [months, setMonths] = useState(3)
  const [fullName, setFullName] = useState("")
  const [card, setCard] = useState("")
  const [consent, setConsent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const app = view.application
  const opt = view.options.find((o) => o.months === months)

  const submit = () => {
    setErr(null)
    start(async () => {
      const r = await applyPayLater({ token, months, fullName, ghanaCard: card, consent })
      if (!r.ok) { setErr(r.error); return }
      const fresh = await getPayLater({ token })
      if (fresh) setView(fresh)
      setOpen(false)
    })
  }

  if (app && app.status !== "declined" && app.status !== "cancelled") {
    const paidOut = app.status === "disbursed" || app.status === "completed"
    return (
      <Card className="mt-4">
        <CardContent className="p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="size-4 text-emerald-600" />
            {app.status === "pending" ? "Pay-later application sent — waiting for the lender" : paidOut ? "Paid by your pay-later plan" : "Pay later approved"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {app.monthlyPayment != null
              ? `${ghs(app.monthlyPayment)} a month for ${app.months} months (${ghs(app.totalRepayable ?? 0)} in total). Ref ${app.reference}.`
              : `Ref ${app.reference}. We'll text you when the lender decides.`}
          </p>
          {app.status === "approved" && view.kind === "estimate" && (
            <p className="mt-1 text-xs text-muted-foreground">The lender pays the garage when your invoice is ready — you won&apos;t need to pay at collection (except anything above the approved amount).</p>
          )}
          {paidOut && <p className="mt-1 text-xs text-muted-foreground">See your repayments in the FixAm app under &ldquo;Pay later&rdquo;.</p>}
        </CardContent>
      </Card>
    )
  }

  if (!view.options.length) return null

  return (
    <Card className="mt-4">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Fix now, pay later</p>
            <p className="text-sm text-muted-foreground">
              Spread {ghs(view.amount)} over 1–6 months. A partner lender pays the garage now; you repay monthly by MoMo.
            </p>
            {app?.status === "declined" && <p className="mt-1 text-xs text-red-700">Your last application wasn&apos;t approved: {app.declineReason}</p>}
            {!view.canApply && view.why && <p className="mt-1 text-xs text-muted-foreground">{view.why}</p>}
          </div>
        </div>

        {view.canApply && !open && (
          <Button className="mt-3" variant="secondary" onClick={() => setOpen(true)}>See monthly options</Button>
        )}

        {view.canApply && open && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {view.options.map((o) => (
                <button key={o.months} type="button" onClick={() => setMonths(o.months)}
                  className={`rounded-xl border p-2 text-center ${months === o.months ? "border-primary bg-primary-subtle" : "border-border"}`}>
                  <span className="block text-xs text-muted-foreground">{o.months} {o.months === 1 ? "month" : "months"}</span>
                  <span className="block text-sm font-semibold tabular-nums">{ghs(o.monthly)}</span>
                </button>
              ))}
            </div>
            {opt && (
              <p className="text-xs text-muted-foreground">
                {ghs(opt.monthly)} a month · {ghs(opt.total)} in total ({ghs(opt.total - view.amount)} lender charge) · {view.rateLabel}. The lender makes the final decision and may offer fewer months.
              </p>
            )}
            <label className="block text-sm">
              Full name (as on your Ghana Card)
              <input className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
            </label>
            <label className="block text-sm">
              Ghana Card number
              <input className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm uppercase" placeholder="GHA-123456789-0" value={card} onChange={(e) => setCard(e.target.value)} />
              <span className="mt-0.5 block text-xs text-muted-foreground">Sent to the lender for the credit check only. FixAm doesn&apos;t keep it.</span>
            </label>
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>I agree to share my name, phone number, Ghana Card number and this bill with FixAm&apos;s lending partner so they can decide, and to repay them as scheduled.</span>
            </label>
            {err && <p className="text-sm text-red-700">{err}</p>}
            <div className="flex gap-2">
              <Button disabled={pending || !consent || !fullName.trim() || !card.trim()} onClick={submit}>{pending ? "Asking the lender…" : `Apply — ${months} ${months === 1 ? "month" : "months"}`}</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
