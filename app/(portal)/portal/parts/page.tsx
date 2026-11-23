import { Suspense } from "react"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { getPartsShopContext, searchPartsForCar } from "@/lib/parts-shop/actions"
import { listPartTypes } from "@/lib/parts-catalog/actions"
import { PartsShop } from "./parts-shop"

async function Loader({ searchParams }: { searchParams: Promise<{ q?: string; part?: string }> }) {
  await connection()
  const [ctx, partTypes, sp] = await Promise.all([getPartsShopContext(), listPartTypes(), searchParams])
  if (!ctx) redirect("/onboarding/driver")
  const car = ctx.cars[0]
  const initialResults =
    sp.q || sp.part
      ? await searchPartsForCar({ make: car?.make, model: car?.model, year: car?.year ?? undefined, q: sp.q || undefined, partTypeId: sp.part || undefined })
      : null
  return (
    <PartsShop
      cars={ctx.cars}
      myGarages={ctx.myGarages}
      partTypes={partTypes.map((p) => ({ id: p.id, name: p.name, category: p.category }))}
      initialQ={sp.q ?? ""}
      initialPartTypeId={sp.part ?? null}
      initialResults={initialResults}
    />
  )
}

export default function PartsPage(props: { searchParams: Promise<{ q?: string; part?: string }> }) {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em]">Parts for my car</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Only parts that fit your car. Send them to your garage, have them delivered, or pick up. Your money is held by FixAm until the part arrives.
      </p>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-muted" />}>
        <Loader searchParams={props.searchParams} />
      </Suspense>
    </div>
  )
}
