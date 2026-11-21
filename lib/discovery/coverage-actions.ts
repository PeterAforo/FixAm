"use server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garageVehicleCoverage, vehicleMakes, vehicleModels } from "@/lib/db/schema"
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { uuidv7 } from "@/lib/id"

const staffPrincipal = (role: StaffRole, garageId: string, branchId: string | null) =>
  ({ kind: "staff" as const, role, garageId, branchId })

async function requireManager(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  const principal = staffPrincipal(m.role, garageId, m.branchId)
  if (!can(principal, "garage.settings.manage")) return null
  return { membership: m, principal }
}

const addSchema = z.object({
  garageId: z.string().uuid(),
  catalogMakeId: z.string().uuid().optional().nullable(),
  catalogModelId: z.string().uuid().optional().nullable(),
  make: z.string().max(60).optional().or(z.literal("")),
  model: z.string().max(60).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
})

/** Add (or reactivate) a make/model the garage services. */
export async function addGarageCoverage(rawInput: unknown): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }

  const parsed = addSchema.safeParse(rawInput)
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: "Check the fields", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> } }
  }
  const input = parsed.data

  const ctx = await requireManager(userId, input.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Only the garage owner can manage coverage" } }

  // Resolve snapshot labels — catalogue wins over free text.
  let make = input.make?.trim() ?? ""
  let model = input.model?.trim() || null
  const catalogMakeId = input.catalogMakeId ?? null
  const catalogModelId = input.catalogModelId ?? null

  if (catalogMakeId) {
    const [mk] = await db().select({ name: vehicleMakes.name }).from(vehicleMakes).where(eq(vehicleMakes.id, catalogMakeId)).limit(1)
    if (!mk) return { ok: false, error: { code: "VALIDATION", message: "Unknown make", fieldErrors: { catalogMakeId: ["Pick a valid make"] } } }
    make = mk.name
    if (catalogModelId) {
      const [md] = await db()
        .select({ name: vehicleModels.name, makeId: vehicleModels.makeId })
        .from(vehicleModels)
        .where(eq(vehicleModels.id, catalogModelId))
        .limit(1)
      if (!md || md.makeId !== catalogMakeId) {
        return { ok: false, error: { code: "VALIDATION", message: "Unknown model", fieldErrors: { catalogModelId: ["Pick a valid model"] } } }
      }
      model = md.name
    }
  } else if (!make) {
    return { ok: false, error: { code: "VALIDATION", message: "Enter a make", fieldErrors: { make: ["Required"] } } }
  }

  // Dedupe: same garage + same catalogue ids, or same make/model text when no catalogue ids.
  const candidates = await db()
    .select({ id: garageVehicleCoverage.id, isActive: garageVehicleCoverage.isActive, model: garageVehicleCoverage.model, catalogModelId: garageVehicleCoverage.catalogModelId })
    .from(garageVehicleCoverage)
    .where(
      and(
        eq(garageVehicleCoverage.garageId, input.garageId),
        catalogMakeId
          ? eq(garageVehicleCoverage.catalogMakeId, catalogMakeId)
          : eq(garageVehicleCoverage.make, make)
      )
    )
  const dupe = catalogMakeId
    ? candidates.find((e) => (catalogModelId ? e.catalogModelId === catalogModelId : e.catalogModelId == null))
    : candidates.find((e) => (e.model ?? null) === (model ?? null))

  if (dupe) {
    if (!dupe.isActive) {
      await db().update(garageVehicleCoverage).set({ isActive: true, updatedAt: new Date() }).where(eq(garageVehicleCoverage.id, dupe.id))
      await writeAuditLog({ garageId: input.garageId, actorUserId: userId, action: "coverage.reactivate", entityType: "garage_vehicle_coverage", entityId: dupe.id })
      return { ok: true, data: { id: dupe.id } }
    }
    return { ok: false, error: { code: "CONFLICT", message: "Already listed" } }
  }

  const id = uuidv7()
  await db().insert(garageVehicleCoverage).values({
    id,
    garageId: input.garageId,
    catalogMakeId,
    catalogModelId: catalogModelId ?? null,
    make,
    model,
    notes: input.notes?.trim() || null,
    isActive: true,
  })
  await writeAuditLog({ garageId: input.garageId, actorUserId: userId, action: "coverage.add", entityType: "garage_vehicle_coverage", entityId: id, after: { make, model, catalogMakeId, catalogModelId } })
  return { ok: true, data: { id } }
}

const removeSchema = z.object({ garageId: z.string().uuid(), coverageId: z.string().uuid() })

/** Remove (deactivate) a coverage entry. */
export async function removeGarageCoverage(rawInput: unknown): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }

  const parsed = removeSchema.safeParse(rawInput)
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  }
  const { garageId, coverageId } = parsed.data

  const ctx = await requireManager(userId, garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Only the garage owner can manage coverage" } }

  const [row] = await db()
    .select()
    .from(garageVehicleCoverage)
    .where(and(eq(garageVehicleCoverage.id, coverageId), eq(garageVehicleCoverage.garageId, garageId)))
    .limit(1)
  if (!row) return { ok: false, error: { code: "NOT_FOUND", message: "Coverage entry not found" } }

  await db().update(garageVehicleCoverage).set({ isActive: false, updatedAt: new Date() }).where(eq(garageVehicleCoverage.id, coverageId))
  await writeAuditLog({ garageId, actorUserId: userId, action: "coverage.remove", entityType: "garage_vehicle_coverage", entityId: coverageId, before: { make: row.make, model: row.model } })
  return { ok: true, data: { id: coverageId } }
}
