import "server-only"
import { createHash, randomBytes } from "crypto"
import { and, asc, eq, inArray, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { conditionReports, garages, jobItems, pickupRuns, users } from "@/lib/db/schema"
import { storageProvider } from "@/lib/integrations/storage"
import { appUrl, sendDirectSms } from "@/lib/messaging/direct"
import { uuidv7 } from "@/lib/id"
import { OPEN_RUN, RUN_LABEL, canMoveRun, compareReports, type RunStatus } from "./core"

type Run = typeof pickupRuns.$inferSelect
const sha = (s: string) => createHash("sha256").update(s).digest("hex")

export type NewRun = {
  garageId: string
  branchId: string | null
  bookingId?: string | null
  jobId?: string | null
  customerId?: string | null
  kind: "pickup" | "dropoff"
  contactName: string | null
  contactPhone: string
  vehicleLabel: string | null
  plate: string | null
  address: string
  lat?: number | null
  lng?: number | null
  scheduledAt: Date
  fee: bigint
  status?: RunStatus
  notes?: string | null
  createdBy?: string | null
}

/** Creates a run with its own tracking link; texts the customer unless it's still unconfirmed. */
export async function createRun(input: NewRun): Promise<{ run: Run; trackUrl: string }> {
  const token = randomBytes(18).toString("base64url")
  const [run] = await db().insert(pickupRuns).values({
    id: uuidv7(), garageId: input.garageId, branchId: input.branchId, bookingId: input.bookingId ?? null, jobId: input.jobId ?? null,
    customerId: input.customerId ?? null, kind: input.kind, contactName: input.contactName, contactPhone: input.contactPhone,
    vehicleLabel: input.vehicleLabel, plate: input.plate, address: input.address,
    lat: input.lat != null ? input.lat.toFixed(6) : null, lng: input.lng != null ? input.lng.toFixed(6) : null,
    scheduledAt: input.scheduledAt, fee: input.fee, status: input.status ?? "scheduled",
    trackerTokenHash: sha(token), notes: input.notes ?? null, createdBy: input.createdBy ?? null,
  }).returning()
  const trackUrl = appUrl(`/p/${token}`)
  if (run.jobId) await addFeeToJob(run).catch(() => undefined)
  if (run.status !== "unconfirmed") await textCustomer(run, "booked", trackUrl)
  return { run, trackUrl }
}

async function textCustomer(run: Run, what: "booked" | "en_route" | "arrived" | "done", trackUrl?: string) {
  const [g] = await db().select({ name: garages.name }).from(garages).where(eq(garages.id, run.garageId)).limit(1)
  const when = run.scheduledAt.toLocaleString("en-GH", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" })
  const status = what === "booked"
    ? `${run.kind === "pickup" ? "Pickup" : "Return"} booked for ${when}.`
    : RUN_LABEL[run.kind as "pickup" | "dropoff"][what === "done" ? "done" : what] + "."
  await sendDirectSms(run.contactPhone, "pickup_status", {
    garage_name: g?.name ?? "Your garage", status, link: trackUrl ?? appUrl("/portal"),
  })
}

/** Public booking confirmed by SMS code → its runs become real. */
export async function confirmRunsForBooking(bookingId: string) {
  const runs = await db().update(pickupRuns).set({ status: "scheduled", updatedAt: new Date() })
    .where(and(eq(pickupRuns.bookingId, bookingId), eq(pickupRuns.status, "unconfirmed"))).returning()
  // A fresh tracking link per run (the raw token is never stored).
  for (const r of runs) {
    const token = randomBytes(18).toString("base64url")
    await db().update(pickupRuns).set({ trackerTokenHash: sha(token) }).where(eq(pickupRuns.id, r.id))
    if (r.kind === "pickup") await textCustomer(r, "booked", appUrl(`/p/${token}`))
  }
}

/** Booking checked in as a job: link its runs and put the fees on the job. */
export async function linkRunsToJob(bookingId: string, jobId: string, garageId: string) {
  const runs = await db().update(pickupRuns).set({ jobId, updatedAt: new Date() })
    .where(and(eq(pickupRuns.bookingId, bookingId), eq(pickupRuns.garageId, garageId))).returning()
  for (const r of runs) await addFeeToJob(r).catch(() => undefined)
}

/** Each run's fee becomes one approved sundry line on the job (once). */
async function addFeeToJob(run: Run) {
  if (!run.jobId || run.fee <= 0n || run.feeJobItemId || run.status === "cancelled") return
  const id = uuidv7()
  await db().insert(jobItems).values({
    id, garageId: run.garageId, jobId: run.jobId, type: "sundry", description: run.kind === "pickup" ? "Car pickup" : "Car return (drop-off)",
    quantity: "1", unitPrice: run.fee, approvalStatus: "approved",
  })
  await db().update(pickupRuns).set({ feeJobItemId: id }).where(eq(pickupRuns.id, run.id))
}

export async function moveRun(run: Run, to: RunStatus, actorUserId: string): Promise<{ ok: true; run: Run } | { ok: false; error: string }> {
  if (!canMoveRun(run.status, to)) return { ok: false, error: "That step isn't possible now" }
  if (to === "done") return { ok: false, error: "Complete the condition report to finish" }
  const now = new Date()
  const [u] = await db().update(pickupRuns).set({
    status: to, updatedAt: now,
    ...(to === "en_route" ? { startedAt: now, driverUserId: run.driverUserId ?? actorUserId } : {}),
    ...(to === "arrived" ? { arrivedAt: now } : {}),
  }).where(and(eq(pickupRuns.id, run.id), eq(pickupRuns.status, run.status))).returning()
  if (!u) return { ok: false, error: "The run changed — refresh and try again" }
  if (to === "en_route" || to === "arrived") await textCustomer(u, to).catch(() => undefined)
  return { ok: true, run: u }
}

export async function updateDriverLocation(userId: string, lat: number, lng: number) {
  await db().update(pickupRuns).set({ driverLat: lat.toFixed(6), driverLng: lng.toFixed(6), driverLocationAt: new Date() })
    .where(and(eq(pickupRuns.driverUserId, userId), inArray(pickupRuns.status, ["en_route", "arrived"])))
}

export type ReportFiles = { photos: Partial<Record<string, { bytes: Uint8Array; type: string }>>; signature: { bytes: Uint8Array; type: string } }

/** Saves the handover report and finishes the run. */
export async function saveReport(run: Run, input: {
  files: ReportFiles
  fuelLevel: number
  odometerKm: number
  warningLights: string[]
  damageNotes: string | null
  signedByName: string
  recordedBy: string
}) {
  const store = storageProvider()
  const photos: Record<string, string> = {}
  for (const [side, f] of Object.entries(input.files.photos)) {
    if (!f) continue
    const key = `handover/${run.id}/${run.kind}-${side}-${uuidv7()}.${f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg"}`
    await store.put(key, f.bytes, f.type)
    photos[side] = key
  }
  const sigKey = `handover/${run.id}/${run.kind}-signature-${uuidv7()}.png`
  await store.put(sigKey, input.files.signature.bytes, "image/png")
  const now = new Date()
  await db().insert(conditionReports).values({
    garageId: run.garageId, runId: run.id, stage: run.kind, photos, fuelLevel: input.fuelLevel, odometerKm: input.odometerKm,
    warningLights: input.warningLights, damageNotes: input.damageNotes, signaturePath: sigKey, signedByName: input.signedByName,
    signedAt: now, recordedBy: input.recordedBy,
  })
  const [u] = await db().update(pickupRuns).set({ status: "done", doneAt: now, updatedAt: now })
    .where(eq(pickupRuns.id, run.id)).returning()
  await textCustomer(u, "done").catch(() => undefined)
  return u
}

export type RunReportView = {
  stage: string; fuelLevel: number | null; odometerKm: number | null; warningLights: string[]; damageNotes: string | null
  signedByName: string | null; signedAt: string | null; photos: { side: string; url: string }[]; signatureUrl: string | null
}
export type RunView = {
  id: string; kind: "pickup" | "dropoff"; status: RunStatus; label: string; scheduledAt: string; address: string
  driverName: string | null; driverPhone: string | null
  driverLocation: { lat: number; lng: number; at: string } | null
  report: RunReportView | null
}

async function reportView(r: typeof conditionReports.$inferSelect): Promise<RunReportView> {
  const store = storageProvider()
  const photos = await Promise.all(Object.entries((r.photos ?? {}) as Record<string, string>).map(async ([side, key]) => ({ side, url: await store.getSignedUrl(key, 3600) })))
  return {
    stage: r.stage, fuelLevel: r.fuelLevel, odometerKm: r.odometerKm, warningLights: r.warningLights, damageNotes: r.damageNotes,
    signedByName: r.signedByName, signedAt: r.signedAt?.toISOString() ?? null, photos,
    signatureUrl: r.signaturePath ? await store.getSignedUrl(r.signaturePath, 3600) : null,
  }
}

/** All runs for the same booking/job, with reports (customer pages and the job tracker). */
export async function runsView(where: { runId?: string; jobId?: string | null; bookingId?: string | null }): Promise<{ runs: RunView[]; comparison: ReturnType<typeof compareReports> | null }> {
  let jobId = where.jobId ?? null
  let bookingId = where.bookingId ?? null
  if (where.runId) {
    const [r] = await db().select({ jobId: pickupRuns.jobId, bookingId: pickupRuns.bookingId }).from(pickupRuns).where(eq(pickupRuns.id, where.runId)).limit(1)
    jobId = r?.jobId ?? null
    bookingId = r?.bookingId ?? null
  }
  const conds = [where.runId ? eq(pickupRuns.id, where.runId) : null, jobId ? eq(pickupRuns.jobId, jobId) : null, bookingId ? eq(pickupRuns.bookingId, bookingId) : null].filter((c): c is NonNullable<typeof c> => !!c)
  if (!conds.length) return { runs: [], comparison: null }
  const rows = await db().select({ r: pickupRuns, driverName: users.fullName, driverPhone: users.phone })
    .from(pickupRuns).leftJoin(users, eq(users.id, pickupRuns.driverUserId))
    .where(and(or(...conds), sql`${pickupRuns.status} <> 'unconfirmed'`)).orderBy(asc(pickupRuns.scheduledAt))
  const reports = rows.length ? await db().select().from(conditionReports).where(inArray(conditionReports.runId, rows.map((x) => x.r.id))) : []
  const runs: RunView[] = []
  for (const { r, driverName, driverPhone } of rows) {
    const rep = reports.find((x) => x.runId === r.id)
    const live = ["en_route", "arrived"].includes(r.status) && r.driverLat && r.driverLng && r.driverLocationAt
    runs.push({
      id: r.id, kind: r.kind as "pickup" | "dropoff", status: r.status as RunStatus, label: RUN_LABEL[r.kind as "pickup" | "dropoff"][r.status as RunStatus] ?? r.status,
      scheduledAt: r.scheduledAt.toISOString(), address: r.address,
      driverName: OPEN_RUN.includes(r.status as RunStatus) || r.status === "done" ? driverName : null,
      driverPhone: ["en_route", "arrived"].includes(r.status) ? driverPhone : null,
      driverLocation: live ? { lat: Number(r.driverLat), lng: Number(r.driverLng), at: r.driverLocationAt!.toISOString() } : null,
      report: rep ? await reportView(rep) : null,
    })
  }
  const p = reports.find((x) => x.stage === "pickup")
  const d = reports.find((x) => x.stage === "dropoff")
  return { runs, comparison: p && d ? compareReports(p, d) : null }
}

export async function runByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null
  const [r] = await db().select().from(pickupRuns).where(eq(pickupRuns.trackerTokenHash, sha(token))).limit(1)
  return r ?? null
}

/** Runs for a job, found from the job's /t/ tracker token. */
export async function runsForJobToken(token: string) {
  const { jobs } = await import("@/lib/db/schema")
  const [j] = await db().select({ id: jobs.id }).from(jobs).where(eq(jobs.trackerTokenHash, sha(token))).limit(1)
  return j ? runsView({ jobId: j.id }) : { runs: [], comparison: null }
}
