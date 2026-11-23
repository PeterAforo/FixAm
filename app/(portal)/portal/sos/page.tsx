import { Suspense } from "react"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { getPartsShopContext } from "@/lib/parts-shop/actions"
import { listMySos } from "@/lib/towing/actions"
import { SosForm } from "./sos-form"

async function Loader() {
  await connection()
  const [ctx, recent] = await Promise.all([getPartsShopContext(), listMySos()])
  if (!ctx) redirect("/onboarding/driver")
  return <SosForm cars={ctx.cars} myGarages={ctx.myGarages} recent={recent} />
}

export default function SosPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em]">Breakdown help</h1>
      <p className="mt-1 text-sm text-muted-foreground">Stuck on the road? We alert the nearest tow trucks and roadside help. If anyone is hurt, call 112 or the ambulance on 193 first.</p>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-muted" />}>
        <Loader />
      </Suspense>
    </div>
  )
}
