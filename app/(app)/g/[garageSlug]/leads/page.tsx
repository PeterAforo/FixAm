import { Suspense } from "react"
import { connection } from "next/server"
import { notFound, redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages } from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can } from "@/lib/auth/permissions"
import { listGarageLeads } from "@/lib/repair-requests/actions"
import { LeadsPanel } from "./leads-panel"

async function Loader({ params }: { params: Promise<{ garageSlug: string }> }) {
  await connection()
  const { garageSlug } = await params
  const userId = await getSessionUserId()
  if (!userId) redirect("/login")
  const [garage] = await db().select({ id: garages.id }).from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) notFound()
  const m = await resolveMembership(userId, garage.id)
  if (!m || !can({ kind: "staff", role: m.role, garageId: garage.id, branchId: m.branchId }, "bookings.manage")) notFound()
  const leads = await listGarageLeads(garage.id)
  return <LeadsPanel garageId={garage.id} garageSlug={garageSlug} leads={leads} />
}

export default function LeadsPage(props: { params: Promise<{ garageSlug: string }> }) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em]">Leads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Drivers nearby describe their car problem first. Send a price range and a time — when they accept, it lands in Bookings.
        </p>
        <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-2xl bg-muted" />}>
          <Loader params={props.params} />
        </Suspense>
      </div>
    </div>
  )
}
