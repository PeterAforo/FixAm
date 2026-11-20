import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { navForRole } from "@/lib/nav"
import { EmptyState } from "@/components/brand/empty-state"

const SECTION_LABELS: Record<string, string> = {
  jobs: "Job board",
  "my-jobs": "My jobs",
  bookings: "Bookings",
  vehicles: "Vehicles",
  customers: "Customers",
  parts: "Parts & stock",
  pos: "Point of sale",
  marketplace: "Marketplace",
  reminders: "Reminders",
  renewals: "Renewals",
  money: "Money",
  reports: "Reports",
  "my-stats": "My stats",
  settings: "Settings",
  "check-in": "Check in",
}

async function Section({
  params,
}: {
  params: Promise<{ garageSlug: string; section: string }>
}) {
  await connection()
  const { garageSlug, section } = await params
  const label = SECTION_LABELS[section]
  if (!label) notFound()

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/${section}`)
  await ensureUser()

  const [garage] = await db()
    .select()
    .from(garages)
    .where(eq(garages.slug, garageSlug))
    .limit(1)
  const membership = garage ? await resolveMembership(userId, garage.id) : null
  if (!membership) redirect("/onboarding")

  // Role gate: section must be reachable via this role's nav
  const allowed =
    navForRole(membership.role).some((i) =>
      i.route.endsWith(`/${section}`) || (section === "check-in" && membership.role !== "storekeeper")
    ) || section === "settings"
  if (!allowed) notFound()

  return (
    <div className="p-6 md:p-10">
      <EmptyState
        title={label}
        description="This screen is on the way — it lands in an upcoming phase. The shell, navigation and permissions are already live."
      />
    </div>
  )
}

export default function GarageSectionPage({
  params,
}: {
  params: Promise<{ garageSlug: string; section: string }>
}) {
  return (
    <Suspense fallback={<div className="p-10"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></div>}>
      <Section params={params} />
    </Suspense>
  )
}
