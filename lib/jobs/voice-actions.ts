"use server"

import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garageSettings, jobFindings, jobItems, jobTasks, jobs, vehicles } from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can } from "@/lib/auth/permissions"
import { resolveMembership, writeAuditLog } from "@/lib/actions"
import { runPrompt } from "@/lib/ai/run"
import { jobNotesPrompt } from "@/lib/ai/prompts"
import { matchPartTypeText } from "@/lib/parts-catalog/actions"
import type { JobNotesDraft } from "./voice-notes-core"

type Fail = { ok: false; error: string }

async function member(garageId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const m = await resolveMembership(userId, garageId)
  if (!m || !can({ kind: "staff", role: m.role, garageId, branchId: m.branchId }, "jobs.update")) return null
  return { userId }
}

export type DraftPart = JobNotesDraft["parts"][number] & { partTypeId: string | null; partTypeName: string | null }
export type JobDraft = Omit<JobNotesDraft, "parts"> & { parts: DraftPart[] }

/** Voice/typed notes → a draft for the mechanic to review. Saves nothing. */
export async function draftJobFromNotes(raw: unknown): Promise<{ ok: true; draft: JobDraft } | Fail> {
  const parsed = z.object({ garageId: z.string().uuid(), jobId: z.string().uuid(), notes: z.string().trim().min(5).max(3000) }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Say or type a little more about the job" }
  const d = parsed.data
  const who = await member(d.garageId)
  if (!who) return { ok: false, error: "No permission" }
  const [row] = await db()
    .select({ complaint: jobs.complaint, make: vehicles.make, model: vehicles.model, year: vehicles.year })
    .from(jobs)
    .innerJoin(vehicles, eq(vehicles.id, jobs.vehicleId))
    .where(and(eq(jobs.id, d.jobId), eq(jobs.garageId, d.garageId)))
    .limit(1)
  if (!row) return { ok: false, error: "Job not found" }
  const r = await runPrompt(jobNotesPrompt, { notes: d.notes, vehicle: `${row.make} ${row.model}${row.year ? ` ${row.year}` : ""}`, complaint: row.complaint }, { garageId: d.garageId, userId: who.userId })
  if (!r.ok) return { ok: false, error: "Couldn't draft from that note — try again or type it" }
  const parts: DraftPart[] = []
  for (const p of r.data.parts) {
    const m = (await matchPartTypeText(p.description))[0]
    parts.push({ ...p, partTypeId: m && m.score >= 0.5 ? m.partType.id : null, partTypeName: m && m.score >= 0.5 ? m.partType.name : null })
  }
  return { ok: true, draft: { ...r.data, parts } }
}

const saveSchema = z.object({
  garageId: z.string().uuid(),
  jobId: z.string().uuid(),
  findings: z.array(z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(2000).nullable(), severity: z.enum(["urgent", "recommended", "can_wait"]), recommendation: z.enum(["replace", "repair", "monitor"]) })).max(20),
  tasks: z.array(z.object({ title: z.string().trim().min(1).max(200) })).max(30),
  parts: z.array(z.object({ description: z.string().trim().min(1).max(300), quantity: z.number().min(0.25).max(999), partTypeId: z.string().uuid().nullable() })).max(30),
  labour: z.array(z.object({ description: z.string().trim().min(1).max(300), hours: z.number().min(0).max(999) })).max(20),
})

/** Save only the entries the mechanic confirmed. Parts are added at GH₵0 for the advisor to price. */
export async function saveJobDraft(raw: unknown): Promise<{ ok: true; saved: number } | Fail> {
  const parsed = saveSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Check the entries" }
  const d = parsed.data
  const who = await member(d.garageId)
  if (!who) return { ok: false, error: "No permission" }
  const [job] = await db().select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, d.jobId), eq(jobs.garageId, d.garageId))).limit(1)
  if (!job) return { ok: false, error: "Job not found" }
  const [settings] = await db().select({ rate: garageSettings.defaultLabourRate }).from(garageSettings).where(eq(garageSettings.garageId, d.garageId)).limit(1)
  const rate = Number(settings?.rate ?? 0n)

  if (d.findings.length) {
    await db().insert(jobFindings).values(
      d.findings.map((f) => ({ garageId: d.garageId, jobId: d.jobId, title: f.title, description: f.description, severity: f.severity, recommendation: f.recommendation, createdBy: who.userId }))
    )
  }
  if (d.tasks.length) {
    await db().insert(jobTasks).values(d.tasks.map((t, i) => ({ garageId: d.garageId, jobId: d.jobId, title: t.title, sortOrder: 200 + i })))
  }
  const items = [
    ...d.parts.map((p) => ({ garageId: d.garageId, jobId: d.jobId, type: "part" as const, description: p.description, quantity: String(p.quantity), unitPrice: 0n, partTypeId: p.partTypeId, sortOrder: 150 })),
    ...d.labour.map((l) => ({ garageId: d.garageId, jobId: d.jobId, type: "labour" as const, description: l.description, quantity: "1", unitPrice: BigInt(Math.round(rate * l.hours)), labourHours: String(l.hours), sortOrder: 160 })),
  ]
  if (items.length) await db().insert(jobItems).values(items)
  const saved = d.findings.length + d.tasks.length + items.length
  await writeAuditLog({ garageId: d.garageId, actorUserId: who.userId, action: "job.voice_notes_saved", entityType: "job", entityId: d.jobId, after: { findings: d.findings.length, tasks: d.tasks.length, parts: d.parts.length, labour: d.labour.length } }).catch(() => undefined)
  return { ok: true, saved }
}
