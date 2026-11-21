import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { branches, garages } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { PosPanel } from "./pos-panel"

async function Loader({ params }: { params: Promise<{ garageSlug: string }> }) {
  await connection()
  const { garageSlug } = await params

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/pos`)
  await ensureUser()

  const [garage] = await db().select().from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) redirect("/onboarding")

  const m = await resolveMembership(userId, garage.id)
  if (!m) notFound()
  const principal = { kind: "staff" as const, role: m.role as StaffRole, garageId: garage.id, branchId: m.branchId }
  if (!can(principal, "pos.sell")) notFound()

  const branchRows = await db().select({ id: branches.id, name: branches.name }).from(branches)
    .where(and(eq(branches.garageId, garage.id), isNull(branches.deletedAt)))
  const visible = m.branchId ? branchRows.filter((b) => b.id === m.branchId) : branchRows

  return <PosPanel garageSlug={garageSlug} garageId={garage.id} branches={visible} defaultBranchId={visible[0]?.id ?? null} />
}

export default function PosPage({ params }: { params: Promise<{ garageSlug: string }> }) {
  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" />}>
          <Loader params={params} />
        </Suspense>
      </div>
    </div>
  )
}
