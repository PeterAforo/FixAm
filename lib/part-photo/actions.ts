"use server"

import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { jobs, vehicles } from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { rateLimit } from "@/lib/rate-limit"
import { MAX_IMAGE_BYTES, sniffImageType } from "./core"
import { identifyPartPhoto, recordPhotoChoice, type PartPhotoResult } from "./service"

type Fail = { ok: false; error: string }

/**
 * "What part is this?" — FormData: photo (File), note?, vehicle? (driver),
 * or garageId + jobId (garage job card; the car comes from the job).
 */
export async function identifyPartFromPhoto(form: FormData): Promise<{ ok: true; result: PartPhotoResult } | Fail> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: "Sign in first" }
  const rl = await rateLimit(`part-photo:${userId}`, 30, 3600)
  if (!rl.ok) return { ok: false, error: "Too many photos in an hour — try again later" }

  const file = form.get("photo")
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Take or choose a photo first" }
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "That photo is too large — try again (we shrink it automatically on most phones)" }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const mediaType = sniffImageType(bytes)
  if (!mediaType) return { ok: false, error: "Use a JPEG, PNG or WebP photo" }

  const fields = z.object({
    note: z.string().max(300).optional(),
    vehicle: z.string().max(120).optional(),
    garageId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
  }).safeParse({
    note: form.get("note") || undefined,
    vehicle: form.get("vehicle") || undefined,
    garageId: form.get("garageId") || undefined,
    jobId: form.get("jobId") || undefined,
  })
  if (!fields.success) return { ok: false, error: "Invalid input" }
  const f = fields.data

  let vehicle = f.vehicle ?? null
  let garageId: string | null = null
  if (f.garageId) {
    const m = await resolveMembership(userId, f.garageId)
    if (!m) return { ok: false, error: "No permission" }
    garageId = f.garageId
    if (f.jobId) {
      const [v] = await db().select({ make: vehicles.make, model: vehicles.model, year: vehicles.year })
        .from(jobs).innerJoin(vehicles, eq(vehicles.id, jobs.vehicleId))
        .where(and(eq(jobs.id, f.jobId), eq(jobs.garageId, f.garageId))).limit(1)
      if (v) vehicle = [v.year, v.make, v.model].filter(Boolean).join(" ")
    }
  }

  const result = await identifyPartPhoto({
    image: { mediaType, base64: Buffer.from(bytes).toString("base64") },
    note: f.note,
    vehicle,
    source: garageId ? "garage" : "driver",
    ctx: { userId, garageId },
  })
  return { ok: true, result }
}

export async function confirmPhotoPart(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({ scanId: z.string().uuid(), partTypeId: z.string().uuid() }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Invalid input" }
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: "Sign in first" }
  await recordPhotoChoice(parsed.data.scanId, parsed.data.partTypeId, userId).catch(() => undefined)
  return { ok: true }
}
