import "server-only"
import { createHash, randomBytes } from "crypto"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  branches,
  customers,
  garageSettings,
  garages,
  inspectionItems,
  inspections,
  obdScans,
  users,
  vehicles,
} from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { getPortalPhone } from "@/lib/portal/session"
import { resolveMembership, writeAuditLog } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { rateLimit } from "@/lib/rate-limit"
import { paymentProvider } from "@/lib/integrations/payments"
import { nextPaymentReference } from "@/lib/payments/reference"
import { appUrl, sendDirectSms } from "@/lib/messaging/direct"
import { sendMessage } from "@/lib/messaging/send"
import { formatGHS } from "@/lib/money"
import { runPrompt } from "@/lib/ai/run"
import { inspectionReportPrompt } from "@/lib/ai/prompts"
import { uuidv7 } from "@/lib/id"
import {
  CHECKLIST,
  INSPECTION_SECTIONS,
  canTransition,
  flaggedItems,
  isInspectionToken,
  newInspectionToken,
  summariseResults,
  type BookInspectionInput,
  type VehicleDetailsInput,
} from "./core"

type Inspection = typeof inspections.$inferSelect

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex")
}

function nextNumber(): string {
  const d = new Date()
  const rand = randomBytes(3).toString("hex").toUpperCase()
  return `INS-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${rand}`
}

async function seedItems(inspectionId: string) {
  if (CHECKLIST.length === 0) return
  await db().insert(inspectionItems).values(
    CHECKLIST.map((c) => ({ inspectionId, section: c.section, itemKey: c.key, label: c.label, result: "na" }))
  )
}

// ---------------------------------------------------------------------------
// Driver side (portal)
// ---------------------------------------------------------------------------

async function driverCtx() {
  const userId = await getSessionUserId()
  const phone = await getPortalPhone()
  if (!userId || !phone) return null
  return { userId, phone }
}

/** Garages offering inspections (public-ish list for the booking form). */
export async function listInspectionGarages() {
  const rows = await db()
    .select({
      id: garages.id,
      name: garages.name,
      slug: garages.slug,
      city: garages.city,
      address: garages.address,
      phone: garages.phone,
      price: garageSettings.inspectionPrice,
    })
    .from(garageSettings)
    .innerJoin(garages, eq(garages.id, garageSettings.garageId))
    .where(and(eq(garageSettings.offersInspections, true), isNull(garages.deletedAt)))
    .limit(100)
  return rows.map((r) => ({ ...r, price: Number(r.price) }))
}

export async function myInspections() {
  const me = await driverCtx()
  if (!me) return []
  const rows = await db()
    .select({
      id: inspections.id,
      number: inspections.number,
      status: inspections.status,
      price: inspections.price,
      paymentStatus: inspections.paymentStatus,
      garageName: garages.name,
      garageSlug: garages.slug,
      scheduledAt: inspections.scheduledAt,
      createdAt: inspections.createdAt,
      hasReport: sql<boolean>`${inspections.shareTokenHash} is not null`,
    })
    .from(inspections)
    .innerJoin(garages, eq(garages.id, inspections.garageId))
    .where(and(eq(inspections.driverPhone, me.phone), isNull(inspections.deletedAt)))
    .orderBy(desc(inspections.createdAt))
    .limit(50)
  return rows.map((r) => ({ ...r, price: Number(r.price), scheduledAt: r.scheduledAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString() }))
}

/**
 * Book + pay for an inspection. Creates the row awaiting payment and returns
 * a checkout URL (theTeller hosted checkout or MoMo charge display text).
 */
export async function bookAndPayInspection(input: BookInspectionInput, channel: "card" | "momo", momoNetwork?: "mtn" | "telecel" | "airteltigo") {
  const me = await driverCtx()
  if (!me) return { ok: false as const, error: "Sign in to book an inspection" }
  const rl = await rateLimit(`insp-book:${me.userId}`, 10, 3600)
  if (!rl.ok) return { ok: false as const, error: "Too many bookings — try again later" }

  const [garage] = await db().select().from(garages).where(eq(garages.id, input.garageId)).limit(1)
  if (!garage) return { ok: false as const, error: "Garage not found" }
  const [settings] = await db().select().from(garageSettings).where(eq(garageSettings.garageId, garage.id)).limit(1)
  if (!settings?.offersInspections) return { ok: false as const, error: "This garage doesn't offer inspections" }
  const price = settings.inspectionPrice ?? 0n
  if (price <= 0n) return { ok: false as const, error: "This garage hasn't set an inspection price yet" }

  if (input.locationKind === "seller") {
    if (!input.sellerName?.trim() || !input.sellerPhone?.trim() || !input.sellerAddress?.trim()) {
      return { ok: false as const, error: "For a seller visit we need the seller's name, phone and address" }
    }
  }
  if (!input.vehicle.make?.trim() && !input.vehicle.model?.trim() && !input.vehicle.plate?.trim()) {
    return { ok: false as const, error: "Tell us the car's make/model or plate" }
  }

  // Resolve driver customer record for this garage (create if missing).
  let customerId: string | null = null
  const [cust] = await db().select({ id: customers.id }).from(customers)
    .where(and(eq(customers.garageId, garage.id), eq(customers.phone, me.phone), isNull(customers.deletedAt))).limit(1)
  if (cust) customerId = cust.id
  else {
    const [u] = await db().select({ fullName: users.fullName, email: users.email }).from(users).where(eq(users.id, me.userId)).limit(1)
    const [created] = await db().insert(customers).values({
      garageId: garage.id,
      phone: me.phone,
      fullName: u?.fullName ?? "Driver",
      email: u?.email ?? null,
      source: "inspection_booking",
    }).returning({ id: customers.id })
    customerId = created?.id ?? null
  }

  const reference = await nextPaymentReference()
  const id = uuidv7()
  const [branch] = await db().select({ id: branches.id }).from(branches).where(and(eq(branches.garageId, garage.id), isNull(branches.deletedAt))).limit(1)
  await db().insert(inspections).values({
    id,
    number: nextNumber(),
    garageId: garage.id,
    branchId: branch?.id ?? null,
    customerId,
    driverPhone: me.phone,
    driverUserId: me.userId,
    vehicleDetails: input.vehicle,
    locationKind: input.locationKind,
    sellerName: input.locationKind === "seller" ? input.sellerName!.trim() : null,
    sellerPhone: input.locationKind === "seller" ? input.sellerPhone!.trim() : null,
    sellerAddress: input.locationKind === "seller" ? input.sellerAddress!.trim() : null,
    sellerLat: input.locationKind === "seller" ? (input.sellerLat != null ? String(input.sellerLat) : null) : null,
    sellerLng: input.locationKind === "seller" ? (input.sellerLng != null ? String(input.sellerLng) : null) : null,
    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
    price,
    paymentStatus: "pending",
    paymentReference: reference,
    status: "awaiting_payment",
    internalNotes: input.notes?.trim() || null,
  })
  await seedItems(id)

  const provider = paymentProvider()
  try {
    if (channel === "momo") {
      if (!momoNetwork) return { ok: false as const, error: "Pick a MoMo network" }
      const res = await provider.chargeMobileMoney({
        amountPesewas: price,
        phone: me.phone,
        network: momoNetwork,
        reference,
        metadata: { inspectionId: id },
        description: `FixAm inspection ${garage.name}`,
      })
      return { ok: true as const, inspectionId: id, displayText: res.displayText, reference }
    }
    const res = await provider.initializeCheckout({
      amountPesewas: price,
      phone: me.phone,
      reference,
      metadata: { inspectionId: id },
      returnPath: "/portal/inspections",
      description: `Pre-purchase inspection — ${garage.name}`,
    })
    return { ok: true as const, inspectionId: id, checkoutUrl: res.authorizationUrl, reference }
  } catch (e) {
    await db().update(inspections).set({ paymentStatus: "failed", status: "cancelled", updatedAt: new Date() }).where(eq(inspections.id, id))
    return { ok: false as const, error: e instanceof Error ? e.message : "Payment failed to start" }
  }
}

/** Settle a paid inspection reference — called from escrow reconcile. */
export async function markInspectionPaid(inspectionId: string, reference: string, amountPesewas?: bigint) {
  const [row] = await db().select().from(inspections).where(eq(inspections.id, inspectionId)).limit(1)
  if (!row || row.paymentStatus === "paid") return
  await db().update(inspections)
    .set({ paymentStatus: "paid", status: row.status === "awaiting_payment" ? "booked" : row.status, updatedAt: new Date() })
    .where(eq(inspections.id, inspectionId))
  // Let the garage know a booking landed.
  const [g] = await db().select({ phone: garages.phone, name: garages.name }).from(garages).where(eq(garages.id, row.garageId)).limit(1)
  if (g?.phone) {
    await sendDirectSms(g.phone, "delivery_update", {
      number: row.number,
      status: `inspection booked & paid (${formatGHS(Number(row.price))})`,
      link: appUrl(`/g/${row.garageId}/inspections`),
    }).catch(() => undefined)
  }
  void amountPesewas
}

/** Driver cancels an unpaid/paid booking (before it starts). */
export async function cancelMyInspection(raw: unknown) {
  const me = await driverCtx()
  if (!me) return { ok: false as const, error: "Sign in first" }
  const { z } = await import("zod")
  const id = z.string().uuid().safeParse(raw)
  if (!id.success) return { ok: false as const, error: "Invalid inspection" }
  const [row] = await db().select().from(inspections)
    .where(and(eq(inspections.id, id.data), eq(inspections.driverPhone, me.phone), isNull(inspections.deletedAt))).limit(1)
  if (!row) return { ok: false as const, error: "Not found" }
  if (!["awaiting_payment", "booked"].includes(row.status)) return { ok: false as const, error: "Too late to cancel" }
  await db().update(inspections).set({ status: "cancelled", updatedAt: new Date() }).where(eq(inspections.id, row.id))
  return { ok: true as const }
}

// ---------------------------------------------------------------------------
// Garage / inspector side
// ---------------------------------------------------------------------------

async function staffCtx(userId: string, garageId: string, permission: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  const principal = { kind: "staff" as const, role: m.role as StaffRole, garageId, branchId: m.branchId }
  if (!can(principal, permission)) return null
  return { membership: m, principal }
}

export async function listGarageInspections(garageId: string, status?: string) {
  const rows = await db()
    .select({
      id: inspections.id,
      number: inspections.number,
      status: inspections.status,
      paymentStatus: inspections.paymentStatus,
      driverPhone: inspections.driverPhone,
      vehicleDetails: inspections.vehicleDetails,
      locationKind: inspections.locationKind,
      scheduledAt: inspections.scheduledAt,
      price: inspections.price,
      inspectorName: users.fullName,
      createdAt: inspections.createdAt,
    })
    .from(inspections)
    .leftJoin(users, eq(users.id, inspections.inspectorId))
    .where(and(
      eq(inspections.garageId, garageId),
      isNull(inspections.deletedAt),
      status ? eq(inspections.status, status) : undefined,
    ))
    .orderBy(desc(inspections.scheduledAt), desc(inspections.createdAt))
    .limit(200)
  return rows.map((r) => ({ ...r, price: Number(r.price) }))
}

export type InspectionDetail = {
  inspection: Inspection
  garageName: string
  inspectorName: string | null
  items: (typeof inspectionItems.$inferSelect)[]
  obd: { id: string; vin: string | null; milOn: boolean | null; dtcs: unknown; explanation: unknown; createdAt: Date }[]
}

export async function getInspection(garageId: string, inspectionId: string): Promise<InspectionDetail | null> {
  const [row] = await db().select().from(inspections)
    .where(and(eq(inspections.id, inspectionId), eq(inspections.garageId, garageId), isNull(inspections.deletedAt))).limit(1)
  if (!row) return null
  const [items, obd, inspector, garage] = await Promise.all([
    db().select().from(inspectionItems).where(eq(inspectionItems.inspectionId, row.id)).orderBy(inspectionItems.section, inspectionItems.itemKey),
    db().select({ id: obdScans.id, vin: obdScans.vin, milOn: obdScans.milOn, dtcs: obdScans.dtcs, explanation: obdScans.explanation, createdAt: obdScans.createdAt })
      .from(obdScans).where(eq(obdScans.inspectionId, row.id)).orderBy(desc(obdScans.createdAt)).limit(5),
    row.inspectorId ? db().select({ fullName: users.fullName }).from(users).where(eq(users.id, row.inspectorId)).limit(1) : Promise.resolve([]),
    db().select({ name: garages.name }).from(garages).where(eq(garages.id, garageId)).limit(1),
  ])
  return { inspection: row, garageName: garage[0]?.name ?? "", inspectorName: inspector[0]?.fullName ?? null, items, obd }
}

export async function startInspection(raw: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const, error: "Sign in first" }
  const { z } = await import("zod")
  const d = z.object({ garageId: z.string().uuid(), inspectionId: z.string().uuid() }).safeParse(raw)
  if (!d.success) return { ok: false as const, error: "Invalid input" }
  const ctx = await staffCtx(userId, d.data.garageId, "inspections.perform")
  if (!ctx) return { ok: false as const, error: "No permission" }
  const [row] = await db().select().from(inspections).where(and(eq(inspections.id, d.data.inspectionId), eq(inspections.garageId, d.data.garageId))).limit(1)
  if (!row) return { ok: false as const, error: "Not found" }
  if (!canTransition(row.status, "in_progress")) return { ok: false as const, error: `Can't start from ${row.status}` }
  if (row.paymentStatus !== "paid") return { ok: false as const, error: "Payment hasn't been confirmed yet" }
  await db().update(inspections)
    .set({ status: "in_progress", inspectorId: userId, startedAt: new Date(), updatedAt: new Date() })
    .where(eq(inspections.id, row.id))
  await writeAuditLog({ garageId: d.data.garageId, actorUserId: userId, action: "inspection.start", entityType: "inspection", entityId: row.id }).catch(() => undefined)
  return { ok: true as const }
}

export async function saveInspectionItem(raw: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const, error: "Sign in first" }
  const { itemResultSchema } = await import("./core")
  const d = itemResultSchema.safeParse(raw)
  if (!d.success) return { ok: false as const, error: "Invalid result" }
  const [insp] = await db().select({ garageId: inspections.garageId, status: inspections.status }).from(inspections).where(eq(inspections.id, d.data.inspectionId)).limit(1)
  if (!insp) return { ok: false as const, error: "Not found" }
  const ctx = await staffCtx(userId, insp.garageId, "inspections.perform")
  if (!ctx) return { ok: false as const, error: "No permission" }
  if (!["booked", "in_progress"].includes(insp.status)) return { ok: false as const, error: "Inspection isn't open" }
  const key = d.data.itemKey
  await db().insert(inspectionItems).values({
    inspectionId: d.data.inspectionId,
    section: key.split(".")[0]!,
    itemKey: key,
    label: key,
    result: d.data.result,
    note: d.data.note || null,
    photoPath: d.data.photoPath || null,
    updatedBy: userId,
  }).onConflictDoUpdate({
    target: [inspectionItems.inspectionId, inspectionItems.itemKey],
    set: { result: d.data.result, note: d.data.note || null, photoPath: d.data.photoPath || null, updatedBy: userId, updatedAt: new Date() },
  })
  return { ok: true as const }
}

/** Garage-side settings: offers_inspections + price. */
export async function saveInspectionSettings(raw: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const, error: "Sign in first" }
  const { z } = await import("zod")
  const d = z.object({
    garageId: z.string().uuid(),
    offersInspections: z.boolean(),
    inspectionPrice: z.number().int().min(0).max(10_000_000), // pesewas
  }).safeParse(raw)
  if (!d.success) return { ok: false as const, error: "Invalid input" }
  const ctx = await staffCtx(userId, d.data.garageId, "garage.settings.manage")
  if (!ctx) return { ok: false as const, error: "Only owners can change settings" }
  const vals = { offersInspections: d.data.offersInspections, inspectionPrice: BigInt(d.data.inspectionPrice), updatedAt: new Date() }
  await db().insert(garageSettings).values({ garageId: d.data.garageId, ...vals })
    .onConflictDoUpdate({ target: garageSettings.garageId, set: vals })
  return { ok: true as const }
}

// ---------------------------------------------------------------------------
// Complete → AI report → share link
// ---------------------------------------------------------------------------

/** Recent invoice line descriptions+prices at this garage — fair-quote grounding for cost estimates. */
async function garagePriceHints(garageId: string): Promise<string[]> {
  const rows = await db().execute(sql`
    select description, round(avg(unit_price))::bigint as avg_price, count(*)::int as n
    from invoice_items ii join invoices i on i.id = ii.invoice_id
    where i.garage_id = ${garageId} and i.deleted_at is null and ii.unit_price > 0
    group by description order by n desc limit 40
  `).catch(() => ({ rows: [] as { description: string; avg_price: string; n: number }[] }))
  const list = (rows as unknown as { rows?: { description: string; avg_price: string; n: number }[] }).rows ?? (rows as unknown as { description: string; avg_price: string; n: number }[])
  return list.slice(0, 40).map((r) => `${r.description} ~GH₵${(Number(r.avg_price) / 100).toFixed(2)} (${r.n}x)`)
}

export async function completeInspection(raw: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const, error: "Sign in first" }
  const { completeInspectionSchema } = await import("./core")
  const d = completeInspectionSchema.safeParse(raw)
  if (!d.success) return { ok: false as const, error: "Invalid input" }
  const [insp] = await db().select().from(inspections).where(eq(inspections.id, d.data.inspectionId)).limit(1)
  if (!insp) return { ok: false as const, error: "Not found" }
  const ctx = await staffCtx(userId, insp.garageId, "inspections.perform")
  if (!ctx) return { ok: false as const, error: "No permission" }
  if (!canTransition(insp.status, "completed")) return { ok: false as const, error: `Can't complete from ${insp.status}` }

  const items = await db().select().from(inspectionItems).where(eq(inspectionItems.inspectionId, insp.id))
  const flagged = flaggedItems(items)
  const summary = summariseResults(items)

  // AI summary + repair cost estimates grounded in the garage's own price history.
  const hints = await garagePriceHints(insp.garageId)
  const ai = await runPrompt(inspectionReportPrompt, {
    vehicle: insp.vehicleDetails as VehicleDetailsInput,
    sections: INSPECTION_SECTION_SUMMARY(items),
    flagged: flagged.map((f) => ({ label: f.label, result: f.result, note: f.note })),
    obdSummary: await obdSummaryFor(insp.id),
    priceHints: hints,
    testDriveNotes: d.data.testDriveNotes || insp.testDriveNotes || "",
  }, { garageId: insp.garageId, userId }).catch(() => null)

  const aiReport = ai?.ok
    ? {
        summary: ai.data.summary,
        costs: ai.data.costs.map((c) => ({ item: c.item, estimatePesewas: c.estimatePesewas, note: (c as { note?: string }).note ?? null })),
        grounded: hints.length > 0,
        generatedAt: new Date().toISOString(),
        provider: ai.provider,
      }
    : null

  // Share token — store only the hash.
  const token = newInspectionToken()
  await db().update(inspections).set({
    status: "completed",
    completedAt: new Date(),
    testDriveNotes: d.data.testDriveNotes || insp.testDriveNotes,
    aiReport,
    shareTokenHash: sha256(token),
    shareTokenIssuedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(inspections.id, insp.id))

  await writeAuditLog({ garageId: insp.garageId, actorUserId: userId, action: "inspection.complete", entityType: "inspection", entityId: insp.id, after: { flagged: flagged.length, score: summary.scorePct } }).catch(() => undefined)

  // Notify the driver.
  if (insp.driverPhone) {
    const [g] = await db().select({ name: garages.name }).from(garages).where(eq(garages.id, insp.garageId)).limit(1)
    await sendMessage({
      garageId: insp.garageId,
      channel: "sms",
      to: insp.driverPhone,
      templateKey: "inspection_report_ready",
      variables: { number: insp.number, garage: g?.name ?? "", link: appUrl(`/i/${token}`) },
      idempotencyKey: `insp-report:${insp.id}`,
    }).catch(() => sendDirectSms(insp.driverPhone, "delivery_update", { number: insp.number, status: "inspection report ready", link: appUrl(`/i/${token}`) }).catch(() => undefined))
  }
  return { ok: true as const, shareToken: token, shareUrl: appUrl(`/i/${token}`) }
}

function INSPECTION_SECTION_SUMMARY(items: (typeof inspectionItems.$inferSelect)[]) {
  const bySection = new Map<string, { pass: number; attention: number; fail: number; na: number }>()
  for (const i of items) {
    const s = bySection.get(i.section) ?? { pass: 0, attention: 0, fail: 0, na: 0 }
    if (i.result === "pass") s.pass++
    else if (i.result === "attention") s.attention++
    else if (i.result === "fail") s.fail++
    else s.na++
    bySection.set(i.section, s)
  }
  return Array.from(bySection.entries()).map(([section, c]) => ({ section, ...c }))
}

async function obdSummaryFor(inspectionId: string): Promise<string> {
  const rows = await db().select({ vin: obdScans.vin, milOn: obdScans.milOn, dtcs: obdScans.dtcs, explanation: obdScans.explanation })
    .from(obdScans).where(eq(obdScans.inspectionId, inspectionId)).orderBy(desc(obdScans.createdAt)).limit(3)
  if (!rows.length) return "No OBD scan attached."
  return rows.map((r) => {
    const codes = Array.isArray(r.dtcs) ? (r.dtcs as { code: string }[]).map((d) => d.code).join(", ") : "none"
    const expl = r.explanation as { summary?: string } | null
    return `Scan ${r.vin ?? ""}: MIL ${r.milOn ? "ON" : "off"}, codes: ${codes || "none"}${expl?.summary ? ` — ${expl.summary}` : ""}`
  }).join(" | ")
}

// ---------------------------------------------------------------------------
// Public report (/i/[token])
// ---------------------------------------------------------------------------

export type PublicInspectionReport = {
  number: string
  garageName: string
  completedAt: string | null
  vehicle: VehicleDetailsInput
  locationKind: string
  scorePct: number | null
  counts: { pass: number; attention: number; fail: number; na: number }
  sections: { key: string; label: string; pass: number; attention: number; fail: number; na: number; flagged: { label: string; result: string; note: string | null }[] }[]
  testDriveNotes: string | null
  aiReport: { summary: string; costs: { item: string; estimatePesewas: number; note: string | null }[]; grounded: boolean } | null
  obd: { vin: string | null; milOn: boolean | null; codes: string[]; summary: string | null }[]
}

async function buildReport(row: Inspection): Promise<PublicInspectionReport> {
  const [items, garage, obdRows] = await Promise.all([
    db().select().from(inspectionItems).where(eq(inspectionItems.inspectionId, row.id)),
    db().select({ name: garages.name }).from(garages).where(eq(garages.id, row.garageId)).limit(1),
    db().select({ vin: obdScans.vin, milOn: obdScans.milOn, dtcs: obdScans.dtcs, explanation: obdScans.explanation })
      .from(obdScans).where(eq(obdScans.inspectionId, row.id)).orderBy(desc(obdScans.createdAt)).limit(5),
  ])
  const counts = summariseResults(items)
  const sections = INSPECTION_SECTIONS.map((s) => {
    const si = items.filter((i) => i.section === s.key)
    const sc = summariseResults(si)
    return {
      key: s.key,
      label: s.label,
      pass: sc.pass, attention: sc.attention, fail: sc.fail, na: sc.na,
      flagged: si.filter((i) => i.result === "attention" || i.result === "fail")
        .map((i) => ({ label: i.label, result: i.result, note: i.note })),
    }
  })
  const ai = row.aiReport as { summary?: string; costs?: { item: string; estimatePesewas: number; note: string | null }[]; grounded?: boolean } | null
  return {
    number: row.number,
    garageName: garage[0]?.name ?? "FixAm garage",
    completedAt: row.completedAt?.toISOString() ?? null,
    vehicle: row.vehicleDetails as VehicleDetailsInput,
    locationKind: row.locationKind,
    scorePct: counts.answered > 0 ? counts.scorePct : null,
    counts: { pass: counts.pass, attention: counts.attention, fail: counts.fail, na: counts.na },
    sections,
    testDriveNotes: row.testDriveNotes,
    aiReport: ai?.summary ? { summary: ai.summary, costs: ai.costs ?? [], grounded: !!ai.grounded } : null,
    obd: obdRows.map((o) => ({
      vin: o.vin,
      milOn: o.milOn,
      codes: Array.isArray(o.dtcs) ? (o.dtcs as { code: string }[]).map((d) => d.code) : [],
      summary: (o.explanation as { summary?: string } | null)?.summary ?? null,
    })),
  }
}

export async function loadPublicInspection(token: string): Promise<PublicInspectionReport | null> {
  if (!isInspectionToken(token)) return null
  const hash = sha256(token)
  const [row] = await db().select().from(inspections)
    .where(and(eq(inspections.shareTokenHash, hash), eq(inspections.status, "completed"), isNull(inspections.deletedAt))).limit(1)
  if (!row) return null
  return buildReport(row)
}

/** Driver views their own completed report inside the portal (no token needed). */
export async function myInspectionReport(inspectionId: string): Promise<PublicInspectionReport | null> {
  const me = await driverCtx()
  if (!me) return null
  const [row] = await db().select().from(inspections)
    .where(and(eq(inspections.id, inspectionId), eq(inspections.driverPhone, me.phone), eq(inspections.status, "completed"), isNull(inspections.deletedAt))).limit(1)
  return row ? buildReport(row) : null
}

// ---------------------------------------------------------------------------
// Passport integration — attach the report to the car's passport once bought.
// ---------------------------------------------------------------------------

export async function linkInspectionToVehicle(raw: unknown) {
  const me = await driverCtx()
  if (!me) return { ok: false as const, error: "Sign in first" }
  const { z } = await import("zod")
  const d = z.object({ inspectionId: z.string().uuid(), vehicleId: z.string().uuid() }).safeParse(raw)
  if (!d.success) return { ok: false as const, error: "Invalid input" }
  // The vehicle must belong to this driver's phone at some garage.
  const [v] = await db().select({ id: vehicles.id }).from(vehicles)
    .innerJoin(customers, eq(customers.id, vehicles.currentOwnerId))
    .where(and(eq(vehicles.id, d.data.vehicleId), eq(customers.phone, me.phone), isNull(vehicles.deletedAt))).limit(1)
  if (!v) return { ok: false as const, error: "That car isn't in your garage list" }
  const [row] = await db().select().from(inspections)
    .where(and(eq(inspections.id, d.data.inspectionId), eq(inspections.driverPhone, me.phone))).limit(1)
  if (!row || row.status !== "completed") return { ok: false as const, error: "Only finished reports can be attached" }
  await db().update(inspections).set({ vehicleId: v.id, updatedAt: new Date() }).where(eq(inspections.id, row.id))
  await writeAuditLog({ garageId: row.garageId, actorUserId: me.userId, action: "inspection.link_vehicle", entityType: "inspection", entityId: row.id, after: { vehicleId: v.id } }).catch(() => undefined)
  return { ok: true as const }
}

/** Store an item photo (≤3.5 MB image) and return its storage path. */
export async function storeInspectionPhoto(form: FormData): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: "Sign in first" }
  const inspectionId = String(form.get("inspectionId") ?? "")
  const itemKey = String(form.get("itemKey") ?? "")
  const file = form.get("photo")
  if (!inspectionId || !itemKey || !(file instanceof File)) return { ok: false, error: "Missing photo" }
  const [insp] = await db().select({ garageId: inspections.garageId, status: inspections.status }).from(inspections).where(eq(inspections.id, inspectionId)).limit(1)
  if (!insp) return { ok: false, error: "Not found" }
  const ctx = await staffCtx(userId, insp.garageId, "inspections.perform")
  if (!ctx || !["booked", "in_progress", "completed"].includes(insp.status)) return { ok: false, error: "No permission" }
  if (!file.type.startsWith("image/")) return { ok: false, error: "Photos must be images" }
  if (file.size > 3.5 * 1024 * 1024) return { ok: false, error: "Photo too large — compress it first" }
  const { storageProvider } = await import("@/lib/integrations/storage")
  const key = `inspections/${insp.garageId}/${inspectionId}/${itemKey.replace(/[^a-z0-9.]/gi, "_")}-${Date.now()}.jpg`
  const { put } = await storageProvider()
  await put(key, new Uint8Array(await file.arrayBuffer()), file.type)
  return { ok: true, path: key }
}

export async function myVehiclesForLinking() {
  const me = await driverCtx()
  if (!me) return []
  return db().select({ id: vehicles.id, plate: vehicles.plateNumber, label: sql<string>`${vehicles.make} || ' ' || ${vehicles.model}` })
    .from(vehicles).innerJoin(customers, eq(customers.id, vehicles.currentOwnerId))
    .where(and(eq(customers.phone, me.phone), isNull(vehicles.deletedAt))).limit(20)
}

export { formatGHS }
