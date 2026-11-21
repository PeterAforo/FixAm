import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { branches, garages } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { getReportData } from "@/lib/reports/load"
import { ReportsPanel } from "./reports-panel"

const REPORT_PERMS = ["reports.view_all", "reports.view_branch", "reports.view_daily", "reports.view_own_stats"] as const

async function Loader({ params, searchParams }: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ type?: string; period?: string; branch?: string }>
}) {
  await connection()
  const { garageSlug } = await params
  const sp = await searchParams
  const type = sp.type === "month" ? "month" : "day"
  const today = new Date()
  const period = sp.period
    ?? (type === "month" ? today.toISOString().slice(0, 7) : today.toISOString().slice(0, 10))

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/reports`)
  await ensureUser()

  const [garage] = await db().select().from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) redirect("/onboarding")

  const m = await resolveMembership(userId, garage.id)
  if (!m) notFound()
  const principal = { kind: "staff" as const, role: m.role as StaffRole, garageId: garage.id, branchId: m.branchId }
  const canView = REPORT_PERMS.some((p) => can(principal, p))
  if (!canView) notFound()

  const branchRows = await db().select({ id: branches.id, name: branches.name }).from(branches)
    .where(and(eq(branches.garageId, garage.id), isNull(branches.deletedAt)))
  const allowedBranchIds = m.branchId ? new Set([m.branchId]) : null
  const visibleBranches = allowedBranchIds
    ? branchRows.filter((b) => allowedBranchIds.has(b.id))
    : branchRows

  const branchId = sp.branch && visibleBranches.some((b) => b.id === sp.branch)
    ? sp.branch
    : (m.branchId ?? null)

  const data = await getReportData(garage.id, branchId, type, period)
  if (!data) notFound()

  const profitVisible = can(principal, "reports.view_all") || can(principal, "reports.view_branch")
  const canExport = can(principal, "reports.export")

  return (
    <ReportsPanel
      garageSlug={garageSlug}
      garageId={garage.id}
      type={type}
      period={period}
      branchId={branchId}
      branches={visibleBranches}
      data={data.metrics}
      source={data.source}
      profitVisible={profitVisible}
      canExport={canExport}
    />
  )
}

export default function ReportsPage({
  params, searchParams,
}: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ type?: string; period?: string; branch?: string }>
}) {
  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <Loader params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  )
}
