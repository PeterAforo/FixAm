"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { formatGHS } from "@/lib/money"
import { performCashUp, recordExpense } from "@/lib/money/expenses"

type Data = {
  categories: { id: string; name: string }[]
  expenses: {
    id: string; description: string; amount: number; paidOn: string
    method: string | null; vendorName: string | null; categoryName: string
    branchName: string | null; receiptPath: string | null
  }[]
  cashUps: {
    id: string; branchId: string; businessDate: string
    expectedCash: number; countedCash: number; difference: number; notes: string | null
  }[]
  branches: { id: string; name: string }[]
  from: string
  to: string
}

const inputCls = "min-h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"
const today = () => new Date().toISOString().slice(0, 10)

export function ExpensesPanel(props: {
  garageSlug: string
  garageId: string
  canManage: boolean
  canCashUp: boolean
  data: Data
}) {
  const { garageSlug, garageId, canManage, canCashUp, data } = props
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [tab, setTab] = useState<"expenses" | "cashup">("expenses")
  const fileRef = useRef<HTMLInputElement>(null)

  const [expForm, setExpForm] = useState({
    branchId: data.branches[0]?.id ?? "",
    categoryId: data.categories[0]?.id ?? "",
    description: "", amount: "", paidOn: today(), method: "cash", vendorName: "",
  })
  const [cashForm, setCashForm] = useState({ branchId: data.branches[0]?.id ?? "", businessDate: today(), countedCash: "", notes: "" })

  const total = data.expenses.reduce((s, e) => s + e.amount, 0)

  function submitExpense(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData()
    fd.set("garageId", garageId)
    fd.set("branchId", expForm.branchId)
    fd.set("categoryId", expForm.categoryId)
    fd.set("description", expForm.description)
    fd.set("amount", expForm.amount)
    fd.set("paidOn", expForm.paidOn)
    fd.set("method", expForm.method)
    fd.set("vendorName", expForm.vendorName)
    const f = fileRef.current?.files?.[0]
    if (f) fd.set("receipt", f)
    startTransition(async () => {
      const res = await recordExpense(fd)
      if (!res.ok) { setMsg(res.error.message); return }
      setMsg(null)
      setExpForm({ ...expForm, description: "", amount: "", vendorName: "" })
      if (fileRef.current) fileRef.current.value = ""
      router.refresh()
    })
  }

  function submitCashUp(e: React.FormEvent) {
    e.preventDefault()
    const counted = Math.round(parseFloat(cashForm.countedCash || "0") * 100)
    startTransition(async () => {
      const res = await performCashUp({
        garageId, branchId: cashForm.branchId, businessDate: cashForm.businessDate,
        countedCash: counted, notes: cashForm.notes || undefined,
      })
      if (!res.ok) { setMsg(res.error.message); return }
      setMsg(res.data.difference === 0 ? "Cash-up saved — no discrepancy" : `Cash-up saved — difference ${formatGHS(res.data.difference)}`)
      setCashForm({ ...cashForm, countedCash: "", notes: "" })
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em]">Expenses & cash-up</h1>
          <p className="text-sm text-muted-foreground">
            {data.expenses.length} expenses · {formatGHS(total)} in period {data.from} → {data.to}
          </p>
        </div>
        <form className="flex items-center gap-2" onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          const q = new URLSearchParams()
          if (fd.get("from")) q.set("from", String(fd.get("from")))
          if (fd.get("to")) q.set("to", String(fd.get("to")))
          router.push(`/g/${garageSlug}/expenses${q.size ? `?${q}` : ""}`)
        }}>
          <input name="from" type="date" defaultValue={data.from} className="min-h-10 rounded-lg border border-border bg-surface px-2 text-sm" />
          <input name="to" type="date" defaultValue={data.to} className="min-h-10 rounded-lg border border-border bg-surface px-2 text-sm" />
          <Button type="submit" variant="secondary">Apply</Button>
        </form>
      </div>

      <div className="flex gap-2">
        {(["expenses", "cashup"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {t === "expenses" ? "Expenses" : "Cash-up"}
          </button>
        ))}
      </div>

      {msg && <p className="rounded-lg bg-info/10 px-3 py-2 text-sm">{msg}</p>}

      {tab === "expenses" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-border bg-surface-muted/40 text-left text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.expenses.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No expenses in this period</td></tr>
                  )}
                  {data.expenses.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="px-4 py-3">{e.paidOn}</td>
                      <td className="px-4 py-3">
                        {e.description}
                        {e.vendorName && <span className="block text-xs text-muted-foreground">{e.vendorName}</span>}
                        {e.receiptPath && <span className="text-xs text-primary">📎 receipt</span>}
                      </td>
                      <td className="px-4 py-3">{e.categoryName}</td>
                      <td className="px-4 py-3">{e.branchName ?? "—"}</td>
                      <td className="px-4 py-3 capitalize">{e.method?.replace("_", " ") ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatGHS(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </CardContent>
          </Card>

          {canManage && (
            <Card>
              <CardContent className="p-4">
                <h2 className="text-[15px] font-semibold">Record expense</h2>
                <form onSubmit={submitExpense} className="mt-3 space-y-3">
                  <select value={expForm.categoryId} onChange={(e) => setExpForm({ ...expForm, categoryId: e.target.value })} className={inputCls} required>
                    {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} placeholder="Description" className={inputCls} required />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} placeholder="Amount GH₵" inputMode="decimal" className={inputCls} required />
                    <input type="date" value={expForm.paidOn} onChange={(e) => setExpForm({ ...expForm, paidOn: e.target.value })} className={inputCls} required />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={expForm.method} onChange={(e) => setExpForm({ ...expForm, method: e.target.value })} className={inputCls}>
                      {["cash", "momo", "card", "bank_transfer", "cheque", "other"].map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
                    </select>
                    <select value={expForm.branchId} onChange={(e) => setExpForm({ ...expForm, branchId: e.target.value })} className={inputCls}>
                      {data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <input value={expForm.vendorName} onChange={(e) => setExpForm({ ...expForm, vendorName: e.target.value })} placeholder="Vendor (optional)" className={inputCls} />
                  <input ref={fileRef} type="file" accept="image/*" className="w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm" />
                  <Button type="submit" disabled={pending} className="w-full">Save expense</Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "cashup" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-border bg-surface-muted/40 text-left text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3 text-right">Expected</th>
                    <th className="px-4 py-3 text-right">Counted</th>
                    <th className="px-4 py-3 text-right">Difference</th>
                    <th className="px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cashUps.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No cash-ups recorded</td></tr>
                  )}
                  {data.cashUps.map((u) => {
                    const branch = data.branches.find((b) => b.id === u.branchId)
                    return (
                      <tr key={u.id} className="border-b last:border-0">
                        <td className="px-4 py-3">{u.businessDate}</td>
                        <td className="px-4 py-3">{branch?.name ?? "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatGHS(u.expectedCash)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatGHS(u.countedCash)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <StatusPill status={u.difference === 0 ? "ok" : u.difference > 0 ? "over" : "short"} tone={u.difference === 0 ? "ok" : "danger"}>
                            {formatGHS(u.difference)}
                          </StatusPill>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{u.notes ?? "—"}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div>
            </CardContent>
          </Card>

          {canCashUp && (
            <Card>
              <CardContent className="p-4">
                <h2 className="text-[15px] font-semibold">End-of-day cash-up</h2>
                <p className="mt-1 text-xs text-muted-foreground">Expected = succeeded cash payments minus cash expenses for the branch and date.</p>
                <form onSubmit={submitCashUp} className="mt-3 space-y-3">
                  <select value={cashForm.branchId} onChange={(e) => setCashForm({ ...cashForm, branchId: e.target.value })} className={inputCls}>
                    {data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <input type="date" value={cashForm.businessDate} onChange={(e) => setCashForm({ ...cashForm, businessDate: e.target.value })} className={inputCls} required />
                  <input value={cashForm.countedCash} onChange={(e) => setCashForm({ ...cashForm, countedCash: e.target.value })} placeholder="Counted cash (GH₵)" inputMode="decimal" className={inputCls} required />
                  <input value={cashForm.notes} onChange={(e) => setCashForm({ ...cashForm, notes: e.target.value })} placeholder="Notes (optional)" className={inputCls} />
                  <Button type="submit" disabled={pending} className="w-full">Complete cash-up</Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
