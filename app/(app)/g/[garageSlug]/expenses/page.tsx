import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { listExpenseData } from "@/lib/money/expenses"
import { ExpensesPanel } from "./expenses-panel"

async function Loader({ params, searchParams }: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await connection()
  const { garageSlug } = await params
  const { from, to } = await searchParams

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/expenses`)
  await ensureUser()

  const [garage] = await db().select().from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) redirect("/onboarding")

  const m = await resolveMembership(userId, garage.id)
  if (!m) notFound()
  const principal = { kind: "staff" as const, role: m.role as StaffRole, garageId: garage.id, branchId: m.branchId }
  const canManage = can(principal, "expenses.manage")
  const canCashUp = can(principal, "cash_up.perform")
  const canView = canManage || canCashUp || can(principal, "reports.view_branch") || can(principal, "reports.view_all") || can(principal, "reports.view_daily")
  if (!canView) notFound()

  const res = await listExpenseData({ garageId: garage.id, from, to })
  if (!res.ok) notFound()

  return (
    <ExpensesPanel
      garageSlug={garageSlug}
      garageId={garage.id}
      canManage={canManage}
      canCashUp={canCashUp}
      data={res.data}
    />
  )
}

export default function ExpensesPage({
  params, searchParams,
}: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-6xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <Loader params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  )
}
