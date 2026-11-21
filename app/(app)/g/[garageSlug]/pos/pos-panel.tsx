"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { formatGHS } from "@/lib/money"
import { completePosSale, posSearch } from "@/lib/pos/actions"

type Part = {
  id: string; sku: string; name: string; brand: string | null
  sellingPrice: number; unit: string | null; barcode: string | null
  onHand: number | null; averageCost: number | null
}
type CartLine = { part: Part; quantity: number }

const METHODS = ["cash", "momo", "card", "bank_transfer", "other"] as const

export function PosPanel(props: {
  garageSlug: string
  garageId: string
  branches: { id: string; name: string }[]
  defaultBranchId: string | null
}) {
  const { garageId, branches, defaultBranchId } = props
  const [branchId, setBranchId] = useState(defaultBranchId ?? "")
  const [q, setQ] = useState("")
  const [results, setResults] = useState<Part[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [method, setMethod] = useState<(typeof METHODS)[number]>("cash")
  const [tendered, setTendered] = useState("")
  const [discount, setDiscount] = useState("")
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<{ invoiceNumber: string; receiptNumber: string; total: number; change: number } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const debounce = useRef<ReturnType<typeof setTimeout>>(null)

  const search = useCallback((query: string) => {
    if (!branchId) return
    startTransition(async () => {
      const res = await posSearch({ garageId, branchId, q: query || undefined })
      if (res.ok) setResults(res.data)
    })
  }, [garageId, branchId])

  useEffect(() => { search("") }, [branchId, search])

  function onQuery(v: string) {
    setQ(v)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => search(v), 250)
  }

  function addToCart(p: Part) {
    setCart((c) => {
      const found = c.find((l) => l.part.id === p.id)
      if (found) return c.map((l) => l.part.id === p.id ? { ...l, quantity: l.quantity + 1 } : l)
      return [...c, { part: p, quantity: 1 }]
    })
    setMsg(null)
  }

  function setQty(partId: string, qty: number) {
    setCart((c) => qty <= 0 ? c.filter((l) => l.part.id !== partId) : c.map((l) => l.part.id === partId ? { ...l, quantity: qty } : l))
  }

  // estimate totals client-side (server recomputes authoritatively)
  const subtotal = cart.reduce((s, l) => s + l.part.sellingPrice * l.quantity, 0)
  const discPct = Math.min(50, Math.max(0, parseFloat(discount || "0") || 0))
  const approxTotal = Math.round(subtotal * (1 - discPct / 100))
  const tenderedNum = Math.round(parseFloat(tendered || "0") * 100)
  const change = method === "cash" && tendered ? Math.max(0, tenderedNum - approxTotal) : 0

  function checkout() {
    if (cart.length === 0 || !branchId) return
    startTransition(async () => {
      const res = await completePosSale({
        garageId, branchId,
        items: cart.map((l) => ({ partId: l.part.id, quantity: l.quantity })),
        discountPercent: discPct || undefined,
        method,
        tendered: method === "cash" ? tenderedNum || undefined : undefined,
      })
      if (!res.ok) { setMsg(res.error.message); return }
      setReceipt(res.data)
      setCart([]); setTendered(""); setDiscount(""); setMsg(null)
      search(q)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Counter sale</h1>
          <p className="text-sm text-muted-foreground">{cart.length} lines in cart</p>
        </div>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
          className="min-h-10 rounded-lg border-2 border-border bg-surface px-3 text-sm">
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {msg && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}

      {receipt && (
        <Card className="border-success">
          <CardContent className="p-4">
            <p className="font-display text-lg font-bold text-success">Sale complete</p>
            <p className="text-sm">Invoice {receipt.invoiceNumber} · Receipt {receipt.receiptNumber}</p>
            <p className="text-sm">Total {formatGHS(receipt.total)}{receipt.change > 0 ? ` · Change ${formatGHS(receipt.change)}` : ""}</p>
            <div className="mt-2 flex gap-2">
              <Button variant="secondary" onClick={() => window.print()}>Print receipt</Button>
              <Button variant="ghost" onClick={() => setReceipt(null)}>New sale</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* search + grid */}
        <div>
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search or scan barcode…"
            className="min-h-12 w-full rounded-xl border-2 border-border bg-surface px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
            autoFocus
          />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {results.map((p) => {
              const inCart = cart.find((l) => l.part.id === p.id)?.quantity ?? 0
              const out = p.onHand != null && p.onHand - inCart <= 0
              return (
                <button key={p.id} onClick={() => addToCart(p)} disabled={out}
                  className="rounded-xl border-2 border-border bg-surface p-3 text-left transition hover:border-primary disabled:opacity-40">
                  <p className="truncate text-sm font-bold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.sku}{p.brand ? ` · ${p.brand}` : ""}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="font-display font-bold">{formatGHS(p.sellingPrice)}</span>
                    <span className={`text-xs ${out ? "text-danger" : "text-muted-foreground"}`}>
                      {p.onHand == null ? "—" : `${p.onHand} in stock`}
                    </span>
                  </div>
                </button>
              )
            })}
            {results.length === 0 && <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No parts match</p>}
          </div>
        </div>

        {/* cart */}
        <Card>
          <CardContent className="flex h-full flex-col p-4">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">Cart</h2>
            <div className="mt-2 flex-1 divide-y overflow-y-auto">
              {cart.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Tap parts to add</p>}
              {cart.map((l) => (
                <div key={l.part.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.part.name}</p>
                    <p className="text-xs text-muted-foreground">{formatGHS(l.part.sellingPrice)} each</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setQty(l.part.id, l.quantity - 1)} className="h-7 w-7 rounded-lg border-2 border-border text-sm font-bold">−</button>
                    <span className="w-8 text-center text-sm font-bold tabular-nums">{l.quantity}</span>
                    <button onClick={() => setQty(l.part.id, l.quantity + 1)} className="h-7 w-7 rounded-lg border-2 border-border text-sm font-bold">+</button>
                  </div>
                  <span className="w-20 text-right text-sm font-bold tabular-nums">{formatGHS(l.part.sellingPrice * l.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="mt-3 space-y-2 border-t pt-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatGHS(subtotal)}</span></div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Discount %</span>
                <input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="0"
                  className="h-8 w-16 rounded-lg border-2 border-border bg-surface px-2 text-right text-sm" />
              </div>
              <div className="flex justify-between text-base font-bold"><span>Total (est.)</span><span className="tabular-nums">{formatGHS(approxTotal)}</span></div>
            </div>

            <div className="mt-3 grid grid-cols-5 gap-1">
              {METHODS.map((m) => (
                <button key={m} onClick={() => setMethod(m)}
                  className={`rounded-lg border-2 px-1 py-1.5 text-xs font-bold capitalize ${method === m ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface"}`}>
                  {m === "bank_transfer" ? "transfer" : m}
                </button>
              ))}
            </div>

            {method === "cash" && (
              <div className="mt-2">
                <input value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder="Cash tendered GH₵" inputMode="decimal"
                  className="min-h-10 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm" />
                {tenderedNum > 0 && <p className="mt-1 text-right text-sm">Change: <b>{formatGHS(change)}</b></p>}
              </div>
            )}

            <Button className="mt-3 w-full !min-h-12 text-base" onClick={checkout} disabled={pending || cart.length === 0 || !branchId}>
              {pending ? "Processing…" : `Charge ${formatGHS(approxTotal)}`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
