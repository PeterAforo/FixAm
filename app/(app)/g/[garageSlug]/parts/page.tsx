import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { listPartsPage } from "@/lib/parts/actions"
import { PartsPanel } from "./parts-panel"

async function Loader({ params, searchParams }: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ q?: string; low?: string; branch?: string }>
}) {
  await connection()
  const { garageSlug } = await params
  const sp = await searchParams

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/parts`)
  await ensureUser()

  const [garage] = await db().select().from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) redirect("/onboarding")

  const m = await resolveMembership(userId, garage.id)
  if (!m) notFound()
  const principal = { kind: "staff" as const, role: m.role as StaffRole, garageId: garage.id, branchId: m.branchId }
  if (!can(principal, "parts.view")) notFound()

  const res = await listPartsPage({
    garageId: garage.id,
    q: sp.q || undefined,
    lowStock: sp.low === "1",
    branchId: sp.branch || undefined,
  })
  if (!res.ok) notFound()

  return (
    <PartsPanel
      garageSlug={garageSlug}
      garageId={garage.id}
      data={res.data}
    />
  )
}

export default function PartsPage({
  params, searchParams,
}: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ q?: string; low?: string; branch?: string }>
}) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-7xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <Loader params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  )
}
