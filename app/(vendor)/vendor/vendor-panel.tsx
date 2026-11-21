"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill, statusTone } from "@/components/brand/status-pill"
import { formatGHS } from "@/lib/money"
import {
  fulfilVendorOrder,
  getVendorDashboard,
  importVendorProductsCsv,
  updateVendorProfile,
  upsertVendorProduct,
  vendorSignup,
} from "@/lib/vendors/actions"
import { parseVendorProductsCsv, type VendorCsvIssue, type VendorCsvRow } from "@/lib/vendors/csv"

type Dash = NonNullable<Extract<Awaited<ReturnType<typeof getVendorDashboard>>, { ok: true; data: object }>["data"]>
type Product = {
  id: string; sku: string; name: string; brand: string | null; category: string
  price: number; stockStatus: string | null; quantityAvailable: number | null
  minOrderQty: number | null; leadTimeHours: number | null; isActive: boolean | null
}

const inputCls = "min-h-10 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

const NEXT_ACTION: Record<string, { label: string; action: string } | null> = {
  placed: { label: "Accept order", action: "accept" },
  accepted: { label: "Mark packed", action: "packed" },
  packed: { label: "Out for delivery", action: "out_for_delivery" },
  out_for_delivery: { label: "Mark delivered", action: "delivered" },
  delivered: null, received: null, cancelled: null, rejected: null,
}

export function VendorPanel(props: { dashboard: Dash | null; products: Product[] }) {
  const { dashboard, products } = props
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [tab, setTab] = useState<"orders" | "products" | "profile" | "payouts">("orders")

  // signup form
  const [signup, setSignup] = useState({
    businessName: "", phone: "", email: "", city: "", region: "",
    categories: "", payoutMethod: "momo" as "momo" | "bank", payoutDetails: "",
  })

  // product form
  const [showProduct, setShowProduct] = useState(false)
  const [pForm, setPForm] = useState({ productId: "", sku: "", name: "", brand: "", category: "", price: "", stockStatus: "in_stock", quantityAvailable: "", leadTimeHours: "" })
  const csvRef = useRef<HTMLInputElement>(null)
  const [csvRows, setCsvRows] = useState<VendorCsvRow[] | null>(null)
  const [csvIssues, setCsvIssues] = useState<VendorCsvIssue[]>([])
  const [importResult, setImportResult] = useState<string | null>(null)

  // profile form
  const [profForm, setProfForm] = useState<{
    phone: string; email: string; city: string; region: string; categories: string
    payoutMethod: "momo" | "bank"; payoutDetails: string
    deliveryZones: { region: string; city: string; fee: string; etaHours: string }[]
  }>({
    phone: "", email: "", city: "", region: "", categories: "",
    payoutMethod: "momo", payoutDetails: "",
    deliveryZones: [],
  })

  function submitSignup(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await vendorSignup({
        businessName: signup.businessName, phone: signup.phone,
        email: signup.email || undefined, city: signup.city || undefined, region: signup.region || undefined,
        categories: signup.categories.split(",").map((s) => s.trim()).filter(Boolean),
        deliveryZones: [],
        payoutMethod: signup.payoutMethod, payoutDetails: signup.payoutDetails || undefined,
      })
      if (!res.ok) { setMsg(res.error.message); return }
      setMsg("Application submitted — awaiting platform approval")
      router.refresh()
    })
  }

  function submitProduct(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await upsertVendorProduct({
        productId: pForm.productId || undefined,
        sku: pForm.sku, name: pForm.name, brand: pForm.brand || undefined,
        category: pForm.category, price: parseFloat(pForm.price || "0"),
        stockStatus: pForm.stockStatus as never,
        quantityAvailable: pForm.quantityAvailable ? parseInt(pForm.quantityAvailable, 10) : undefined,
        leadTimeHours: pForm.leadTimeHours ? parseInt(pForm.leadTimeHours, 10) : undefined,
      })
      if (!res.ok) { setMsg(res.error.message); return }
      setMsg(null); setShowProduct(false)
      setPForm({ productId: "", sku: "", name: "", brand: "", category: "", price: "", stockStatus: "in_stock", quantityAvailable: "", leadTimeHours: "" })
      router.refresh()
    })
  }

  function openProduct(p: Product) {
    setPForm({
      productId: p.id, sku: p.sku, name: p.name, brand: p.brand ?? "", category: p.category,
      price: String(p.price), stockStatus: p.stockStatus ?? "in_stock",
      quantityAvailable: p.quantityAvailable != null ? String(p.quantityAvailable) : "",
      leadTimeHours: p.leadTimeHours != null ? String(p.leadTimeHours) : "",
    })
    setShowProduct(true)
  }

  function onCsvFile(f: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const { rows, issues } = parseVendorProductsCsv(String(reader.result ?? ""))
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
        const res = await importVendorProductsCsv({ csvText: String(reader.result ?? "") })
        if (!res.ok) { setMsg(res.error.message); return }
        setImportResult(`Imported ${res.data.inserted} new, updated ${res.data.updated}, ${res.data.issues.length} issues`)
        setCsvRows(null); setCsvIssues([])
        if (csvRef.current) csvRef.current.value = ""
        router.refresh()
      })
    }
    reader.readAsText(raw)
  }

  function fulfil(orderId: string, action: string) {
    startTransition(async () => {
      const res = await fulfilVendorOrder({ orderId, action: action as never })
      if (!res.ok) { setMsg(res.error.message); return }
      setMsg(null); router.refresh()
    })
  }

  function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await updateVendorProfile({
        phone: profForm.phone || undefined, email: profForm.email || undefined,
        city: profForm.city || undefined, region: profForm.region || undefined,
        categories: profForm.categories.split(",").map((s) => s.trim()).filter(Boolean),
        payoutMethod: profForm.payoutMethod, payoutDetails: profForm.payoutDetails || undefined,
        deliveryZones: profForm.deliveryZones
          .filter((z) => z.region.trim())
          .map((z) => ({
            region: z.region.trim(),
            city: z.city.trim() || undefined,
            fee: parseFloat(z.fee || "0") || 0,
            etaHours: parseInt(z.etaHours || "0", 10) || undefined,
          })),
      })
      if (!res.ok) { setMsg(res.error.message); return }
      setMsg("Profile saved"); router.refresh()
    })
  }

  // ---------- no vendor account → signup ----------
  if (!dashboard) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-bold">Become a FixAm vendor</h1>
        <p className="text-muted-foreground">Sell parts to garages across Ghana. Applications are reviewed by the FixAm team.</p>
        {msg && <p className="rounded-lg bg-info/10 px-3 py-2 text-sm">{msg}</p>}
        <Card className="max-w-xl">
          <CardContent className="p-5">
            <form onSubmit={submitSignup} className="space-y-3">
              <input value={signup.businessName} onChange={(e) => setSignup({ ...signup, businessName: e.target.value })} placeholder="Business name *" className={inputCls} required />
              <div className="grid grid-cols-2 gap-3">
                <input value={signup.phone} onChange={(e) => setSignup({ ...signup, phone: e.target.value })} placeholder="Phone *" className={inputCls} required />
                <input value={signup.email} onChange={(e) => setSignup({ ...signup, email: e.target.value })} placeholder="Email" type="email" className={inputCls} />
                <input value={signup.city} onChange={(e) => setSignup({ ...signup, city: e.target.value })} placeholder="City" className={inputCls} />
                <input value={signup.region} onChange={(e) => setSignup({ ...signup, region: e.target.value })} placeholder="Region" className={inputCls} />
              </div>
              <input value={signup.categories} onChange={(e) => setSignup({ ...signup, categories: e.target.value })} placeholder="Categories (comma separated, e.g. Tyres, Oils, Parts)" className={inputCls} />
              <div className="grid grid-cols-2 gap-3">
                <select value={signup.payoutMethod} onChange={(e) => setSignup({ ...signup, payoutMethod: e.target.value as "momo" | "bank" })} className={inputCls}>
                  <option value="momo">MoMo payout</option>
                  <option value="bank">Bank transfer</option>
                </select>
                <input value={signup.payoutDetails} onChange={(e) => setSignup({ ...signup, payoutDetails: e.target.value })} placeholder="Payout number / account" className={inputCls} />
              </div>
              <Button type="submit" disabled={pending} className="w-full">Submit application</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  const v = dashboard.vendor
  const pendingApproval = v.status !== "approved"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">{v.businessName}</h1>
          <p className="text-sm text-muted-foreground">
            {v.city ?? ""}{v.region ? `, ${v.region}` : ""} · ★ {v.ratingAvg ?? "—"} ({v.ratingCount ?? 0} reviews)
            {pendingApproval && <StatusPill status={v.status} tone={statusTone(v.status)} className="ml-2">{v.status}</StatusPill>}
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <div><p className="text-xs text-muted-foreground">Sales</p><p className="font-bold tabular-nums">{formatGHS(dashboard.salesTotal)}</p></div>
          <div><p className="text-xs text-muted-foreground">Commission</p><p className="font-bold tabular-nums">{formatGHS(dashboard.commissionTotal)}</p></div>
          <div><p className="text-xs text-muted-foreground">Products</p><p className="font-bold tabular-nums">{dashboard.productCount}</p></div>
          <div><p className="text-xs text-muted-foreground">Orders</p><p className="font-bold tabular-nums">{dashboard.orders.length}</p></div>
        </div>
      </div>

      {pendingApproval && (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm">Your account is {v.status} — you won&rsquo;t appear in the marketplace until approved.</p>
      )}
      {msg && <p className="rounded-lg bg-info/10 px-3 py-2 text-sm">{msg}</p>}

      <div className="flex gap-2">
        {(["orders", "products", "profile", ...(dashboard.canPayouts ? (["payouts"] as const) : [])] as const).map((t) => (
          <button key={t} onClick={() => {
            setTab(t)
            if (t === "profile" && dashboard) {
              setProfForm({
                phone: v.phone ?? "", email: v.email ?? "", city: v.city ?? "", region: v.region ?? "",
                categories: (v.categories ?? []).join(", "),
                payoutMethod: (v.payoutMethod === "bank" ? "bank" : "momo") as "momo" | "bank",
                payoutDetails: "",
                deliveryZones: (((v.deliveryZones ?? []) as { region?: string; city?: string; fee?: number; etaHours?: number }[]) ?? []).map((z) => ({
                  region: String(z.region ?? ""), city: String(z.city ?? ""),
                  fee: String(Number(z.fee ?? 0)), etaHours: String(Number(z.etaHours ?? "")),
                })),
              })
            }
          }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "orders" && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Expected</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {dashboard.orders.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No orders yet</td></tr>
                )}
                {dashboard.orders.map((o) => {
                  const next = NEXT_ACTION[o.status]
                  return (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-mono text-xs font-bold">{o.number}</td>
                      <td className="px-4 py-3 capitalize">{o.origin.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatGHS(o.total)}</td>
                      <td className="px-4 py-3 text-xs">{o.expectedDeliveryAt?.slice(0, 10) ?? "—"}</td>
                      <td className="px-4 py-3"><StatusPill status={o.status} tone={statusTone(o.status)} /></td>
                      <td className="px-4 py-3 text-right">
                        {dashboard.canFulfil && next && !pendingApproval && (
                          <Button variant="secondary" className="!min-h-8 px-3 text-xs" disabled={pending}
                            onClick={() => fulfil(o.id, next.action)}>{next.label}</Button>
                        )}
                        {o.status === "placed" && dashboard.canFulfil && !pendingApproval && (
                          <Button variant="ghost" className="!min-h-8 px-2 text-xs text-danger" disabled={pending}
                            onClick={() => fulfil(o.id, "reject")}>Reject</Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {tab === "products" && dashboard.canManage && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold">Catalogue ({products.length})</h2>
            <div className="flex gap-2">
              <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => e.target.files?.[0] && onCsvFile(e.target.files[0])} />
              <Button variant="secondary" onClick={() => csvRef.current?.click()}>Import CSV</Button>
              <Button onClick={() => setShowProduct(!showProduct)}>{showProduct ? "Close" : "Add product"}</Button>
            </div>
          </div>

          {showProduct && (
            <Card>
              <CardContent className="p-4">
                <form onSubmit={submitProduct} className="grid gap-3 sm:grid-cols-3">
                  <input value={pForm.sku} onChange={(e) => setPForm({ ...pForm, sku: e.target.value })} placeholder="SKU *" className={inputCls} required />
                  <input value={pForm.name} onChange={(e) => setPForm({ ...pForm, name: e.target.value })} placeholder="Name *" className={`${inputCls} sm:col-span-2`} required />
                  <input value={pForm.brand} onChange={(e) => setPForm({ ...pForm, brand: e.target.value })} placeholder="Brand" className={inputCls} />
                  <input value={pForm.category} onChange={(e) => setPForm({ ...pForm, category: e.target.value })} placeholder="Category *" className={inputCls} required />
                  <input value={pForm.price} onChange={(e) => setPForm({ ...pForm, price: e.target.value })} placeholder="Price GH₵ *" inputMode="decimal" className={inputCls} required />
                  <select value={pForm.stockStatus} onChange={(e) => setPForm({ ...pForm, stockStatus: e.target.value })} className={inputCls}>
                    {["in_stock", "low", "out", "on_order"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                  </select>
                  <input value={pForm.quantityAvailable} onChange={(e) => setPForm({ ...pForm, quantityAvailable: e.target.value })} placeholder="Qty available" inputMode="numeric" className={inputCls} />
                  <input value={pForm.leadTimeHours} onChange={(e) => setPForm({ ...pForm, leadTimeHours: e.target.value })} placeholder="Lead time (hrs)" inputMode="numeric" className={inputCls} />
                  <div className="flex gap-2 sm:col-span-3">
                    <Button type="submit" disabled={pending}>{pForm.productId ? "Save" : "Add"}</Button>
                    <Button type="button" variant="secondary" onClick={() => setShowProduct(false)}>Cancel</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {csvRows && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium">{csvRows.length} valid rows{csvIssues.length > 0 ? `, ${csvIssues.length} issues` : ""}</p>
                {csvIssues.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-auto rounded-lg border border-danger/40 p-2 text-xs">
                    {csvIssues.map((i, idx) => <p key={idx} className="text-danger">Row {i.row}: {i.message}</p>)}
                  </div>
                )}
                <Button className="mt-2" onClick={commitImport} disabled={pending || csvRows.length === 0}>Import {csvRows.length} products</Button>
              </CardContent>
            </Card>
          )}
          {importResult && <p className="text-sm text-success">{importResult}</p>}

          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3">Stock</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No products yet</td></tr>}
                  {products.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-4 py-3"><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.brand ?? ""}</p></td>
                      <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
                      <td className="px-4 py-3">{p.category}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatGHS(p.price)}</td>
                      <td className="px-4 py-3 text-xs capitalize">{p.stockStatus?.replace(/_/g, " ") ?? "—"}{p.quantityAvailable != null ? ` · ${p.quantityAvailable}` : ""}</td>
                      <td className="px-4 py-3 text-right"><Button variant="ghost" className="!min-h-8 px-2 text-xs" onClick={() => openProduct(p)}>Edit</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "payouts" && dashboard.canPayouts && (() => {
        const paidOrders = dashboard.orders.filter((o) => o.status === "delivered" || o.status === "received")
        const earnings = paidOrders.reduce((s, o) => s + o.subtotal - o.commissionAmount, 0)
        const pending = dashboard.orders.filter((o) => !["delivered", "received", "cancelled", "rejected", "returned"].includes(o.status))
          .reduce((s, o) => s + o.subtotal - o.commissionAmount, 0)
        return (
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Paid out / payable</p>
              <p className="font-display text-xl font-bold tabular-nums">{formatGHS(earnings)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">In transit</p>
              <p className="font-display text-xl font-bold tabular-nums">{formatGHS(pending)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Payout method</p>
              <p className="font-bold capitalize">{v.payoutMethod ?? "Not set"}</p>
              <p className="mt-1 text-xs text-muted-foreground">Payouts are released after orders are marked received. Update details in Profile.</p>
            </CardContent></Card>
          </div>
        )
      })()}

      {tab === "profile" && dashboard.canSettings && (
        <Card className="max-w-xl">
          <CardContent className="p-5">
            <h2 className="font-display text-lg font-bold">Business profile & payouts</h2>
            <form onSubmit={saveProfile} className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input value={profForm.phone} onChange={(e) => setProfForm({ ...profForm, phone: e.target.value })} placeholder="Phone" className={inputCls} />
                <input value={profForm.email} onChange={(e) => setProfForm({ ...profForm, email: e.target.value })} placeholder="Email" className={inputCls} />
                <input value={profForm.city} onChange={(e) => setProfForm({ ...profForm, city: e.target.value })} placeholder="City" className={inputCls} />
                <input value={profForm.region} onChange={(e) => setProfForm({ ...profForm, region: e.target.value })} placeholder="Region" className={inputCls} />
              </div>
              <input value={profForm.categories} onChange={(e) => setProfForm({ ...profForm, categories: e.target.value })} placeholder="Categories (comma separated)" className={inputCls} />
              <div className="grid grid-cols-2 gap-3">
                <select value={profForm.payoutMethod} onChange={(e) => setProfForm({ ...profForm, payoutMethod: e.target.value as "momo" | "bank" })} className={inputCls}>
                  <option value="momo">MoMo payout</option>
                  <option value="bank">Bank transfer</option>
                </select>
                <input value={profForm.payoutDetails} onChange={(e) => setProfForm({ ...profForm, payoutDetails: e.target.value })} placeholder="Payout number / account" className={inputCls} />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery zones</label>
                  <Button type="button" variant="secondary" className="!min-h-7 px-2 text-xs"
                    onClick={() => setProfForm({ ...profForm, deliveryZones: [...profForm.deliveryZones, { region: "", city: "", fee: "", etaHours: "" }] })}>
                    + Add zone
                  </Button>
                </div>
                {profForm.deliveryZones.length === 0 && (
                  <p className="text-xs text-muted-foreground">No zones — garages can&rsquo;t filter you by region until you add at least one.</p>
                )}
                {profForm.deliveryZones.map((z, i) => (
                  <div key={i} className="mb-2 grid grid-cols-12 gap-2">
                    <input value={z.region} onChange={(e) => setProfForm({ ...profForm, deliveryZones: profForm.deliveryZones.map((zz, j) => j === i ? { ...zz, region: e.target.value } : zz) })} placeholder="Region *" className={`${inputCls} col-span-4`} />
                    <input value={z.city} onChange={(e) => setProfForm({ ...profForm, deliveryZones: profForm.deliveryZones.map((zz, j) => j === i ? { ...zz, city: e.target.value } : zz) })} placeholder="City (optional)" className={`${inputCls} col-span-3`} />
                    <input value={z.fee} onChange={(e) => setProfForm({ ...profForm, deliveryZones: profForm.deliveryZones.map((zz, j) => j === i ? { ...zz, fee: e.target.value } : zz) })} placeholder="Delivery fee GH₵" inputMode="decimal" className={`${inputCls} col-span-2`} />
                    <input value={z.etaHours} onChange={(e) => setProfForm({ ...profForm, deliveryZones: profForm.deliveryZones.map((zz, j) => j === i ? { ...zz, etaHours: e.target.value } : zz) })} placeholder="ETA hrs" inputMode="numeric" className={`${inputCls} col-span-2`} />
                    <Button type="button" variant="ghost" className="!min-h-10 col-span-1 px-1 text-danger"
                      onClick={() => setProfForm({ ...profForm, deliveryZones: profForm.deliveryZones.filter((_, j) => j !== i) })}>×</Button>
                  </div>
                ))}
              </div>
              <Button type="submit" disabled={pending}>Save profile</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
