"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { adminUpsertDvlaFee } from "@/lib/dvla/actions"

const inputCls = "min-h-10 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

type Fee = {
  id: string
  recordType: string
  vehicleCategory: string
  description: string | null
  amount: number
  effectiveFrom: string
  effectiveTo: string | null
}

export function AdminDvlaFeesPanel({ fees }: { fees: Fee[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({ recordType: "roadworthy", vehicleCategory: "", description: "", amount: "", effectiveFrom: "", effectiveTo: "" })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    startTransition(async () => {
      const res = await adminUpsertDvlaFee({
        recordType: form.recordType,
        vehicleCategory: form.vehicleCategory.trim(),
        description: form.description || undefined,
        amount: Math.round(Number(form.amount) * 100),
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo || undefined,
      })
      if (!res.ok) { setMsg({ ok: false, text: res.error.message }); return }
      setMsg({ ok: true, text: "Fee saved." })
      setForm({ ...form, vehicleCategory: "", description: "", amount: "", effectiveFrom: "", effectiveTo: "" })
      router.refresh()
    })
  }

  return (
    <div className="mt-4 space-y-6">
      <Card><CardContent className="p-5">
        <h3 className="font-display text-base font-bold">Add / update fee</h3>
        <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-3">
          <select className={inputCls} value={form.recordType} onChange={(e) => setForm({ ...form, recordType: e.target.value })}>
            <option value="roadworthy">Roadworthy</option>
            <option value="registration_licence">Registration / licence</option>
            <option value="drivers_licence">Driver's licence</option>
          </select>
          <input className={inputCls} placeholder="Vehicle category *" required value={form.vehicleCategory} onChange={(e) => setForm({ ...form, vehicleCategory: e.target.value })} />
          <input className={inputCls} type="number" min={0} step="0.01" placeholder="Amount GH₵ *" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input className={inputCls} placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div><label className="text-xs font-bold uppercase text-muted-foreground">Effective from *</label><input className={inputCls} type="date" required value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} /></div>
          <div><label className="text-xs font-bold uppercase text-muted-foreground">Effective to</label><input className={inputCls} type="date" value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })} /></div>
          <div className="flex items-end gap-2 sm:col-span-3">
            <Button type="submit" disabled={pending}>Save fee</Button>
            {msg && <p className={`text-sm font-semibold ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
          </div>
        </form>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">Type</th><th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Description</th><th className="px-4 py-3 text-right">Fee</th>
              <th className="px-4 py-3">Effective</th>
            </tr>
          </thead>
          <tbody>
            {fees.map((f) => (
              <tr key={f.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-semibold">{f.recordType.replace(/_/g, " ")}</td>
                <td className="px-4 py-2">{f.vehicleCategory}</td>
                <td className="px-4 py-2 text-muted-foreground">{f.description ?? "—"}</td>
                <td className="px-4 py-2 text-right font-semibold">GH₵ {(f.amount / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{f.effectiveFrom}{f.effectiveTo ? ` → ${f.effectiveTo}` : " →"}</td>
              </tr>
            ))}
            {fees.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No fees configured yet.</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  )
}
