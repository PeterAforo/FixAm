import { Suspense } from "react"
import { connection } from "next/server"
import { redirect } from "next/navigation"
import { getPartsShopContext } from "@/lib/parts-shop/actions"
import { getClaimFormData } from "@/lib/claims/actions"
import { ClaimWizard } from "../claim-wizard"

async function Loader() {
  await connection()
  const [ctx, form] = await Promise.all([getPartsShopContext(), getClaimFormData()])
  if (!ctx || !form) redirect("/onboarding/driver")
  return (
    <ClaimWizard
      vehicles={form.vehicles.map((v) => ({ id: v.id, plateNumber: v.plateNumber, make: v.make, model: v.model, year: v.year }))}
      brokers={form.brokers}
      garages={ctx.myGarages.map((g) => ({ id: g.id, name: g.name, city: g.city ?? null }))}
    />
  )
}

export default function NewClaimPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em]">File an insurance claim</h1>
      <p className="mt-1 text-sm text-muted-foreground">Five minutes, start to finish. Your draft saves itself as you go.</p>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-muted" />}>
        <Loader />
      </Suspense>
    </div>
  )
}
