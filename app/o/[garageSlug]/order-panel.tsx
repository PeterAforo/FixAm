"use client"

import { useMemo, useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { formatGHS } from "@/lib/money"
import { isCompatible } from "@/lib/shop/compat"
import { lookupOrderCustomer, placeCustomerOrder } from "@/lib/shop/actions"

type ShopData = Extract<Awaited<ReturnType<typeof import("@/lib/shop/actions").getPublicShop>>, { ok: true }>["data"]

const inputCls = "min-h-10 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

type CartLine = { kind: "part" | "vendor"; id: string; name: string; price: number; qty: number; vendorName?: string; minQty?: number }

export function OrderPanel({ garageSlug, data }: { garageSlug: string; data: ShopData }) {
  const [pending, startTransition] = useTransition()
  const [phone, setPhone] = useState("")
  const [customer, setCustomer] = useState<{ id: string; fullName: string; phone: string } | null>(null)
  const [vehicles, setVehicles] = useState<{ id: string; plateNumber: string; make: string; model: string; year: number | null; color: string | null }[]>([])
  const [vehicleId, setVehicleId] = useState("")
  const [guestName, setGuestName] = useState("")
  const [cart, setCart] = useState<CartLine[]>([])
  const [branchId, setBranchId] = useState(data.branches[0]?.id ?? "")
  const [fulfilment, setFulfilment] = useState<"pickup" | "fitting">("pickup")
  const [preferredDate, setPreferredDate] = useState("")
  const [payNow, setPayNow] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [done, setDone] = useState<{ bookingNumber: string | null; orders: { number: string; vendorName: string; total: number }[] } | null>(null)

  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null

  const vendorProducts = useMemo(() =>
    data.vendorProducts.filter((p) => isCompatible(p.compatibleVehicles, vehicle)),
    [data.vendorProducts, vehicle]
  )
  const garageParts = data.parts // garage catalogue isn't vehicle-filtered

  function lookup(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await lookupOrderCustomer({ garageSlug, phone })
      if (!res.ok) { setMsg(res.error ?? "Lookup failed"); return }
      setMsg(null)
      if (res.data.customer) {
        setCustomer(res.data.customer)
        setGuestName(res.data.customer.fullName)
        setVehicles(res.data.vehicles)
        if (res.data.vehicles.length === 1) setVehicleId(res.data.vehicles[0]!.id)
      } else {
        setCustomer(null); setVehicles([]); setVehicleId("")
        setMsg("New customer — you can still order parts.")
      }
    })
  }

  function add(kind: "part" | "vendor", item: { id: string; name: string; price: number; vendorName?: string; minQty?: number }) {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.kind === kind && l.id === item.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx]!, qty: next[idx]!.qty + 1 }
        return next
      }
      return [...prev, { kind, id: item.id, name: item.name, price: item.price, qty: 1, vendorName: item.vendorName, minQty: item.minQty }]
    })
  }
  function setQty(idx: number, qty: number) {
    setCart((prev) => qty <= 0 ? prev.filter((_, i) => i !== idx) : prev.map((l, i) => i === idx ? { ...l, qty } : l))
  }

  const cartTotal = cart.reduce((s, l) => s + l.qty * l.price, 0)
  const vendorVendors = new Set(cart.filter((l) => l.kind === "vendor").map((l) => l.vendorName))
  const estDelivery = cart.filter((l) => l.kind === "vendor").length > 0 ? 20 : 0 // flat estimate; real fee at checkout

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (cart.length === 0) { setMsg("Your cart is empty"); return }
    if (!guestName.trim()) { setMsg("Enter your name"); return }
    startTransition(async () => {
      const res = await placeCustomerOrder({
        garageSlug, branchId,
        customerId: customer?.id,
        guestName: guestName.trim(), guestPhone: phone,
        vehicleId: vehicle?.id,
        fulfilment, preferredDate: preferredDate || undefined,
        items: cart.map((l) => ({ type: l.kind, id: l.id, qty: l.qty })),
        payNow,
      })
      if (!res.ok) { setMsg(res.error); return }
      setDone({ bookingNumber: res.data.bookingNumber, orders: res.data.orders })
      if (res.data.checkoutUrl) window.location.href = res.data.checkoutUrl
    })
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <Card><CardContent className="p-8 text-center">
          <h1 className="font-display text-2xl font-bold">Order received!</h1>
          <p className="mt-2 text-muted-foreground">
            {done.bookingNumber && <>Booking <b>{done.bookingNumber}</b> — we&rsquo;ll confirm your {fulfilment === "fitting" ? "fitting" : "pickup"} slot shortly. </>}
            {done.orders.length > 0 && <>Vendor orders: {done.orders.map((o) => o.number).join(", ")}.</>}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">Questions? Call {data.garage.name} directly.</p>
        </CardContent></Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-10">
      <header className="flex items-center gap-4">
        <div
          className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-xl font-bold text-white"
          style={{ background: data.garage.brandColor ?? "var(--color-primary)" }}
        >
          {data.garage.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.garage.logoUrl} alt="" className="size-full object-cover" />
          ) : (
            data.garage.name.slice(0, 1).toUpperCase()
          )}
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">{data.garage.name}</p>
          <h1 className="font-display text-3xl font-bold">Order parts</h1>
          <p className="text-muted-foreground">
            {[data.garage.city, data.garage.region].filter(Boolean).join(", ") || "Garage stock for pickup or fitting"} · parts delivered from our vendor network.
          </p>
        </div>
      </header>

      {/* step 1: phone + vehicle */}
      <Card><CardContent className="space-y-3 p-5">
        <form onSubmit={lookup} className="flex gap-2">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Your phone number" className={inputCls} required />
          <Button type="submit" variant="secondary" disabled={pending}>Find my car</Button>
        </form>
        {customer && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>Hi <b>{customer.fullName}</b></span>
            {vehicles.length > 0 && (
              <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={`${inputCls} !w-auto`}>
                <option value="">No specific vehicle</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plateNumber} — {v.make} {v.model} {v.year ?? ""}</option>)}
              </select>
            )}
          </div>
        )}
        {msg && <p className="rounded-lg bg-info/10 px-3 py-2 text-sm">{msg}</p>}
      </CardContent></Card>

      {/* catalogue */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {garageParts.length > 0 && (
            <section>
              <h2 className="mb-2 font-display text-lg font-bold">{data.garage.name} stock — pickup or fitting</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {garageParts.map((p) => (
                  <Card key={p.id}><CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold leading-tight">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{[p.brand, p.category].filter(Boolean).join(" · ")}</p>
                      </div>
                      <span className="font-bold tabular-nums">{formatGHS(p.sellingPrice)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{Number(p.onHand) > 0 ? `${p.onHand} in stock` : "Order in"}</p>
                    <Button variant="secondary" className="mt-3 !min-h-8 w-full text-xs" onClick={() => add("part", { id: p.id, name: p.name, price: p.sellingPrice })}>Add</Button>
                  </CardContent></Card>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 font-display text-lg font-bold">Vendor network{vehicle ? ` — fits ${vehicle.make} ${vehicle.model}` : ""}</h2>
            {vendorProducts.length === 0 && <p className="text-sm text-muted-foreground">No vendor parts{vehicle ? " compatible with this vehicle" : ""} right now.</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {vendorProducts.map((p) => (
                <Card key={p.id}><CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold leading-tight">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.vendorName}{p.vendorRating != null ? ` · ★${p.vendorRating.toFixed(1)}` : ""}{p.zone?.etaHours ? ` · ~${p.zone.etaHours}h` : ""}</p>
                    </div>
                    <span className="font-bold tabular-nums">{formatGHS(p.price)}</span>
                  </div>
                  <Button variant="secondary" className="mt-3 !min-h-8 w-full text-xs" onClick={() => add("vendor", { id: p.id, name: p.name, price: p.price, vendorName: p.vendorName, minQty: p.minOrderQty })}>Add</Button>
                </CardContent></Card>
              ))}
            </div>
          </section>
        </div>

        {/* cart + checkout */}
        <Card className="h-fit">
          <CardContent className="space-y-3 p-5">
            <h2 className="font-display text-lg font-bold">Your order ({cart.length})</h2>
            {cart.length === 0 && <p className="text-sm text-muted-foreground">Add parts to get started.</p>}
            {cart.map((l, i) => (
              <div key={`${l.kind}-${l.id}`} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{l.name}</p>
                  <p className="text-xs text-muted-foreground">{l.kind === "vendor" ? l.vendorName : "Garage stock"} · {formatGHS(l.price)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button className="h-6 w-6 rounded border border-border" onClick={() => setQty(i, l.qty - 1)}>−</button>
                  <span className="w-6 text-center text-sm font-bold">{l.qty}</span>
                  <button className="h-6 w-6 rounded border border-border" onClick={() => setQty(i, l.qty + 1)}>+</button>
                </div>
              </div>
            ))}

            {cart.length > 0 && (
              <form onSubmit={submit} className="space-y-3 border-t border-border pt-3">
                <label className="block text-xs font-semibold uppercase text-muted-foreground">
                  Collect / deliver via
                  <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={`${inputCls} mt-1`} required>
                    {data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </label>
                {cart.some((l) => l.kind === "part") && (
                  <>
                    <div className="flex gap-2">
                      {(["pickup", "fitting"] as const).map((f) => (
                        <button type="button" key={f} onClick={() => setFulfilment(f)}
                          className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium capitalize ${fulfilment === f ? "border-primary bg-primary/10" : "border-border"}`}>
                          {f === "pickup" ? "Pickup" : "Fit for me"}
                        </button>
                      ))}
                    </div>
                    {fulfilment === "fitting" && (
                      <label className="block text-xs font-semibold uppercase text-muted-foreground">
                        Preferred date
                        <input type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} className={`${inputCls} mt-1`} />
                      </label>
                    )}
                  </>
                )}
                <label className="block text-xs font-semibold uppercase text-muted-foreground">
                  Your name
                  <input value={guestName} onChange={(e) => setGuestName(e.target.value)} className={`${inputCls} mt-1`} required />
                </label>
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <div className="flex justify-between"><span>Parts</span><span className="tabular-nums">{formatGHS(cart.filter((l) => l.kind === "part").reduce((s, l) => s + l.qty * l.price, 0))}</span></div>
                  {vendorVendors.size > 0 && <div className="flex justify-between"><span>Vendor items ({vendorVendors.size} vendor{vendorVendors.size > 1 ? "s" : ""})</span><span className="tabular-nums">{formatGHS(cart.filter((l) => l.kind === "vendor").reduce((s, l) => s + l.qty * l.price, 0))}</span></div>}
                  <div className="mt-1 flex justify-between font-bold"><span>Total</span><span className="tabular-nums">{formatGHS(cartTotal + (cart.some((l) => l.kind === "vendor") ? estDelivery : 0))}</span></div>
                  <p className="mt-1 text-xs text-muted-foreground">Final total incl. delivery confirmed on order.</p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} />
                  Pay now by card / MoMo
                </label>
                <Button type="submit" className="w-full" disabled={pending}>Place order</Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
