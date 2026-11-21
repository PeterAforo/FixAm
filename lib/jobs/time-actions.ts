"use server"
import { z } from "zod"
import { and, desc, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { jobAssignments, jobTasks, jobs, timeLogs } from "@/lib/db/schema"
import { resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { updateJobStatus } from "./actions"

const staffPrincipal = (role: StaffRole, garageId: string, branchId: string | null) =>
  ({ kind: "staff" as const, role, garageId, branchId })

async function requireMembership(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return { membership: m, principal: staffPrincipal(m.role, garageId, m.branchId) }
}

async function mechanicJob(garageId: string, jobId: string, userId: string) {
  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.garageId, garageId), isNull(jobs.deletedAt)))
    .limit(1)
  if (!job) return null
  const [asg] = await db()
    .select({ id: jobAssignments.id })
    .from(jobAssignments)
    .where(and(eq(jobAssignments.jobId, jobId), eq(jobAssignments.userId, userId)))
    .limit(1)
  return asg ? job : null
}

const startSchema = z.object({
  garageId: z.string().uuid(),
  jobId: z.string().uuid(),
  jobTaskId: z.string().uuid().optional(),
  clientId: z.string().min(8).max(80),
})

/** Start a timer. Idempotent via clientId (offline queue safe). */
export async function startTimeLog(rawInput: unknown): Promise<ActionResult<{ timeLogId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = startSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  const job = await mechanicJob(d.garageId, d.jobId, userId)
  if (!job) {
    // advisors/managers may also log time on any job
    if (!can(ctx.principal, "jobs.update")) return { ok: false, error: { code: "FORBIDDEN", message: "Not assigned to this job" } }
  }

  // idempotent: same clientId returns existing row
  const [existing] = await db()
    .select({ id: timeLogs.id })
    .from(timeLogs)
    .where(eq(timeLogs.clientId, d.clientId))
    .limit(1)
  if (existing) return { ok: true, data: { timeLogId: existing.id } }

  // stop any open log for this user+job first
  const open = await db()
    .select({ id: timeLogs.id })
    .from(timeLogs)
    .where(and(eq(timeLogs.jobId, d.jobId), eq(timeLogs.userId, userId), isNull(timeLogs.endedAt)))
  for (const o of open) {
    await db().update(timeLogs).set({ endedAt: new Date(), updatedAt: new Date() }).where(eq(timeLogs.id, o.id))
  }

  const [row] = await db()
    .insert(timeLogs)
    .values({
      garageId: d.garageId,
      jobId: d.jobId,
      jobTaskId: d.jobTaskId ?? null,
      userId,
      startedAt: new Date(),
      clientId: d.clientId,
    })
    .returning({ id: timeLogs.id })
  return { ok: true, data: { timeLogId: row!.id } }
}

const stopSchema = z.object({
  garageId: z.string().uuid(),
  timeLogId: z.string().uuid(),
})

export async function stopTimeLog(rawInput: unknown): Promise<ActionResult<{ timeLogId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = stopSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }

  const [log] = await db()
    .select({ id: timeLogs.id, userId: timeLogs.userId, endedAt: timeLogs.endedAt })
    .from(timeLogs)
    .where(and(eq(timeLogs.id, d.timeLogId), eq(timeLogs.garageId, d.garageId)))
    .limit(1)
  if (!log) return { ok: false, error: { code: "NOT_FOUND", message: "Timer not found" } }
  if (log.userId !== userId && !can(ctx.principal, "jobs.update")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Not your timer" } }
  }
  if (log.endedAt) return { ok: true, data: { timeLogId: log.id } }

  await db().update(timeLogs).set({ endedAt: new Date(), updatedAt: new Date() }).where(eq(timeLogs.id, log.id))
  return { ok: true, data: { timeLogId: log.id } }
}

/** Mechanic moves their job to quality_check (server re-validates transitions). */
export async function mechanicAdvanceJob(rawInput: unknown): Promise<ActionResult<{ jobId: string; status: string }>> {
  return updateJobStatus(rawInput)
}

/** Open timer for a user+job (for resume UI). */
export async function getOpenTimer(rawInput: unknown): Promise<ActionResult<{ timeLogId: string; startedAt: string } | null>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const schema = z.object({ garageId: z.string().uuid(), jobId: z.string().uuid() })
  const parsed = schema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const ctx = await requireMembership(userId, parsed.data.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }

  const [row] = await db()
    .select({ id: timeLogs.id, startedAt: timeLogs.startedAt })
    .from(timeLogs)
    .where(and(eq(timeLogs.jobId, parsed.data.jobId), eq(timeLogs.userId, userId), isNull(timeLogs.endedAt)))
    .orderBy(desc(timeLogs.startedAt))
    .limit(1)
  return { ok: true, data: row ? { timeLogId: row.id, startedAt: row.startedAt.toISOString() } : null }
}

/** Today's tasks for a job (for mechanic checklist). */
export async function listJobTasksForMechanic(rawInput: unknown): Promise<
  ActionResult<{ id: string; title: string; isDone: boolean; required: boolean; checklistItem: boolean }[]>
> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const schema = z.object({ garageId: z.string().uuid(), jobId: z.string().uuid() })
  const parsed = schema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const ctx = await requireMembership(userId, parsed.data.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  const job = await mechanicJob(parsed.data.garageId, parsed.data.jobId, userId)
  if (!job && !can(ctx.principal, "jobs.view")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Not assigned" } }
  }

  const rows = await db()
    .select({ id: jobTasks.id, title: jobTasks.title, isDone: jobTasks.isDone, required: jobTasks.required, checklistItem: jobTasks.checklistItem })
    .from(jobTasks)
    .where(and(eq(jobTasks.jobId, parsed.data.jobId), eq(jobTasks.garageId, parsed.data.garageId)))
    .orderBy(jobTasks.sortOrder)
  return {
    ok: true,
    data: rows.map((r) => ({ id: r.id, title: r.title, isDone: r.isDone ?? false, required: r.required ?? false, checklistItem: r.checklistItem ?? false })),
  }
}
