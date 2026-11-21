import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages, users } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { loadDashboard } from "@/lib/dashboard"
import { DashboardPanel } from "./dashboard-panel"

async function Loader({ params }: { params: Promise<{ garageSlug: string }> }) {
  await connection()
  const { garageSlug } = await params

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}`)
  await ensureUser()
  const [userRow] = await db().select({ fullName: users.fullName }).from(users).where(eq(users.id, userId)).limit(1)

  const [garage] = await db().select().from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) redirect("/onboarding")

  const m = await resolveMembership(userId, garage.id)
  if (!m) notFound()
  const principal = { kind: "staff" as const, role: m.role as StaffRole, garageId: garage.id, branchId: m.branchId }

  const data = await loadDashboard(garage.id, m.branchId)
  const canSeeMoney = can(principal, "invoices.view") || can(principal, "payments.record") || can(principal, "reports.view_daily")

  return (
    <DashboardPanel
      garageId={garage.id}
      garageSlug={garageSlug}
      garageName={garage.name}
      userName={userRow?.fullName ?? "there"}
      canSeeMoney={canSeeMoney}
      canCheckIn={can(principal, "jobs.create")}
      canBook={can(principal, "bookings.manage")}
      canExpense={can(principal, "expenses.manage")}
      canPos={can(principal, "pos.sell")}
      data={data}
    />
  )
}

export default function GarageDashboardPage({ params }: { params: Promise<{ garageSlug: string }> }) {
  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <Loader params={params} />
        </Suspense>
      </div>
    </div>
  )
}
