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
import { CustomerPartsPanel } from "./customer-parts-panel"
import { SpecialtiesPanel } from "./specialties-panel"
import { WorkshopRulesPanel } from "./workshop-rules-panel"
import { SeasonalPanel } from "./seasonal-panel"
import { PickupPanel } from "./pickup-panel"
import { WhatsAppPanel } from "./whatsapp-panel"
import { getPickupSettings } from "@/lib/pickups/actions"
import { getSeasonalOverview } from "@/lib/seasonal/actions"
import { garageSettings } from "@/lib/db/schema"
import { getCustomerPartsSettings } from "@/lib/parts-shop/garage-actions"

async function Loader({ params }: { params: Promise<{ garageSlug: string }> }) {
  const { garageSlug } = await params
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

  const [billing, coverageRows, catalogue, partsSettings, seasonal] = await Promise.all([
    getGarageBilling({ garageId: garage.id }),
    canManageSettings
      ? db()
          .select()
          .from(garageVehicleCoverage)
          .where(and(eq(garageVehicleCoverage.garageId, garage.id), eq(garageVehicleCoverage.isActive, true)))
      : Promise.resolve([]),
    canManageSettings ? listCatalogueGrouped() : Promise.resolve([]),
    canManageSettings ? getCustomerPartsSettings(garage.id) : Promise.resolve(null),
    canManageSettings ? getSeasonalOverview(garage.id).catch(() => null) : Promise.resolve(null),
  ])
  const pickup = canManageSettings ? await getPickupSettings(garage.id).catch(() => null) : null
  const [settingsRow] = canManageSettings
    ? await db().select({ specialties: garageSettings.specialties, requireOldPartProof: garageSettings.requireOldPartProof, whatsappNumber: garageSettings.whatsappNumber, whatsappPhoneNumberId: garageSettings.whatsappPhoneNumberId, whatsappAiEnabled: garageSettings.whatsappAiEnabled }).from(garageSettings).where(eq(garageSettings.garageId, garage.id)).limit(1)
    : []
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
        <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em]">Settings</h1>
        <p className="text-sm text-muted-foreground">{garage.name}</p>
      </div>

      <section>
        <h2 className="text-[15px] font-semibold">Team &amp; templates</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Link href={`/g/${garageSlug}/settings/staff`} className="rounded-xl border border-border bg-card p-4 text-sm font-semibold hover:bg-surface-muted">Staff &amp; invites →</Link>
          <Link href={`/g/${garageSlug}/settings/templates`} className="rounded-xl border border-border bg-card p-4 text-sm font-semibold hover:bg-surface-muted">Message templates →</Link>
        </div>
      </section>

      {canManageSettings && (
        <section>
          <h2 className="text-[15px] font-semibold">Directory &amp; vehicle coverage</h2>
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

      {canManageSettings && (
        <section>
          <h2 className="text-[15px] font-semibold">Workshop rules</h2>
          <WorkshopRulesPanel garageId={garage.id} requireOldPartProof={settingsRow?.requireOldPartProof ?? true} />
        </section>
      )}

      {pickup && (
        <section>
          <h2 className="text-[15px] font-semibold">Pickup &amp; drop-off</h2>
          <PickupPanel garageId={garage.id} initial={pickup} />
        </section>
      )}

      {canManageSettings && (
        <section>
          <h2 className="text-[15px] font-semibold">WhatsApp</h2>
          <p className="mt-1 text-sm text-muted-foreground">Customers message you on WhatsApp. The AI assistant answers first; staff take over in the inbox.</p>
          <WhatsAppPanel
            garageId={garage.id}
            whatsappNumber={settingsRow?.whatsappNumber ?? null}
            phoneNumberId={settingsRow?.whatsappPhoneNumberId ?? null}
            aiEnabled={settingsRow?.whatsappAiEnabled ?? false}
          />
        </section>
      )}

      {seasonal && (
        <section>
          <h2 className="text-[15px] font-semibold">Seasonal reminders</h2>
          <SeasonalPanel garageId={garage.id} overview={seasonal} />
        </section>
      )}

      {canManageSettings && (
        <section>
          <h2 className="text-[15px] font-semibold">Repair leads — what you specialise in</h2>
          <p className="mt-1 text-sm text-muted-foreground">Drivers post problems before choosing a garage. Pick your specialties so the right leads reach you.</p>
          <SpecialtiesPanel garageId={garage.id} initial={settingsRow?.specialties ?? []} />
        </section>
      )}

      {partsSettings && (
        <section>
          <h2 className="text-[15px] font-semibold">Customer parts &amp; payouts</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Customers can buy parts on FixAm and have them delivered to you for fitting. Their money is held until you confirm the part arrived.
          </p>
          <CustomerPartsPanel garageId={garage.id} settings={partsSettings} />
        </section>
      )}

      <section>
        <h2 className="text-[15px] font-semibold">Billing &amp; plan</h2>
        {billing.ok && billing.data ? (
          <BillingPanel garageId={garage.id} billing={billing.data} />
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No subscription found for this garage.</p>
        )}
      </section>
    </div>
  )
}

export default function SettingsPage({ params }: { params: Promise<{ garageSlug: string }> }) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
        <Loader params={params} />
      </Suspense>
    </div>
  )
}
