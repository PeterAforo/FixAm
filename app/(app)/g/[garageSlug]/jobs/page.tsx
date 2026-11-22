import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { and, asc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  bays,
  branches,
  customers,
  garages,
  jobAssignments,
  jobs,
  users,
  vehicles,
} from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { JobsBoard } from "./jobs-board"
import type { JobStatus } from "@/lib/jobs/transitions"

const BOARD_STATUSES: JobStatus[] = [
  "booked",
  "checked_in",
  "diagnosing",
  "estimate_sent",
  "approved",
  "declined",
  "in_progress",
  "waiting_parts",
  "quality_check",
  "ready",
  "delivered",
  "closed",
  "cancelled",
]

async function JobsLoader({
  params,
  searchParams,
}: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ mechanic?: string; priority?: string; branch?: string; swimlane?: string; q?: string; status?: string }>
}) {
  await connection()
  const { garageSlug } = await params
  const filters = await searchParams

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
  if (membership.role === "mechanic") redirect(`/g/${garageSlug}/my-jobs`)
  if (!can(principal, "jobs.view")) notFound()

  const conditions: SQL[] = [
    eq(jobs.garageId, garage.id),
    isNull(jobs.deletedAt),
  ]

  // default: exclude terminal statuses unless explicitly filtered
  if (filters.status) {
    conditions.push(eq(jobs.status, filters.status as JobStatus))
  } else {
    conditions.push(sql`${jobs.status} NOT IN ('closed','cancelled')`)
  }
  if (filters.priority && ["low", "normal", "high", "urgent"].includes(filters.priority)) {
    conditions.push(eq(jobs.priority, filters.priority as "low" | "normal" | "high" | "urgent"))
  }
  if (filters.branch) {
    conditions.push(eq(jobs.branchId, filters.branch))
  }
  if (filters.q?.trim()) {
    const like = `%${filters.q.trim()}%`
    conditions.push(
      sql`(${jobs.number} ILIKE ${like} OR ${jobs.complaint} ILIKE ${like} OR ${vehicles.plateNumber} ILIKE ${like} OR ${customers.fullName} ILIKE ${like})`
    )
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
      branchId: jobs.branchId,
      bayId: jobs.bayId,
      plateNumber: vehicles.plateNumber,
      make: vehicles.make,
      model: vehicles.model,
      year: vehicles.year,
      bodyType: vehicles.bodyType,
      colorHex: vehicles.colorHex,
      customerName: customers.fullName,
      customerId: customers.id,
    })
    .from(jobs)
    .innerJoin(vehicles, eq(jobs.vehicleId, vehicles.id))
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(and(...conditions))
    .orderBy(asc(jobs.promisedAt))
    .limit(400)

  // mechanic filter → restrict to jobs assigned to that user
  let filtered = rows
  if (filters.mechanic) {
    const assigned = await db()
      .select({ jobId: jobAssignments.jobId })
      .from(jobAssignments)
      .where(and(eq(jobAssignments.garageId, garage.id), eq(jobAssignments.userId, filters.mechanic)))
    const ids = new Set(assigned.map((a) => a.jobId))
    filtered = rows.filter((r) => ids.has(r.id))
  }

  const assignmentRows = filtered.length
    ? await db()
        .select({ jobId: jobAssignments.jobId, userId: jobAssignments.userId, name: users.fullName, isLead: jobAssignments.isLead })
        .from(jobAssignments)
        .innerJoin(users, eq(jobAssignments.userId, users.id))
        .where(and(eq(jobAssignments.garageId, garage.id), inArray(jobAssignments.jobId, filtered.map((f) => f.id))))
    : []

  const assigneesByJob = new Map<string, { userId: string; name: string; isLead: boolean }[]>()
  for (const a of assignmentRows) {
    const list = assigneesByJob.get(a.jobId) ?? []
    list.push({ userId: a.userId ?? "", name: a.name, isLead: a.isLead ?? false })
    assigneesByJob.set(a.jobId, list)
  }

  const [branchRows, mechanicRows, bayRows] = await Promise.all([
    db().select({ id: branches.id, name: branches.name }).from(branches).where(and(eq(branches.garageId, garage.id), isNull(branches.deletedAt))).orderBy(asc(branches.name)),
    db()
      .select({ userId: jobAssignments.userId, name: users.fullName })
      .from(jobAssignments)
      .innerJoin(users, eq(jobAssignments.userId, users.id))
      .where(eq(jobAssignments.garageId, garage.id))
      .groupBy(jobAssignments.userId, users.fullName)
      .orderBy(users.fullName),
    db()
      .select({ id: bays.id, name: bays.name, branchId: bays.branchId })
      .from(bays)
      .where(and(eq(bays.garageId, garage.id), eq(bays.isActive, true), isNull(bays.deletedAt)))
      .orderBy(asc(bays.name)),
  ])

  return (
    <JobsBoard
      garageSlug={garageSlug}
      garageId={garage.id}
      statuses={BOARD_STATUSES}
      jobs={filtered.map((j) => ({
        id: j.id,
        number: j.number,
        status: j.status,
        priority: j.priority ?? "normal",
        complaint: j.complaint,
        promisedAt: j.promisedAt?.toISOString() ?? null,
        plateNumber: j.plateNumber,
        vehicleLabel: `${j.make} ${j.model}${j.year ? ` ${j.year}` : ""}`,
        bodyType: j.bodyType,
        colorHex: j.colorHex,
        customerName: j.customerName,
        customerId: j.customerId,
        branchId: j.branchId,
        bayId: j.bayId,
        assignees: assigneesByJob.get(j.id) ?? [],
      }))}
      branches={branchRows}
      mechanics={[...new Map(mechanicRows.filter((m) => m.userId).map((m) => [m.userId!, m])).values()].map((m) => ({ userId: m.userId!, name: m.name }))}
      bays={bayRows.map((b) => ({ id: b.id, name: b.name, branchId: b.branchId }))}
      filters={{
        mechanic: filters.mechanic ?? "",
        priority: filters.priority ?? "",
        branch: filters.branch ?? "",
        swimlane: filters.swimlane ?? "",
        q: filters.q ?? "",
      }}
      canStatusUpdate={can(principal, "jobs.status.update")}
    />
  )
}

export default function JobsPage({
  params,
  searchParams,
}: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ mechanic?: string; priority?: string; branch?: string; swimlane?: string; q?: string; status?: string }>
}) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-[1400px]">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <JobsLoader params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  )
}
