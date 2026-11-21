import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { and, asc, desc, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  bays,
  branches,
  customers,
  garages,
  jobAssignments,
  jobFindings,
  jobItems,
  jobMedia,
  jobStatusEvents,
  jobTasks,
  jobs,
  users,
  vehicles,
} from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { JobDetailPanel } from "./job-detail-panel"
import { nextStatuses } from "@/lib/jobs/transitions"

async function JobLoader({
  params,
}: {
  params: Promise<{ garageSlug: string; jobId: string }>
}) {
  await connection()
  const { garageSlug, jobId } = await params

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/jobs/${jobId}`)
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
  const canView =
    can(principal, "jobs.view") ||
    (membership.role === "mechanic" && can(principal, "jobs.view_assigned"))
  if (!canView) notFound()

  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.garageId, garage.id), isNull(jobs.deletedAt)))
    .limit(1)
  if (!job) notFound()

  // mechanics only see jobs they're assigned to
  if (membership.role === "mechanic") {
    const [asg] = await db()
      .select({ id: jobAssignments.id })
      .from(jobAssignments)
      .where(and(eq(jobAssignments.jobId, job.id), eq(jobAssignments.userId, userId)))
      .limit(1)
    if (!asg) notFound()
  }

  const [
    vehicle,
    customer,
    branch,
    bay,
    assignmentRows,
    findingRows,
    itemRows,
    taskRows,
    mediaRows,
    eventRows,
  ] = await Promise.all([
    db().select().from(vehicles).where(eq(vehicles.id, job.vehicleId)).limit(1),
    db().select().from(customers).where(eq(customers.id, job.customerId)).limit(1),
    db().select().from(branches).where(eq(branches.id, job.branchId)).limit(1),
    job.bayId ? db().select().from(bays).where(eq(bays.id, job.bayId)).limit(1) : Promise.resolve([]),
    db()
      .select({ userId: jobAssignments.userId, isLead: jobAssignments.isLead, name: users.fullName })
      .from(jobAssignments)
      .innerJoin(users, eq(jobAssignments.userId, users.id))
      .where(eq(jobAssignments.jobId, job.id)),
    db().select().from(jobFindings).where(and(eq(jobFindings.jobId, job.id), eq(jobFindings.garageId, garage.id))).orderBy(asc(jobFindings.createdAt)),
    db().select().from(jobItems).where(and(eq(jobItems.jobId, job.id), eq(jobItems.garageId, garage.id))).orderBy(asc(jobItems.sortOrder)),
    db().select().from(jobTasks).where(and(eq(jobTasks.jobId, job.id), eq(jobTasks.garageId, garage.id))).orderBy(asc(jobTasks.sortOrder)),
    db().select().from(jobMedia).where(and(eq(jobMedia.jobId, job.id), eq(jobMedia.garageId, garage.id))).orderBy(desc(jobMedia.createdAt)).limit(60),
    db()
      .select({
        id: jobStatusEvents.id,
        fromStatus: jobStatusEvents.fromStatus,
        toStatus: jobStatusEvents.toStatus,
        note: jobStatusEvents.note,
        customerVisible: jobStatusEvents.customerVisible,
        actorName: users.fullName,
        createdAt: jobStatusEvents.createdAt,
      })
      .from(jobStatusEvents)
      .leftJoin(users, eq(jobStatusEvents.actorUserId, users.id))
      .where(eq(jobStatusEvents.jobId, job.id))
      .orderBy(desc(jobStatusEvents.createdAt))
      .limit(50),
  ])

  const v = vehicle[0]
  const c = customer[0]

  const [parentJob] = job.warrantyParentJobId
    ? await db().select({ number: jobs.number }).from(jobs).where(eq(jobs.id, job.warrantyParentJobId)).limit(1)
    : [null]

  return (
    <JobDetailPanel
      garageSlug={garageSlug}
      garageId={garage.id}
      job={{
        id: job.id,
        number: job.number,
        status: job.status,
        priority: job.priority ?? "normal",
        complaint: job.complaint,
        checkInOdometerKm: job.checkInOdometerKm,
        checkInFuelLevel: job.checkInFuelLevel,
        checkInItems: job.checkInItems,
        promisedAt: job.promisedAt?.toISOString() ?? null,
        checkedInAt: job.checkedInAt?.toISOString() ?? null,
        readyAt: job.readyAt?.toISOString() ?? null,
        deliveredAt: job.deliveredAt?.toISOString() ?? null,
        internalNotes: job.internalNotes,
        qcSignedOff: Boolean(job.qcSignedOffAt),
        isWarranty: job.isWarranty ?? false,
        warrantyParentNumber: parentJob?.number ?? null,
      }}
      vehicle={v ? { id: v.id, plateNumber: v.plateNumber, make: v.make, model: v.model, year: v.year } : null}
      customer={c ? { id: c.id, name: c.fullName || c.companyName || c.phone, phone: c.phone } : null}
      branchName={branch[0]?.name ?? null}
      bayName={bay[0]?.name ?? null}
      assignments={assignmentRows.map((a) => ({ userId: a.userId ?? "", name: a.name, isLead: a.isLead ?? false }))}
      findings={findingRows.map((f) => ({
        id: f.id,
        title: f.title,
        description: f.description,
        severity: f.severity,
        customerVisible: f.customerVisible ?? true,
        createdAt: f.createdAt.toISOString(),
      }))}
      items={itemRows.map((i) => ({
        id: i.id,
        type: i.type,
        description: i.description,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        labourHours: i.labourHours != null ? Number(i.labourHours) : null,
        approvalStatus: i.approvalStatus,
      }))}
      tasks={taskRows.map((t) => ({
        id: t.id,
        title: t.title,
        isDone: t.isDone ?? false,
        required: t.required ?? false,
        checklistItem: t.checklistItem ?? false,
        assignedTo: t.assignedTo,
      }))}
      media={mediaRows.map((m) => ({
        id: m.id,
        kind: m.kind,
        stage: m.stage,
        caption: m.caption,
        storagePath: m.storagePath,
        customerVisible: m.customerVisible ?? true,
        createdAt: m.createdAt.toISOString(),
      }))}
      events={eventRows.map((e) => ({
        id: e.id,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        note: e.note,
        customerVisible: e.customerVisible ?? true,
        actorName: e.actorName,
        createdAt: e.createdAt.toISOString(),
      }))}
      nextStatuses={nextStatuses(job.status)}
      canUpdate={can(principal, "jobs.update")}
      canQcSignoff={can(principal, "jobs.quality_check.sign_off")}
      canStatusUpdate={can(principal, "jobs.status.update")}
      canAssign={can(principal, "jobs.assign")}
      canMediaUpload={can(principal, "jobs.media.upload")}
      canTasksUpdate={can(principal, "jobs.tasks.update_own") || can(principal, "jobs.update")}
      currentUserId={userId}
    />
  )
}

export default function JobPage({ params }: { params: Promise<{ garageSlug: string; jobId: string }> }) {
  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <JobLoader params={params} />
        </Suspense>
      </div>
    </div>
  )
}
