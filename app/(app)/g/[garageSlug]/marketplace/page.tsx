import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { branches, garages } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { browseMarketplace, listGarageVendorOrders } from "@/lib/marketplace/actions"
import { MarketplacePanel } from "./marketplace-panel"

async function Loader({ params, searchParams }: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ q?: string; tab?: string }>
}) {
  await connection()
  const { garageSlug } = await params
  const sp = await searchParams

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/marketplace`)
  await ensureUser()

  const [garage] = await db().select().from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) redirect("/onboarding")

  const m = await resolveMembership(userId, garage.id)
  if (!m) notFound()
  const principal = { kind: "staff" as const, role: m.role as StaffRole, garageId: garage.id, branchId: m.branchId }
  if (!can(principal, "parts.view")) notFound()

  const [browse, orders, branchRows] = await Promise.all([
    browseMarketplace({ garageId: garage.id, q: sp.q || undefined }),
    listGarageVendorOrders({ garageId: garage.id }),
    db().select({ id: branches.id, name: branches.name }).from(branches)
      .where(and(eq(branches.garageId, garage.id), isNull(branches.deletedAt))).orderBy(branches.name),
  ])

  const canOrder = can(principal, "purchase_orders.create")
  const canReceive = can(principal, "purchase_orders.receive")

  return (
    <MarketplacePanel
      garageId={garage.id}
      garageSlug={garageSlug}
      branches={branchRows}
      products={browse.ok ? browse.data.products : []}
      garageLocation={browse.ok ? browse.data.garage : { region: null, city: null }}
      orders={orders.ok ? orders.data : []}
      canOrder={canOrder}
      canReceive={canReceive}
      initialQ={sp.q ?? ""}
      initialTab={sp.tab === "orders" ? "orders" : "shop"}
    />
  )
}

export default function MarketplacePage(props: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ q?: string; tab?: string }>
}) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-7xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <Loader params={props.params} searchParams={props.searchParams} />
        </Suspense>
      </div>
    </div>
  )
}
