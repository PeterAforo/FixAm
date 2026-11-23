"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { saveCustomerPartsSettings, saveGaragePayoutAccount, type CustomerPartsSettings } from "@/lib/parts-shop/garage-actions"

const inputCls = "min-h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

export function CustomerPartsPanel({ garageId, settings }: { garageId: string; settings: CustomerPartsSettings }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [accepts, setAccepts] = useState(settings.accepts)
  const [fee, setFee] = useState(String(settings.fittingFee / 100))
  const [msg, setMsg] = useState<string | null>(null)
  const [editing, setEditing] = useState(!settings.payoutAccount)
  const [acct, setAcct] = useState({ method: "momo" as "momo" | "bank", network: "mtn" as "mtn" | "telecel" | "airteltigo", phone: "", bankCode: "", accountNumber: "", accountName: "" })

  function saveParts() {
    const pesewas = Math.round((parseFloat(fee || "0") || 0) * 100)
    startTransition(async () => {
      const r = await saveCustomerPartsSettings({ garageId, accepts, fittingFee: pesewas })
      setMsg(r.ok ? "Saved" : r.error)
      router.refresh()
    })
  }

  function savePayout(e: React.FormEvent) {
    e.preventDefault()
    const account =
      acct.method === "momo"
        ? { method: "momo", network: acct.network, phone: acct.phone, accountName: acct.accountName }
        : { method: "bank", bankCode: acct.bankCode, accountNumber: acct.accountNumber, accountName: acct.accountName }
    startTransition(async () => {
      const r = await saveGaragePayoutAccount({ garageId, account })
      setMsg(r.ok ? `FixAm will pay you into ${r.account}` : r.error)
      if (r.ok) setEditing(false)
      router.refresh()
    })
  }

  return (
    <div className="mt-3 space-y-4 rounded-xl border border-border bg-card p-4">
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1" checked={accepts} onChange={(e) => setAccepts(e.target.checked)} />
        <span>
          <span className="block text-sm font-semibold">Fit parts customers buy on FixAm</span>
          <span className="block text-xs text-muted-foreground">Turn off and customers won&apos;t be able to send parts to your garage.</span>
        </span>
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">Fitting fee (shown before they pay)</span>
          <span className="flex items-center gap-2">
            <span className="text-sm">GH₵</span>
            <input value={fee} onChange={(e) => setFee(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className={`${inputCls} w-28`} disabled={!accepts} />
          </span>
        </label>
        <Button variant="secondary" disabled={pending} onClick={saveParts}>Save</Button>
      </div>

      <div className="border-t border-border pt-4">
        <p className="text-sm font-semibold">Where FixAm pays you</p>
        <p className="text-xs text-muted-foreground">
          Online invoice payments and fitting fees land in FixAm&apos;s account first, then go straight to you. {settings.payoutAccount ? `Currently: ${settings.payoutAccount}.` : "Not set yet."}
        </p>
        {!editing ? (
          <Button variant="secondary" className="mt-2" onClick={() => setEditing(true)}>Change payout account</Button>
        ) : (
          <form onSubmit={savePayout} className="mt-3 space-y-2">
            <div className="flex gap-2">
              {(["momo", "bank"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setAcct({ ...acct, method: m })}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${acct.method === m ? "border-foreground bg-foreground text-background" : "border-border"}`}>
                  {m === "momo" ? "Mobile Money" : "Bank account"}
                </button>
              ))}
            </div>
            {acct.method === "momo" ? (
              <div className="grid grid-cols-2 gap-2">
                <select value={acct.network} onChange={(e) => setAcct({ ...acct, network: e.target.value as typeof acct.network })} className={inputCls} aria-label="Network">
                  <option value="mtn">MTN MoMo</option>
                  <option value="telecel">Telecel Cash</option>
                  <option value="airteltigo">AT Money</option>
                </select>
                <input value={acct.phone} onChange={(e) => setAcct({ ...acct, phone: e.target.value })} placeholder="024 123 4567" className={inputCls} required />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input value={acct.bankCode} onChange={(e) => setAcct({ ...acct, bankCode: e.target.value.toUpperCase() })} placeholder="Bank code, e.g. GCB" className={inputCls} required />
                <input value={acct.accountNumber} onChange={(e) => setAcct({ ...acct, accountNumber: e.target.value.replace(/\D/g, "") })} placeholder="Account number" className={inputCls} required />
              </div>
            )}
            <input value={acct.accountName} onChange={(e) => setAcct({ ...acct, accountName: e.target.value })} placeholder="Name on the account" className={inputCls} required />
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>Save payout account</Button>
              {settings.payoutAccount && <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>}
            </div>
          </form>
        )}
      </div>
      {msg && <p className="rounded-lg bg-info/10 px-3 py-2 text-sm">{msg}</p>}
    </div>
  )
}
