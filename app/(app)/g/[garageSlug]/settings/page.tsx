import { Suspense } from "react"
import { connection } from "next/server"
import { notFound, redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import Link from "next/link"
import { db } from "@/lib/db"
import { garages } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can } from "@/lib/auth/permissions"
import { getGarageBilling } from "@/lib/billing/actions"
import { BillingPanel } from "./billing-panel"

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
  if (!can(principal, "garage.settings.manage") && !can(principal, "garage.subscription.manage")) notFound()

  const billing = await getGarageBilling({ garageId: garage.id })

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
