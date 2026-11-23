"use client"

import { Fragment, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill, statusTone } from "@/components/brand/status-pill"
import { StatTile } from "@/components/brand/stat-tile"
import { Package, ShoppingBag, Star, Wallet } from "lucide-react"
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
import { getVendorDeliveryPin } from "@/lib/riders/actions"
import type { PartTypeView } from "@/lib/parts-catalog/actions"
import type { VendorPayoutsView } from "@/lib/escrow/actions"
import { VendorPayouts } from "./vendor-payouts"

type Dash = NonNullable<Extract<Awaited<ReturnType<typeof getVendorDashboard>>, { ok: true; data: object }>["data"]>
type Product = {
  id: string; sku: string; name: string; brand: string | null; category: string
  price: number; stockStatus: string | null; quantityAvailable: number | null
  minOrderQty: number | null; leadTimeHours: number | null; isActive: boolean | null
  partTypeId?: string | null; condition?: string | null; fitMake?: string | null; fitModel?: string | null
  fitYearFrom?: number | null; fitYearTo?: number | null; oemNumber?: string | null; warrantyDays?: number | null
}

const CONDITION_LABEL: Record<string, string> = { genuine: "Genuine", aftermarket: "Aftermarket", home_used: "Home-used" }
const CONDITION_TINT: Record<string, string> = {
  genuine: "bg-[#EEF8D6] text-[#4E6B07]",
  aftermarket: "bg-[#E6F4FF] text-[#0B5CAD]",
  home_used: "bg-[#FFF3E0] text-[#8A5300]",
}
const EMPTY_PRODUCT = {
  productId: "", sku: "", name: "", brand: "", category: "", price: "", stockStatus: "in_stock", quantityAvailable: "", leadTimeHours: "",
  partTypeId: "", condition: "aftermarket", fitMake: "", fitModel: "", fitYearFrom: "", fitYearTo: "", oemNumber: "", warrantyDays: "",
}
const fitLabel = (p: Product) => {
  if (!p.fitMake) return "Fits most cars"
  const years = p.fitYearFrom || p.fitYearTo ? ` ${p.fitYearFrom ?? "…"}–${p.fitYearTo ?? "…"}` : ""
  return `${p.fitMake}${p.fitModel ? ` ${p.fitModel}` : ""}${years}`
}

const inputCls = "min-h-11 w-full rounded-xl border border-input bg-card px-3.5 text-sm outline-none transition-shadow placeholder:text-[#8C857B] focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

const NEXT_ACTION: Record<string, { label: string; action: string } | null> = {
  placed: { label: "Accept order", action: "accept" },
  accepted: { label: "Mark packed", action: "packed" },
  packed: { label: "Out for delivery", action: "out_for_delivery" },
  out_for_delivery: { label: "Mark delivered", action: "delivered" },
  cancelled: null,
  delivered: null,
  received: null,
  rejected: null,
}

/** Shows the pickup PIN the FixAm rider must quote to collect the parcel. */
function PickupPin({ orderId }: { orderId: string }) {
  const [pin, setPin] = useState<string | null | undefined>(undefined)
  const [busy, start] = useTransition()
  if (pin != null) {
    return pin ? (
      <div className="text-xs font-semibold text-foreground">Pickup PIN: <span className="font-mono tracking-[0.3em]">{pin}</span> — give it to the rider</div>
    ) : (
      <div className="text-xs text-muted-foreground">No active rider yet — PIN appears once one accepts.</div>
    )
  }
  return (
    <button type="button" disabled={busy} className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
      onClick={() => start(async () => {
        const res = await getVendorDeliveryPin({ orderId })
        setPin(res.ok ? res.pin : null)
      })}>
      Show pickup PIN
    </button>
  )
}

export function VendorPanel(props: { dashboard: Dash | null; products: Product[]; partTypes?: PartTypeView[]; payouts?: VendorPayoutsView | null }) {
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
  const [pForm, setPForm] = useState(EMPTY_PRODUCT)
  const partTypes = props.partTypes ?? []
  const typeById = new Map(partTypes.map((t) => [t.id, t]))
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
        partTypeId: pForm.partTypeId || null,
        condition: (pForm.condition || null) as never,
        fitMake: pForm.fitMake || null,
        fitModel: pForm.fitModel || null,
        fitYearFrom: pForm.fitYearFrom ? parseInt(pForm.fitYearFrom, 10) : null,
        fitYearTo: pForm.fitYearTo ? parseInt(pForm.fitYearTo, 10) : null,
        oemNumber: pForm.oemNumber || null,
        warrantyDays: pForm.warrantyDays ? parseInt(pForm.warrantyDays, 10) : null,
      })
      if (!res.ok) { setMsg(res.error.message); return }
      setMsg(null); setShowProduct(false)
      setPForm(EMPTY_PRODUCT)
      router.refresh()
    })
  }

  function openProduct(p: Product) {
    setPForm({
      productId: p.id, sku: p.sku, name: p.name, brand: p.brand ?? "", category: p.category,
      price: String(p.price), stockStatus: p.stockStatus ?? "in_stock",
      quantityAvailable: p.quantityAvailable != null ? String(p.quantityAvailable) : "",
      leadTimeHours: p.leadTimeHours != null ? String(p.leadTimeHours) : "",
      partTypeId: p.partTypeId ?? "", condition: p.condition ?? "",
      fitMake: p.fitMake ?? "", fitModel: p.fitModel ?? "",
      fitYearFrom: p.fitYearFrom != null ? String(p.fitYearFrom) : "",
      fitYearTo: p.fitYearTo != null ? String(p.fitYearTo) : "",
      oemNumber: p.oemNumber ?? "", warrantyDays: p.warrantyDays != null ? String(p.warrantyDays) : "",
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

  const [dispatch, setDispatch] = useState<{ orderId: string; riderName: string; riderPhone: string } | null>(null)

  function fulfil(orderId: string, action: string, extra?: { courier?: "vendor" | "partner" | "fixam_rider"; riderName?: string; riderPhone?: string }) {
    startTransition(async () => {
      const res = await fulfilVendorOrder({ orderId, action: action as never, ...extra })
      if (!res.ok) { setMsg(res.error.message); return }
      setMsg(null); setDispatch(null); router.refresh()
    })
  }

  function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await updateVendorProfile({
        phone: profForm.phone || undefined, email: profForm.email || undefined,
        city: profForm.city || undefined, region: profForm.region || undefined,
        categories: profForm.categories.split(",").map((s) => s.trim()).filter(Boolean),
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
        {msg && <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm">{msg}</p>}
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {[v.city, v.region].filter(Boolean).join(", ") || "Parts shop"}
          </p>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 font-display text-[30px] font-bold leading-tight tracking-[-0.03em]">
            {v.businessName}
            {pendingApproval && <StatusPill status={v.status} tone={statusTone(v.status)}>{v.status === "pending" ? "Awaiting approval" : v.status}</StatusPill>}
            {v.isVerified && !pendingApproval && (
              <span className="rounded-full bg-[#EEF8D6] px-2.5 py-1 text-xs font-semibold text-[#4E6B07]">Verified seller</span>
            )}
          </h1>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Sales" value={formatGHS(dashboard.salesTotal)} icon={<Wallet />} hint={`Commission ${formatGHS(dashboard.commissionTotal)}`} />
        <StatTile label="Orders" value={dashboard.orders.length} icon={<ShoppingBag />} hint={`${dashboard.orders.filter((o) => o.status === "placed").length} waiting to accept`} />
        <StatTile label="Active products" value={dashboard.productCount} icon={<Package />} hint="Visible in the marketplace" />
        <StatTile label="Rating" value={v.ratingAvg != null ? v.ratingAvg.toFixed(1) : "—"} icon={<Star />} hint={`${v.ratingCount ?? 0} reviews`} />
      </div>

      {pendingApproval && (
        <p className="rounded-[18px] border border-[#F3D9A4] bg-[#FFF7E6] px-5 py-4 text-sm text-[#6B5320] dark:border-[#FFB020]/30 dark:bg-[#FFB020]/10 dark:text-[#FFD27A]"><span className="font-semibold">Your shop is being reviewed.</span> Add your products now — they go live in the marketplace as soon as FixAm approves you (usually within a day).</p>
      )}
      {msg && <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm">{msg}</p>}

      <div className="flex flex-wrap gap-1.5">
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
            className={`inline-flex h-9 items-center rounded-full border px-4 text-sm capitalize transition-colors ${tab === t ? "border-foreground bg-foreground font-medium text-background" : "border-border bg-card hover:border-border-strong"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "orders" && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left bg-surface-muted/50 text-xs font-medium text-muted-foreground">
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
                  const isPickup = o.destinationType === "pickup"
                  const base = NEXT_ACTION[o.status]
                  const next = base && isPickup && base.action === "out_for_delivery" ? { label: "Ready for pickup", action: "out_for_delivery" }
                    : base && isPickup && base.action === "delivered" ? { label: "Picked up", action: "delivered" } : base
                  const needsRider = next?.action === "out_for_delivery" && !isPickup
                  return (
                    <Fragment key={o.id}>
                    <tr className="border-b last:border-0">
                      <td className="px-4 py-3 font-mono text-xs font-semibold">{o.number}</td>
                      <td className="px-4 py-3">
                        <div className="capitalize">{o.origin.replace(/_/g, " ")}</div>
                        <div className="text-xs text-muted-foreground">
                          {o.destinationType === "garage" ? `→ ${o.garageName ?? "garage"}` : o.destinationType === "home" ? `→ ${o.deliveryAddress ?? "customer"}${o.deliveryCity ? `, ${o.deliveryCity}` : ""}` : "Customer picks up"}
                          {o.buyerPhone ? ` · ${o.buyerPhone}` : ""}
                        </div>
                        {(o.riderName || o.courierReference) && (
                          <div className="text-xs text-muted-foreground">{o.courier === "partner" ? "Partner courier" : o.courier === "fixam_rider" ? "FixAm rider" : "Rider"}: {o.riderName ?? o.courierReference}{o.riderPhone ? ` · ${o.riderPhone}` : ""}</div>
                        )}
                        {o.courier === "fixam_rider" && (o.status === "out_for_delivery") && <PickupPin orderId={o.id} />}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatGHS(o.total)}</td>
                      <td className="px-4 py-3 text-xs">{o.expectedDeliveryAt?.slice(0, 10) ?? "—"}</td>
                      <td className="px-4 py-3"><StatusPill status={o.status} tone={statusTone(o.status)} /></td>
                      <td className="px-4 py-3 text-right">
                        {dashboard.canFulfil && next && !pendingApproval && (
                          <Button variant="secondary" className="!min-h-8 px-3 text-xs" disabled={pending}
                            onClick={() => needsRider ? setDispatch({ orderId: o.id, riderName: "", riderPhone: "" }) : fulfil(o.id, next.action)}>{next.label}</Button>
                        )}
                        {o.status === "placed" && dashboard.canFulfil && !pendingApproval && (
                          <Button variant="ghost" className="!min-h-8 px-2 text-xs text-danger" disabled={pending}
                            onClick={() => fulfil(o.id, "reject")}>Reject</Button>
                        )}
                      </td>
                    </tr>
                    {dispatch?.orderId === o.id && (
                      <tr className="border-b bg-surface-muted/40">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="flex flex-wrap items-end gap-2">
                            <label className="text-xs">
                              <span className="mb-1 block font-semibold text-muted-foreground">Rider name</span>
                              <input value={dispatch.riderName} onChange={(e) => setDispatch({ ...dispatch, riderName: e.target.value })} className={`${inputCls} !min-h-9 w-44`} placeholder="Kojo" />
                            </label>
                            <label className="text-xs">
                              <span className="mb-1 block font-semibold text-muted-foreground">Rider phone</span>
                              <input value={dispatch.riderPhone} onChange={(e) => setDispatch({ ...dispatch, riderPhone: e.target.value })} className={`${inputCls} !min-h-9 w-40`} placeholder="024 000 0000" inputMode="tel" />
                            </label>
                            <Button className="!min-h-9 px-3 text-xs" disabled={pending || !dispatch.riderName.trim() || !dispatch.riderPhone.trim()}
                              onClick={() => fulfil(o.id, "out_for_delivery", { courier: "vendor", riderName: dispatch.riderName, riderPhone: dispatch.riderPhone })}>Send with my rider</Button>
                            <Button variant="secondary" className="!min-h-9 px-3 text-xs" disabled={pending}
                              onClick={() => fulfil(o.id, "out_for_delivery", { courier: "fixam_rider" })}>Send with a FixAm rider</Button>
                            <Button variant="secondary" className="!min-h-9 px-3 text-xs" disabled={pending}
                              onClick={() => fulfil(o.id, "out_for_delivery", { courier: "partner" })}>No rider free — book FixAm courier</Button>
                            <Button variant="ghost" className="!min-h-9 px-2 text-xs" onClick={() => setDispatch(null)}>Cancel</Button>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
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
                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground">Part type (FixAm standard list) — helps garages find you</span>
                    <select
                      value={pForm.partTypeId}
                      onChange={(e) => {
                        const t = typeById.get(e.target.value)
                        setPForm({ ...pForm, partTypeId: e.target.value, category: pForm.category || t?.category || "" })
                      }}
                      className={inputCls}
                    >
                      <option value="">— Choose a part type —</option>
                      {[...new Set(partTypes.map((t) => t.category))].map((cat) => (
                        <optgroup key={cat} label={cat}>
                          {partTypes.filter((t) => t.category === cat).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">Condition</span>
                    <select value={pForm.condition} onChange={(e) => setPForm({ ...pForm, condition: e.target.value })} className={inputCls}>
                      <option value="genuine">Genuine (OEM)</option>
                      <option value="aftermarket">Aftermarket (new)</option>
                      <option value="home_used">Home-used</option>
                    </select>
                  </label>
                  <input value={pForm.brand} onChange={(e) => setPForm({ ...pForm, brand: e.target.value })} placeholder="Brand" className={inputCls} />
                  <input value={pForm.category} onChange={(e) => setPForm({ ...pForm, category: e.target.value })} placeholder="Category *" className={inputCls} required />
                  <input value={pForm.price} onChange={(e) => setPForm({ ...pForm, price: e.target.value })} placeholder="Price GH₵ *" inputMode="decimal" className={inputCls} required />
                  <select value={pForm.stockStatus} onChange={(e) => setPForm({ ...pForm, stockStatus: e.target.value })} className={inputCls}>
                    {["in_stock", "low", "out", "on_order"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                  </select>
                  <input value={pForm.quantityAvailable} onChange={(e) => setPForm({ ...pForm, quantityAvailable: e.target.value })} placeholder="Qty available" inputMode="numeric" className={inputCls} />
                  <input value={pForm.leadTimeHours} onChange={(e) => setPForm({ ...pForm, leadTimeHours: e.target.value })} placeholder="Lead time (hrs)" inputMode="numeric" className={inputCls} />
                  <div className="space-y-1 sm:col-span-3">
                    <span className="text-xs font-medium text-muted-foreground">Fits (leave blank if it fits most cars)</span>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <input value={pForm.fitMake} onChange={(e) => setPForm({ ...pForm, fitMake: e.target.value })} placeholder="Make, e.g. Toyota" className={inputCls} />
                      <input value={pForm.fitModel} onChange={(e) => setPForm({ ...pForm, fitModel: e.target.value })} placeholder="Model, e.g. Corolla" className={inputCls} />
                      <input value={pForm.fitYearFrom} onChange={(e) => setPForm({ ...pForm, fitYearFrom: e.target.value.replace(/\D/g, "") })} placeholder="Year from" inputMode="numeric" maxLength={4} className={inputCls} />
                      <input value={pForm.fitYearTo} onChange={(e) => setPForm({ ...pForm, fitYearTo: e.target.value.replace(/\D/g, "") })} placeholder="Year to" inputMode="numeric" maxLength={4} className={inputCls} />
                    </div>
                  </div>
                  <input value={pForm.oemNumber} onChange={(e) => setPForm({ ...pForm, oemNumber: e.target.value })} placeholder="OEM / part number" className={inputCls} />
                  <input value={pForm.warrantyDays} onChange={(e) => setPForm({ ...pForm, warrantyDays: e.target.value.replace(/\D/g, "") })} placeholder="Warranty (days)" inputMode="numeric" className={inputCls} />
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
                  <tr className="border-b text-left bg-surface-muted/50 text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Part type</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3">Stock</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No products yet</td></tr>}
                  {products.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <p className="flex flex-wrap items-center gap-1.5 font-medium">
                          {p.name}
                          {p.condition && (
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CONDITION_TINT[p.condition] ?? "bg-muted"}`}>{CONDITION_LABEL[p.condition] ?? p.condition}</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{[p.brand, fitLabel(p)].filter(Boolean).join(" · ")}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
                      <td className="px-4 py-3">
                        {p.partTypeId && typeById.get(p.partTypeId) ? (
                          typeById.get(p.partTypeId)!.name
                        ) : (
                          <span className="text-xs font-medium text-[#B8390A]">Not linked — garages won&apos;t find it</span>
                        )}
                      </td>
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

      {tab === "payouts" && dashboard.canPayouts && (
        <VendorPayouts view={props.payouts ?? null} isOwner={dashboard.role === "vendor_owner"} />
      )}

      {tab === "profile" && dashboard.canSettings && (
        <Card className="max-w-xl">
          <CardContent className="p-5">
            <h2 className="font-display text-lg font-bold">Business profile</h2>
            <form onSubmit={saveProfile} className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input value={profForm.phone} onChange={(e) => setProfForm({ ...profForm, phone: e.target.value })} placeholder="Phone" className={inputCls} />
                <input value={profForm.email} onChange={(e) => setProfForm({ ...profForm, email: e.target.value })} placeholder="Email" className={inputCls} />
                <input value={profForm.city} onChange={(e) => setProfForm({ ...profForm, city: e.target.value })} placeholder="City" className={inputCls} />
                <input value={profForm.region} onChange={(e) => setProfForm({ ...profForm, region: e.target.value })} placeholder="Region" className={inputCls} />
              </div>
              <input value={profForm.categories} onChange={(e) => setProfForm({ ...profForm, categories: e.target.value })} placeholder="Categories (comma separated)" className={inputCls} />
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
