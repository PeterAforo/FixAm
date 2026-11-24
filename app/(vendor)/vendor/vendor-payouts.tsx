"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill, type StatusTone } from "@/components/brand/status-pill"
import { formatGHS } from "@/lib/money"
import { saveVendorPayoutAccount, type VendorPayoutsView } from "@/lib/escrow/actions"

const inputCls = "min-h-11 w-full rounded-xl border border-input bg-card px-3.5 text-sm outline-none transition-shadow placeholder:text-[#8C857B] focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  succeeded: { label: "Paid", tone: "ok" },
  queued: { label: "Sending", tone: "info" },
  processing: { label: "Sending", tone: "info" },
  pending_confirmation: { label: "Confirming", tone: "info" },
  needs_attention: { label: "Needs attention", tone: "danger" },
}

/** Vendor Payouts tab: where the money goes, what's held, and payout history. */
export function VendorPayouts({ view, isOwner }: { view: VendorPayoutsView | null; isOwner: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(!view?.account)
  const [msg, setMsg] = useState<string | null>(null)
  const [form, setForm] = useState({
    method: (view?.accountMethod ?? "momo") as "momo" | "bank",
    network: "mtn" as "mtn" | "telecel" | "airteltigo",
    phone: "",
    bankCode: "",
    accountNumber: "",
    accountName: "",
  })

  if (!view) return <p className="text-sm text-muted-foreground">You don&apos;t have access to payouts.</p>

  function save(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    const payload =
      form.method === "momo"
        ? { method: "momo", network: form.network, phone: form.phone, accountName: form.accountName }
        : { method: "bank", bankCode: form.bankCode, accountNumber: form.accountNumber, accountName: form.accountName }
    startTransition(async () => {
      const r = await saveVendorPayoutAccount(payload)
      if (!r.ok) return setMsg(r.error.message)
      setMsg(`Payouts will go to ${r.data.account}`)
      setEditing(false)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Held for you</p>
          <p className="font-display text-xl font-bold tabular-nums">{formatGHS(view.held)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Released when the buyer confirms delivery, or 72 h after you mark it delivered.</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">On the way to you</p>
          <p className="font-display text-xl font-bold tabular-nums">{formatGHS(view.releasing)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Paid out</p>
          <p className="font-display text-xl font-bold tabular-nums">{formatGHS(view.paidOut)}</p>
        </CardContent></Card>
      </div>

      <Card className="max-w-xl">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">Where we pay you</h2>
              <p className="mt-1 text-sm text-muted-foreground">{view.account ?? "No payout account yet — add one so we can pay you."}</p>
            </div>
            {!editing && isOwner && <Button variant="secondary" onClick={() => setEditing(true)}>Change</Button>}
          </div>
          {editing && isOwner && (
            <form onSubmit={save} className="mt-4 space-y-3">
              <div className="flex gap-2">
                {(["momo", "bank"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setForm({ ...form, method: m })}
                    className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${form.method === m ? "border-foreground bg-foreground text-background" : "border-border"}`}>
                    {m === "momo" ? "Mobile Money" : "Bank account"}
                  </button>
                ))}
              </div>
              {form.method === "momo" ? (
                <div className="grid grid-cols-2 gap-3">
                  <select value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value as typeof form.network })} className={inputCls} aria-label="Network">
                    <option value="mtn">MTN MoMo</option>
                    <option value="telecel">Telecel Cash</option>
                    <option value="airteltigo">AT Money</option>
                  </select>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="024 123 4567" inputMode="tel" className={inputCls} required />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <input value={form.bankCode} onChange={(e) => setForm({ ...form, bankCode: e.target.value.toUpperCase() })} placeholder="Bank code, e.g. GCB" className={inputCls} required />
                  <input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value.replace(/\D/g, "") })} placeholder="Account number" inputMode="numeric" className={inputCls} required />
                </div>
              )}
              <input value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} placeholder="Name on the account" className={inputCls} required />
              <p className="text-xs text-muted-foreground">We check the bank&apos;s account name before paying. Details are stored encrypted.</p>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>Save payout account</Button>
                {view.account && <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>}
              </div>
            </form>
          )}
          {!isOwner && <p className="mt-3 text-xs text-muted-foreground">Only the business owner can change the payout account.</p>}
          {msg && <p className="mt-3 rounded-lg bg-info/10 px-3 py-2 text-sm">{msg}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {view.rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No payouts yet.</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[600px]">
              <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Amount</th><th className="px-4 py-2">To</th><th className="px-4 py-2">Status</th></tr>
              </thead>
              <tbody>
                {view.rows.map((r) => {
                  const s = STATUS[r.status] ?? { label: r.status, tone: "neutral" as StatusTone }
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-4 py-2">{new Date(r.completedAt ?? r.createdAt).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}</td>
                      <td className="px-4 py-2 tabular-nums">{formatGHS(r.amount)}</td>
                      <td className="px-4 py-2">{r.method === "bank" ? "Bank" : "MoMo"}</td>
                      <td className="px-4 py-2">
                        <StatusPill status={s.label} tone={s.tone} />
                        {r.lastError && <p className="mt-1 text-xs text-muted-foreground">{r.lastError}</p>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
