import { Suspense } from "react"
import { connection } from "next/server"
import { notFound, redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages } from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can } from "@/lib/auth/permissions"
import { listIncomingParts } from "@/lib/parts-shop/garage-actions"
import { IncomingPartsPanel } from "./incoming-parts-panel"

async function Loader({ params }: { params: Promise<{ garageSlug: string }> }) {
  await connection()
  const { garageSlug } = await params
  const userId = await getSessionUserId()
  if (!userId) redirect("/login")
  const [garage] = await db().select({ id: garages.id, name: garages.name }).from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) notFound()
  const m = await resolveMembership(userId, garage.id)
  if (!m) notFound()
  const principal = { kind: "staff" as const, role: m.role, garageId: garage.id, branchId: m.branchId }
  if (!can(principal, "purchase_orders.view")) notFound()
  const parts = await listIncomingParts(garage.id)
  return <IncomingPartsPanel garageId={garage.id} parts={parts} canReceive={can(principal, "purchase_orders.receive")} />
}

export default function IncomingPartsPage(props: { params: Promise<{ garageSlug: string }> }) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em]">Incoming parts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Parts your customers bought on FixAm and sent here for fitting. Take a photo when one arrives — that pays the seller.
        </p>
        <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-2xl bg-muted" />}>
          <Loader params={props.params} />
        </Suspense>
      </div>
    </div>
  )
}
