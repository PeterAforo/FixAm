"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { formatGHS } from "@/lib/money"
import { openCreditAccount } from "@/lib/money/credit"

type Account = {
  id: string
  customerName: string
  creditLimit: number
  balance: number
  status: string
  paymentTermsDays: number
  statementDay: number | null
}

const inputCls = "min-h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

export function CreditAccountsPanel(props: {
  garageSlug: string
  garageId: string
  canManage: boolean
  accounts: Account[]
  customers: { id: string; name: string; phone: string | null }[]
}) {
  const { garageSlug, garageId, canManage, accounts, customers } = props
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [form, setForm] = useState({ customerId: "", limit: "", terms: "30", statementDay: "1" })

  function submit() {
    const limit = Math.round(parseFloat(form.limit || "0") * 100)
    if (!form.customerId || limit <= 0) { setMsg("Pick a customer and enter a limit"); return }
    startTransition(async () => {
      const res = await openCreditAccount({
        garageId,
        customerId: form.customerId,
        creditLimit: limit,
        paymentTermsDays: parseInt(form.terms, 10) || 30,
        statementDay: parseInt(form.statementDay, 10) || 1,
      })
      if (!res.ok) { setMsg(res.error.message); return }
      setOpen(false); setMsg(null); router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em]">Credit accounts</h1>
          <p className="text-sm text-muted-foreground">{accounts.length} active account{accounts.length === 1 ? "" : "s"}</p>
        </div>
        {canManage && <Button onClick={() => setOpen(true)}>Open account</Button>}
      </div>

      {msg && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-border bg-surface-muted/40 text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-right">Limit</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3 text-right">Utilisation</th>
                <th className="px-4 py-3">Terms</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No credit accounts yet</td></tr>
              )}
              {accounts.map((a) => {
                const pct = a.creditLimit > 0 ? Math.min(100, Math.round((a.balance / a.creditLimit) * 100)) : 0
                return (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{a.customerName}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatGHS(a.creditLimit)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatGHS(a.balance)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 rounded-full bg-muted">
                          <div className={`h-2 rounded-full ${pct > 90 ? "bg-danger" : pct > 70 ? "bg-warning" : "bg-success"}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{a.paymentTermsDays}d · stmt day {a.statementDay ?? "—"}</td>
                    <td className="px-4 py-3"><StatusPill status={a.status} tone={a.status === "active" ? "ok" : "neutral"} /></td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/g/${garageSlug}/credit/${a.id}`} className="text-sm text-primary hover:underline">View</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        </CardContent>
      </Card>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-semibold tracking-[-0.01em]">Open credit account</h2>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Customer</span>
                <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} className={inputCls}>
                  <option value="">Select…</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Credit limit (GH₵)</span>
                <input value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} inputMode="decimal" placeholder="e.g. 5000" className={inputCls} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Terms (days)</span>
                  <input value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} inputMode="numeric" className={inputCls} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Statement day</span>
                  <input value={form.statementDay} onChange={(e) => setForm({ ...form, statementDay: e.target.value })} inputMode="numeric" className={inputCls} />
                </label>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={pending} onClick={submit}>Open account</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
