"use server"
import { randomBytes, createHash } from "crypto"
import { z } from "zod"
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  bookings,
  branches,
  customers,
  documentSequences,
  dueItems,
  jobAssignments,
  jobFindings,
  jobItems,
  jobMedia,
  garages,
  jobStatusEvents,
  jobTasks,
  jobTemplates,
  jobs,
  memberships,
  invoices,
  paymentPlans,
  odometerReadings,
  parts,
  users,
  vehicles,
} from "@/lib/db/schema"
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { validateReading, type OdometerReading } from "@/lib/domain/mileage"
import { inngest } from "@/lib/inngest/client"
import { sendMessage } from "@/lib/messaging/send"
import { uuidv7 } from "@/lib/id"
import { canTransitionJob, type JobStatus } from "./transitions"
import { buildInvoiceFromJob } from "@/lib/money/invoice-core"
import { issueReservedStock } from "@/lib/parts/stock"
import { closeDueItem } from "@/lib/reminders/engine"
import { storageProvider } from "@/lib/integrations/storage"

const staffPrincipal = (role: StaffRole, garageId: string, branchId: string | null) =>
  ({ kind: "staff" as const, role, garageId, branchId })

async function requireMembership(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return { membership: m, principal: staffPrincipal(m.role, garageId, m.branchId) }
}

async function nextJobNumber(garageId: string, branchId: string): Promise<string> {
  const rows = await db()
    .insert(documentSequences)
    .values({ garageId, branchId, docType: "JOB", nextNumber: 2n })
    .onConflictDoUpdate({
      target: [documentSequences.garageId, documentSequences.branchId, documentSequences.docType],
      set: { nextNumber: sql`${documentSequences.nextNumber} + 1`, updatedAt: new Date() },
    })
    .returning({ nextNumber: documentSequences.nextNumber })
  // nextNumber was just incremented; the number used is nextNumber-1... simpler: read then bump
  const n = Number(rows[0]!.nextNumber) - 1
  return `JOB-${String(n).padStart(4, "0")}`
}

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

const checkInSchema = z.object({
  garageId: z.string().uuid(),
  branchId: z.string().uuid(),
  customerId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  bookingId: z.string().uuid().optional(),
  jobTemplateId: z.string().uuid().optional(),
  bayId: z.string().uuid().optional(),
  mechanicIds: z.array(z.string().uuid()).max(10).default([]),
  complaint: z.string().min(1).max(2000),
  checkInOdometerKm: z.number().int().min(0).max(2_000_000),
  checkInFuelLevel: z.number().int().min(0).max(100).default(50),
  checkInItems: z.string().max(1000).optional().or(z.literal("")),
  promisedAt: z.string().datetime({ offset: true }).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  warrantyParentJobId: z.string().uuid().optional(),
  signatureDataUrl: z.string().max(500_000).optional(),
})

async function storeSignature(dataUrl: string, garageId: string, jobId: string) {
  const m = /^data:image\/(png|jpeg|jpg);base64,(.+)$/.exec(dataUrl)
  if (!m) return null
  const ext = m[1] === "png" ? "png" : "jpg"
  const key = `${garageId}/jobs/${jobId}/signature.${ext}`
  await storageProvider().put(key, Buffer.from(m[2]!, "base64"))
  return key
}

export async function checkInJob(rawInput: unknown): Promise<ActionResult<{ jobId: string; number: string; trackerUrl: string | null }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }

  const parsed = checkInSchema.safeParse(rawInput)
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
  if (!can(ctx.principal, "jobs.create")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "You can't check in vehicles" } }
  }

  // validate branch belongs to garage and actor can access it
  const [branch] = await db()
    .select({ id: branches.id })
    .from(branches)
    .where(and(eq(branches.id, d.branchId), eq(branches.garageId, d.garageId)))
    .limit(1)
  if (!branch) return { ok: false, error: { code: "VALIDATION", message: "Unknown branch", fieldErrors: { branchId: ["Pick a branch"] } } }

  const [vehicle] = await db()
    .select({ id: vehicles.id, currentOwnerId: vehicles.currentOwnerId })
    .from(vehicles)
    .where(and(eq(vehicles.id, d.vehicleId), eq(vehicles.garageId, d.garageId), isNull(vehicles.deletedAt)))
    .limit(1)
  if (!vehicle) return { ok: false, error: { code: "NOT_FOUND", message: "Vehicle not found" } }

  const [customer] = await db()
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, d.customerId), eq(customers.garageId, d.garageId), isNull(customers.deletedAt)))
    .limit(1)
  if (!customer) return { ok: false, error: { code: "NOT_FOUND", message: "Customer not found" } }

  let template: typeof jobTemplates.$inferSelect | null = null
  if (d.jobTemplateId) {
    const rows = await db()
      .select()
      .from(jobTemplates)
      .where(and(eq(jobTemplates.id, d.jobTemplateId), eq(jobTemplates.garageId, d.garageId)))
      .limit(1)
    template = rows[0] ?? null
  }

  // warranty/callback: parent must be a real job on the same vehicle
  if (d.warrantyParentJobId) {
    const [parent] = await db()
      .select({ id: jobs.id, vehicleId: jobs.vehicleId })
      .from(jobs)
      .where(and(eq(jobs.id, d.warrantyParentJobId), eq(jobs.garageId, d.garageId), isNull(jobs.deletedAt)))
      .limit(1)
    if (!parent || parent.vehicleId !== d.vehicleId) {
      return { ok: false, error: { code: "VALIDATION", message: "Warranty parent job must be on the same vehicle", fieldErrors: { warrantyParentJobId: ["Pick a previous job for this vehicle"] } } }
    }
  }

  const jobId = uuidv7()
  const number = await nextJobNumber(d.garageId, d.branchId)
  const signaturePath = d.signatureDataUrl ? await storeSignature(d.signatureDataUrl, d.garageId, jobId) : null
  const trackerToken = randomBytes(24).toString("hex")
  const trackerTokenHash = createHash("sha256").update(trackerToken).digest("hex")

  await db().insert(jobs).values({
    id: jobId,
    garageId: d.garageId,
    branchId: d.branchId,
    number,
    vehicleId: d.vehicleId,
    customerId: d.customerId,
    bookingId: d.bookingId ?? null,
    jobTemplateId: template?.id ?? null,
    bayId: d.bayId ?? null,
    status: "checked_in",
    priority: d.priority,
    complaint: d.complaint,
    checkInOdometerKm: d.checkInOdometerKm,
    checkInFuelLevel: d.checkInFuelLevel,
    checkInItems: d.checkInItems || null,
    checkInSignaturePath: signaturePath,
    promisedAt: d.promisedAt ? new Date(d.promisedAt) : null,
    checkedInAt: new Date(),
    serviceAdvisorId: userId,
    warrantyParentJobId: d.warrantyParentJobId ?? null,
    isWarranty: Boolean(d.warrantyParentJobId),
    trackerTokenHash,
  })

  // link booking → job and mark it checked in
  if (d.bookingId) {
    await db()
      .update(bookings)
      .set({ status: "checked_in", jobId, updatedAt: new Date() })
      .where(and(eq(bookings.id, d.bookingId), eq(bookings.garageId, d.garageId)))
  }

  // status event (creation → checked_in)
  await db().insert(jobStatusEvents).values({
    garageId: d.garageId,
    jobId,
    fromStatus: null,
    toStatus: "checked_in",
    actorUserId: userId,
    note: "Checked in",
  })

  // odometer reading (required at check-in) — source check_in
  const odoRows = await db()
    .select({ readingKm: odometerReadings.readingKm, readAt: odometerReadings.readAt, status: odometerReadings.status })
    .from(odometerReadings)
    .where(and(eq(odometerReadings.vehicleId, d.vehicleId), eq(odometerReadings.garageId, d.garageId)))
    .orderBy(desc(odometerReadings.readAt))
    .limit(50)
  const history: OdometerReading[] = odoRows.map((r) => ({
    km: r.readingKm,
    at: r.readAt,
    status: r.status === "valid" ? "valid" : r.status === "flagged" ? "flagged" : "rejected",
  }))
  const odoStatus = validateReading({ km: d.checkInOdometerKm, at: new Date() }, history)
  const [odo] = await db()
    .insert(odometerReadings)
    .values({
      garageId: d.garageId,
      vehicleId: d.vehicleId,
      readingKm: d.checkInOdometerKm,
      readAt: new Date(),
      source: "check_in",
      status: odoStatus,
      flagReason: odoStatus === "flagged" ? "implausible_rate" : null,
      recordedByUserId: userId,
      jobId,
    })
    .returning({ id: odometerReadings.id })
  if (odoStatus === "valid") {
    await db()
      .update(vehicles)
      .set({ lastOdometerKm: d.checkInOdometerKm, lastOdometerAt: new Date(), updatedAt: new Date() })
      .where(eq(vehicles.id, d.vehicleId))
  }
  await inngest.send({
    name: "vehicle/odometer.recorded",
    data: { garageId: d.garageId, vehicleId: d.vehicleId, readingId: odo!.id, status: odoStatus },
  })

  // template → job_tasks (checklist) + job_items (default items)
  if (template) {
    const checklist = Array.isArray(template.checklist) ? (template.checklist as { label: string; required?: boolean }[]) : []
    if (checklist.length) {
      await db().insert(jobTasks).values(
        checklist.map((c, i) => ({
          garageId: d.garageId,
          jobId,
          title: c.label,
          required: Boolean(c.required),
          checklistItem: true,
          sortOrder: i,
        }))
      )
    }
    const items = Array.isArray(template.defaultItems)
      ? (template.defaultItems as { type?: string; description?: string; quantity?: number; unitPricePesewas?: number; sku?: string; labour_hours?: number }[])
      : []
    if (items.length) {
      const skus = items.map((i) => i.sku).filter((s): s is string => Boolean(s))
      const partRows = skus.length
        ? await db().select({ id: parts.id, sku: parts.sku }).from(parts).where(and(eq(parts.garageId, d.garageId), sql`${parts.sku} = ANY(${skus})`))
        : []
      const partBySku = new Map(partRows.map((p) => [p.sku, p.id]))
      const itemRows = await Promise.all(
        items.map(async (item, i) => {
          let partId: string | null = null
          let unitPrice = item.unitPricePesewas ?? 0
          if (item.sku) {
            partId = partBySku.get(item.sku) ?? null
            if (partId) {
              const [p] = await db().select({ sellingPrice: parts.sellingPrice }).from(parts).where(eq(parts.id, partId)).limit(1)
              if (p) unitPrice = Number(p.sellingPrice)
            }
          }
          return {
            garageId: d.garageId,
            jobId,
            type: (item.type === "part" ? "part" : item.type === "labour" ? "labour" : item.type === "sundry" ? "sundry" : "service_fee") as "part" | "labour" | "sundry" | "service_fee",
            description: item.description ?? "Item",
            partId,
            quantity: String(item.quantity ?? 1),
            unitPrice: BigInt(unitPrice),
            labourHours: item.labour_hours != null ? String(item.labour_hours) : null,
            sortOrder: i,
          }
        })
      )
      await db().insert(jobItems).values(itemRows)
    }
  }

  // assignments (mechanics; first is lead)
  const mechIds = [...new Set(d.mechanicIds)]
  if (mechIds.length) {
    const valid = await db()
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.garageId, d.garageId), eq(memberships.status, "active"), sql`${memberships.userId} = ANY(${mechIds})`))
    const validIds = new Set(valid.map((v) => v.userId))
    const ids = mechIds.filter((id) => validIds.has(id))
    if (ids.length) {
      await db().insert(jobAssignments).values(
        ids.map((uid, i) => ({ garageId: d.garageId, jobId, userId: uid, isLead: i === 0 }))
      )
    }
  }

  await writeAuditLog({
    garageId: d.garageId,
    actorUserId: userId,
    action: "job.check_in",
    entityType: "job",
    entityId: jobId,
    after: { number, vehicleId: d.vehicleId, odometer: d.checkInOdometerKm },
  })

  // send the live-tracker link to the customer (best-effort)
  let trackerUrl: string | null = null
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    trackerUrl = `${base}/t/${trackerToken}`
    const [cust] = await db().select({ phone: customers.phone, fullName: customers.fullName }).from(customers).where(eq(customers.id, d.customerId)).limit(1)
    const [gr] = await db().select({ name: garages.name }).from(garages).where(eq(garages.id, d.garageId)).limit(1)
    const [veh] = await db().select({ plateNumber: vehicles.plateNumber, make: vehicles.make, model: vehicles.model }).from(vehicles).where(eq(vehicles.id, d.vehicleId)).limit(1)
    if (cust?.phone) {
      await sendMessage({
        garageId: d.garageId,
        channel: "whatsapp",
        to: cust.phone,
        templateKey: "check_in_tracker",
        variables: {
          customer_first_name: (cust.fullName ?? "there").split(" ")[0]!,
          plate: veh?.plateNumber ?? "",
          vehicle: veh ? `${veh.make} ${veh.model}` : "",
          garage_name: gr?.name ?? "the garage",
          job_number: number,
          tracker_link: trackerUrl,
        },
        idempotencyKey: `tracker:${jobId}`,
      })
    }
  } catch {
    // link still returned to staff even if messaging fails
  }

  return { ok: true, data: { jobId, number, trackerUrl } }
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

async function getJob(garageId: string, jobId: string) {
  const rows = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.garageId, garageId), isNull(jobs.deletedAt)))
    .limit(1)
  return rows[0] ?? null
}

const statusSchema = z.object({
  garageId: z.string().uuid(),
  jobId: z.string().uuid(),
  toStatus: z.enum([
    "booked", "checked_in", "diagnosing", "estimate_sent", "approved", "declined",
    "in_progress", "waiting_parts", "quality_check", "ready", "delivered", "closed", "cancelled",
  ]),
  note: z.string().max(500).optional(),
  customerVisible: z.boolean().default(true),
})

export async function updateJobStatus(rawInput: unknown): Promise<ActionResult<{ jobId: string; status: JobStatus }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }

  const parsed = statusSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const { garageId, jobId, toStatus, note, customerVisible } = parsed.data

  const ctx = await requireMembership(userId, garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member of this garage" } }
  if (!can(ctx.principal, "jobs.status.update")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "You can't change job status" } }
  }

  const job = await getJob(garageId, jobId)
  if (!job) return { ok: false, error: { code: "NOT_FOUND", message: "Job not found" } }

  const from = job.status as JobStatus
  if (!canTransitionJob(from, toStatus)) {
    return {
      ok: false,
      error: { code: "VALIDATION", message: `Can't move from ${from.replace(/_/g, " ")} to ${toStatus.replace(/_/g, " ")}` },
    }
  }

  // Side-effect guards from data-model.json
  if (toStatus === "quality_check") {
    const openRequired = await db()
      .select({ id: jobTasks.id })
      .from(jobTasks)
      .where(and(eq(jobTasks.jobId, jobId), eq(jobTasks.garageId, garageId), eq(jobTasks.required, true), eq(jobTasks.isDone, false), eq(jobTasks.checklistItem, true)))
      .limit(1)
    if (openRequired[0]) {
      return { ok: false, error: { code: "VALIDATION", message: "Required checklist tasks must be completed first" } }
    }
  }
  if (toStatus === "ready" && !job.qcSignedOffAt) {
    return { ok: false, error: { code: "VALIDATION", message: "QC sign-off is required before marking ready" } }
  }

  // Delivery gate: invoice must be issued AND settled (paid in full, charged
  // to a credit account, or covered by an active payment plan).
  if (toStatus === "delivered") {
    const [inv] = await db()
      .select({
        id: invoices.id,
        status: invoices.status,
        balanceDue: invoices.balanceDue,
        creditAccountId: invoices.creditAccountId,
        paymentPlanId: invoices.paymentPlanId,
      })
      .from(invoices)
      .where(and(eq(invoices.garageId, garageId), eq(invoices.source, "job"), eq(invoices.sourceId, jobId), inArray(invoices.status, ["issued", "partially_paid", "paid"])))
      .orderBy(desc(invoices.createdAt))
      .limit(1)
    let planActive = false
    if (inv?.paymentPlanId) {
      const [plan] = await db().select({ status: paymentPlans.status }).from(paymentPlans)
        .where(and(eq(paymentPlans.id, inv.paymentPlanId), eq(paymentPlans.garageId, garageId))).limit(1)
      planActive = plan?.status === "active"
    }
    const settled =
      !!inv &&
      (inv.status === "paid" ||
        Number(inv.balanceDue) <= 0 ||
        inv.creditAccountId != null ||
        planActive)
    if (!settled) {
      return { ok: false, error: { code: "VALIDATION", message: "Invoice must be issued and settled (paid, on credit, or on a payment plan) before delivery" } }
    }
  }

  const now = new Date()
  const patch: Record<string, unknown> = { status: toStatus, updatedAt: now }
  if (toStatus === "ready") patch.readyAt = now
  if (toStatus === "delivered") patch.deliveredAt = now

  await db().update(jobs).set(patch).where(eq(jobs.id, jobId))

  await db().insert(jobStatusEvents).values({
    garageId,
    jobId,
    fromStatus: from,
    toStatus,
    actorUserId: userId,
    note: note || null,
    customerVisible,
  })

  // delivered → create due item from template's creates_due_item_type
  if (toStatus === "delivered" && job.jobTemplateId) {
    const [tpl] = await db()
      .select({ createsDueItemType: jobTemplates.createsDueItemType })
      .from(jobTemplates)
      .where(eq(jobTemplates.id, job.jobTemplateId))
      .limit(1)
    const dueType = tpl?.createsDueItemType
    if (dueType) {
      const existing = await db()
        .select({ id: dueItems.id })
        .from(dueItems)
        .where(and(eq(dueItems.vehicleId, job.vehicleId), eq(dueItems.garageId, garageId), eq(dueItems.type, dueType), sql`${dueItems.status} IN ('scheduled','due_soon','due','overdue')`))
        .limit(1)
      if (!existing[0] && job.customerId) {
        // default interval: oil_change 6mo/7500km semi-synthetic baseline
        const months = dueType === "oil_change" ? 6 : 12
        const km = dueType === "oil_change" ? 7500 : 15000
        const due = new Date(now)
        due.setMonth(due.getMonth() + months)
        await db().insert(dueItems).values({
          garageId,
          vehicleId: job.vehicleId,
          customerId: job.customerId,
          type: dueType,
          title: `${dueType.replace(/_/g, " ")} due`,
          dueDate: due.toISOString().slice(0, 10),
          dueMileageKm: (job.checkInOdometerKm ?? 0) + km,
          effectiveDueDate: due.toISOString().slice(0, 10),
          status: "scheduled",
          sourceType: "job",
          sourceId: jobId,
        })
      }
    }
  }

  // delivered → complete the due item that triggered this job (via booking.dueItemId)
  if (toStatus === "delivered" && job.bookingId) {
    try {
      const [b] = await db().select({ dueItemId: bookings.dueItemId }).from(bookings).where(eq(bookings.id, job.bookingId)).limit(1)
      if (b?.dueItemId) {
        await closeDueItem(b.dueItemId, "completed", "completed via job delivery")
      }
    } catch (e) {
      console.error("[jobs] due-item completion on delivery failed", e)
    }
  }

  // delivered → issue approved part stock (reserved at estimate approval)
  if (toStatus === "delivered") {
    try {
      const partItems = await db()
        .select({ id: jobItems.id, partId: jobItems.partId, quantity: jobItems.quantity })
        .from(jobItems)
        .where(and(
          eq(jobItems.jobId, jobId),
          eq(jobItems.garageId, garageId),
          eq(jobItems.type, "part"),
          eq(jobItems.approvalStatus, "approved"),
          sql`${jobItems.partId} IS NOT NULL`,
        ))
      for (const i of partItems) {
        await issueReservedStock({
          garageId, branchId: job.branchId, partId: i.partId!,
          quantity: Number(i.quantity), jobId, actorUserId: userId,
        })
        await db().update(jobItems).set({ isIssuedFromStock: true, updatedAt: now }).where(eq(jobItems.id, i.id))
      }
    } catch (e) {
      console.error("[jobs] stock issue on delivery failed", e)
    }
  }

  // ready → auto-create draft invoice from billable items (best-effort)
  if (toStatus === "ready") {
    try {
      await buildInvoiceFromJob(db(), {
        garageId,
        jobId,
        branchId: job.branchId,
        customerId: job.customerId,
        vehicleId: job.vehicleId,
        actorUserId: userId,
      })
    } catch {
      // invoicing is best-effort; can be created manually from the job
    }
  }

  // ready → notify customer with pickup message (best-effort)
  if (toStatus === "ready") {
    try {
      const [cust] = await db()
        .select({ phone: customers.phone, fullName: customers.fullName })
        .from(customers)
        .where(eq(customers.id, job.customerId))
        .limit(1)
      const [gr] = await db().select({ name: garages.name }).from(garages).where(eq(garages.id, garageId)).limit(1)
      const [veh] = await db().select({ plateNumber: vehicles.plateNumber, make: vehicles.make, model: vehicles.model }).from(vehicles).where(eq(vehicles.id, job.vehicleId)).limit(1)
      if (cust?.phone) {
        const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
        await sendMessage({
          garageId,
          channel: "whatsapp",
          to: cust.phone,
          templateKey: "job_ready",
          variables: {
            customer_first_name: (cust.fullName ?? "there").split(" ")[0]!,
            plate: veh?.plateNumber ?? "",
            vehicle: veh ? `${veh.make} ${veh.model}` : "",
            garage_name: gr?.name ?? "the garage",
            balance: "GH₵ 0.00", // invoice gate lands in P2
            action_link: `${base}/portal`,
          },
          idempotencyKey: `job-ready:${jobId}:${toStatus}`,
        })
      }
    } catch {
      // notification is best-effort; status change already committed
    }
  }

  await writeAuditLog({
    garageId,
    actorUserId: userId,
    action: "job.status.update",
    entityType: "job",
    entityId: jobId,
    before: { status: from },
    after: { status: toStatus, note },
  })

  return { ok: true, data: { jobId, status: toStatus } }
}

/** QC sign-off — required before a job can move to ready. */
export async function signOffQc(rawInput: unknown): Promise<ActionResult<{ jobId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const schema = z.object({ garageId: z.string().uuid(), jobId: z.string().uuid() })
  const parsed = schema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const { garageId, jobId } = parsed.data

  const ctx = await requireMembership(userId, garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "jobs.quality_check.sign_off")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Can't sign off QC" } }
  }
  const job = await getJob(garageId, jobId)
  if (!job) return { ok: false, error: { code: "NOT_FOUND", message: "Job not found" } }
  if (job.qcSignedOffAt) return { ok: true, data: { jobId } }

  await db()
    .update(jobs)
    .set({ qcSignedOffBy: userId, qcSignedOffAt: new Date(), updatedAt: new Date() })
    .where(eq(jobs.id, jobId))
  return { ok: true, data: { jobId } }
}

// ---------------------------------------------------------------------------
// Findings / items / tasks / media / assignments
// ---------------------------------------------------------------------------

const findingSchema = z.object({
  garageId: z.string().uuid(),
  jobId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().or(z.literal("")),
  severity: z.enum(["urgent", "recommended", "can_wait"]).default("recommended"),
  customerVisible: z.boolean().default(true),
})

export async function addJobFinding(rawInput: unknown): Promise<ActionResult<{ findingId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = findingSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Check the fields" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "jobs.update")) return { ok: false, error: { code: "FORBIDDEN", message: "Can't add findings" } }
  const job = await getJob(d.garageId, d.jobId)
  if (!job) return { ok: false, error: { code: "NOT_FOUND", message: "Job not found" } }

  const [row] = await db()
    .insert(jobFindings)
    .values({
      garageId: d.garageId,
      jobId: d.jobId,
      title: d.title,
      description: d.description || null,
      severity: d.severity,
      createdBy: userId,
      customerVisible: d.customerVisible,
    })
    .returning({ id: jobFindings.id })
  return { ok: true, data: { findingId: row!.id } }
}

const itemSchema = z.object({
  garageId: z.string().uuid(),
  jobId: z.string().uuid(),
  type: z.enum(["labour", "part", "sundry", "service_fee"]),
  description: z.string().min(1).max(300),
  partId: z.string().uuid().optional(),
  quantity: z.number().positive().max(9999).default(1),
  unitPrice: z.number().int().min(0), // pesewas
  labourHours: z.number().min(0).max(999).optional(),
})

export async function addJobItem(rawInput: unknown): Promise<ActionResult<{ itemId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = itemSchema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "VALIDATION", message: "Check the fields", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> },
    }
  }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "jobs.update")) return { ok: false, error: { code: "FORBIDDEN", message: "Can't add items" } }
  const job = await getJob(d.garageId, d.jobId)
  if (!job) return { ok: false, error: { code: "NOT_FOUND", message: "Job not found" } }

  const [row] = await db()
    .insert(jobItems)
    .values({
      garageId: d.garageId,
      jobId: d.jobId,
      type: d.type,
      description: d.description,
      partId: d.partId ?? null,
      quantity: String(d.quantity),
      unitPrice: BigInt(d.unitPrice),
      labourHours: d.labourHours != null ? String(d.labourHours) : null,
      sortOrder: 100,
    })
    .returning({ id: jobItems.id })
  return { ok: true, data: { itemId: row!.id } }
}

export async function toggleJobTask(rawInput: unknown): Promise<ActionResult<{ taskId: string; isDone: boolean }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const schema = z.object({ garageId: z.string().uuid(), taskId: z.string().uuid(), isDone: z.boolean() })
  const parsed = schema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const { garageId, taskId, isDone } = parsed.data

  const ctx = await requireMembership(userId, garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  // mechanics may update tasks on their jobs; others need jobs.update
  const [task] = await db()
    .select({ id: jobTasks.id, jobId: jobTasks.jobId, assignedTo: jobTasks.assignedTo })
    .from(jobTasks)
    .where(and(eq(jobTasks.id, taskId), eq(jobTasks.garageId, garageId)))
    .limit(1)
  if (!task) return { ok: false, error: { code: "NOT_FOUND", message: "Task not found" } }

  const allowed =
    can(ctx.principal, "jobs.update") ||
    can(ctx.principal, "jobs.tasks.update_own") ||
    (ctx.membership.role === "mechanic" && task.assignedTo === userId)
  if (!allowed) return { ok: false, error: { code: "FORBIDDEN", message: "Can't update this task" } }

  await db()
    .update(jobTasks)
    .set({ isDone, doneAt: isDone ? new Date() : null, updatedAt: new Date() })
    .where(eq(jobTasks.id, taskId))
  return { ok: true, data: { taskId, isDone } }
}

export async function assignJobMechanic(rawInput: unknown): Promise<ActionResult<{ jobId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const schema = z.object({
    garageId: z.string().uuid(),
    jobId: z.string().uuid(),
    userId: z.string().uuid(),
    isLead: z.boolean().default(false),
  })
  const parsed = schema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "jobs.assign")) return { ok: false, error: { code: "FORBIDDEN", message: "Can't assign" } }
  const job = await getJob(d.garageId, d.jobId)
  if (!job) return { ok: false, error: { code: "NOT_FOUND", message: "Job not found" } }

  await db()
    .insert(jobAssignments)
    .values({ garageId: d.garageId, jobId: d.jobId, userId: d.userId, isLead: d.isLead })
    .onConflictDoNothing()
  return { ok: true, data: { jobId: d.jobId } }
}

const mediaSchema = z.object({
  garageId: z.string().uuid(),
  jobId: z.string().uuid(),
  kind: z.enum(["photo", "video", "voice"]).default("photo"),
  stage: z.enum(["check_in", "diagnosis", "repair", "qc", "delivery"]).optional(),
  caption: z.string().max(300).optional().or(z.literal("")),
  customerVisible: z.boolean().default(true),
})

export async function uploadJobMedia(formData: FormData): Promise<ActionResult<{ mediaId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }

  const parsed = mediaSchema.safeParse({
    garageId: formData.get("garageId"),
    jobId: formData.get("jobId"),
    kind: formData.get("kind") || "photo",
    stage: formData.get("stage") || undefined,
    caption: formData.get("caption") ?? "",
    customerVisible: formData.get("customerVisible") !== "false",
  })
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: { code: "VALIDATION", message: "Choose a file" } }
  }
  if (file.size > 25 * 1024 * 1024) {
    return { ok: false, error: { code: "VALIDATION", message: "File must be under 25 MB" } }
  }

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "jobs.media.upload")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Can't upload media" } }
  }
  const job = await getJob(d.garageId, d.jobId)
  if (!job) return { ok: false, error: { code: "NOT_FOUND", message: "Job not found" } }

  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "bin"
  const key = `${d.garageId}/jobs/${d.jobId}/${uuidv7()}.${ext}`
  await storageProvider().put(key, Buffer.from(await file.arrayBuffer()))

  const [row] = await db()
    .insert(jobMedia)
    .values({
      garageId: d.garageId,
      jobId: d.jobId,
      kind: d.kind,
      stage: d.stage ?? null,
      storagePath: key,
      caption: d.caption || null,
      customerVisible: d.customerVisible,
      uploadedBy: userId,
    })
    .returning({ id: jobMedia.id })
  return { ok: true, data: { mediaId: row!.id } }
}

/** Staff roster for assignment pickers (active members with names). */
export async function listGarageStaff(rawInput: unknown): Promise<
  ActionResult<{ userId: string; name: string; role: string; branchId: string | null }[]>
> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const schema = z.object({ garageId: z.string().uuid() })
  const parsed = schema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const m = await resolveMembership(userId, parsed.data.garageId)
  if (!m) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }

  const rows = await db()
    .select({
      userId: memberships.userId,
      role: memberships.role,
      branchId: memberships.branchId,
      fullName: users.fullName,
      email: users.email,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(and(eq(memberships.garageId, parsed.data.garageId), eq(memberships.status, "active")))
  return {
    ok: true,
    data: rows
      .filter((r): r is typeof r & { userId: string } => Boolean(r.userId))
      .map((r) => ({
        userId: r.userId,
        name: r.fullName || r.email,
        role: r.role,
        branchId: r.branchId,
      })),
  }
}
