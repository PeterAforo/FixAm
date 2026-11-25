"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { useConfetti } from "@/components/brand/confetti"
import { formatGHS } from "@/lib/money"
import { createCreditNote, issueInvoice, voidInvoice } from "@/lib/money/actions"
import { recordPayment } from "@/lib/money/payments"
import { createPaymentPlan, previewPaymentPlan, payInstalment, rotateInstalmentLink, cancelPaymentPlan } from "@/lib/money/instalments"

type Invoice = {
  id: string; number: string | null; status: string; source: string; sourceId: string | null
  issueDate: string | null; dueDate: string | null
  subtotal: number; discountTotal: number; taxTotal: number
  total: number; amountPaid: number; balanceDue: number; depositApplied: number
  notes: string | null; voidReason: string | null
  issuedAt: string | null; createdAt: string
}
type Line = {
  id: string; type: string; description: string
  quantity: number; unitPrice: number; discountAmount: number; lineTotal: number
  taxes: { code: string; rate_bp: number; amount: number }[]
}

const inputCls = "min-h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"
const todayISO = () => new Date().toISOString().slice(0, 10)

export function InvoiceDetailPanel(props: {
  garageSlug: string
  garageId: string
  canIssue: boolean
  canVoid: boolean
  canCredit: boolean
  canRecordPayment: boolean
  canPlan: boolean
  plan: {
    id: string; status: string; frequency: string; startDate: string
    totalAmount: number; downPayment: number; lateFeeRule: unknown
  } | null
  instalmentList: {
    id: string; sequence: number; dueDate: string
    amount: number; amountPaid: number; lateFee: number; status: string
  }[]
  invoice: Invoice
  customer: { fullName: string; phone: string | null } | null
  vehicle: { plateNumber: string; make: string | null; model: string | null } | null
  branchName: string | null
  issuerName: string | null
  lines: Line[]
}) {
  const p = props
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [payLink, setPayLink] = useState<string | null>(null)
  const [voidOpen, setVoidOpen] = useState(false)
  const [voidReason, setVoidReason] = useState("")
  const [creditOpen, setCreditOpen] = useState(false)
  const [credit, setCredit] = useState({ amount: "", reason: "" })
  const [payOpen, setPayOpen] = useState(false)
  const [pay, setPay] = useState({ method: "cash" as string, amount: "", momoNetwork: "mtn", payerPhone: "" })
  const [planOpen, setPlanOpen] = useState(false)
  const [planForm, setPlanForm] = useState({ count: "3", frequency: "monthly", startDate: todayISO(), downPayment: "0", lateFeePct: "", lateFeeDays: "7" })
  const [planPreview, setPlanPreview] = useState<{ sequence: number; dueDate: string; amount: number }[] | null>(null)
  const [planLinks, setPlanLinks] = useState<{ instalmentId: string; sequence: number; url: string }[]>([])
  const [instPayId, setInstPayId] = useState<string | null>(null)
  const [instPayMsg, setInstPayMsg] = useState<string | null>(null)
  const confetti = useConfetti()

  const inv = p.invoice
  const wasPaid = useRef(false)
  useEffect(() => {
    if (inv.status === "paid" && !wasPaid.current) {
      wasPaid.current = true
      confetti()
    }
  }, [inv.status, confetti])
  const isDraft = inv.status === "draft"
  const isLive = ["issued", "partially_paid", "paid"].includes(inv.status)

  function issue() {
    startTransition(async () => {
      const res = await issueInvoice({ garageId: p.garageId, invoiceId: inv.id, dueDays: 14 })
      if (!res.ok) { setMsg(res.error.message); return }
      setPayLink(`${window.location.origin}/t/${res.data.payToken}`)
      router.refresh()
    })
  }

  function confirmVoid() {
    startTransition(async () => {
      const res = await voidInvoice({ garageId: p.garageId, invoiceId: inv.id, reason: voidReason })
      if (!res.ok) { setMsg(res.error.message); return }
      setVoidOpen(false); router.refresh()
    })
  }

  function submitPayment() {
    const amount = Math.round(parseFloat(pay.amount || "0") * 100)
    if (!amount || amount <= 0) { setMsg("Enter an amount"); return }
    startTransition(async () => {
      const res = await recordPayment({
        garageId: p.garageId,
        invoiceId: inv.id,
        method: pay.method,
        amount,
        momoNetwork: pay.method === "momo" ? pay.momoNetwork : undefined,
        payerPhone: pay.method === "momo" ? pay.payerPhone || undefined : undefined,
      })
      if (!res.ok) { setMsg(res.error.message); return }
      setPayOpen(false); setMsg(null)
      router.refresh()
    })
  }

  function planPayload() {
    const down = Math.round(parseFloat(planForm.downPayment || "0") * 100)
    const lateFeeRule = planForm.lateFeePct
      ? { kind: "percent" as const, rate_bp: Math.round(parseFloat(planForm.lateFeePct) * 100), after_days: parseInt(planForm.lateFeeDays || "7", 10) }
      : null
    return {
      totalAmount: inv.balanceDue,
      downPayment: down,
      instalmentCount: parseInt(planForm.count, 10) || 1,
      frequency: planForm.frequency as "weekly" | "fortnightly" | "monthly" | "custom",
      startDate: planForm.startDate,
      lateFeeRule,
    }
  }

  function preview() {
    startTransition(async () => {
      const res = await previewPaymentPlan(planPayload())
      if (res.ok) setPlanPreview(res.data)
      else setMsg("Could not preview schedule")
    })
  }

  function submitPlan() {
    startTransition(async () => {
      const res = await createPaymentPlan({ garageId: p.garageId, invoiceId: inv.id, ...planPayload() })
      if (!res.ok) { setMsg(res.error.message); return }
      setPlanLinks(res.data.links)
      setPlanOpen(false); setPlanPreview(null); setMsg(null)
      router.refresh()
    })
  }

  function payInst(id: string) {
    setInstPayId(id); setInstPayMsg(null)
    startTransition(async () => {
      const res = await payInstalment({ garageId: p.garageId, instalmentId: id, method: "cash" })
      if (!res.ok) { setInstPayMsg(res.error.message); return }
      setInstPayId(null); router.refresh()
    })
  }

  function linkFor(id: string) {
    startTransition(async () => {
      const res = await rotateInstalmentLink({ garageId: p.garageId, instalmentId: id })
      if (res.ok) {
        await navigator.clipboard.writeText(res.data.url)
        setInstPayMsg("Pay link copied to clipboard")
      } else setInstPayMsg(res.error.message)
    })
  }

  function cancelPlan() {
    if (!p.plan) return
    startTransition(async () => {
      const res = await cancelPaymentPlan({ garageId: p.garageId, planId: p.plan!.id })
      if (!res.ok) { setMsg(res.error.message); return }
      router.refresh()
    })
  }

  function confirmCredit() {
    const amount = Math.round(parseFloat(credit.amount) * 100)
    if (!amount || !credit.reason.trim()) { setMsg("Enter an amount and reason"); return }
    startTransition(async () => {
      const res = await createCreditNote({ garageId: p.garageId, invoiceId: inv.id, amountPesewas: amount, reason: credit.reason.trim() })
      if (!res.ok) { setMsg(res.error.message); return }
      setCreditOpen(false); setCredit({ amount: "", reason: "" }); router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/g/${p.garageSlug}/invoices`} className="text-sm text-muted-foreground hover:underline">← Invoices</Link>
          <h1 className="mt-1 font-display text-[30px] font-semibold tracking-[-0.025em]">{inv.number ?? "Draft invoice"}</h1>
          <p className="text-sm text-muted-foreground">
            {p.customer?.fullName ?? "No customer"}
            {p.vehicle ? ` · ${p.vehicle.plateNumber} ${p.vehicle.make ?? ""} ${p.vehicle.model ?? ""}`.trim() : ""}
            {p.branchName ? ` · ${p.branchName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={inv.status} tone={inv.status === "paid" ? "ok" : inv.status === "void" ? "danger" : inv.status === "draft" ? "neutral" : "info"} />
          {isDraft && p.canIssue && <Button disabled={pending} onClick={issue}>Issue invoice</Button>}
          {isLive && p.canRecordPayment && inv.balanceDue > 0 && (
            <Button onClick={() => { setPay({ method: "cash", amount: (inv.balanceDue / 100).toFixed(2), momoNetwork: "mtn", payerPhone: "" }); setPayOpen(true) }}>
              Record payment
            </Button>
          )}
          {isLive && p.canPlan && !p.plan && inv.balanceDue > 0 && (
            <Button variant="secondary" onClick={() => { setPlanForm({ count: "3", frequency: "monthly", startDate: todayISO(), downPayment: "0", lateFeePct: "", lateFeeDays: "7" }); setPlanPreview(null); setPlanOpen(true) }}>
              Payment plan
            </Button>
          )}
          {isLive && p.canCredit && inv.balanceDue > 0 && (
            <Button variant="secondary" onClick={() => setCreditOpen(true)}>Credit note</Button>
          )}
          {isLive && p.canVoid && inv.amountPaid === 0 && (
            <Button variant="ghost" onClick={() => setVoidOpen(true)}>Void</Button>
          )}
          {isLive && (
            <>
              <a href={`/print/invoices/${inv.id}`} target="_blank" rel="noreferrer">
                <Button variant="secondary">Print A4</Button>
              </a>
              <a href={`/print/invoices/${inv.id}?format=thermal`} target="_blank" rel="noreferrer">
                <Button variant="secondary">Print 80mm</Button>
              </a>
            </>
          )}
        </div>
      </div>

      {msg && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}
      {payLink && (
        <div className="rounded-xl border border-success/40 bg-success/10 p-4 text-sm">
          <p className="font-semibold">Invoice issued.</p>
          <p className="mt-1 break-all text-muted-foreground">Customer pay link: {payLink}</p>
          <Button variant="secondary" className="mt-2" onClick={() => navigator.clipboard.writeText(payLink)}>Copy link</Button>
        </div>
      )}
      {inv.status === "void" && inv.voidReason && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">Voided: {inv.voidReason}</p>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto"><table className="table-cards w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-border bg-surface-muted/40 text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Unit price</th>
                <th className="px-4 py-3 text-right">Discount</th>
                <th className="px-4 py-3 text-right">Tax</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {p.lines.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="px-4 py-3">{l.description}</td>
                  <td className="px-4 py-3 text-muted-foreground">{l.type}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.quantity}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatGHS(l.unitPrice)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.discountAmount ? formatGHS(l.discountAmount) : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs">
                    {l.taxes.length ? l.taxes.map((t) => `${t.code} ${(t.rate_bp / 100).toFixed(0)}%`).join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatGHS(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <dl className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{formatGHS(inv.subtotal)}</dd></div>
            {inv.discountTotal > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd className="tabular-nums">−{formatGHS(inv.discountTotal)}</dd></div>}
            {inv.taxTotal > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Tax</dt><dd className="tabular-nums">{formatGHS(inv.taxTotal)}</dd></div>}
            <div className="flex justify-between border-t pt-1 font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatGHS(inv.total)}</dd></div>
            {inv.depositApplied > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Deposit applied</dt><dd className="tabular-nums">−{formatGHS(inv.depositApplied)}</dd></div>}
            <div className="flex justify-between"><dt className="text-muted-foreground">Paid</dt><dd className="tabular-nums">{formatGHS(inv.amountPaid)}</dd></div>
            <div className="flex justify-between font-semibold"><dt>Balance due</dt><dd className="tabular-nums">{formatGHS(inv.balanceDue)}</dd></div>
          </dl>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground md:grid-cols-4">
            <div>Issued: {inv.issueDate ?? "—"}</div>
            <div>Due: {inv.dueDate ?? "—"}</div>
            <div>Source: {inv.source}{inv.sourceId && inv.source === "job" ? ` · ${inv.sourceId.slice(0, 8)}` : ""}</div>
            <div>By: {p.issuerName ?? "—"}</div>
          </dl>
          {inv.notes && <p className="mt-3 text-sm text-muted-foreground">Notes: {inv.notes}</p>}
        </CardContent>
      </Card>

      {voidOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-semibold tracking-[-0.01em]">Void {inv.number ?? "invoice"}</h2>
            <input
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Reason (required)"
              className={`mt-4 ${inputCls}`}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setVoidOpen(false)}>Cancel</Button>
              <Button variant="danger" disabled={pending || voidReason.trim().length < 3} onClick={confirmVoid}>Void</Button>
            </div>
          </div>
        </div>
      )}

      {planLinks.length > 0 && (
        <div className="rounded-xl border border-info bg-info/10 p-4 text-sm">
          <p className="font-semibold">Payment plan created — instalment pay links:</p>
          <ul className="mt-2 space-y-1">
            {planLinks.map((l) => (
              <li key={l.instalmentId} className="flex items-center justify-between gap-2">
                <span>#{l.sequence}</span>
                <code className="break-all text-xs text-muted-foreground">{l.url}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {instPayMsg && <p className="rounded-lg bg-info/10 px-3 py-2 text-sm">{instPayMsg}</p>}

      {p.plan && p.instalmentList.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">
                Payment plan · {p.plan.frequency} · {p.plan.status}
              </h2>
              {p.canPlan && p.plan.status === "active" && (
                <Button variant="ghost" onClick={cancelPlan}>Cancel plan</Button>
              )}
            </div>
            <div className="overflow-x-auto"><table className="table-cards mt-3 w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-border bg-surface-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="py-2">#</th>
                  <th className="py-2">Due</th>
                  <th className="py-2 text-right">Amount</th>
                  <th className="py-2 text-right">Paid</th>
                  <th className="py-2">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {p.instalmentList.map((i) => {
                  const outstanding = i.amount + i.lateFee - i.amountPaid
                  const payable = ["upcoming", "due", "overdue"].includes(i.status) && outstanding > 0
                  return (
                    <tr key={i.id} className="border-b last:border-0">
                      <td className="py-2">{i.sequence}</td>
                      <td className="py-2">{i.dueDate}</td>
                      <td className="py-2 text-right tabular-nums">{formatGHS(i.amount)}{i.lateFee > 0 ? ` +${formatGHS(i.lateFee)} fee` : ""}</td>
                      <td className="py-2 text-right tabular-nums">{formatGHS(i.amountPaid)}</td>
                      <td className="py-2"><StatusPill status={i.status} tone={i.status === "paid" ? "ok" : i.status === "overdue" ? "danger" : "neutral"} /></td>
                      <td className="py-2 text-right">
                        {payable && p.canRecordPayment && (
                          <Button size="sm" variant="secondary" disabled={pending || instPayId === i.id} onClick={() => payInst(i.id)}>
                            {instPayId === i.id ? "…" : "Record"}
                          </Button>
                        )}
                        {payable && (
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => linkFor(i.id)}>Pay link</Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          </CardContent>
        </Card>
      )}

      {planOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-semibold tracking-[-0.01em]">Payment plan</h2>
            <p className="mt-1 text-sm text-muted-foreground">Balance: {formatGHS(inv.balanceDue)}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Instalments</span>
                <input value={planForm.count} onChange={(e) => setPlanForm({ ...planForm, count: e.target.value })} inputMode="numeric" className={inputCls} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Frequency</span>
                <select value={planForm.frequency} onChange={(e) => setPlanForm({ ...planForm, frequency: e.target.value })} className={inputCls}>
                  <option value="weekly">Weekly</option>
                  <option value="fortnightly">Fortnightly</option>
                  <option value="monthly">Monthly</option>
                  <option value="custom">Custom days</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">First due</span>
                <input type="date" value={planForm.startDate} onChange={(e) => setPlanForm({ ...planForm, startDate: e.target.value })} className={inputCls} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Down payment (GH₵)</span>
                <input value={planForm.downPayment} onChange={(e) => setPlanForm({ ...planForm, downPayment: e.target.value })} inputMode="decimal" className={inputCls} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Late fee % (optional)</span>
                <input value={planForm.lateFeePct} onChange={(e) => setPlanForm({ ...planForm, lateFeePct: e.target.value })} inputMode="decimal" placeholder="e.g. 5" className={inputCls} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">After (days)</span>
                <input value={planForm.lateFeeDays} onChange={(e) => setPlanForm({ ...planForm, lateFeeDays: e.target.value })} inputMode="numeric" className={inputCls} />
              </label>
            </div>

            {planPreview && (
              <div className="mt-4 rounded-xl border border-border p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Schedule preview</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                  {planPreview.map((s) => (
                    <div key={s.sequence} className="flex justify-between">
                      <span className="text-muted-foreground">#{s.sequence} {s.dueDate}</span>
                      <span className="tabular-nums font-medium">{formatGHS(s.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPlanOpen(false)}>Cancel</Button>
              <Button variant="secondary" disabled={pending} onClick={preview}>Preview</Button>
              <Button disabled={pending || !planPreview} onClick={submitPlan}>Create plan</Button>
            </div>
          </div>
        </div>
      )}

      {payOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-semibold tracking-[-0.01em]">Record payment</h2>
            <p className="mt-1 text-sm text-muted-foreground">Balance due: {formatGHS(inv.balanceDue)}</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {["cash", "momo", "card", "bank_transfer", "cheque", "other"].map((m) => (
                <button
                  key={m}
                  onClick={() => setPay({ ...pay, method: m })}
                  className={`rounded-lg border px-2 py-2 text-xs font-semibold capitalize ${pay.method === m ? "border-primary bg-primary/10" : "border-border"}`}
                >
                  {m.replace("_", " ")}
                </button>
              ))}
            </div>
            <input
              value={pay.amount}
              onChange={(e) => setPay({ ...pay, amount: e.target.value })}
              placeholder="Amount (GH₵)"
              inputMode="decimal"
              className={`mt-3 ${inputCls}`}
            />
            {pay.method === "momo" && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <select
                  value={pay.momoNetwork}
                  onChange={(e) => setPay({ ...pay, momoNetwork: e.target.value })}
                  className={inputCls}
                >
                  <option value="mtn">MTN</option>
                  <option value="telecel">Telecel</option>
                  <option value="airteltigo">AirtelTigo</option>
                </select>
                <input
                  value={pay.payerPhone}
                  onChange={(e) => setPay({ ...pay, payerPhone: e.target.value })}
                  placeholder="Payer phone"
                  inputMode="tel"
                  className={inputCls}
                />
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPayOpen(false)}>Cancel</Button>
              <Button disabled={pending} onClick={submitPayment}>Record</Button>
            </div>
          </div>
        </div>
      )}

      {creditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-semibold tracking-[-0.01em]">Credit note</h2>
            <p className="mt-1 text-sm text-muted-foreground">Balance due: {formatGHS(inv.balanceDue)}</p>
            <input
              value={credit.amount}
              onChange={(e) => setCredit({ ...credit, amount: e.target.value })}
              placeholder="Amount (GH₵)"
              inputMode="decimal"
              className={`mt-4 ${inputCls}`}
            />
            <input
              value={credit.reason}
              onChange={(e) => setCredit({ ...credit, reason: e.target.value })}
              placeholder="Reason (required)"
              className={`mt-3 ${inputCls}`}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreditOpen(false)}>Cancel</Button>
              <Button disabled={pending} onClick={confirmCredit}>Issue credit note</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
