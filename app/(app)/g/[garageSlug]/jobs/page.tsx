import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import Link from "next/link"
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { customers, garages, jobs, vehicles } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { Card, CardContent } from "@/components/brand/card"
import { EmptyState } from "@/components/brand/empty-state"
import { StatusPill } from "@/components/brand/status-pill"
import { PlateChip } from "@/components/brand/plate-chip"
import { Button } from "@/components/brand/button"
import type { JobStatus } from "@/lib/jobs/transitions"

const OPEN_STATUSES = ["booked", "checked_in", "diagnosing", "estimate_sent", "approved", "in_progress", "waiting_parts", "quality_check", "ready"] as const

async function JobsLoader({
  params,
  searchParams,
}: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  await connection()
  const { garageSlug } = await params
  const { q = "", status = "" } = await searchParams

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/jobs`)
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
  // mechanics see their own jobs via /my-jobs; board viewers see all
  if (membership.role === "mechanic") redirect(`/g/${garageSlug}/my-jobs`)
  if (!can(principal, "jobs.view")) notFound()

  const conditions = [eq(jobs.garageId, garage.id), isNull(jobs.deletedAt)]
  const term = q.trim()
  if (term) {
    const like = `%${term}%`
    conditions.push(
      or(
        ilike(jobs.number, like),
        ilike(jobs.complaint, like),
        ilike(vehicles.plateNumber, like),
        ilike(customers.fullName, like)
      )!
    )
  }
  if (status === "open") {
    conditions.push(sql`${jobs.status} = ANY(${[...OPEN_STATUSES]}::job_status[])`)
  } else if (status) {
    conditions.push(eq(jobs.status, status as JobStatus))
  }

  const rows = await db()
    .select({
      id: jobs.id,
      number: jobs.number,
      status: jobs.status,
      priority: jobs.priority,
      complaint: jobs.complaint,
      promisedAt: jobs.promisedAt,
      checkedInAt: jobs.checkedInAt,
      plateNumber: vehicles.plateNumber,
      customerName: customers.fullName,
      bayName: sql<string | null>`(select name from bays where id = ${jobs.bayId})`,
    })
    .from(jobs)
    .innerJoin(vehicles, eq(jobs.vehicleId, vehicles.id))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(and(...conditions))
    .orderBy(desc(jobs.createdAt))
    .limit(200)

  const [counts] = await db()
    .select({
      open: sql<number>`count(*) filter (where ${jobs.status} = ANY(${[...OPEN_STATUSES]}::job_status[]))::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(jobs)
    .where(and(eq(jobs.garageId, garage.id), isNull(jobs.deletedAt)))

  const canCheckIn = can(principal, "jobs.create")

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Job board</h1>
          <p className="text-muted-foreground">
            {counts?.open ?? 0} open · {counts?.total ?? 0} total
          </p>
        </div>
        {canCheckIn && (
          <Button asChild>
            <Link href={`/g/${garageSlug}/check-in`}>+ Check in</Link>
          </Button>
        )}
      </header>

      <form className="flex flex-wrap items-center gap-3" action={`/g/${garageSlug}/jobs`}>
        <input
          name="q"
          defaultValue={term}
          placeholder="Search job #, plate, customer, complaint…"
          className="min-h-11 min-w-64 flex-1 rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <select name="status" defaultValue={status} className="min-h-11 rounded-lg border-2 border-border bg-surface px-3 text-sm">
          <option value="">All jobs</option>
          <option value="open">Open only</option>
          <option value="booked">Booked</option>
          <option value="checked_in">Checked in</option>
          <option value="in_progress">In progress</option>
          <option value="quality_check">Quality check</option>
          <option value="ready">Ready</option>
          <option value="delivered">Delivered</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title="No jobs found"
          description={term || status ? "Try a different search or filter." : "Check in a vehicle to create the first job."}
          action={canCheckIn ? <Button asChild><Link href={`/g/${garageSlug}/check-in`}>+ Check in</Link></Button> : undefined}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {rows.map((j) => (
                <li key={j.id}>
                  <Link
                    href={`/g/${garageSlug}/jobs/${j.id}`}
                    className="flex flex-wrap items-center gap-3 px-5 py-4 transition-colors hover:bg-surface-muted/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-bold">
                        <span className="font-mono">{j.number}</span>
                        <PlateChip plate={j.plateNumber} />
                        {j.priority !== "normal" && (
                          <StatusPill tone={j.priority === "urgent" ? "danger" : "warning"}>{j.priority}</StatusPill>
                        )}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {j.customerName} · {j.complaint ?? "—"}
                        {j.bayName ? ` · Bay ${j.bayName}` : ""}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {j.promisedAt ? <p>Promised {new Date(j.promisedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p> : null}
                    </div>
                    <StatusPill status={j.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function JobsPage({
  params,
  searchParams,
}: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <JobsLoader params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  )
}
