import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { and, asc, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  customers,
  garages,
  jobAssignments,
  jobFindings,
  jobItems,
  jobTasks,
  jobs,
  timeLogs,
  users,
  vehicles,
} from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { MechanicJobPanel } from "./mechanic-job-panel"

async function MechanicJobLoader({
  params,
}: {
  params: Promise<{ garageSlug: string; jobId: string }>
}) {
  await connection()
  const { garageSlug, jobId } = await params

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/my-jobs/${jobId}`)
  await ensureUser()

  const [garage] = await db().select().from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) redirect("/onboarding")

  const membership = await resolveMembership(userId, garage.id)
  if (!membership || membership.role !== "mechanic") notFound()

  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.garageId, garage.id), isNull(jobs.deletedAt)))
    .limit(1)
  if (!job) notFound()

  const [asg] = await db()
    .select({ id: jobAssignments.id, isLead: jobAssignments.isLead })
    .from(jobAssignments)
    .where(and(eq(jobAssignments.jobId, job.id), eq(jobAssignments.userId, userId)))
    .limit(1)
  if (!asg) notFound()

  const [vehicle, customer, taskRows, findingRows, itemRows, openTimer, assigneeRows] = await Promise.all([
    db().select().from(vehicles).where(eq(vehicles.id, job.vehicleId)).limit(1),
    db().select().from(customers).where(eq(customers.id, job.customerId)).limit(1),
    db().select().from(jobTasks).where(and(eq(jobTasks.jobId, job.id), eq(jobTasks.garageId, garage.id))).orderBy(asc(jobTasks.sortOrder)),
    db().select().from(jobFindings).where(and(eq(jobFindings.jobId, job.id), eq(jobFindings.garageId, garage.id))).orderBy(asc(jobFindings.createdAt)),
    db().select().from(jobItems).where(and(eq(jobItems.jobId, job.id), eq(jobItems.garageId, garage.id))).orderBy(asc(jobItems.sortOrder)),
    db().select({ id: timeLogs.id, startedAt: timeLogs.startedAt })
      .from(timeLogs)
      .where(and(eq(timeLogs.jobId, job.id), eq(timeLogs.userId, userId), isNull(timeLogs.endedAt)))
      .orderBy(asc(timeLogs.startedAt))
      .limit(1),
    db().select({ name: users.fullName, isLead: jobAssignments.isLead })
      .from(jobAssignments)
      .innerJoin(users, eq(jobAssignments.userId, users.id))
      .where(eq(jobAssignments.jobId, job.id)),
  ])

  const v = vehicle[0]
  const c = customer[0]

  return (
    <MechanicJobPanel
      garageSlug={garageSlug}
      garageId={garage.id}
      job={{
        id: job.id,
        number: job.number,
        status: job.status,
        complaint: job.complaint,
        checkInOdometerKm: job.checkInOdometerKm,
        checkInItems: job.checkInItems,
        promisedAt: job.promisedAt?.toISOString() ?? null,
      }}
      vehicle={v ? { id: v.id, plateNumber: v.plateNumber, make: v.make, model: v.model } : null}
      customer={c ? { id: c.id, name: c.fullName || c.phone } : null}
      assignees={assigneeRows.map((a) => ({ name: a.name, isLead: a.isLead ?? false }))}
      tasks={taskRows.map((t) => ({
        id: t.id,
        title: t.title,
        isDone: t.isDone ?? false,
        required: t.required ?? false,
        checklistItem: t.checklistItem ?? false,
      }))}
      findings={findingRows.map((f) => ({
        id: f.id,
        title: f.title,
        description: f.description,
        severity: f.severity,
      }))}
      items={itemRows.map((i) => ({
        id: i.id,
        description: i.description,
        type: i.type,
        quantity: Number(i.quantity),
      }))}
      openTimer={openTimer[0] ? { id: openTimer[0].id, startedAt: openTimer[0].startedAt.toISOString() } : null}
    />
  )
}

export default function MechanicJobPage({
  params,
}: {
  params: Promise<{ garageSlug: string; jobId: string }>
}) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-3xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <MechanicJobLoader params={params} />
        </Suspense>
      </div>
    </div>
  )
}
