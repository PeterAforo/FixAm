"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill, statusTone } from "@/components/brand/status-pill"
import { formatGHS } from "@/lib/money"
import {
  createVendorOrder,
  getVendorOrderDetail,
  receiveVendorOrder,
  reviewVendorOrder,
  verifyVendorOrderPayment,
} from "@/lib/marketplace/actions"
import { disputeVendorOrder } from "@/lib/escrow/actions"

type Product = {
  id: string; sku: string; name: string; brand: string | null; category: string
  unit: string; price: number; stockStatus: string | null
  quantityAvailable: number | null; minOrderQty: number | null
  leadTimeHours: number | null; vendorId: string; vendorName: string
  vendorRating: number | null; vendorRatingCount: number | null
  vendorCity: string | null; vendorRegion: string | null
  vendorVerified: boolean | null
  compatibleVehicles: unknown
  zone: { region?: string; city?: string; fee?: number; etaHours?: number } | null
}

type OrderRow = {
  id: string; number: string; status: string; origin: string
  total: number; subtotal: number; deliveryFee: number
  paymentStatus: string | null
  expectedDeliveryAt: string | null; deliveredAt: string | null
  createdAt: string; vendorName: string; jobId: string | null; branchName: string | null
}

type OrderDetail = NonNullable<Extract<Awaited<ReturnType<typeof getVendorOrderDetail>>, { ok: true; data: object }>["data"]>

const inputCls = "min-h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

export function MarketplacePanel(props: {
  garageId: string
  garageSlug: string
  branches: { id: string; name: string }[]
  products: Product[]
  garageLocation: { region: string | null; city: string | null }
  orders: OrderRow[]
  canOrder: boolean
  canReceive: boolean
  initialQ: string
  initialTab: "shop" | "orders"
  paymentNotice?: "success" | "pending" | "failed" | null
}) {
  const { garageId, garageSlug, branches, products, garageLocation, orders, canOrder, canReceive } = props
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [tab, setTab] = useState<"shop" | "orders">(props.initialTab)
  const [q, setQ] = useState(props.initialQ)
  const [cart, setCart] = useState<Map<string, { product: Product; qty: number }>>(new Map())
  const [showCart, setShowCart] = useState(false)
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "")
  const [payNow, setPayNow] = useState(false)
  const [msg, setMsg] = useState<string | null>(
    props.paymentNotice === "success"
      ? "Payment received. FixAm holds it safely and pays the vendor once you receive the parts."
      : props.paymentNotice === "pending"
        ? "We're still waiting for the payment to confirm — this page updates within a few minutes."
        : props.paymentNotice === "failed"
          ? "The payment didn't go through. Open the order and try again, or pay on delivery."
          : null
  )
  const [disputeText, setDisputeText] = useState<string | null>(null)

  const [openOrder, setOpenOrder] = useState<string | null>(null)
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [review, setReview] = useState({ rating: 5, comment: "" })

  const cartCount = [...cart.values()].reduce((s, c) => s + c.qty, 0)
  const cartSubtotal = [...cart.values()].reduce((s, c) => s + c.qty * c.product.price, 0)
  const cartFees = [...new Set([...cart.values()].map((c) => c.product.vendorId))]
    .reduce((s, vid) => s + ([...cart.values()].find((c) => c.product.vendorId === vid)?.product.zone?.fee ?? 0), 0)
  const cartTotal = cartSubtotal + cartFees

  const groupedProducts = useMemo(() => {
    const map = new Map<string, { vendor: string; rating: number | null; verified: boolean; items: Product[] }>()
    for (const p of products) {
      const g = map.get(p.vendorId) ?? { vendor: p.vendorName, rating: p.vendorRating, verified: p.vendorVerified === true, items: [] }
      g.items.push(p)
      map.set(p.vendorId, g)
    }
    return [...map.values()].sort((a, b) => Number(b.verified) - Number(a.verified))
  }, [products])

  function addToCart(p: Product) {
    setCart((prev) => {
      const next = new Map(prev)
      const cur = next.get(p.id)
      next.set(p.id, { product: p, qty: Math.min((cur?.qty ?? 0) + (p.minOrderQty ?? 1), 999) })
      return next
    })
  }
  function setQty(id: string, qty: number) {
    setCart((prev) => {
      const next = new Map(prev)
      if (qty <= 0) next.delete(id)
      else next.set(id, { ...next.get(id)!, qty })
      return next
    })
  }

  function search(e: React.FormEvent) {
    e.preventDefault()
    router.push(`/g/${garageSlug}/marketplace?q=${encodeURIComponent(q)}`)
  }

  function checkout() {
    if (!branchId || cart.size === 0) return
    startTransition(async () => {
      const res = await createVendorOrder({
        garageId, branchId,
        items: [...cart.values()].map((c) => ({ productId: c.product.id, quantity: c.qty })),
        payNow,
      })
      if (!res.ok) { setMsg(res.error.message); return }
      setMsg(`Order placed: ${res.data.orders.map((o) => o.number).join(", ")}`)
      if (res.data.checkoutUrl) {
        window.location.href = res.data.checkoutUrl
        return
      }
      setCart(new Map()); setShowCart(false)
      router.refresh()
    })
  }

  function toggleOrder(id: string) {
    if (openOrder === id) { setOpenOrder(null); setDetail(null); return }
    setOpenOrder(id); setDetail(null)
    startTransition(async () => {
      const res = await getVendorOrderDetail({ garageId, orderId: id })
      if (res.ok) setDetail(res.data)
    })
  }

  function act(fn: () => Promise<{ ok: boolean; error?: { message: string } }>, okMsg?: string) {
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) { setMsg(res.error?.message ?? "Failed"); return }
      setMsg(okMsg ?? null)
      if (openOrder) {
        const d = await getVendorOrderDetail({ garageId, orderId: openOrder })
        if (d.ok) setDetail(d.data)
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em]">Marketplace</h1>
          <p className="text-sm text-muted-foreground">
            Parts from approved vendors{garageLocation.region || garageLocation.city
              ? ` delivering to ${[garageLocation.city, garageLocation.region].filter(Boolean).join(", ")}`
              : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant={tab === "shop" ? "primary" : "secondary"} onClick={() => setTab("shop")}>Shop</Button>
          <Button variant={tab === "orders" ? "primary" : "secondary"} onClick={() => setTab("orders")}>
            Orders{orders.length > 0 ? ` (${orders.length})` : ""}
          </Button>
          <Button variant="secondary" onClick={() => setShowCart(!showCart)} disabled={cartCount === 0}>
            Cart ({cartCount})
          </Button>
        </div>
      </div>

      {msg && <p className="rounded-lg bg-info/10 px-3 py-2 text-sm">{msg}</p>}

      {showCart && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="text-[15px] font-semibold">Cart — grouped by vendor</h2>
            {[...new Set([...cart.values()].map((c) => c.product.vendorId))].map((vid) => {
              const lines = [...cart.values()].filter((c) => c.product.vendorId === vid)
              const vendor = lines[0]!.product.vendorName
              const sub = lines.reduce((s, c) => s + c.qty * c.product.price, 0)
              const fee = lines[0]!.product.zone?.fee ?? 0
              return (
                <div key={vid} className="rounded-xl border border-border p-3">
                  <p className="text-sm font-semibold">{vendor}</p>
                  {lines.map((c) => (
                    <div key={c.product.id} className="mt-1 flex items-center justify-between text-sm">
                      <span>{c.product.name} × {c.qty}</span>
                      <span className="flex items-center gap-2 tabular-nums">
                        {formatGHS(c.qty * c.product.price)}
                        <button className="text-danger" onClick={() => setQty(c.product.id, 0)}>remove</button>
                      </span>
                    </div>
                  ))}
                  <p className="mt-1 text-xs text-muted-foreground">Subtotal {formatGHS(sub)} + delivery {formatGHS(fee)}</p>
                </div>
              )
            })}
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">Deliver to branch</span>
                <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputCls}>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} />
                Pay now (card / MoMo) — held by FixAm until you receive the parts
              </label>
              <Button onClick={checkout} disabled={pending || !canOrder || !branchId}>
                Place order — {formatGHS(cartTotal)}
              </Button>
            </div>
            {!canOrder && <p className="text-xs text-muted-foreground">You don&apos;t have permission to place orders.</p>}
          </CardContent>
        </Card>
      )}

      {tab === "shop" && (
        <>
          <form onSubmit={search} className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search parts, SKU, brand…" className={inputCls} />
            <Button type="submit" variant="secondary">Search</Button>
          </form>

          {products.length === 0 && (
            <Card><CardContent className="p-10 text-center text-muted-foreground">
              No vendor products deliver to your region yet.
            </CardContent></Card>
          )}

          {groupedProducts.map((g) => (
            <section key={g.vendor}>
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="text-[15px] font-semibold">
                  {g.vendor}
                  {g.verified && (
                    <span className="ml-2 rounded-pill border border-success/40 bg-success/10 px-2 py-0.5 align-middle text-xs font-semibold text-success">
                      Verified
                    </span>
                  )}
                </h2>
                {g.rating != null && <span className="text-xs text-muted-foreground">★ {g.rating.toFixed(1)}</span>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((p) => {
                  const inCart = cart.get(p.id)?.qty ?? 0
                  return (
                    <Card key={p.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold leading-tight">{p.name}</p>
                            <p className="text-xs text-muted-foreground">{[p.brand, p.category].filter(Boolean).join(" · ")}</p>
                          </div>
                          <span className="shrink-0 font-semibold tabular-nums">{formatGHS(p.price)}</span>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {[p.stockStatus?.replace(/_/g, " "), p.quantityAvailable != null ? `${p.quantityAvailable} avail` : null,
                            p.zone?.etaHours ? `ETA ~${p.zone.etaHours}h` : p.leadTimeHours ? `ETA ~${p.leadTimeHours}h` : null,
                            p.zone?.fee ? `delivery ${formatGHS(p.zone.fee)}` : "free delivery",
                            p.vendorCity].filter(Boolean).join(" · ")}
                        </p>
                        {p.compatibleVehicles != null && (
                          <p className="mt-1 text-xs text-muted-foreground">Fits: {JSON.stringify(p.compatibleVehicles).slice(0, 80)}</p>
                        )}
                        <div className="mt-3 flex items-center gap-2">
                          {inCart > 0 && (
            
            <div className="flex items-center gap-1">
                              <button className="h-7 w-7 rounded-lg border border-border text-sm" onClick={() => setQty(p.id, inCart - (p.minOrderQty ?? 1))}>−</button>
                              <span className="w-8 text-center text-sm font-semibold tabular-nums">{inCart}</span>
                              <button className="h-7 w-7 rounded-lg border border-border text-sm" onClick={() => setQty(p.id, inCart + (p.minOrderQty ?? 1))}>+</button>
                            </div>
                          )}
                          <Button variant="secondary" className="!min-h-8 flex-1 text-xs" disabled={!canOrder}
                            onClick={() => addToCart(p)}>
                            {inCart > 0 ? "Add more" : `Add${p.minOrderQty && p.minOrderQty > 1 ? ` (min ${p.minOrderQty})` : ""}`}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </section>
          ))}
        </>
      )}

      {tab === "orders" && (
        <div className="space-y-3">
          {orders.length === 0 && (
            <Card><CardContent className="p-10 text-center text-muted-foreground">No vendor orders yet — find parts in the Shop tab.</CardContent></Card>
          )}
          {orders.map((o) => (
            <Card key={o.id}>
              <CardContent className="p-4">
                <button className="flex w-full flex-wrap items-center justify-between gap-2 text-left" onClick={() => toggleOrder(o.id)}>
                  <div>
                    <p className="font-mono text-sm font-semibold">{o.number}</p>
                    <p className="text-xs text-muted-foreground">{o.vendorName} · {o.branchName ?? ""} · {o.origin.replace(/_/g, " ")}{o.jobId ? " · job-linked" : ""}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums">{formatGHS(o.total)}</span>
                    <StatusPill status={o.status} tone={statusTone(o.status)} />
                    {o.paymentStatus === "pending" && <StatusPill status="unpaid" tone="warning" />}
                  </div>
                </button>

                {openOrder === o.id && (
                  <div className="mt-4 border-t border-border pt-4">
                    {detail === null && <p className="text-sm text-muted-foreground">Loading…</p>}
                    {detail && (
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                          <span>Subtotal {formatGHS(detail.subtotal)}</span>
                          <span>Delivery {formatGHS(detail.deliveryFee)}</span>
                          <span>Total {formatGHS(detail.total)}</span>
                          {detail.expectedDeliveryAt && <span>Expected {detail.expectedDeliveryAt.slice(0, 10)}</span>}
                        </div>

                        {/* tracking timeline */}
                        <ol className="flex flex-wrap gap-2">
                          {["placed", "accepted", "packed", "out_for_delivery", "delivered", "received"].map((s) => {
                            const idx = ["placed", "accepted", "packed", "out_for_delivery", "delivered", "received"].indexOf(detail.status)
                            const sIdx = ["placed", "accepted", "packed", "out_for_delivery", "delivered", "received"].indexOf(s)
                            const ev = detail.events.find((e) => e.status === s)
                            return (
                              <li key={s} className={`rounded-full px-3 py-1 text-xs font-medium ${sIdx <= idx && !["cancelled", "rejected"].includes(detail.status) ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                                {s.replace(/_/g, " ")}{ev ? ` · ${ev.at.slice(5, 10)}` : ""}
                              </li>
                            )
                          })}
                          {["cancelled", "rejected"].includes(detail.status) && (
                            <li className="rounded-full bg-danger/15 px-3 py-1 text-xs font-medium text-danger">{detail.status}</li>
                          )}
                        </ol>

                        <div className="overflow-x-auto"><table className="table-cards w-full text-sm min-w-[600px]">
                          <tbody>
                            {detail.items.map((i) => (
                              <tr key={i.id} className="border-b last:border-0">
                                <td className="py-2">{i.description}</td>
                                <td className="py-2 text-right tabular-nums">{i.quantity} × {formatGHS(i.unitPrice)}</td>
                                <td className="py-2 text-right text-xs text-muted-foreground">{i.partId ? "mapped" : "unmapped"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table></div>

                        <div className="flex flex-wrap gap-2">
                          {canReceive && ["delivered", "out_for_delivery"].includes(detail.status) && (
                            <Button disabled={pending} onClick={() => act(() => receiveVendorOrder({ garageId, orderId: detail.id }), "Received into stock")}>Receive into stock</Button>
                          )}
                          {detail.paymentStatus === "pending" && (
                            <Button variant="secondary" disabled={pending}
                              onClick={() => act(() => verifyVendorOrderPayment({ garageId, orderId: detail.id }))}>Check payment</Button>
                          )}
                          {canReceive && detail.paymentStatus === "paid" && !["received", "cancelled", "rejected"].includes(detail.status) && disputeText === null && (
                            <Button variant="secondary" disabled={pending} onClick={() => setDisputeText("")}>Report a problem</Button>
                          )}
                        </div>
                        {disputeText !== null && (
                          <div className="rounded-xl border border-border p-3">
                            <p className="text-sm font-semibold">What went wrong?</p>
                            <p className="text-xs text-muted-foreground">We&apos;ll hold the vendor&apos;s money while the FixAm team sorts it out.</p>
                            <textarea value={disputeText} onChange={(e) => setDisputeText(e.target.value)} rows={3}
                              placeholder="e.g. Wrong part delivered — ordered front pads, got rear" className={`${inputCls} mt-2`} />
                            <div className="mt-2 flex gap-2">
                              <Button disabled={pending || disputeText.trim().length < 10}
                                onClick={() => act(async () => {
                                  const r = await disputeVendorOrder({ garageId, orderId: detail.id, reason: disputeText })
                                  if (r.ok) setDisputeText(null)
                                  return r
                                }, "Problem reported — payment frozen while we look into it")}>Send report</Button>
                              <Button variant="secondary" disabled={pending} onClick={() => setDisputeText(null)}>Cancel</Button>
                            </div>
                          </div>
                        )}

                        {detail.canReview && (
                          <div className="rounded-xl border border-border p-3">
                            <p className="text-sm font-semibold">Review {detail.vendorName}</p>
                            <div className="mt-2 flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((r) => (
                                <button key={r} onClick={() => setReview({ ...review, rating: r })}
                                  className={`text-xl ${r <= review.rating ? "text-warning" : "text-muted-foreground"}`}>★</button>
                              ))}
                            </div>
                            <textarea value={review.comment} onChange={(e) => setReview({ ...review, comment: e.target.value })}
                              placeholder="Comment (optional)" rows={2} className={`${inputCls} mt-2`} />
                            <Button className="mt-2" disabled={pending}
                              onClick={() => act(() => reviewVendorOrder({ garageId, orderId: detail.id, rating: review.rating, comment: review.comment || undefined }), "Thanks for the review")}>
                              Submit review
                            </Button>
                          </div>
                        )}
                        {detail.review && <p className="text-sm text-muted-foreground">Reviewed: {"★".repeat(detail.review.rating)} {detail.review.comment ?? ""}</p>}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
