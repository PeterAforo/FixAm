import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { listPurchaseOrders } from "@/lib/purchasing/actions"
import { PosOrdersPanel } from "./po-panel"

async function Loader({ params, searchParams }: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ status?: string }>
}) {
  await connection()
  const { garageSlug } = await params
  const sp = await searchParams

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/purchase-orders`)
  await ensureUser()

  const [garage] = await db().select().from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) redirect("/onboarding")

  const m = await resolveMembership(userId, garage.id)
  if (!m) notFound()
  const principal = { kind: "staff" as const, role: m.role as StaffRole, garageId: garage.id, branchId: m.branchId }
  if (!can(principal, "purchase_orders.view")) notFound()

  const res = await listPurchaseOrders({ garageId: garage.id, status: sp.status || undefined })
  if (!res.ok) notFound()

  return <PosOrdersPanel garageSlug={garageSlug} garageId={garage.id} data={res.data} />
}

export default function PurchaseOrdersPage({
  params, searchParams,
}: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ status?: string }>
}) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-6xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <Loader params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  )
}
