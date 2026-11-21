"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { formatGHS } from "@/lib/money"
import {
  adjustStock,
  importPartsCsv,
  setStockConfig,
  transferStock,
  upsertPart,
} from "@/lib/parts/actions"
import { parsePartsCsv, type CsvIssue, type CsvRow } from "@/lib/parts/csv"

type Part = {
  id: string; sku: string; name: string; brand: string | null; category: string | null
  unit: string | null; costPrice: number; sellingPrice: number
  barcode: string | null; isActive: boolean | null; onlineVisible: boolean | null
  preferredVendorName: string | null
  levelId: string | null; branchId: string | null; branchName: string | null
  onHand: number | null; reserved: number | null
  reorderLevel: number | null; binLocation: string | null
}

type Data = {
  parts: Part[]
  branches: { id: string; name: string }[]
  branchId: string | null
  canManage: boolean
  canAdjust: boolean
  canTransfer: boolean
}

const inputCls = "min-h-10 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

const EMPTY_FORM = {
  partId: "", sku: "", name: "", brand: "", category: "", unit: "pcs",
  costPrice: "", sellingPrice: "", barcode: "", description: "",
  onlineVisible: false, isActive: true,
}

export function PartsPanel(props: { garageSlug: string; garageId: string; data: Data }) {
  const { garageSlug, garageId, data } = props
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [tab, setTab] = useState<"catalogue" | "import">("catalogue")
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [adjustFor, setAdjustFor] = useState<Part | null>(null)
  const [transferFor, setTransferFor] = useState<Part | null>(null)
  const [configFor, setConfigFor] = useState<Part | null>(null)
  const csvRef = useRef<HTMLInputElement>(null)
  const [csvRows, setCsvRows] = useState<CsvRow[] | null>(null)
  const [csvIssues, setCsvIssues] = useState<CsvIssue[]>([])
  const [importResult, setImportResult] = useState<string | null>(null)

  const [adjustForm, setAdjustForm] = useState({ quantity: "", reason: "", unitCost: "" })
  const [transferForm, setTransferForm] = useState({ toBranchId: "", quantity: "" })
  const [configForm, setConfigForm] = useState({ reorderLevel: "", reorderQuantity: "", binLocation: "" })

  function openEdit(p: Part) {
    setForm({
      partId: p.id, sku: p.sku, name: p.name, brand: p.brand ?? "", category: p.category ?? "",
      unit: p.unit ?? "pcs", costPrice: String(p.costPrice), sellingPrice: String(p.sellingPrice),
      barcode: p.barcode ?? "", description: "", onlineVisible: p.onlineVisible ?? false, isActive: p.isActive ?? true,
    })
    setShowForm(true)
  }

  function submitPart(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await upsertPart({
        garageId, partId: form.partId || undefined,
        sku: form.sku, name: form.name, brand: form.brand || undefined,
        category: form.category || undefined, unit: form.unit || undefined,
        costPrice: parseFloat(form.costPrice || "0"), sellingPrice: parseFloat(form.sellingPrice || "0"),
        barcode: form.barcode || undefined, description: form.description || undefined,
        onlineVisible: form.onlineVisible, isActive: form.isActive,
      })
      if (!res.ok) { setMsg(res.error.message); return }
      setMsg(null); setShowForm(false); setForm(EMPTY_FORM); router.refresh()
    })
  }

  function submitAdjust(e: React.FormEvent) {
    e.preventDefault()
    if (!adjustFor) return
    startTransition(async () => {
      const res = await adjustStock({
        garageId, branchId: adjustFor.branchId!, partId: adjustFor.id,
        quantity: parseFloat(adjustForm.quantity), reason: adjustForm.reason,
        unitCost: adjustForm.unitCost ? parseFloat(adjustForm.unitCost) : undefined,
      })
      if (!res.ok) { setMsg(res.error.message); return }
      setMsg("Stock adjusted"); setAdjustFor(null); setAdjustForm({ quantity: "", reason: "", unitCost: "" }); router.refresh()
    })
  }

  function submitTransfer(e: React.FormEvent) {
    e.preventDefault()
    if (!transferFor) return
    startTransition(async () => {
      const res = await transferStock({
        garageId, fromBranchId: transferFor.branchId!, toBranchId: transferForm.toBranchId,
        partId: transferFor.id, quantity: parseFloat(transferForm.quantity),
      })
      if (!res.ok) { setMsg(res.error.message); return }
      setMsg("Transfer complete"); setTransferFor(null); setTransferForm({ toBranchId: "", quantity: "" }); router.refresh()
    })
  }

  function submitConfig(e: React.FormEvent) {
    e.preventDefault()
    if (!configFor) return
    startTransition(async () => {
      const res = await setStockConfig({
        garageId, branchId: configFor.branchId!, partId: configFor.id,
        reorderLevel: configForm.reorderLevel !== "" ? parseFloat(configForm.reorderLevel) : undefined,
        reorderQuantity: configForm.reorderQuantity !== "" ? parseFloat(configForm.reorderQuantity) : undefined,
        binLocation: configForm.binLocation,
      })
      if (!res.ok) { setMsg(res.error.message); return }
      setMsg("Stock settings saved"); setConfigFor(null); router.refresh()
    })
  }

  function onCsvFile(f: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? "")
      const { rows, issues } = parsePartsCsv(text)
      setCsvRows(rows); setCsvIssues(issues); setImportResult(null)
    }
    reader.readAsText(f)
  }

  function commitImport() {
    const raw = csvRef.current?.files?.[0]
    if (!raw) return
    const reader = new FileReader()
    reader.onload = () => {
      startTransition(async () => {
        const res = await importPartsCsv({ garageId, csvText: String(reader.result ?? "") })
        if (!res.ok) { setMsg(res.error.message); return }
        setImportResult(`Imported ${res.data.inserted} new, updated ${res.data.updated}, ${res.data.issues.length} row issues`)
        setCsvRows(null); setCsvIssues([])
        if (csvRef.current) csvRef.current.value = ""
        router.refresh()
      })
    }
    reader.readAsText(raw)
  }

  const lowCount = data.parts.filter((p) => p.onHand != null && p.reorderLevel != null && p.onHand <= p.reorderLevel).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Parts & stock</h1>
          <p className="text-sm text-muted-foreground">
            {data.parts.length} parts{lowCount > 0 ? ` · ${lowCount} low on stock` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`/g/${garageSlug}/purchase-orders`} className="inline-flex min-h-10 items-center rounded-lg border-2 border-border bg-surface px-4 text-sm font-bold">Purchase orders →</a>
          <Button variant="secondary" onClick={() => setTab(tab === "import" ? "catalogue" : "import")}>
            {tab === "import" ? "Catalogue" : "Import CSV"}
          </Button>
          {data.canManage && tab === "catalogue" && (
            <Button onClick={() => { setForm(EMPTY_FORM); setShowForm(true) }}>New part</Button>
          )}
        </div>
      </div>

      {msg && <p className="rounded-lg bg-info/10 px-3 py-2 text-sm">{msg}</p>}

      {tab === "catalogue" && (
        <>
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const q = new URLSearchParams()
            if (fd.get("q")) q.set("q", String(fd.get("q")))
            if (fd.get("low")) q.set("low", "1")
            if (data.branchId) q.set("branch", data.branchId)
            router.push(`/g/${garageSlug}/parts${q.size ? `?${q}` : ""}`)
          }}>
            <input name="q" placeholder="Search name, SKU, barcode…" className="min-h-10 w-64 rounded-lg border-2 border-border bg-surface px-3 text-sm" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="low" value="1" defaultChecked={false} className="h-4 w-4" /> Low stock only
            </label>
            <Button type="submit" variant="secondary">Search</Button>
          </form>

          {showForm && (
            <Card>
              <CardContent className="p-4">
                <h2 className="font-display text-lg font-bold">{form.partId ? "Edit part" : "New part"}</h2>
                <form onSubmit={submitPart} className="mt-3 grid gap-3 sm:grid-cols-3">
                  <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="SKU *" className={inputCls} required />
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name *" className={inputCls} required />
                  <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="Barcode" className={inputCls} />
                  <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Brand" className={inputCls} />
                  <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category" className={inputCls} />
                  <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="Unit" className={inputCls} />
                  <input value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} placeholder="Cost GH₵" inputMode="decimal" className={inputCls} required />
                  <input value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} placeholder="Selling GH₵" inputMode="decimal" className={inputCls} required />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.onlineVisible} onChange={(e) => setForm({ ...form, onlineVisible: e.target.checked })} className="h-4 w-4" />
                    Visible online
                  </label>
                  <div className="sm:col-span-3 flex gap-2">
                    <Button type="submit" disabled={pending}>{form.partId ? "Save changes" : "Create part"}</Button>
                    <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Part</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3 text-right">On hand</th>
                    <th className="px-4 py-3 text-right">Reserved</th>
                    <th className="px-4 py-3 text-right">Reorder</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.parts.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No parts found</td></tr>
                  )}
                  {data.parts.map((p) => {
                    const low = p.onHand != null && p.reorderLevel != null && p.onHand <= p.reorderLevel
                    return (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="px-4 py-3">
                          <p className="font-medium">{p.name}{!p.isActive && <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>}</p>
                          <p className="text-xs text-muted-foreground">{[p.brand, p.category].filter(Boolean).join(" · ")}{p.preferredVendorName ? ` · ${p.preferredVendorName}` : ""}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
                        <td className="px-4 py-3">{p.branchName ?? "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {p.onHand ?? "—"}
                          {low && <StatusPill status="low" tone="warning" className="ml-2">low</StatusPill>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{p.reserved ?? "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{p.reorderLevel ?? "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatGHS(p.costPrice)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatGHS(p.sellingPrice)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            {data.canManage && <Button variant="ghost" className="!min-h-8 px-2 text-xs" onClick={() => openEdit(p)}>Edit</Button>}
                            {data.canAdjust && p.branchId && <Button variant="ghost" className="!min-h-8 px-2 text-xs" onClick={() => { setAdjustFor(p); setAdjustForm({ quantity: "", reason: "", unitCost: "" }) }}>Stock</Button>}
                            {data.canTransfer && data.branches.length > 1 && p.branchId && <Button variant="ghost" className="!min-h-8 px-2 text-xs" onClick={() => { setTransferFor(p); setTransferForm({ toBranchId: "", quantity: "" }) }}>Move</Button>}
                            {data.canAdjust && p.branchId && <Button variant="ghost" className="!min-h-8 px-2 text-xs" onClick={() => { setConfigFor(p); setConfigForm({ reorderLevel: p.reorderLevel != null ? String(p.reorderLevel) : "", reorderQuantity: "", binLocation: p.binLocation ?? "" }) }}>Cfg</Button>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      {tab === "import" && (
        <Card>
          <CardContent className="p-4">
            <h2 className="font-display text-lg font-bold">Import parts from CSV</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Columns: <code>sku, name, brand, category, unit, cost price, selling price, barcode</code>. Existing SKUs are updated.
            </p>
            <input ref={csvRef} type="file" accept=".csv,text/csv" className="mt-3 w-full text-sm"
              onChange={(e) => e.target.files?.[0] && onCsvFile(e.target.files[0])} />

            {csvRows && (
              <div className="mt-4">
                <p className="text-sm font-medium">{csvRows.length} valid rows{csvIssues.length > 0 ? `, ${csvIssues.length} issues` : ""}</p>
                {csvIssues.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-auto rounded-lg border border-danger/40 p-2 text-xs">
                    {csvIssues.map((i, idx) => <p key={idx} className="text-danger">Row {i.row} ({i.sku || "?"}): {i.message}</p>)}
                  </div>
                )}
                <div className="mt-2 max-h-64 overflow-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted"><tr><th className="px-2 py-1 text-left">SKU</th><th className="px-2 py-1 text-left">Name</th><th className="px-2 py-1 text-right">Cost</th><th className="px-2 py-1 text-right">Price</th></tr></thead>
                    <tbody>
                      {csvRows.slice(0, 50).map((r) => (
                        <tr key={r.row} className="border-t"><td className="px-2 py-1 font-mono">{r.sku}</td><td className="px-2 py-1">{r.name}</td><td className="px-2 py-1 text-right">{r.costPrice}</td><td className="px-2 py-1 text-right">{r.sellingPrice}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  {csvRows.length > 50 && <p className="px-2 py-1 text-xs text-muted-foreground">…and {csvRows.length - 50} more</p>}
                </div>
                <Button className="mt-3" onClick={commitImport} disabled={pending || csvRows.length === 0}>
                  Import {csvRows.length} parts
                </Button>
              </div>
            )}
            {importResult && <p className="mt-3 text-sm text-success">{importResult}</p>}
          </CardContent>
        </Card>
      )}

      {/* adjust stock modal */}
      {adjustFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAdjustFor(null)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-4">
              <h3 className="font-display text-lg font-bold">Adjust stock — {adjustFor.name}</h3>
              <p className="text-xs text-muted-foreground">On hand {adjustFor.onHand ?? 0} · branch {adjustFor.branchName}</p>
              <form onSubmit={submitAdjust} className="mt-3 space-y-3">
                <input value={adjustForm.quantity} onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })} placeholder="Quantity (+ in / − out)" inputMode="decimal" className={inputCls} required />
                <input value={adjustForm.unitCost} onChange={(e) => setAdjustForm({ ...adjustForm, unitCost: e.target.value })} placeholder="Unit cost GH₵ (inbound only)" inputMode="decimal" className={inputCls} />
                <input value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} placeholder="Reason *" className={inputCls} required />
                <div className="flex gap-2">
                  <Button type="submit" disabled={pending}>Save</Button>
                  <Button type="button" variant="secondary" onClick={() => setAdjustFor(null)}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* transfer modal */}
      {transferFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setTransferFor(null)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-4">
              <h3 className="font-display text-lg font-bold">Transfer — {transferFor.name}</h3>
              <form onSubmit={submitTransfer} className="mt-3 space-y-3">
                <select value={transferForm.toBranchId} onChange={(e) => setTransferForm({ ...transferForm, toBranchId: e.target.value })} className={inputCls} required>
                  <option value="">To branch…</option>
                  {data.branches.filter((b) => b.id !== transferFor.branchId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <input value={transferForm.quantity} onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })} placeholder="Quantity" inputMode="decimal" className={inputCls} required />
                <div className="flex gap-2">
                  <Button type="submit" disabled={pending}>Transfer</Button>
                  <Button type="button" variant="secondary" onClick={() => setTransferFor(null)}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* stock config modal */}
      {configFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfigFor(null)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-4">
              <h3 className="font-display text-lg font-bold">Stock settings — {configFor.name}</h3>
              <form onSubmit={submitConfig} className="mt-3 space-y-3">
                <input value={configForm.reorderLevel} onChange={(e) => setConfigForm({ ...configForm, reorderLevel: e.target.value })} placeholder="Reorder level" inputMode="decimal" className={inputCls} />
                <input value={configForm.reorderQuantity} onChange={(e) => setConfigForm({ ...configForm, reorderQuantity: e.target.value })} placeholder="Reorder quantity" inputMode="decimal" className={inputCls} />
                <input value={configForm.binLocation} onChange={(e) => setConfigForm({ ...configForm, binLocation: e.target.value })} placeholder="Bin location" className={inputCls} />
                <div className="flex gap-2">
                  <Button type="submit" disabled={pending}>Save</Button>
                  <Button type="button" variant="secondary" onClick={() => setConfigFor(null)}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
