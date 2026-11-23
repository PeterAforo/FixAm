"use client"

import { useMemo, useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { checkPrice } from "@/lib/fair-quote/actions"
import type { FairQuoteCheck } from "@/lib/fair-quote/core"

const CLASSES = [
  { v: "economy", l: "Saloon or hatchback (Corolla, Elantra, Vitz…)" },
  { v: "suv", l: "SUV or pickup (RAV4, Hilux, Tucson…)" },
  { v: "premium", l: "Premium brand (Mercedes, BMW, Lexus…)" },
  { v: "commercial", l: "Van, bus or truck (Sprinter, HiAce…)" },
  { v: "motorbike", l: "Motorbike or tricycle" },
] as const

const TONE: Record<FairQuoteCheck["verdict"], string> = {
  within: "border-emerald-200 bg-emerald-50 text-emerald-900",
  above: "border-amber-200 bg-amber-50 text-amber-900",
  below: "border-sky-200 bg-sky-50 text-sky-900",
}

const ghs = (p: number) => `GH₵${(p / 100).toLocaleString("en-GH", { maximumFractionDigits: 0 })}`

export function PriceCheck({ partTypes, cities }: { partTypes: { id: string; name: string; category: string }[]; cities: string[] }) {
  const [what, setWhat] = useState("")
  const [cls, setCls] = useState<(typeof CLASSES)[number]["v"]>("economy")
  const [city, setCity] = useState("")
  const [price, setPrice] = useState("")
  const [result, setResult] = useState<{ check: FairQuoteCheck | null } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const grouped = useMemo(() => {
    const m = new Map<string, { id: string; name: string }[]>()
    for (const p of partTypes) m.set(p.category, [...(m.get(p.category) ?? []), p])
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [partTypes])

  const submit = () => {
    setErr(null)
    setResult(null)
    start(async () => {
      const res = await checkPrice({ what, carClass: cls, city, priceGhs: Number(price) })
      if (res.ok) setResult(res.data)
      else setErr(res.error.message)
    })
  }

  const field = "mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
  return (
    <Card className="mt-6">
      <CardContent className="space-y-4 p-5">
        <label className="block text-sm font-medium">
          What is the price for?
          <select className={field} value={what} onChange={(e) => setWhat(e.target.value)}>
            <option value="">Choose a part or labour…</option>
            <option value="labour">Labour (price per hour)</option>
            {grouped.map(([cat, list]) => (
              <optgroup key={cat} label={cat}>
                {list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Your car
          <select className={field} value={cls} onChange={(e) => setCls(e.target.value as typeof cls)}>
            {CLASSES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">
          City <span className="font-normal text-muted-foreground">(optional)</span>
          <input className={field} list="price-check-cities" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Accra, Kumasi" />
          <datalist id="price-check-cities">{cities.map((c) => <option key={c} value={c.replace(/\b\w/g, (x) => x.toUpperCase())} />)}</datalist>
        </label>
        <label className="block text-sm font-medium">
          Price you were quoted (GH₵){what === "labour" ? " per hour" : " for one part"}
          <input className={field} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" />
        </label>
        <Button className="w-full" disabled={pending || !what || !Number(price)} onClick={submit}>
          {pending ? "Checking…" : "Check this price"}
        </Button>

        {err && <p className="text-sm text-red-700">{err}</p>}
        {result && !result.check && (
          <p className="rounded-xl border border-border bg-surface-sunken p-3 text-sm text-muted-foreground">
            Not enough recent prices for this yet — we only show a range once at least 5 prices from 3 or more garages are in. Try without a city, or check back later.
          </p>
        )}
        {result?.check && (
          <div className={`rounded-xl border p-4 ${TONE[result.check.verdict]}`}>
            <p className="font-display text-lg font-semibold">
              {result.check.verdict === "within" ? "Looks fair" : result.check.verdict === "above" ? "Higher than most" : "Lower than most"}
            </p>
            <p className="mt-1 text-sm">{result.check.summary}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div><p className="opacity-70">Lower end</p><p className="font-semibold tabular-nums">{ghs(result.check.band.low)}</p></div>
              <div><p className="opacity-70">Middle</p><p className="font-semibold tabular-nums">{ghs(result.check.band.median)}</p></div>
              <div><p className="opacity-70">Upper end</p><p className="font-semibold tabular-nums">{ghs(result.check.band.high)}</p></div>
            </div>
            {result.check.verdict === "above" && (
              <p className="mt-3 text-xs">Ask the mechanic which brand or grade the part is, and what work is included — that often explains the difference.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
