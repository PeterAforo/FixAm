import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages, jobTemplates } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { TemplatesPanel } from "./templates-panel"

async function TemplatesLoader({ params }: { params: Promise<{ garageSlug: string }> }) {
  await connection()
  const { garageSlug } = await params

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/settings/templates`)
  await ensureUser()

  const [garage] = await db().select().from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) redirect("/onboarding")

  const membership = await resolveMembership(userId, garage.id)
  if (!membership) redirect("/onboarding")

  const principal = {
    kind: "staff" as const,
    role: membership.role as StaffRole,
    garageId: garage.id,
    branchId: membership.branchId,
  }
  if (!can(principal, "garage.templates.manage")) notFound()

  const rows = await db()
    .select()
    .from(jobTemplates)
    .where(eq(jobTemplates.garageId, garage.id))
    .orderBy(asc(jobTemplates.name))

  return (
    <TemplatesPanel
      garageSlug={garageSlug}
      garageId={garage.id}
      templates={rows.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        defaultItems: t.defaultItems,
        checklist: t.checklist,
        estimatedMinutes: t.estimatedMinutes,
        depositPercent: t.depositPercent,
        createsDueItemType: t.createsDueItemType,
        isActive: t.isActive ?? true,
      }))}
    />
  )
}

export default function TemplatesPage({ params }: { params: Promise<{ garageSlug: string }> }) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-4xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <TemplatesLoader params={params} />
        </Suspense>
      </div>
    </div>
  )
}
