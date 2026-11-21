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
import { RenewalsPanel } from "./renewals-panel"

async function Loader({ garageSlug }: { garageSlug: string }) {
  await connection()
  const userId = await getSessionUserId()
  if (!userId) redirect("/login")
  await ensureUser()

  const [garage] = await db().select().from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) notFound()
  const m = await resolveMembership(userId, garage.id)
  if (!m) redirect("/login")
  const canView = can({ kind: "staff", role: m.role as never, garageId: garage.id, branchId: m.branchId }, "renewals.view")
  if (!canView) redirect(`/g/${garageSlug}`)

  const res = await listRenewals({ garageId: garage.id })
  const renewals = res.ok ? res.data : []

  return <RenewalsPanel garageId={garage.id} garageSlug={garageSlug} renewals={renewals} canProcess={can({ kind: "staff", role: m.role as never, garageId: garage.id, branchId: m.branchId }, "renewals.process")} />
}

export default async function RenewalsPage({ params }: { params: Promise<{ garageSlug: string }> }) {
  const { garageSlug } = await params
  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto max-w-7xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <Loader garageSlug={garageSlug} />
        </Suspense>
      </div>
    </div>
  )
}
