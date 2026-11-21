import { Suspense } from "react"
import { connection } from "next/server"
import { eq } from "drizzle-orm"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { garages } from "@/lib/db/schema"
import { getMyStats } from "@/lib/stats/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can } from "@/lib/auth/permissions"
import { MyStatsPanel } from "./my-stats-panel"

async function StatsLoader({ garageSlug }: { garageSlug: string }) {
  await connection()
  const [garage] = await db().select({ id: garages.id, slug: garages.slug }).from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) redirect("/onboarding")

  const stats = await getMyStats(garage.id)
  if (!stats) redirect("/onboarding")

  const userId = await getSessionUserId()
  const membership = userId ? await resolveMembership(userId, garage.id) : null
  const canManage = membership
    ? can({ kind: "staff", role: membership.role, garageId: garage.id, branchId: membership.branchId }, "garage.settings.manage")
    : false

  return <MyStatsPanel garageId={garage.id} stats={stats} canManage={canManage} />
}

export default async function MyStatsPage({ params }: { params: Promise<{ garageSlug: string }> }) {
  const { garageSlug } = await params
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <h1 className="font-display text-3xl font-bold">My stats</h1>
      <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-2xl bg-surface" />}>
        <StatsLoader garageSlug={garageSlug} />
      </Suspense>
    </div>
  )
}
