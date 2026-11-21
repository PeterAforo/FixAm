import { redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { getVendorDashboard, listVendorProducts } from "@/lib/vendors/actions"
import { VendorPanel } from "./vendor-panel"

async function Loader() {
  await connection()
  const userId = await getSessionUserId()
  if (!userId) redirect("/login?next=/vendor")
  await ensureUser()

  const dash = await getVendorDashboard()
  const products = dash.ok && dash.data?.canManage ? await listVendorProducts({}) : { ok: true as const, data: [] as never[] }

  return (
    <VendorPanel
      dashboard={dash.ok ? dash.data : null}
      products={products.ok ? products.data : []}
    />
  )
}

export default function VendorPage() {
  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-5xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <Loader />
        </Suspense>
      </div>
    </div>
  )
}
