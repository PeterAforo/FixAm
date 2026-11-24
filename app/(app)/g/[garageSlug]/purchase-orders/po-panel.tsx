"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill, statusTone } from "@/components/brand/status-pill"
import { formatGHS } from "@/lib/money"
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrder,
  receiveGoods,
  submitPurchaseOrder,
} from "@/lib/purchasing/actions"

type Order = {
  id: string; number: string; status: string
  vendorName: string | null; externalSupplierName: string | null
  total: number; expectedAt: string | null; branchName: string | null
  createdAt: string; itemCount: number; receivedCount: number; orderedCount: number
}
type Data = {
  orders: Order[]
  vendors: { id: string; name: string; city: string | null; region: string | null }[]
  branches: { id: string; name: string }[]
  parts: { id: string; sku: string; name: string; sellingPrice: number }[]
  canCreate: boolean
  canApprove: boolean
  canReceive: boolean
}

const inputCls = "min-h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

export function PosOrdersPanel(props: { garageSlug: string; garageId: string; data: Data }) {
  const { garageSlug, garageId, data } = props
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [receiveFor, setReceiveFor] = useState<Order | null>(null)
  const [receiveItems, setReceiveItems] = useState<{ itemId: string; partName: string; remaining: number; quantity: string }[] | null>(null)
  const [receiveNotes, setReceiveNotes] = useState("")

  const [poForm, setPoForm] = useState({
    branchId: data.branches[0]?.id ?? "", vendorId: "", externalSupplierName: "",
    expectedAt: "", notes: "",
  })
  const [lines, setLines] = useState([{ partId: "", quantity: "1", unitCost: "" }])

  function act(fn: (i: unknown) => Promise<{ ok: boolean; error?: { message: string } }>, input: unknown, okMsg?: string) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const res = await fn(input) as { ok: boolean; error?: { message: string }; data?: unknown }
        if (!res.ok) { setMsg(res.error?.message ?? "Failed") } else { setMsg(okMsg ?? null); router.refresh() }
        resolve()
      })
    })
  }

  function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    const items = lines.filter((l) => l.partId && parseFloat(l.quantity) > 0)
    if (items.length === 0) { setMsg("Add at least one line"); return }
    act(createPurchaseOrder, {
      garageId,
      branchId: poForm.branchId,
      vendorId: poForm.vendorId || undefined,
      externalSupplierName: poForm.externalSupplierName || undefined,
      expectedAt: poForm.expectedAt || undefined,
      notes: poForm.notes || undefined,
      items: items.map((l) => ({ partId: l.partId, quantity: parseFloat(l.quantity), unitCost: parseFloat(l.unitCost || "0") })),
    }, "PO created").then(() => { setShowCreate(false); setLines([{ partId: "", quantity: "1", unitCost: "" }]) })
  }

  function openReceive(o: Order) {
    setReceiveFor(o); setReceiveItems(null); setReceiveNotes("")
    startTransition(async () => {
      const res = await getPurchaseOrder({ garageId, poId: o.id })
      if (res.ok && res.data) {
        setReceiveItems(res.data.items.map((i: { id: string; partName: string; quantity: number; quantityReceived: number }) => ({
          itemId: i.id, partName: i.partName,
          remaining: i.quantity - i.quantityReceived,
          quantity: String(Math.max(0, i.quantity - i.quantityReceived)),
        })))
      }
    })
  }

  function submitReceive(e: React.FormEvent) {
    e.preventDefault()
    if (!receiveFor || !receiveItems) return
    const lines = receiveItems.filter((l) => parseFloat(l.quantity) > 0)
    if (lines.length === 0) { setMsg("Enter quantities to receive"); return }
    act(receiveGoods, {
      garageId, poId: receiveFor.id,
      lines: lines.map((l) => ({ itemId: l.itemId, quantity: parseFloat(l.quantity) })),
      notes: receiveNotes || undefined,
    }, "Goods received").then(() => setReceiveFor(null))
  }

  const STATUS_TABS = ["", "draft", "pending_approval", "sent", "partially_delivered", "received", "cancelled"]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em]">Purchase orders</h1>
          <p className="text-sm text-muted-foreground">{data.orders.length} orders</p>
        </div>
        {data.canCreate && <Button onClick={() => setShowCreate(!showCreate)}>{showCreate ? "Close" : "New PO"}</Button>}
      </div>

      {msg && <p className="rounded-lg bg-info/10 px-3 py-2 text-sm">{msg}</p>}

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((s) => (
          <a key={s || "all"} href={`/g/${garageSlug}/purchase-orders${s ? `?status=${s}` : ""}`}
            className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${!s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {s ? s.replace(/_/g, " ") : "All"}
          </a>
        ))}
      </div>

      {showCreate && (
        <Card>
          <CardContent className="p-4">
            <h2 className="text-[15px] font-semibold">New purchase order</h2>
            <form onSubmit={submitCreate} className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <select value={poForm.branchId} onChange={(e) => setPoForm({ ...poForm, branchId: e.target.value })} className={inputCls} required>
                  {data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select value={poForm.vendorId} onChange={(e) => setPoForm({ ...poForm, vendorId: e.target.value })} className={inputCls}>
                  <option value="">Marketplace vendor…</option>
                  {data.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}{v.city ? ` (${v.city})` : ""}</option>)}
                </select>
                <input value={poForm.externalSupplierName} onChange={(e) => setPoForm({ ...poForm, externalSupplierName: e.target.value })} placeholder="Or external supplier" className={inputCls} />
                <input type="date" value={poForm.expectedAt} onChange={(e) => setPoForm({ ...poForm, expectedAt: e.target.value })} className={inputCls} />
                <input value={poForm.notes} onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })} placeholder="Notes" className={`${inputCls} sm:col-span-2`} />
              </div>

              <div className="space-y-2">
                {lines.map((l, idx) => (
                  <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_100px_120px_40px]">
                    <select value={l.partId} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, partId: e.target.value } : x))} className={inputCls} required>
                      <option value="">Part…</option>
                      {data.parts.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                    </select>
                    <input value={l.quantity} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} placeholder="Qty" inputMode="decimal" className={inputCls} required />
                    <input value={l.unitCost} onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, unitCost: e.target.value } : x))} placeholder="Unit cost GH₵" inputMode="decimal" className={inputCls} required />
                    <Button type="button" variant="ghost" onClick={() => setLines(lines.filter((_, i) => i !== idx))}>✕</Button>
                  </div>
                ))}
                <Button type="button" variant="secondary" onClick={() => setLines([...lines, { partId: "", quantity: "1", unitCost: "" }])}>+ Add line</Button>
              </div>

              <Button type="submit" disabled={pending}>Create draft PO</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted/40 text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-3">PO #</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Received</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Expected</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.orders.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No purchase orders</td></tr>
              )}
              {data.orders.map((o) => (
                <tr key={o.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{o.number}</td>
                  <td className="px-4 py-3">{o.vendorName ?? o.externalSupplierName ?? "—"}</td>
                  <td className="px-4 py-3">{o.branchName ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{o.receivedCount}/{o.orderedCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatGHS(o.total)}</td>
                  <td className="px-4 py-3 text-xs">{o.expectedAt?.slice(0, 10) ?? "—"}</td>
                  <td className="px-4 py-3"><StatusPill status={o.status} tone={statusTone(o.status)} /></td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {o.status === "draft" && data.canCreate && <Button variant="ghost" className="!min-h-8 px-2 text-xs" onClick={() => act(submitPurchaseOrder, { garageId, poId: o.id }, "Submitted for approval")}>Submit</Button>}
                      {o.status === "pending_approval" && data.canApprove && <Button variant="ghost" className="!min-h-8 px-2 text-xs" onClick={() => act(approvePurchaseOrder, { garageId, poId: o.id }, "PO sent to supplier")}>Approve</Button>}
                      {data.canReceive && ["sent", "accepted", "partially_delivered"].includes(o.status) && (
                        <Button variant="ghost" className="!min-h-8 px-2 text-xs" onClick={() => openReceive(o)}>Receive</Button>
                      )}
                      {!["received", "cancelled"].includes(o.status) && data.canCreate && (
                        <Button variant="ghost" className="!min-h-8 px-2 text-xs text-danger" onClick={() => act(cancelPurchaseOrder, { garageId, poId: o.id }, "PO cancelled")}>Cancel</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* receive modal */}
      {receiveFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setReceiveFor(null)}>
          <Card className="max-h-[calc(100dvh-2rem)] overflow-y-auto w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-4">
              <h3 className="text-[15px] font-semibold">Receive — {receiveFor.number}</h3>
              {!receiveItems ? (
                <p className="py-6 text-sm text-muted-foreground">Loading…</p>
              ) : (
                <form onSubmit={submitReceive} className="mt-3 space-y-2">
                  {receiveItems.map((l) => (
                    <div key={l.itemId} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 flex-1 truncate">{l.partName} <span className="text-xs text-muted-foreground">({l.remaining} remaining)</span></span>
                      <input value={l.quantity} inputMode="decimal"
                        onChange={(e) => setReceiveItems(receiveItems.map((x) => x.itemId === l.itemId ? { ...x, quantity: e.target.value } : x))}
                        className="h-9 w-24 rounded-lg border border-border bg-surface px-2 text-right" />
                    </div>
                  ))}
                  <input value={receiveNotes} onChange={(e) => setReceiveNotes(e.target.value)} placeholder="Delivery note (optional)" className={`${inputCls} mt-2`} />
                  <div className="flex gap-2 pt-2">
                    <Button type="submit" disabled={pending}>Confirm receipt</Button>
                    <Button type="button" variant="secondary" onClick={() => setReceiveFor(null)}>Close</Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
