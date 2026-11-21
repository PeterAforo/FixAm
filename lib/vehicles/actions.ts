"use server"
import { z } from "zod"
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  customers,
  documents,
  dueItems,
  garageSettings,
  odometerReadings,
  vehicleOwnerships,
  vehicles,
} from "@/lib/db/schema"
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { validateReading, type OdometerReading } from "@/lib/domain/mileage"
import { computeServiceDueDates, intervalForOilGrade, OIL_GRADES } from "@/lib/domain/service"
import { inngest } from "@/lib/inngest/client"
import { uuidv7 } from "@/lib/id"
import { plateSearchKey } from "./plate"

const staffPrincipal = (role: StaffRole, garageId: string, branchId: string | null) =>
  ({ kind: "staff" as const, role, garageId, branchId })

async function requireMembership(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return { membership: m, principal: staffPrincipal(m.role, garageId, m.branchId) }
}

const vehicleInput = z.object({
  customerId: z.string().uuid(),
  plateNumber: z.string().min(2).max(20),
  vin: z.string().max(40).optional().or(z.literal("")),
  make: z.string().min(1).max(60),
  model: z.string().min(1).max(60),
  year: z.number().int().min(1950).max(2100).optional().nullable(),
  color: z.string().max(40).optional().or(z.literal("")),
  colorHex: z.string().max(9).optional().or(z.literal("")),
  bodyType: z
    .enum(["sedan", "suv", "hatchback", "pickup", "van", "truck", "bus", "motorbike", "other"])
    .default("sedan"),
  fuelType: z
    .enum(["petrol", "diesel", "hybrid", "electric", "lpg", "cng"])
    .optional()
    .nullable(),
  transmission: z.enum(["manual", "automatic"]).optional().nullable(),
  engineSize: z.string().max(20).optional().or(z.literal("")),
  usage: z
    .enum(["private", "commercial", "taxi", "ride_hailing", "fleet"])
    .default("private"),
  notes: z.string().max(2000).optional().or(z.literal("")),
})

const createSchema = z.object({ garageId: z.string().uuid(), vehicle: vehicleInput })
const updateSchema = createSchema.extend({ vehicleId: z.string().uuid() })

function clean<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === "string" && v.trim() === "" ? null : v
  }
  return out as T
}

async function getVehicle(garageId: string, vehicleId: string) {
  const rows = await db()
    .select()
    .from(vehicles)
    .where(
      and(
        eq(vehicles.id, vehicleId),
        eq(vehicles.garageId, garageId),
        isNull(vehicles.deletedAt)
      )
    )
    .limit(1)
  return rows[0] ?? null
}

async function findByPlate(garageId: string, plateSearch: string, excludeId?: string) {
  const rows = await db()
    .select({ id: vehicles.id, plateNumber: vehicles.plateNumber })
    .from(vehicles)
    .where(
      and(
        eq(vehicles.garageId, garageId),
        eq(vehicles.plateSearch, plateSearch),
        isNull(vehicles.deletedAt),
        excludeId ? ne(vehicles.id, excludeId) : undefined
      )
    )
    .limit(1)
  return rows[0] ?? null
}

async function customerExists(garageId: string, customerId: string) {
  const rows = await db()
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.garageId, garageId),
        isNull(customers.deletedAt)
      )
    )
    .limit(1)
  return !!rows[0]
}

export async function createVehicle(rawInput: unknown): Promise<
  ActionResult<{ vehicleId: string; duplicate?: { id: string; plate: string } }>
> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }

  const parsed = createSchema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Check the highlighted fields",
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      },
    }
  }
  const { garageId, vehicle: v } = parsed.data

  const ctx = await requireMembership(userId, garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member of this garage" } }
  if (!can(ctx.principal, "vehicles.create")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "You can't add vehicles" } }
  }

  if (!(await customerExists(garageId, v.customerId))) {
    return { ok: false, error: { code: "VALIDATION", message: "Customer not found", fieldErrors: { customerId: ["Pick a customer"] } } }
  }

  const plateSearch = plateSearchKey(v.plateNumber)
  if (!plateSearch) {
    return { ok: false, error: { code: "VALIDATION", message: "Enter a plate number", fieldErrors: { plateNumber: ["Required"] } } }
  }

  const dup = await findByPlate(garageId, plateSearch)
  if (dup) {
    return { ok: true, data: { vehicleId: dup.id, duplicate: { id: dup.id, plate: dup.plateNumber } } }
  }

  const vehicleId = uuidv7()
  const values = clean({
    id: vehicleId,
    garageId,
    plateNumber: v.plateNumber.toUpperCase().trim(),
    plateSearch,
    vin: v.vin || null,
    make: v.make.trim(),
    model: v.model.trim(),
    year: v.year ?? null,
    color: v.color || null,
    colorHex: v.colorHex || null,
    bodyType: v.bodyType,
    fuelType: v.fuelType ?? null,
    transmission: v.transmission ?? null,
    engineSize: v.engineSize || null,
    usage: v.usage,
    currentOwnerId: v.customerId,
    notes: v.notes || null,
  })

  try {
    await db().insert(vehicles).values(values)
    await db().insert(vehicleOwnerships).values({
      garageId,
      vehicleId,
      customerId: v.customerId,
      fromDate: new Date().toISOString().slice(0, 10),
      isPrimary: true,
    })
    await writeAuditLog({
      garageId,
      actorUserId: userId,
      action: "vehicle.create",
      entityType: "vehicle",
      entityId: vehicleId,
      after: { plate: v.plateNumber, make: v.make, model: v.model },
    })
    return { ok: true, data: { vehicleId } }
  } catch (e) {
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "23505") {
      const again = await findByPlate(garageId, plateSearch)
      if (again) {
        return { ok: true, data: { vehicleId: again.id, duplicate: { id: again.id, plate: again.plateNumber } } }
      }
    }
    throw e
  }
}

export async function updateVehicle(rawInput: unknown): Promise<
  ActionResult<{ vehicleId: string; duplicate?: { id: string; plate: string } }>
> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }

  const parsed = updateSchema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Check the highlighted fields",
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      },
    }
  }
  const { garageId, vehicleId, vehicle: v } = parsed.data

  const ctx = await requireMembership(userId, garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member of this garage" } }
  if (!can(ctx.principal, "vehicles.update")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "You can't edit vehicles" } }
  }

  const before = await getVehicle(garageId, vehicleId)
  if (!before) return { ok: false, error: { code: "NOT_FOUND", message: "Vehicle not found" } }
  if (!(await customerExists(garageId, v.customerId))) {
    return { ok: false, error: { code: "VALIDATION", message: "Customer not found", fieldErrors: { customerId: ["Pick a customer"] } } }
  }

  const plateSearch = plateSearchKey(v.plateNumber)
  const dup = await findByPlate(garageId, plateSearch, vehicleId)
  if (dup) {
    return { ok: true, data: { vehicleId: dup.id, duplicate: { id: dup.id, plate: dup.plateNumber } } }
  }

  const values = clean({
    plateNumber: v.plateNumber.toUpperCase().trim(),
    plateSearch,
    vin: v.vin || null,
    make: v.make.trim(),
    model: v.model.trim(),
    year: v.year ?? null,
    color: v.color || null,
    colorHex: v.colorHex || null,
    bodyType: v.bodyType,
    fuelType: v.fuelType ?? null,
    transmission: v.transmission ?? null,
    engineSize: v.engineSize || null,
    usage: v.usage,
    currentOwnerId: v.customerId,
    notes: v.notes || null,
    updatedAt: new Date(),
  })

  await db().update(vehicles).set(values).where(eq(vehicles.id, vehicleId))
  await writeAuditLog({
    garageId,
    actorUserId: userId,
    action: "vehicle.update",
    entityType: "vehicle",
    entityId: vehicleId,
    before: { plate: before.plateNumber },
    after: { plate: v.plateNumber },
  })
  return { ok: true, data: { vehicleId } }
}

const transferSchema = z.object({
  garageId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  newCustomerId: z.string().uuid(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

/** Close the current ownership period and open a new one. History is kept. */
export async function transferOwnership(rawInput: unknown): Promise<ActionResult<{ vehicleId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }

  const parsed = transferSchema.safeParse(rawInput)
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: "Check the highlighted fields" } }
  }
  const { garageId, vehicleId, newCustomerId, effectiveDate } = parsed.data

  const ctx = await requireMembership(userId, garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member of this garage" } }
  if (!can(ctx.principal, "vehicles.update")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "You can't transfer vehicles" } }
  }

  const vehicle = await getVehicle(garageId, vehicleId)
  if (!vehicle) return { ok: false, error: { code: "NOT_FOUND", message: "Vehicle not found" } }
  if (!(await customerExists(garageId, newCustomerId))) {
    return { ok: false, error: { code: "VALIDATION", message: "Customer not found" } }
  }
  if (vehicle.currentOwnerId === newCustomerId) {
    return { ok: false, error: { code: "VALIDATION", message: "That customer already owns this vehicle" } }
  }

  const fromDate = effectiveDate ?? new Date().toISOString().slice(0, 10)
  const prevDay = new Date(`${fromDate}T00:00:00Z`)
  prevDay.setUTCDate(prevDay.getUTCDate() - 1)
  const toDate = prevDay.toISOString().slice(0, 10)

  await db()
    .update(vehicleOwnerships)
    .set({ toDate, updatedAt: new Date() })
    .where(
      and(
        eq(vehicleOwnerships.vehicleId, vehicleId),
        eq(vehicleOwnerships.garageId, garageId),
        isNull(vehicleOwnerships.toDate)
      )
    )
  await db().insert(vehicleOwnerships).values({
    garageId,
    vehicleId,
    customerId: newCustomerId,
    fromDate,
    isPrimary: true,
  })
  await db()
    .update(vehicles)
    .set({ currentOwnerId: newCustomerId, updatedAt: new Date() })
    .where(eq(vehicles.id, vehicleId))

  await writeAuditLog({
    garageId,
    actorUserId: userId,
    action: "vehicle.transfer_ownership",
    entityType: "vehicle",
    entityId: vehicleId,
    before: { ownerId: vehicle.currentOwnerId },
    after: { ownerId: newCustomerId, fromDate },
  })
  return { ok: true, data: { vehicleId } }
}

const odometerSchema = z.object({
  garageId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  readingKm: z.number().int().min(0).max(2_000_000),
  readAt: z.string().datetime({ offset: true }).optional(),
  source: z.enum(["check_in", "service_record", "customer_update", "staff_update", "import"]).default("staff_update"),
  odometerReplaced: z.boolean().default(false),
  jobId: z.string().uuid().optional(),
})

async function validReadings(garageId: string, vehicleId: string): Promise<OdometerReading[]> {
  const rows = await db()
    .select({ readingKm: odometerReadings.readingKm, readAt: odometerReadings.readAt, status: odometerReadings.status })
    .from(odometerReadings)
    .where(
      and(
        eq(odometerReadings.vehicleId, vehicleId),
        eq(odometerReadings.garageId, garageId)
      )
    )
    .orderBy(desc(odometerReadings.readAt))
    .limit(50)
  return rows.map((r) => ({
    km: r.readingKm,
    at: r.readAt,
    status: r.status === "valid" ? "valid" : r.status === "flagged" ? "flagged" : "rejected",
  }))
}

/** Record an odometer reading. Lower/implausible values are stored flagged. */
export async function recordOdometer(rawInput: unknown): Promise<
  ActionResult<{ readingId: string; status: "valid" | "flagged" }>
> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }

  const parsed = odometerSchema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Check the highlighted fields",
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      },
    }
  }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member of this garage" } }
  if (!can(ctx.principal, "vehicles.odometer.record")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "You can't record mileage" } }
  }

  const vehicle = await getVehicle(d.garageId, d.vehicleId)
  if (!vehicle) return { ok: false, error: { code: "NOT_FOUND", message: "Vehicle not found" } }

  const readAt = d.readAt ? new Date(d.readAt) : new Date()
  const history = await validReadings(d.garageId, d.vehicleId)
  const status = validateReading(
    { km: d.readingKm, at: readAt, odometerReplaced: d.odometerReplaced },
    history
  )
  const flagReason =
    status === "flagged"
      ? d.readingKm < (history.find((h) => (h.status ?? "valid") === "valid")?.km ?? Infinity)
        ? "reading_lower_than_previous"
        : "implausible_rate"
      : null

  const [row] = await db()
    .insert(odometerReadings)
    .values({
      garageId: d.garageId,
      vehicleId: d.vehicleId,
      readingKm: d.readingKm,
      readAt,
      source: d.source,
      status,
      flagReason,
      recordedByUserId: userId,
      jobId: d.jobId ?? null,
      odometerReplaced: d.odometerReplaced,
    })
    .returning({ id: odometerReadings.id })

  if (status === "valid") {
    await db()
      .update(vehicles)
      .set({ lastOdometerKm: d.readingKm, lastOdometerAt: readAt, updatedAt: new Date() })
      .where(eq(vehicles.id, d.vehicleId))
  }

  await writeAuditLog({
    garageId: d.garageId,
    actorUserId: userId,
    action: "vehicle.odometer.record",
    entityType: "vehicle",
    entityId: d.vehicleId,
    after: { readingKm: d.readingKm, status },
  })

  await inngest.send({
    name: "vehicle/odometer.recorded",
    data: { garageId: d.garageId, vehicleId: d.vehicleId, readingId: row!.id, status },
  })

  return { ok: true, data: { readingId: row!.id, status } }
}

const reviewSchema = z.object({
  garageId: z.string().uuid(),
  readingId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
})

/** Approve or reject a flagged reading (vehicles.odometer.override). */
export async function reviewOdometer(rawInput: unknown): Promise<ActionResult<{ readingId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }

  const parsed = reviewSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const { garageId, readingId, decision } = parsed.data

  const ctx = await requireMembership(userId, garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member of this garage" } }
  if (!can(ctx.principal, "vehicles.odometer.override")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Only managers can review readings" } }
  }

  const rows = await db()
    .select()
    .from(odometerReadings)
    .where(and(eq(odometerReadings.id, readingId), eq(odometerReadings.garageId, garageId)))
    .limit(1)
  const reading = rows[0]
  if (!reading) return { ok: false, error: { code: "NOT_FOUND", message: "Reading not found" } }
  if (reading.status !== "flagged") {
    return { ok: false, error: { code: "VALIDATION", message: "Reading is not flagged" } }
  }

  const newStatus = decision === "approve" ? "valid" : "rejected"
  await db()
    .update(odometerReadings)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(odometerReadings.id, readingId))

  if (decision === "approve") {
    // Only advance the vehicle's last reading if this is the newest valid one
    const latest = await db()
      .select({ km: odometerReadings.readingKm, at: odometerReadings.readAt })
      .from(odometerReadings)
      .where(
        and(
          eq(odometerReadings.vehicleId, reading.vehicleId),
          eq(odometerReadings.garageId, garageId),
          eq(odometerReadings.status, "valid")
        )
      )
      .orderBy(desc(odometerReadings.readAt))
      .limit(1)
    const top = latest[0]
    if (top && top.at.getTime() === reading.readAt.getTime()) {
      await db()
        .update(vehicles)
        .set({ lastOdometerKm: reading.readingKm, lastOdometerAt: reading.readAt, updatedAt: new Date() })
        .where(eq(vehicles.id, reading.vehicleId))
    }
    await inngest.send({
      name: "vehicle/odometer.recorded",
      data: { garageId, vehicleId: reading.vehicleId, readingId, status: "valid" },
    })
  }

  await writeAuditLog({
    garageId,
    actorUserId: userId,
    action: `vehicle.odometer.${decision}`,
    entityType: "odometer_reading",
    entityId: readingId,
    before: { status: reading.status, readingKm: reading.readingKm },
    after: { status: newStatus },
  })
  return { ok: true, data: { readingId } }
}

const docSchema = z.object({
  garageId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  type: z.enum([
    "insurance_policy",
    "insurance_sticker",
    "roadworthy_certificate",
    "vehicle_registration",
    "drivers_licence",
    "national_id",
    "vehicle_photo",
    "invoice_pdf",
    "receipt_pdf",
    "other",
  ]),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
})

const MAX_DOC_BYTES = 10 * 1024 * 1024

/** Upload a vehicle document to storage and register it in `documents`. */
export async function uploadVehicleDocument(formData: FormData): Promise<ActionResult<{ documentId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }

  const parsed = docSchema.safeParse({
    garageId: formData.get("garageId"),
    vehicleId: formData.get("vehicleId"),
    type: formData.get("type"),
    expiresOn: formData.get("expiresOn") ?? "",
  })
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: "Check the highlighted fields" } }
  }
  const d = parsed.data
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: { code: "VALIDATION", message: "Choose a file to upload" } }
  }
  if (file.size > MAX_DOC_BYTES) {
    return { ok: false, error: { code: "VALIDATION", message: "File must be under 10 MB" } }
  }

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member of this garage" } }
  if (!can(ctx.principal, "vehicles.update")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "You can't upload documents" } }
  }
  const vehicle = await getVehicle(d.garageId, d.vehicleId)
  if (!vehicle) return { ok: false, error: { code: "NOT_FOUND", message: "Vehicle not found" } }

  const { storageProvider } = await import("@/lib/integrations/storage")
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "bin"
  const key = `${d.garageId}/vehicles/${d.vehicleId}/${uuidv7()}.${ext}`
  const body = Buffer.from(await file.arrayBuffer())
  await storageProvider().put(key, body)

  const [row] = await db()
    .insert(documents)
    .values({
      garageId: d.garageId,
      vehicleId: d.vehicleId,
      type: d.type,
      storagePath: key,
      fileName: file.name,
      mimeType: file.type || null,
      sizeBytes: file.size,
      expiresOn: d.expiresOn || null,
      uploadedByUserId: userId,
    })
    .returning({ id: documents.id })

  await writeAuditLog({
    garageId: d.garageId,
    actorUserId: userId,
    action: "vehicle.document.upload",
    entityType: "vehicle",
    entityId: d.vehicleId,
    after: { type: d.type, fileName: file.name },
  })
  return { ok: true, data: { documentId: row!.id } }
}

/** Default km/day map from garage settings, keyed by vehicle usage. */
export async function defaultKmPerDay(garageId: string): Promise<Record<string, number>> {
  const rows = await db()
    .select({ v: garageSettings.defaultKmPerDay })
    .from(garageSettings)
    .where(eq(garageSettings.garageId, garageId))
    .limit(1)
  const raw = rows[0]?.v
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const n = Number(v)
      if (Number.isFinite(n)) out[k] = n
    }
    return out
  }
  return { private: 40, commercial: 150, taxi: 180, ride_hailing: 200, fleet: 120 }
}

/** Palette/lookup search: plates ignore spaces & hyphens; phones match digits. */
export async function searchVehiclesAndCustomers(rawInput: unknown): Promise<
  ActionResult<{
    vehicles: { id: string; plate: string; label: string; path: string }[]
    customers: { id: string; name: string; phone: string; path: string }[]
  }>
> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const schema = z.object({ garageId: z.string().uuid(), q: z.string().min(1).max(60) })
  const parsed = schema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const { garageId, q } = parsed.data

  const ctx = await requireMembership(userId, garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member of this garage" } }

  const plateKey = plateSearchKey(q)
  const phoneDigits = q.replace(/\D/g, "")
  const like = `%${q.trim()}%`

  const [vRows, cRows] = await Promise.all([
    db()
      .select({
        id: vehicles.id,
        plateNumber: vehicles.plateNumber,
        make: vehicles.make,
        model: vehicles.model,
      })
      .from(vehicles)
      .where(
        and(
          eq(vehicles.garageId, garageId),
          isNull(vehicles.deletedAt),
          plateKey.length >= 2
            ? sql`(${vehicles.plateSearch} ILIKE ${"%" + plateKey + "%"} OR ${vehicles.plateNumber} ILIKE ${like})`
            : sql`${vehicles.plateNumber} ILIKE ${like}`
        )
      )
      .limit(8),
    db()
      .select({ id: customers.id, fullName: customers.fullName, companyName: customers.companyName, phone: customers.phone })
      .from(customers)
      .where(
        and(
          eq(customers.garageId, garageId),
          isNull(customers.deletedAt),
          sql`(${customers.fullName} ILIKE ${like} OR ${customers.companyName} ILIKE ${like} OR ${customers.phone} ILIKE ${"%" + phoneDigits + "%"})`
        )
      )
      .limit(8),
  ])

  return {
    ok: true,
    data: {
      vehicles: vRows.map((v) => ({
        id: v.id,
        plate: v.plateNumber,
        label: `${v.plateNumber} Â· ${v.make} ${v.model}`,
        path: `/vehicles/${v.id}`,
      })),
      customers: cRows.map((c) => ({
        id: c.id,
        name: c.fullName || c.companyName || c.phone,
        phone: c.phone,
        path: `/customers/${c.id}`,
      })),
    },
  }
}

// ---------------------------------------------------------------------------
// Manual "last oil change" entry (P4-02) — for new customers with no job history
// ---------------------------------------------------------------------------

const oilChangeSchema = z.object({
  garageId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  performedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  odometerKm: z.number().int().min(0).max(2_000_000).optional().nullable(),
  oilGrade: z.enum(OIL_GRADES as [string, ...string[]]).optional().or(z.literal("")),
  oilBrand: z.string().max(80).optional().or(z.literal("")),
  oilQuantityMl: z.number().int().min(0).max(50000).optional().nullable(),
  oilFilters: z.string().max(300).optional().or(z.literal("")),
})

/** Record a past oil change: stores an odometer reading (if given), completes
 *  any open oil_change due item, and schedules the next cycle. */
export async function recordLastOilChange(rawInput: unknown): Promise<ActionResult<{ dueItemId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }

  const parsed = oilChangeSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Check the highlighted fields" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member of this garage" } }
  if (!can(ctx.principal, "vehicles.odometer.record")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "You can't record service history" } }
  }

  const vehicle = await getVehicle(d.garageId, d.vehicleId)
  if (!vehicle) return { ok: false, error: { code: "NOT_FOUND", message: "Vehicle not found" } }
  if (!vehicle.currentOwnerId) {
    return { ok: false, error: { code: "VALIDATION", message: "Vehicle has no current owner" } }
  }

  const performedAt = new Date(`${d.performedOn}T12:00:00Z`)
  const now = new Date()

  // optional odometer reading at service time (source: service_record)
  if (d.odometerKm != null) {
    const readAt = performedAt
    const history = await validReadings(d.garageId, d.vehicleId)
    const status = validateReading({ km: d.odometerKm, at: readAt }, history)
    await db().insert(odometerReadings).values({
      garageId: d.garageId, vehicleId: d.vehicleId, readingKm: d.odometerKm,
      readAt, source: "service_record", status,
      flagReason: status === "flagged" ? "lower_or_implausible" : null,
      recordedByUserId: userId,
    })
    if (status === "valid") {
      await db().update(vehicles)
        .set({ lastOdometerKm: d.odometerKm, lastOdometerAt: readAt, updatedAt: now })
        .where(eq(vehicles.id, d.vehicleId))
    }
    await inngest.send({
      name: "vehicle/odometer.recorded",
      data: { garageId: d.garageId, vehicleId: d.vehicleId, status },
    })
  }

  // complete any open oil_change items — this record IS the service
  await db().update(dueItems).set({
    status: "completed", completedAt: now, updatedAt: now,
  }).where(and(
    eq(dueItems.garageId, d.garageId),
    eq(dueItems.vehicleId, d.vehicleId),
    eq(dueItems.type, "oil_change"),
    sql`${dueItems.status} IN ('scheduled','due_soon','due','overdue')`,
  ))

  const interval = intervalForOilGrade(d.oilGrade || null)
  const kmPerDay = vehicle.kmPerDay != null ? Number(vehicle.kmPerDay) : null
  const dates = computeServiceDueDates({
    performedAt, odometerKm: d.odometerKm ?? null, interval, kmPerDay, now,
  })

  const gradeLabel = d.oilGrade ? d.oilGrade.replace(/_/g, " ") : "oil"
  const [row] = await db().insert(dueItems).values({
    garageId: d.garageId,
    vehicleId: d.vehicleId,
    customerId: vehicle.currentOwnerId,
    type: "oil_change",
    title: `Oil change due (${gradeLabel})`,
    dueDate: dates.dueDate,
    dueMileageKm: dates.dueMileageKm || null,
    predictedDueDate: dates.predictedDueDate,
    effectiveDueDate: dates.effectiveDueDate,
    status: "scheduled",
    sourceType: "manual",
    sourceId: null,
  }).returning({ id: dueItems.id })

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "vehicle.oil_change.record",
    entityType: "vehicle", entityId: d.vehicleId,
    after: { performedOn: d.performedOn, odometerKm: d.odometerKm, oilGrade: d.oilGrade, dueItemId: row!.id },
  })
  return { ok: true, data: { dueItemId: row!.id } }
}
