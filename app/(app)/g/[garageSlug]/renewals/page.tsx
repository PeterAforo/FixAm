import { Suspense } from "react"
import { connection } from "next/server"
import { notFound, redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can } from "@/lib/auth/permissions"
import { listRenewals } from "@/lib/renewals/actions"
import { listGarageBrokerRequests } from "@/lib/brokers/actions"
import { RenewalsPanel } from "./renewals-panel"

async function Loader({ params }: { params: Promise<{ garageSlug: string }> }) {
  const { garageSlug } = await params
  await connection()
  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/renewals`)
  await ensureUser()

  const [garage] = await db().select().from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) notFound()
  const m = await resolveMembership(userId, garage.id)
  if (!m) redirect(`/login?next=/g/${garageSlug}/renewals`)
  const canView = can({ kind: "staff", role: m.role as never, garageId: garage.id, branchId: m.branchId }, "renewals.view")
  if (!canView) redirect(`/g/${garageSlug}`)

  const [res, brokerJobs] = await Promise.all([listRenewals({ garageId: garage.id }), listGarageBrokerRequests(garage.id)])
  const renewals = res.ok ? res.data : []

  return <RenewalsPanel garageId={garage.id} garageSlug={garageSlug} renewals={renewals} brokerJobs={brokerJobs} canProcess={can({ kind: "staff", role: m.role as never, garageId: garage.id, branchId: m.branchId }, "renewals.process")} />
}

export default function RenewalsPage({ params }: { params: Promise<{ garageSlug: string }> }) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-7xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <Loader params={params} />
        </Suspense>
      </div>
    </div>
  )
}
