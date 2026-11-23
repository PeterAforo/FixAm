import { Suspense } from "react"
import { connection } from "next/server"
import { listPartTypes } from "@/lib/parts-catalog/actions"
import { priceCheckCities } from "@/lib/fair-quote/service"
import { PriceCheck } from "./price-check"

async function Loader() {
  await connection()
  const [partTypes, cities] = await Promise.all([listPartTypes(), priceCheckCities().catch(() => [] as string[])])
  return <PriceCheck partTypes={partTypes.map((p) => ({ id: p.id, name: p.name, category: p.category }))} cities={cities} />
}

export default function PriceCheckPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em]">Is this price fair?</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Got a quote from a mechanic? Compare it with what garages on FixAm recently charged for the same thing. No garage is named.
      </p>
      <Suspense fallback={<div className="mt-6 h-72 animate-pulse rounded-2xl bg-muted" />}>
        <Loader />
      </Suspense>
    </div>
  )
}
