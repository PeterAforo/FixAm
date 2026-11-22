import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import Link from "next/link"
import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { customers, garages, jobAssignments, jobs, vehicles } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { Card, CardContent } from "@/components/brand/card"
import { EmptyState } from "@/components/brand/empty-state"
import { StatusPill } from "@/components/brand/status-pill"
import { PlateChip } from "@/components/brand/plate-chip"

const ACTIVE = ["booked", "checked_in", "diagnosing", "estimate_sent", "approved", "in_progress", "waiting_parts", "quality_check", "ready"] as const

async function MyJobsLoader({ params }: { params: Promise<{ garageSlug: string }> }) {
  await connection()
  const { garageSlug } = await params

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/my-jobs`)
  await ensureUser()

  const [garage] = await db().select().from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) redirect("/onboarding")

  const membership = await resolveMembership(userId, garage.id)
  if (!membership || membership.role !== "mechanic") notFound()

  const rows = await db()
    .select({
      id: jobs.id,
      number: jobs.number,
      status: jobs.status,
      priority: jobs.priority,
      complaint: jobs.complaint,
      promisedAt: jobs.promisedAt,
      plateNumber: vehicles.plateNumber,
      make: vehicles.make,
      model: vehicles.model,
      customerName: customers.fullName,
      isLead: jobAssignments.isLead,
    })
    .from(jobs)
    .innerJoin(vehicles, eq(jobs.vehicleId, vehicles.id))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .innerJoin(jobAssignments, and(eq(jobAssignments.jobId, jobs.id), eq(jobAssignments.userId, userId)))
    .where(and(eq(jobs.garageId, garage.id), isNull(jobs.deletedAt), inArray(jobs.status, [...ACTIVE])))
    .orderBy(desc(jobs.promisedAt))
    .limit(100)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em]">My jobs</h1>
        <p className="text-muted-foreground">{rows.length} active assignments</p>
      </header>
      {rows.length === 0 ? (
        <EmptyState pose="sleeping" title="No active jobs" description="Jobs assigned to you will appear here." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((j) => (
            <Link key={j.id} href={`/g/${garageSlug}/my-jobs/${j.id}`}>
              <Card className="h-full transition-transform">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-sm font-semibold">{j.number}</p>
                    <StatusPill status={j.status} />
                  </div>
                  <p className="mt-1 flex items-center gap-2 text-sm font-semibold">
                    <PlateChip plate={j.plateNumber} />
                    <span className="truncate text-muted-foreground">{j.make} {j.model}</span>
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {j.customerName} · {j.complaint ?? "—"}
                  </p>
                  {j.promisedAt && (
                    <p className="mt-2 text-xs font-semibold text-muted-foreground">
                      Promised {new Date(j.promisedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {j.isLead ? " · lead" : ""}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MyJobsPage({ params }: { params: Promise<{ garageSlug: string }> }) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-4xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <MyJobsLoader params={params} />
        </Suspense>
      </div>
    </div>
  )
}
