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

const inputCls = "min-h-10 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function InvoiceDetailPanel(props: {
  garageSlug: string
  garageId: string
  canIssue: boolean
  canVoid: boolean
  canCredit: boolean
  canRecordPayment: boolean
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
          <h1 className="mt-1 text-2xl font-bold">{inv.number ?? "Draft invoice"}</h1>
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
        <div className="rounded-xl border-2 border-success/40 bg-success/10 p-4 text-sm">
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
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
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <dl className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{formatGHS(inv.subtotal)}</dd></div>
            {inv.discountTotal > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd className="tabular-nums">−{formatGHS(inv.discountTotal)}</dd></div>}
            {inv.taxTotal > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Tax</dt><dd className="tabular-nums">{formatGHS(inv.taxTotal)}</dd></div>}
            <div className="flex justify-between border-t pt-1 font-bold"><dt>Total</dt><dd className="tabular-nums">{formatGHS(inv.total)}</dd></div>
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
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-bold">Void {inv.number ?? "invoice"}</h2>
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

      {payOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-bold">Record payment</h2>
            <p className="mt-1 text-sm text-muted-foreground">Balance due: {formatGHS(inv.balanceDue)}</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {["cash", "momo", "card", "bank_transfer", "cheque", "other"].map((m) => (
                <button
                  key={m}
                  onClick={() => setPay({ ...pay, method: m })}
                  className={`rounded-lg border-2 px-2 py-2 text-xs font-bold capitalize ${pay.method === m ? "border-primary bg-primary/10" : "border-border"}`}
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
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-bold">Credit note</h2>
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
