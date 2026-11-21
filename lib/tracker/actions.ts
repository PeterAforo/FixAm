"use server"
import { createHash } from "crypto"
import { z } from "zod"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  branches,
  customers,
  garages,
  jobAssignments,
  jobFindings,
  jobMedia,
  jobStatusEvents,
  jobs,
  users,
  vehicles,
} from "@/lib/db/schema"
import type { ActionResult } from "@/lib/actions"
import { storageProvider } from "@/lib/integrations/storage"

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")

const STAGE_ORDER = ["checked_in", "diagnosing", "estimate_sent", "approved", "in_progress", "waiting_parts", "quality_check", "ready", "delivered", "closed"] as const

export type TrackerData = {
  number: string
  status: string
  stageIndex: number
  plate: string | null
  vehicleLabel: string | null
  promisedAt: string | null
  checkedInAt: string | null
  readyAt: string | null
  deliveredAt: string | null
  garageName: string
  garagePhone: string | null
  garageAddress: string | null
  mechanicFirstName: string | null
  findings: { id: string; title: string; description: string | null; severity: string }[]
  media: { id: string; kind: string; caption: string | null; url: string | null }[]
  events: { id: string; toStatus: string; note: string | null; createdAt: string }[]
  finished: boolean
}

/** Public tracker payload — only customer-visible data, token-scoped. */
export async function getTrackerData(rawInput: unknown): Promise<ActionResult<TrackerData | null>> {
  const parsed = z.object({ token: z.string().min(16).max(128) }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid link" } }

  const [job] = await db()
    .select()
    .from(jobs)
    .where(eq(jobs.trackerTokenHash, sha256(parsed.data.token)))
    .limit(1)
  if (!job || job.deletedAt) return { ok: true, data: null }

  const [vehicle, customer, garage, branch, leadRows, findingRows, mediaRows, eventRows] = await Promise.all([
    db().select({ plateNumber: vehicles.plateNumber, make: vehicles.make, model: vehicles.model }).from(vehicles).where(eq(vehicles.id, job.vehicleId)).limit(1),
    db().select({ phone: customers.phone }).from(customers).where(eq(customers.id, job.customerId)).limit(1),
    db().select({ name: garages.name, phone: garages.phone, address: garages.address }).from(garages).where(eq(garages.id, job.garageId)).limit(1),
    db().select({ phone: branches.phone, address: branches.address }).from(branches).where(eq(branches.id, job.branchId)).limit(1),
    db()
      .select({ name: users.fullName })
      .from(jobAssignments)
      .innerJoin(users, eq(jobAssignments.userId, users.id))
      .where(and(eq(jobAssignments.jobId, job.id), eq(jobAssignments.isLead, true)))
      .limit(1),
    db()
      .select({ id: jobFindings.id, title: jobFindings.title, description: jobFindings.description, severity: jobFindings.severity })
      .from(jobFindings)
      .where(and(eq(jobFindings.jobId, job.id), eq(jobFindings.customerVisible, true)))
      .orderBy(desc(jobFindings.createdAt))
      .limit(20),
    db()
      .select({ id: jobMedia.id, kind: jobMedia.kind, caption: jobMedia.caption, storagePath: jobMedia.storagePath })
      .from(jobMedia)
      .where(and(eq(jobMedia.jobId, job.id), eq(jobMedia.customerVisible, true)))
      .orderBy(desc(jobMedia.createdAt))
      .limit(12),
    db()
      .select({ id: jobStatusEvents.id, toStatus: jobStatusEvents.toStatus, note: jobStatusEvents.note, createdAt: jobStatusEvents.createdAt })
      .from(jobStatusEvents)
      .where(and(eq(jobStatusEvents.jobId, job.id), eq(jobStatusEvents.customerVisible, true)))
      .orderBy(desc(jobStatusEvents.createdAt))
      .limit(30),
  ])

  const media = await Promise.all(
    mediaRows.map(async (m) => {
      try {
        return { id: m.id, kind: m.kind, caption: m.caption, url: await storageProvider().getSignedUrl(m.storagePath, 600) }
      } catch {
        return { id: m.id, kind: m.kind, caption: m.caption, url: null }
      }
    })
  )

  const status = job.status
  const stageIndex = Math.max(0, STAGE_ORDER.indexOf(status as (typeof STAGE_ORDER)[number]))
  const finished = status === "closed" || status === "cancelled" || status === "delivered"

  return {
    ok: true,
    data: {
      number: job.number,
      status,
      stageIndex,
      plate: vehicle[0]?.plateNumber ?? null,
      vehicleLabel: vehicle[0] ? `${vehicle[0].make} ${vehicle[0].model}` : null,
      promisedAt: job.promisedAt?.toISOString() ?? null,
      checkedInAt: job.checkedInAt?.toISOString() ?? null,
      readyAt: job.readyAt?.toISOString() ?? null,
      deliveredAt: job.deliveredAt?.toISOString() ?? null,
      garageName: garage[0]?.name ?? "Garage",
      garagePhone: garage[0]?.phone ?? branch[0]?.phone ?? customer[0]?.phone ?? null,
      garageAddress: garage[0]?.address ?? branch[0]?.address ?? null,
      mechanicFirstName: leadRows[0]?.name?.split(" ")[0] ?? null,
      findings: findingRows.map((f) => ({ id: f.id, title: f.title, description: f.description, severity: f.severity })),
      media,
      events: eventRows.map((e) => ({ id: e.id, toStatus: e.toStatus, note: e.note, createdAt: e.createdAt.toISOString() })),
      finished,
    },
  }
}
