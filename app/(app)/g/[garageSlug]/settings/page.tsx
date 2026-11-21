import { Suspense } from "react"
import { connection } from "next/server"
import { notFound, redirect } from "next/navigation"
import { and, desc, eq } from "drizzle-orm"
import Link from "next/link"
import { db } from "@/lib/db"
import { garageReviews, garageVehicleCoverage, garages } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can } from "@/lib/auth/permissions"
import { getGarageBilling } from "@/lib/billing/actions"
import { listCatalogueGrouped } from "@/lib/catalogue"
import { BillingPanel } from "./billing-panel"
import { CoveragePanel } from "./coverage-panel"
import { ReviewsPanel } from "./reviews-panel"

async function Loader({ garageSlug }: { garageSlug: string }) {
  await connection()
  const userId = await getSessionUserId()
  if (!userId) redirect("/login")
  await ensureUser()

  const [garage] = await db().select().from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) notFound()
  const m = await resolveMembership(userId, garage.id)
  if (!m) redirect("/onboarding")
  const principal = { kind: "staff" as const, role: m.role as never, garageId: garage.id, branchId: m.branchId }
  const canManageSettings = can(principal, "garage.settings.manage")
  if (!canManageSettings && !can(principal, "garage.subscription.manage")) notFound()

  const [billing, coverageRows, catalogue] = await Promise.all([
    getGarageBilling({ garageId: garage.id }),
    canManageSettings
      ? db()
          .select()
          .from(garageVehicleCoverage)
          .where(and(eq(garageVehicleCoverage.garageId, garage.id), eq(garageVehicleCoverage.isActive, true)))
      : Promise.resolve([]),
    canManageSettings ? listCatalogueGrouped() : Promise.resolve([]),
  ])
  const reviews = canManageSettings
    ? await db()
        .select({
          id: garageReviews.id,
          rating: garageReviews.rating,
          comment: garageReviews.comment,
          status: garageReviews.status,
          portalPhone: garageReviews.portalPhone,
          createdAt: garageReviews.createdAt,
        })
        .from(garageReviews)
        .where(eq(garageReviews.garageId, garage.id))
        .orderBy(desc(garageReviews.createdAt))
    : []

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">{garage.name}</p>
      </div>

      <section>
        <h2 className="font-display text-lg font-bold">Team &amp; templates</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Link href={`/g/${garageSlug}/settings/staff`} className="rounded-xl border-2 border-border bg-card p-4 text-sm font-semibold hover:bg-surface-muted">Staff &amp; invites →</Link>
          <Link href={`/g/${garageSlug}/settings/templates`} className="rounded-xl border-2 border-border bg-card p-4 text-sm font-semibold hover:bg-surface-muted">Message templates →</Link>
        </div>
      </section>

      {canManageSettings && (
        <section>
          <h2 className="font-display text-lg font-bold">Directory &amp; vehicle coverage</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Appear in the public garage directory and tell customers which vehicles you service.
          </p>
          <CoveragePanel
            garageId={garage.id}
            coverage={coverageRows}
            makes={catalogue.map((m) => ({ id: m.id, name: m.name, models: m.models.map((v) => ({ id: v.id, name: v.name })) }))}
          />
          <h3 className="mt-6 font-display text-base font-bold">Customer reviews</h3>
          <ReviewsPanel
            garageId={garage.id}
            reviews={reviews.map((r) => ({ ...r, createdAt: r.createdAt.toISOString().slice(0, 10) }))}
          />
        </section>
      )}

      <section>
        <h2 className="font-display text-lg font-bold">Billing &amp; plan</h2>
        {billing.ok && billing.data ? (
          <BillingPanel garageId={garage.id} billing={billing.data} />
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No subscription found for this garage.</p>
        )}
      </section>
    </div>
  )
}

export default async function SettingsPage({ params }: { params: Promise<{ garageSlug: string }> }) {
  const { garageSlug } = await params
  return (
    <div className="p-6 md:p-10">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
        <Loader garageSlug={garageSlug} />
      </Suspense>
    </div>
  )
}
