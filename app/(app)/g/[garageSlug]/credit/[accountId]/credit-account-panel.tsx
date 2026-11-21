"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { formatGHS } from "@/lib/money"
import { chargeInvoiceToCredit, creditAccountPayment } from "@/lib/money/credit"

type Props = {
  garageSlug: string
  garageId: string
  accountId: string
  canManage: boolean
  canExceed: boolean
  canPay: boolean
  account: {
    id: string; customerId: string; creditLimit: number; balance: number
    paymentTermsDays: number; statementDay: number | null; status: string
  }
  customer: { fullName: string; phone: string | null } | null
  openInvoices: { id: string; number: string | null; status: string; balanceDue: number; dueDate: string | null; issueDate: string | null }[]
  ageing: { current: number; d31_60: number; d61_90: number; d90_plus: number }
  statements: { id: string; periodStart: string; periodEnd: string; closingBalance: number; sentAt: string | null }[]
  chargeable: { id: string; number: string | null; balanceDue: number }[]
}

const inputCls = "min-h-10 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function CreditAccountPanel(p: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [chargeInvoiceId, setChargeInvoiceId] = useState("")
  const [payOpen, setPayOpen] = useState(false)
  const [payAmount, setPayAmount] = useState("")
  const [payMethod, setPayMethod] = useState("cash")
  const [allocations, setAllocations] = useState<Record<string, string>>({})

  const utilisation = p.account.creditLimit > 0 ? Math.min(100, Math.round((p.account.balance / p.account.creditLimit) * 100)) : 0
  const totalAgeing = p.ageing.current + p.ageing.d31_60 + p.ageing.d61_90 + p.ageing.d90_plus

  function charge() {
    if (!chargeInvoiceId) return
    startTransition(async () => {
      const res = await chargeInvoiceToCredit({ garageId: p.garageId, invoiceId: chargeInvoiceId, creditAccountId: p.accountId })
      if (!res.ok) { setMsg(res.error.message); return }
      setChargeInvoiceId(""); setMsg(null); router.refresh()
    })
  }

  function submitPayment() {
    const amount = Math.round(parseFloat(payAmount || "0") * 100)
    const allocs = Object.entries(allocations)
      .filter(([, v]) => parseFloat(v) > 0)
      .map(([invoiceId, v]) => ({ invoiceId, amount: Math.round(parseFloat(v) * 100) }))
    const sum = allocs.reduce((s, a) => s + a.amount, 0)
    if (amount <= 0 || sum !== amount) { setMsg("Allocations must sum to the payment amount"); return }
    startTransition(async () => {
      const res = await creditAccountPayment({
        garageId: p.garageId, creditAccountId: p.accountId, method: payMethod, amount, allocations: allocs,
      })
      if (!res.ok) { setMsg(res.error.message); return }
      setPayOpen(false); setMsg(null); setAllocations({}); router.refresh()
    })
  }

  const BUCKETS: [keyof Props["ageing"], string, string][] = [
    ["current", "Current", "bg-info"],
    ["d31_60", "31–60 days", "bg-warning"],
    ["d61_90", "61–90 days", "bg-orange-500"],
    ["d90_plus", "90+ days", "bg-danger"],
  ]

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/g/${p.garageSlug}/credit`} className="text-sm text-muted-foreground hover:underline">← Credit accounts</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{p.customer?.fullName ?? "Credit account"}</h1>
            <p className="text-sm text-muted-foreground">
              {p.customer?.phone ?? ""} · Terms {p.account.paymentTermsDays} days · Statement day {p.account.statementDay ?? "—"}
            </p>
          </div>
          <StatusPill status={p.account.status} tone={p.account.status === "active" ? "ok" : "neutral"} />
        </div>
      </div>

      {msg && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}

      {/* Balance + limit */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Balance</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{formatGHS(p.account.balance)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Credit limit</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{formatGHS(p.account.creditLimit)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Utilisation</p>
          <div className="mt-2 h-3 w-full rounded-full bg-muted">
            <div className={`h-3 rounded-full ${utilisation > 90 ? "bg-danger" : utilisation > 70 ? "bg-warning" : "bg-success"}`} style={{ width: `${utilisation}%` }} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{utilisation}%</p>
        </CardContent></Card>
      </div>

      {/* Ageing */}
      <Card>
        <CardContent className="p-4">
          <h2 className="font-display text-lg font-bold">Ageing</h2>
          <div className="mt-3 flex h-4 w-full overflow-hidden rounded-full">
            {totalAgeing > 0 && BUCKETS.map(([key, , cls]) => (
              <div key={key} className={cls} style={{ width: `${(p.ageing[key] / totalAgeing) * 100}%` }} title={`${key}: ${formatGHS(p.ageing[key])}`} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            {BUCKETS.map(([key, label]) => (
              <span key={key} className="flex items-center gap-1.5">
                <span className={`inline-block size-2.5 rounded-full ${BUCKETS.find(b => b[0] === key)![2]}`} />
                {label}: <b className="tabular-nums">{formatGHS(p.ageing[key])}</b>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Open invoices */}
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <h2 className="font-display text-lg font-bold">Open invoices</h2>
            {p.canPay && p.openInvoices.length > 0 && (
              <Button size="sm" onClick={() => {
                setPayAmount((p.account.balance / 100).toFixed(2))
                setAllocations(Object.fromEntries(p.openInvoices.map((i) => [i.id, (i.balanceDue / 100).toFixed(2)])))
                setPayOpen(true)
              }}>Record payment</Button>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {p.openInvoices.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No open invoices on this account</td></tr>
              )}
              {p.openInvoices.map((i) => (
                <tr key={i.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/g/${p.garageSlug}/invoices/${i.id}`} className="hover:underline">{i.number ?? "Draft"}</Link>
                  </td>
                  <td className="px-4 py-3">{i.dueDate ?? i.issueDate ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatGHS(i.balanceDue)}</td>
                  <td className="px-4 py-3"><StatusPill status={i.status} tone="info" /></td>
                  <td className="px-4 py-3" />
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Charge invoice */}
      {p.canManage && p.chargeable.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-56 flex-1">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">Charge invoice to account</label>
              <select value={chargeInvoiceId} onChange={(e) => setChargeInvoiceId(e.target.value)} className={inputCls}>
                <option value="">Select invoice…</option>
                {p.chargeable.map((i) => (
                  <option key={i.id} value={i.id}>{i.number ?? "Draft"} — {formatGHS(i.balanceDue)}</option>
                ))}
              </select>
            </div>
            <Button disabled={pending || !chargeInvoiceId} onClick={charge}>Charge</Button>
            {!p.canExceed && <p className="w-full text-xs text-muted-foreground">Charges beyond the credit limit require owner approval.</p>}
          </CardContent>
        </Card>
      )}

      {/* Statements */}
      <Card>
        <CardContent className="p-0">
          <h2 className="border-b px-4 py-3 font-display text-lg font-bold">Statements</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3 text-right">Closing balance</th>
                <th className="px-4 py-3">Sent</th>
              </tr>
            </thead>
            <tbody>
              {p.statements.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No statements yet — generated monthly on day {p.account.statementDay ?? "—"}</td></tr>
              )}
              {p.statements.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="px-4 py-3">{s.periodStart} → {s.periodEnd}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatGHS(s.closingBalance)}</td>
                  <td className="px-4 py-3">{s.sentAt ? new Date(s.sentAt).toLocaleDateString("en-GH") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Payment modal */}
      {payOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-bold">Record credit payment</h2>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block font-medium">Amount (GH₵)</span>
              <input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} inputMode="decimal" className={inputCls} />
            </label>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block font-medium">Method</span>
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className={inputCls}>
                {["cash", "momo", "card", "bank_transfer", "cheque", "other"].map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
              </select>
            </label>
            <div className="mt-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Allocate to invoices</p>
              {p.openInvoices.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex-1">{i.number ?? "Invoice"} <span className="text-muted-foreground">(bal {formatGHS(i.balanceDue)})</span></span>
                  <input
                    value={allocations[i.id] ?? ""}
                    onChange={(e) => setAllocations({ ...allocations, [i.id]: e.target.value })}
                    placeholder="0.00"
                    inputMode="decimal"
                    className="min-h-9 w-28 rounded-lg border-2 border-border bg-background px-2 text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPayOpen(false)}>Cancel</Button>
              <Button disabled={pending} onClick={submitPayment}>Record</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
