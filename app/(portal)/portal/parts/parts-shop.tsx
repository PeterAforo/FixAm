"use client"

import { useMemo, useState, useTransition } from "react"
import { BadgeCheck, MapPin, Minus, Plus, Search, ShieldCheck, ShoppingCart, Store, Truck, Wrench } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { formatGHS } from "@/lib/money"
import type { FittingProduct } from "@/lib/parts-catalog/actions"
import {
  placePartOrder,
  quotePartOrder,
  searchDestinationGarages,
  searchPartsForCar,
  type DestGarage,
  type DriverCar,
  type PartQuote,
} from "@/lib/parts-shop/actions"

const REGIONS = [
  "Greater Accra", "Ashanti", "Western", "Central", "Eastern", "Volta", "Northern", "Upper East",
  "Upper West", "Bono", "Bono East", "Ahafo", "Western North", "Oti", "Savannah", "North East",
]

const CONDITION: Record<string, { label: string; cls: string }> = {
  genuine: { label: "Genuine", cls: "bg-[#EEF8D6] text-[#4E6B07]" },
  aftermarket: { label: "Aftermarket", cls: "bg-[#E6F4FF] text-[#0B5CAD]" },
  home_used: { label: "Home-used", cls: "bg-[#FFF1E0] text-[#9A4A00]" },
}

const inputCls = "min-h-11 w-full rounded-xl border border-input bg-card px-3.5 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

type CartLine = { product: FittingProduct; qty: number }
type DestChoice = "my_garage" | "other_garage" | "home" | "pickup"

export function PartsShop(props: {
  cars: DriverCar[]
  myGarages: DestGarage[]
  partTypes: { id: string; name: string; category: string }[]
  initialQ: string
  initialPartTypeId: string | null
  initialResults: FittingProduct[] | null
}) {
  const [pending, startTransition] = useTransition()
  const [carKey, setCarKey] = useState(props.cars[0]?.key ?? "other")
  const [other, setOther] = useState({ make: "", model: "", year: "" })
  const [q, setQ] = useState(props.initialQ)
  const [partTypeId, setPartTypeId] = useState<string | null>(props.initialPartTypeId)
  const [results, setResults] = useState<FittingProduct[] | null>(props.initialResults)
  const [cart, setCart] = useState<Map<string, CartLine>>(new Map())
  const [msg, setMsg] = useState<string | null>(null)

  const acceptingMine = props.myGarages.filter((g) => g.acceptsCustomerParts)
  const [dest, setDest] = useState<DestChoice>(acceptingMine.length ? "my_garage" : "home")
  const [garageId, setGarageId] = useState<string | null>(acceptingMine[0]?.id ?? null)
  const [garageQ, setGarageQ] = useState("")
  const [garageHits, setGarageHits] = useState<DestGarage[]>([])
  const [home, setHome] = useState({ address: "", region: "Greater Accra", city: "" })
  const [quote, setQuote] = useState<PartQuote | null>(null)

  const car = useMemo(() => {
    const c = props.cars.find((x) => x.key === carKey)
    if (c) return { make: c.make, model: c.model, year: c.year, label: c.label }
    const y = parseInt(other.year, 10)
    return { make: other.make.trim(), model: other.model.trim(), year: Number.isFinite(y) ? y : null, label: `${other.make} ${other.model} ${other.year}`.trim() }
  }, [carKey, other, props.cars])

  function search() {
    setMsg(null)
    startTransition(async () => {
      const r = await searchPartsForCar({
        make: car.make || undefined,
        model: car.model || undefined,
        year: car.year ?? undefined,
        q: q.trim() || undefined,
        partTypeId: partTypeId ?? undefined,
      })
      setResults(r)
    })
  }

  const lines = [...cart.values()]
  const cartCount = lines.reduce((s, l) => s + l.qty, 0)

  function setQty(p: FittingProduct, qty: number) {
    const next = new Map(cart)
    if (qty <= 0) next.delete(p.id)
    else next.set(p.id, { product: p, qty: Math.min(qty, 50) })
    setCart(next)
    setQuote(null)
  }

  function destination() {
    if (dest === "pickup") return { type: "pickup" as const }
    if (dest === "home") return { type: "home" as const, address: home.address, region: home.region, city: home.city || undefined }
    return garageId ? { type: "garage" as const, garageId } : null
  }

  function getQuote() {
    const d = destination()
    if (!d) return setMsg("Choose the garage to deliver to")
    setMsg(null)
    startTransition(async () => {
      const r = await quotePartOrder({ items: lines.map((l) => ({ productId: l.product.id, quantity: l.qty })), destination: d, vehicleLabel: car.label || undefined })
      if (!r.ok) return setMsg(r.error)
      setQuote(r.quote)
    })
  }

  function pay() {
    const d = destination()
    if (!d) return
    startTransition(async () => {
      const r = await placePartOrder({ items: lines.map((l) => ({ productId: l.product.id, quantity: l.qty })), destination: d, vehicleLabel: car.label || undefined })
      if (!r.ok) return setMsg(r.error)
      window.location.href = r.checkoutUrl
    })
  }

  function findGarages(value: string) {
    setGarageQ(value)
    if (value.trim().length < 2) return setGarageHits([])
    startTransition(async () => setGarageHits(await searchDestinationGarages(value)))
  }

  const selectedOtherGarage = garageHits.find((g) => g.id === garageId)

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">My car</span>
                <select value={carKey} onChange={(e) => { setCarKey(e.target.value); setResults(null) }} className={inputCls}>
                  {props.cars.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  <option value="other">Another car…</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">Part</span>
                <select value={partTypeId ?? ""} onChange={(e) => setPartTypeId(e.target.value || null)} className={inputCls}>
                  <option value="">Any part</option>
                  {props.partTypes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            </div>
            {carKey === "other" && (
              <div className="grid grid-cols-3 gap-2">
                <input value={other.make} onChange={(e) => setOther({ ...other, make: e.target.value })} placeholder="Make (Toyota)" className={inputCls} />
                <input value={other.model} onChange={(e) => setOther({ ...other, model: e.target.value })} placeholder="Model (Corolla)" className={inputCls} />
                <input value={other.year} onChange={(e) => setOther({ ...other, year: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="Year" inputMode="numeric" className={inputCls} />
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); search() }} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search e.g. brake pads, shock absorber, OEM number" className={`${inputCls} pl-9`} />
              </div>
              <Button type="submit" disabled={pending}>Find parts</Button>
            </form>
          </CardContent>
        </Card>

        {results === null ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Pick your car and search — we&apos;ll only show parts that fit it.
          </p>
        ) : results.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No sellers have that part for this car yet. Try another name, or ask your garage.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {results.map((p) => {
              const inCart = cart.get(p.id)?.qty ?? 0
              const cond = p.condition ? CONDITION[p.condition] : null
              return (
                <Card key={p.id}>
                  <CardContent className="flex h-full flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold leading-tight">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.brand ?? "Unbranded"}{p.fitLevel >= 2 ? " · exact fit" : p.fitLevel === 0 ? " · fits most cars" : ""}</p>
                      </div>
                      {cond && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cond.cls}`}>{cond.label}</span>}
                    </div>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Store className="size-3.5" /> {p.vendorName}{p.vendorCity ? `, ${p.vendorCity}` : ""}
                      {p.vendorVerified && <BadgeCheck className="size-3.5 text-[#0B5CAD]" aria-label="Verified seller" />}
                    </p>
                    {p.warrantyDays ? <p className="flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" /> {p.warrantyDays}-day warranty</p> : null}
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <span className="font-display text-lg font-bold tabular-nums">{formatGHS(p.price)}</span>
                      {inCart ? (
                        <span className="flex items-center gap-1">
                          <Button variant="secondary" size="sm" onClick={() => setQty(p, inCart - 1)} aria-label="One less"><Minus className="size-4" /></Button>
                          <span className="w-6 text-center text-sm font-semibold tabular-nums">{inCart}</span>
                          <Button variant="secondary" size="sm" onClick={() => setQty(p, inCart + 1)} aria-label="One more"><Plus className="size-4" /></Button>
                        </span>
                      ) : (
                        <Button size="sm" onClick={() => setQty(p, 1)}>Add</Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardContent className="space-y-4 p-4">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold"><ShoppingCart className="size-5" /> Basket {cartCount ? `(${cartCount})` : ""}</h2>
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add parts to see delivery options and the total.</p>
            ) : (
              <>
                <ul className="space-y-1 text-sm">
                  {lines.map((l) => (
                    <li key={l.product.id} className="flex justify-between gap-2">
                      <span className="truncate">{l.product.name} × {l.qty}</span>
                      <span className="shrink-0 tabular-nums">{formatGHS(l.product.price * l.qty)}</span>
                    </li>
                  ))}
                </ul>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Where should it go?</p>
                  {([
                    ["my_garage", "My garage", Wrench],
                    ["other_garage", "Another garage", MapPin],
                    ["home", "Deliver to me", Truck],
                    ["pickup", "I'll pick it up", Store],
                  ] as const).map(([value, label, Icon]) => (
                    <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${dest === value ? "border-foreground" : "border-border"}`}>
                      <input type="radio" name="dest" checked={dest === value} onChange={() => { setDest(value); setQuote(null); if (value === "my_garage") setGarageId(acceptingMine[0]?.id ?? null); if (value === "other_garage") setGarageId(null) }} />
                      <Icon className="size-4" /> {label}
                    </label>
                  ))}

                  {dest === "my_garage" && (
                    props.myGarages.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No garages linked to your number yet — choose “Another garage”.</p>
                    ) : (
                      <select value={garageId ?? ""} onChange={(e) => { setGarageId(e.target.value); setQuote(null) }} className={inputCls}>
                        {props.myGarages.map((g) => (
                          <option key={g.id} value={g.id} disabled={!g.acceptsCustomerParts}>
                            {g.name}{g.acceptsCustomerParts ? (g.fittingFee ? ` · fitting ${formatGHS(g.fittingFee)}` : " · free fitting") : " · doesn't fit customer parts"}
                          </option>
                        ))}
                      </select>
                    )
                  )}

                  {dest === "other_garage" && (
                    <div className="space-y-2">
                      <input value={garageQ} onChange={(e) => findGarages(e.target.value)} placeholder="Garage name or town" className={inputCls} />
                      {garageHits.map((g) => (
                        <button key={g.id} type="button" disabled={!g.acceptsCustomerParts} onClick={() => { setGarageId(g.id); setQuote(null) }}
                          className={`block w-full rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-50 ${garageId === g.id ? "border-foreground" : "border-border"}`}>
                          <span className="font-semibold">{g.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {[g.city, g.region].filter(Boolean).join(", ")} · {g.acceptsCustomerParts ? (g.fittingFee ? `fitting ${formatGHS(g.fittingFee)}` : "free fitting") : "doesn't fit customer parts"}
                          </span>
                        </button>
                      ))}
                      {selectedOtherGarage && <p className="text-xs text-muted-foreground">Sending to {selectedOtherGarage.name}.</p>}
                    </div>
                  )}

                  {dest === "home" && (
                    <div className="space-y-2">
                      <input value={home.address} onChange={(e) => { setHome({ ...home, address: e.target.value }); setQuote(null) }} placeholder="Address or landmark" className={inputCls} />
                      <div className="grid grid-cols-2 gap-2">
                        <select value={home.region} onChange={(e) => { setHome({ ...home, region: e.target.value }); setQuote(null) }} className={inputCls}>
                          {REGIONS.map((r) => <option key={r}>{r}</option>)}
                        </select>
                        <input value={home.city} onChange={(e) => { setHome({ ...home, city: e.target.value }); setQuote(null) }} placeholder="Town" className={inputCls} />
                      </div>
                    </div>
                  )}
                </div>

                {quote && (
                  <div className="space-y-1 rounded-xl bg-surface-muted/60 p-3 text-sm">
                    {quote.vendors.map((v) => (
                      <div key={v.vendorId} className="flex justify-between gap-2">
                        <span className="truncate">{v.vendorName}{v.etaHours ? ` · ~${v.etaHours} h` : ""}</span>
                        <span className="tabular-nums">{formatGHS(v.subtotal)}{v.deliveryFee ? ` + ${formatGHS(v.deliveryFee)} delivery` : ""}</span>
                      </div>
                    ))}
                    {quote.fittingFee > 0 && (
                      <div className="flex justify-between"><span>Fitting at {quote.garage?.name}</span><span className="tabular-nums">{formatGHS(quote.fittingFee)}</span></div>
                    )}
                    <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span className="tabular-nums">{formatGHS(quote.total)}</span></div>
                    {quote.problems.map((p) => <p key={p} className="text-xs text-red-700">{p}</p>)}
                  </div>
                )}

                {msg && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{msg}</p>}

                {quote && quote.problems.length === 0 ? (
                  <Button className="w-full" disabled={pending} onClick={pay}>Pay {formatGHS(quote.total)} with MoMo or card</Button>
                ) : (
                  <Button className="w-full" variant="secondary" disabled={pending} onClick={getQuote}>See total</Button>
                )}
                <p className="text-xs text-muted-foreground">FixAm holds your money and only pays the seller once the part arrives. Something wrong? Report it and we&apos;ll sort it out.</p>
              </>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}
