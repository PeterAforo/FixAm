"use server"

import { z } from "zod"
import { and, desc, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { customers, jobs, obdScans, vehicles } from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { getPortalPhone } from "@/lib/portal/session"
import { can } from "@/lib/auth/permissions"
import { resolveMembership, writeAuditLog } from "@/lib/actions"
import { rateLimit } from "@/lib/rate-limit"
import { isDtcCode } from "./dtc-library"
import { explainScan, type ScanExplanation } from "./service"

type Fail = { ok: false; error: string }

const liveSchema = z.object({
  rpm: z.number().min(0).max(20000).optional(),
  coolantC: z.number().min(-40).max(215).optional(),
  speedKmh: z.number().min(0).max(255).optional(),
  loadPct: z.number().min(0).max(100).optional(),
  voltage: z.number().min(0).max(30).optional(),
})

const scanSchema = z.object({
  adapterName: z.string().max(80).nullable().optional(),
  protocol: z.string().max(4).nullable().optional(),
  vin: z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/).nullable().optional(),
  milOn: z.boolean().nullable().optional(),
  dtcs: z.array(z.object({ code: z.string().refine(isDtcCode), kind: z.enum(["stored", "pending", "permanent"]) })).max(40),
  freezeFrame: liveSchema.extend({ dtc: z.string().nullable() }).nullable().optional(),
  live: liveSchema.default({}),
  // where it belongs
  garageId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  inspectionId: z.string().uuid().optional(),
})

export type SavedScan = { scanId: string; explanation: ScanExplanation; vinMismatch: boolean }

/** Stores a scan (garage job or driver's car) and returns the explanation. */
export async function saveObdScan(raw: unknown): Promise<{ ok: true; data: SavedScan } | Fail> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: "Sign in first" }
  const parsed = scanSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "The scan data didn't look right — try scanning again" }
  const d = parsed.data
  const rl = await rateLimit(`obd:${userId}`, 60, 3600)
  if (!rl.ok) return { ok: false, error: "Too many scans in an hour — try again later" }

  let garageId: string | null = null
  let jobId: string | null = null
  let vehicleId: string | null = null
  let customerId: string | null = null
  let inspectionId: string | null = null
  let vehicleLabel: string | null = null
  let knownVin: string | null = null

  if (d.garageId) {
    const m = await resolveMembership(userId, d.garageId)
    if (!m) return { ok: false, error: "No permission" }
    garageId = d.garageId
    if (d.inspectionId) {
      const { inspections } = await import("@/lib/db/schema")
      const [insp] = await db().select({ id: inspections.id, status: inspections.status, details: inspections.vehicleDetails })
        .from(inspections)
        .where(and(eq(inspections.id, d.inspectionId), eq(inspections.garageId, d.garageId), isNull(inspections.deletedAt))).limit(1)
      if (!insp || !["booked", "in_progress", "completed"].includes(insp.status)) return { ok: false, error: "Inspection not found or closed" }
      inspectionId = insp.id
      const det = insp.details as { make?: string; model?: string; year?: string; vin?: string } | null
      vehicleLabel = det ? [det.year, det.make, det.model].filter(Boolean).join(" ") || null : null
      knownVin = det?.vin ?? null
    } else if (d.jobId) {
      const [j] = await db()
        .select({ id: jobs.id, vehicleId: jobs.vehicleId, customerId: jobs.customerId, make: vehicles.make, model: vehicles.model, year: vehicles.year, vin: vehicles.vin })
        .from(jobs).innerJoin(vehicles, eq(vehicles.id, jobs.vehicleId))
        .where(and(eq(jobs.id, d.jobId), eq(jobs.garageId, d.garageId))).limit(1)
      if (!j) return { ok: false, error: "Job not found" }
      jobId = j.id; vehicleId = j.vehicleId; customerId = j.customerId
      vehicleLabel = [j.year, j.make, j.model].filter(Boolean).join(" ")
      knownVin = j.vin
    }
  } else if (d.vehicleId) {
    const phone = await getPortalPhone()
    if (!phone) return { ok: false, error: "Sign in first" }
    const [v] = await db()
      .select({ id: vehicles.id, make: vehicles.make, model: vehicles.model, year: vehicles.year, vin: vehicles.vin, ownerId: vehicles.currentOwnerId })
      .from(vehicles).innerJoin(customers, eq(customers.id, vehicles.currentOwnerId))
      .where(and(eq(vehicles.id, d.vehicleId), eq(customers.phone, phone), isNull(vehicles.deletedAt))).limit(1)
    if (!v) return { ok: false, error: "Car not found" }
    vehicleId = v.id; customerId = v.ownerId
    vehicleLabel = [v.year, v.make, v.model].filter(Boolean).join(" ")
    knownVin = v.vin
  }

  const explanation = await explainScan({
    vehicle: vehicleLabel,
    dtcs: d.dtcs,
    milOn: d.milOn ?? null,
    live: d.live,
    freezeFrame: d.freezeFrame ?? null,
    ctx: { userId, garageId },
  })

  const [row] = await db().insert(obdScans).values({
    garageId, userId, customerId, vehicleId, jobId, inspectionId,
    source: garageId ? "garage" : "driver",
    adapterName: d.adapterName ?? null,
    protocol: d.protocol ?? null,
    vin: d.vin ?? null,
    milOn: d.milOn ?? null,
    dtcs: d.dtcs,
    freezeFrame: d.freezeFrame ?? null,
    live: d.live,
    explanation,
  }).returning({ id: obdScans.id })

  // Fill in a missing VIN on the car record from the scan.
  if (vehicleId && d.vin && !knownVin) await db().update(vehicles).set({ vin: d.vin, updatedAt: new Date() }).where(eq(vehicles.id, vehicleId)).catch(() => undefined)
  if (garageId) {
    await writeAuditLog({ garageId, actorUserId: userId, action: "obd.scan", entityType: jobId ? "job" : "obd_scan", entityId: jobId ?? row.id, after: { scanId: row.id, codes: d.dtcs.map((x) => x.code) } }).catch(() => undefined)
  }
  return { ok: true, data: { scanId: row.id, explanation, vinMismatch: !!(knownVin && d.vin && knownVin.toUpperCase() !== d.vin) } }
}

/**
 * Step 1 of clearing codes: staff only. Writes the audit row BEFORE the
 * browser sends the clear command, so every clear attempt is recorded.
 */
export async function authorizeObdClear(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({ garageId: z.string().uuid(), scanId: z.string().uuid(), reason: z.string().trim().min(3).max(200) }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Say why you're clearing the codes (e.g. 'repaired O2 sensor')" }
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: "Sign in first" }
  const d = parsed.data
  const m = await resolveMembership(userId, d.garageId)
  if (!m || !can({ kind: "staff", role: m.role, garageId: d.garageId, branchId: m.branchId }, "jobs.status.update")) {
    return { ok: false, error: "Only garage staff working on cars can clear codes" }
  }
  const [s] = await db().select().from(obdScans).where(and(eq(obdScans.id, d.scanId), eq(obdScans.garageId, d.garageId))).limit(1)
  if (!s) return { ok: false, error: "Scan not found" }
  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "obd.clear_codes.requested",
    entityType: s.jobId ? "job" : "obd_scan", entityId: s.jobId ?? s.id,
    before: { codes: (s.dtcs as { code: string }[]).map((x) => x.code), milOn: s.milOn },
    after: { scanId: s.id, reason: d.reason },
  })
  await db().update(obdScans).set({ clearRequestedAt: new Date() }).where(eq(obdScans.id, s.id))
  return { ok: true }
}

/** Step 2: the browser reports whether the car accepted the clear. */
export async function confirmObdClear(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({ garageId: z.string().uuid(), scanId: z.string().uuid(), accepted: z.boolean() }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Invalid input" }
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: "Sign in first" }
  const d = parsed.data
  const m = await resolveMembership(userId, d.garageId)
  if (!m) return { ok: false, error: "No permission" }
  const [s] = await db().select({ id: obdScans.id, jobId: obdScans.jobId, req: obdScans.clearRequestedAt })
    .from(obdScans).where(and(eq(obdScans.id, d.scanId), eq(obdScans.garageId, d.garageId))).limit(1)
  if (!s || !s.req) return { ok: false, error: "Clear wasn't authorised" }
  if (d.accepted) await db().update(obdScans).set({ clearedAt: new Date(), clearedBy: userId }).where(eq(obdScans.id, s.id))
  await writeAuditLog({ garageId: d.garageId, actorUserId: userId, action: d.accepted ? "obd.clear_codes.done" : "obd.clear_codes.failed", entityType: s.jobId ? "job" : "obd_scan", entityId: s.jobId ?? s.id, after: { scanId: s.id } })
  return { ok: true }
}

export type ScanSummary = { id: string; createdAt: string; codes: string[]; milOn: boolean | null; overallSeverity: string | null; summary: string | null; cleared: boolean }

function summarise(r: typeof obdScans.$inferSelect): ScanSummary {
  const e = r.explanation as ScanExplanation | null
  return {
    id: r.id, createdAt: r.createdAt.toISOString(), codes: (r.dtcs as { code: string }[]).map((x) => x.code),
    milOn: r.milOn, overallSeverity: e?.overallSeverity ?? null, summary: e?.summary ?? null, cleared: !!r.clearedAt,
  }
}

/** Recent scans for a job (job card) — staff of that garage. */
export async function listJobScans(raw: unknown): Promise<ScanSummary[]> {
  const parsed = z.object({ garageId: z.string().uuid(), jobId: z.string().uuid() }).safeParse(raw)
  if (!parsed.success) return []
  const userId = await getSessionUserId()
  if (!userId || !(await resolveMembership(userId, parsed.data.garageId))) return []
  const rows = await db().select().from(obdScans)
    .where(and(eq(obdScans.garageId, parsed.data.garageId), eq(obdScans.jobId, parsed.data.jobId)))
    .orderBy(desc(obdScans.createdAt)).limit(10)
  return rows.map(summarise)
}

/** A driver's own scan, for attaching to a repair request. */
export async function getMyScan(scanId: string): Promise<(ScanSummary & { explanation: ScanExplanation | null }) | null> {
  const userId = await getSessionUserId()
  if (!userId || !z.string().uuid().safeParse(scanId).success) return null
  const [r] = await db().select().from(obdScans).where(and(eq(obdScans.id, scanId), eq(obdScans.userId, userId))).limit(1)
  return r ? { ...summarise(r), explanation: r.explanation as ScanExplanation | null } : null
}
