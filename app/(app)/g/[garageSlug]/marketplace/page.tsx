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
import Link from "next/link"
import { MarketplacePanel } from "./marketplace-panel"
import { listIncomingParts } from "@/lib/parts-shop/garage-actions"

async function Loader({ params, searchParams }: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ q?: string; tab?: string; payment?: string }>
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

  const [browse, orders, branchRows, incoming] = await Promise.all([
    browseMarketplace({ garageId: garage.id, q: sp.q || undefined }),
    listGarageVendorOrders({ garageId: garage.id }),
    db().select({ id: branches.id, name: branches.name }).from(branches)
      .where(and(eq(branches.garageId, garage.id), isNull(branches.deletedAt))).orderBy(branches.name),
    listIncomingParts(garage.id),
  ])
  const waiting = incoming.filter((p) => p.status !== "received").length

  const canOrder = can(principal, "purchase_orders.create")
  const canReceive = can(principal, "purchase_orders.receive")

  return (
    <>
    <Link href={`/g/${garageSlug}/incoming-parts`} className="mb-4 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm hover:bg-surface-muted">
      <span><b>Incoming parts</b> — parts customers bought and sent to you{waiting ? ` · ${waiting} on the way` : ""}</span>
      <span aria-hidden>→</span>
    </Link>
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
      initialTab={sp.tab === "orders" || sp.payment ? "orders" : "shop"}
      paymentNotice={sp.payment === "success" || sp.payment === "pending" || sp.payment === "failed" ? sp.payment : null}
    />
    </>
  )
}

export default function MarketplacePage(props: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ q?: string; tab?: string; payment?: string }>
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
