import { redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { getVendorDashboard, listVendorProducts } from "@/lib/vendors/actions"
import { VendorPanel } from "./vendor-panel"

async function Loader() {
  await connection()
  const dash = await getVendorDashboard()
  if (!dash.ok) redirect("/login")
  if (!dash.data) redirect("/onboarding/parts-seller")
  const products = dash.data.canManage ? await listVendorProducts({}) : { ok: true as const, data: [] as never[] }

  return <VendorPanel dashboard={dash.data} products={products.ok ? products.data : []} />
}

export default function VendorPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-8 md:py-8">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
        <Loader />
      </Suspense>
    </div>
  )
}
