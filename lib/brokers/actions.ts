"use server";
import { z } from "zod";
import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  brokerMembers,
  brokerRequestEvents,
  brokerRequests,
  brokers,
  customers,
  garages,
  memberships,
  portalProfiles,
  renewalRequests,
  users,
  vehicles,
} from "@/lib/db/schema";
import { getSessionPhone, getSessionUserId } from "@/lib/auth/ensure-user";
import { writeAuditLog, type ActionResult } from "@/lib/actions";
import { appUrl, sendDirectSms } from "@/lib/messaging/direct";
import { normalizeGhPhone } from "@/lib/phone";
import { uuidv7 } from "@/lib/id";
import { OPEN_STATUSES, REQUEST_STATUS, serviceLabel } from "./catalog";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const fail = (
  code: "VALIDATION" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INTERNAL",
  message: string,
) => ({ ok: false as const, error: { code, message } });

/** cedis (number) → pesewas (bigint), tolerant of float noise. */
const pes = (cedis: number) => BigInt(Math.round(cedis * 100));
const num = (v: bigint | null | undefined) => (v != null ? Number(v) : null);
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const cedi = (p: number | null) =>
  p != null
    ? (p / 100).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";

async function myBroker(userId: string) {
  const [row] = await db()
    .select({ broker: brokers, role: brokerMembers.role })
    .from(brokerMembers)
    .innerJoin(brokers, eq(brokerMembers.brokerId, brokers.id))
    .where(
      and(
        eq(brokerMembers.userId, userId),
        eq(brokerMembers.status, "active"),
        isNull(brokers.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function requireBroker() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const m = await myBroker(userId);
  return m ? { userId, broker: m.broker, role: m.role } : null;
}

function newNumber() {
  const t = Date.now().toString(36).toUpperCase().slice(-5);
  const r = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `BRQ-${t}${r}`;
}

async function logEvent(
  requestId: string,
  status: string,
  actor: string,
  actorUserId: string | null,
  note?: string | null,
) {
  await db()
    .insert(brokerRequestEvents)
    .values({ requestId, status, actor, actorUserId, note: note ?? null });
}

function serializeRequest(r: typeof brokerRequests.$inferSelect) {
  return {
    id: r.id,
    number: r.number,
    brokerId: r.brokerId,
    kind: r.kind,
    serviceType: r.serviceType,
    serviceLabel: serviceLabel(r.kind, r.serviceType),
    source: r.source,
    requesterName: r.requesterName,
    requesterPhone: r.requesterPhone,
    garageId: r.garageId,
    renewalRequestId: r.renewalRequestId,
    vehiclePlate: r.vehiclePlate,
    vehicleLabel: [r.vehicleMake, r.vehicleModel, r.vehicleYear].filter(Boolean).join(" "),
    vehicleMake: r.vehicleMake,
    vehicleModel: r.vehicleModel,
    vehicleYear: r.vehicleYear,
    currentExpiry: r.currentExpiry,
    notes: r.notes,
    status: r.status,
    statusLabel: REQUEST_STATUS[r.status]?.label ?? r.status,
    officialFee: num(r.officialFee),
    serviceFee: num(r.serviceFee),
    total: num(r.total),
    quoteNote: r.quoteNote,
    insurerName: r.insurerName,
    completionRef: r.completionRef,
    newExpiry: r.newExpiry,
    paidAt: iso(r.paidAt),
    quotedAt: iso(r.quotedAt),
    acceptedAt: iso(r.acceptedAt),
    completedAt: iso(r.completedAt),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
export type BrokerRequestView = ReturnType<typeof serializeRequest>;

function serializeBroker(b: typeof brokers.$inferSelect) {
  return {
    id: b.id,
    businessName: b.businessName,
    slug: b.slug,
    kind: b.kind,
    phone: b.phone,
    email: b.email,
    address: b.address,
    city: b.city,
    region: b.region,
    gpsLat: b.gpsLat != null ? Number(b.gpsLat) : null,
    gpsLng: b.gpsLng != null ? Number(b.gpsLng) : null,
    about: b.about,
    nicLicenceNumber: b.nicLicenceNumber,
    dvlaAgentNumber: b.dvlaAgentNumber,
    insurers: b.insurers,
    defaultServiceFee: num(b.defaultServiceFee),
    status: b.status,
    isVerified: b.isVerified,
    ratingAvg: b.ratingAvg != null ? Number(b.ratingAvg) : null,
    ratingCount: b.ratingCount,
  };
}
export type BrokerView = ReturnType<typeof serializeBroker>;

/** Where the requester follows the job. */
function requesterLink(r: { source: string; garageId: string | null }, garageSlug?: string | null) {
  return r.source === "garage" && garageSlug
    ? appUrl(`/g/${garageSlug}/renewals`)
    : appUrl("/portal/renewals");
}

async function garageSlugOf(garageId: string | null) {
  if (!garageId) return null;
  const [g] = await db()
    .select({ slug: garages.slug })
    .from(garages)
    .where(eq(garages.id, garageId))
    .limit(1);
  return g?.slug ?? null;
}

// ---------------------------------------------------------------------------
// Broker onboarding + profile
// ---------------------------------------------------------------------------

const profileSchema = z.object({
  businessName: z.string().trim().min(2).max(200),
  kind: z.enum(["insurance", "dvla", "both"]),
  phone: z.string().min(9).max(20),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(300).optional().or(z.literal("")),
  city: z.string().max(100).optional().or(z.literal("")),
  region: z.string().max(100).optional().or(z.literal("")),
  about: z.string().max(1000).optional().or(z.literal("")),
  nicLicenceNumber: z.string().max(60).optional().or(z.literal("")),
  dvlaAgentNumber: z.string().max(60).optional().or(z.literal("")),
  insurers: z.array(z.string().max(80)).max(30).default([]),
  defaultServiceFee: z.number().min(0).max(100000).optional().nullable(), // cedis
  planCode: z.string().min(1).max(40).optional(),
});

export async function getMyBroker() {
  const ctx = await requireBroker();
  if (!ctx) return null;
  return { broker: serializeBroker(ctx.broker), role: ctx.role };
}

export async function brokerSignup(rawInput: unknown): Promise<ActionResult<{ brokerId: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return fail("UNAUTHENTICATED", "Sign in first");
  if (await myBroker(userId)) return fail("CONFLICT", "You already have a broker workspace");

  const parsed = profileSchema.safeParse(rawInput);
  if (!parsed.success) return fail("VALIDATION", "Check the highlighted fields");
  const d = parsed.data;
  const phone = normalizeGhPhone(d.phone);
  if (!phone) return fail("VALIDATION", "Enter a valid Ghana phone number");

  const { resolvePlanCode, createTrialSubscription } = await import("@/lib/billing/account");
  const planCode = await resolvePlanCode("broker", d.planCode);
  if (!planCode) return fail("INTERNAL", "No broker plans configured — contact support");

  const base =
    d.businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "broker";
  const slug = `${base}-${uuidv7().slice(-6)}`;
  const brokerId = uuidv7();
  await db().transaction(async (tx) => {
    await tx.insert(brokers).values({
      id: brokerId,
      businessName: d.businessName,
      slug,
      kind: d.kind,
      status: "pending",
      phone,
      email: d.email || null,
      address: d.address || null,
      city: d.city || null,
      region: d.region || null,
      about: d.about || null,
      nicLicenceNumber: d.nicLicenceNumber || null,
      dvlaAgentNumber: d.dvlaAgentNumber || null,
      insurers: d.insurers,
      defaultServiceFee: d.defaultServiceFee != null ? pes(d.defaultServiceFee) : null,
    });
    await tx.insert(brokerMembers).values({ brokerId, userId, role: "owner" });
    await createTrialSubscription({ ownerKind: "broker", ownerId: brokerId, planCode }, tx);
  });

  await writeAuditLog({
    garageId: null,
    actorUserId: userId,
    action: "broker.signup",
    entityType: "broker",
    entityId: brokerId,
    after: { businessName: d.businessName, kind: d.kind },
  }).catch(() => {});
  return { ok: true, data: { brokerId } };
}

/** Save the office pin used by the public /brokers "near me" finder. Owner only. */
export async function setBrokerLocation(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const ctx = await requireBroker();
  if (!ctx) return fail("UNAUTHENTICATED", "Sign in first");
  if (ctx.role !== "owner") return fail("FORBIDDEN", "Only the owner can move the office pin");
  const parsed = z
    .object({ gpsLat: z.number().min(4).max(11.5), gpsLng: z.number().min(-3.5).max(1.5) })
    .safeParse(rawInput);
  if (!parsed.success) return fail("VALIDATION", "That location isn't in Ghana");
  await db()
    .update(brokers)
    .set({
      gpsLat: parsed.data.gpsLat.toFixed(6),
      gpsLng: parsed.data.gpsLng.toFixed(6),
      updatedAt: new Date(),
    })
    .where(eq(brokers.id, ctx.broker.id));
  return { ok: true, data: { ok: true as const } };
}

export async function updateBrokerProfile(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const ctx = await requireBroker();
  if (!ctx) return fail("UNAUTHENTICATED", "Sign in first");
  if (ctx.role !== "owner") return fail("FORBIDDEN", "Only the owner can edit the profile");
  const parsed = profileSchema.safeParse(rawInput);
  if (!parsed.success) return fail("VALIDATION", "Check the highlighted fields");
  const d = parsed.data;
  const phone = normalizeGhPhone(d.phone);
  if (!phone) return fail("VALIDATION", "Enter a valid Ghana phone number");

  await db()
    .update(brokers)
    .set({
      businessName: d.businessName,
      kind: d.kind,
      phone,
      email: d.email || null,
      address: d.address || null,
      city: d.city || null,
      region: d.region || null,
      about: d.about || null,
      nicLicenceNumber: d.nicLicenceNumber || null,
      dvlaAgentNumber: d.dvlaAgentNumber || null,
      insurers: d.insurers,
      defaultServiceFee: d.defaultServiceFee != null ? pes(d.defaultServiceFee) : null,
      updatedAt: new Date(),
    })
    .where(eq(brokers.id, ctx.broker.id));
  return { ok: true, data: { ok: true as const } };
}

// ---------------------------------------------------------------------------
// Broker workspace: dashboard + inbox
// ---------------------------------------------------------------------------

export async function getBrokerDashboard() {
  const ctx = await requireBroker();
  if (!ctx) return null;
  const rows = await db()
    .select()
    .from(brokerRequests)
    .where(eq(brokerRequests.brokerId, ctx.broker.id))
    .orderBy(desc(brokerRequests.createdAt))
    .limit(500);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const completedThisMonth = rows.filter(
    (r) => r.status === "completed" && r.completedAt && r.completedAt >= monthStart,
  );
  const feesThisMonth = completedThisMonth.reduce((s, r) => s + Number(r.serviceFee ?? 0n), 0);
  const quoted = rows.filter((r) => r.quotedAt);
  const won = quoted.filter((r) => ["accepted", "in_progress", "completed"].includes(r.status));
  const responseHrs = quoted
    .map((r) => (r.quotedAt!.getTime() - r.createdAt.getTime()) / 3_600_000)
    .filter((h) => h >= 0);

  // last 8 weeks of completed fees
  const weeks: { label: string; fees: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const end = new Date(Date.now() - i * 7 * 86_400_000);
    const start = new Date(end.getTime() - 7 * 86_400_000);
    const fees = rows
      .filter(
        (r) =>
          r.status === "completed" &&
          r.completedAt &&
          r.completedAt > start &&
          r.completedAt <= end,
      )
      .reduce((s, r) => s + Number(r.serviceFee ?? 0n), 0);
    weeks.push({
      label: end.toLocaleDateString("en-GH", { day: "numeric", month: "short" }),
      fees,
    });
  }

  return {
    broker: serializeBroker(ctx.broker),
    role: ctx.role,
    counts: {
      requested: count("requested"),
      quoted: count("quoted"),
      accepted: count("accepted"),
      inProgress: count("in_progress"),
      completed: count("completed"),
      open: rows.filter((r) => (OPEN_STATUSES as readonly string[]).includes(r.status)).length,
    },
    feesThisMonth,
    completedThisMonth: completedThisMonth.length,
    winRate: quoted.length ? Math.round((won.length / quoted.length) * 100) : null,
    avgResponseHrs: responseHrs.length
      ? Math.round((responseHrs.reduce((a, b) => a + b, 0) / responseHrs.length) * 10) / 10
      : null,
    weeks,
    needsAction: rows
      .filter((r) => r.status === "requested" || r.status === "accepted")
      .slice(0, 8)
      .map(serializeRequest),
    recent: rows.slice(0, 8).map(serializeRequest),
  };
}

export async function listBrokerRequests(rawInput: unknown) {
  const ctx = await requireBroker();
  if (!ctx) return [];
  const parsed = z
    .object({ status: z.string().max(30).optional(), q: z.string().max(80).optional() })
    .safeParse(rawInput ?? {});
  const f = parsed.success ? parsed.data : {};
  const conds = [eq(brokerRequests.brokerId, ctx.broker.id)];
  if (f.status === "open") conds.push(inArray(brokerRequests.status, [...OPEN_STATUSES]));
  else if (f.status && f.status !== "all") conds.push(eq(brokerRequests.status, f.status));
  if (f.q) {
    const like = `%${f.q.trim()}%`;
    conds.push(
      or(
        ilike(brokerRequests.vehiclePlate, like),
        ilike(brokerRequests.requesterName, like),
        ilike(brokerRequests.number, like),
        ilike(brokerRequests.requesterPhone, like),
      )!,
    );
  }
  const rows = await db()
    .select()
    .from(brokerRequests)
    .where(and(...conds))
    .orderBy(desc(brokerRequests.createdAt))
    .limit(300);
  return rows.map(serializeRequest);
}

export async function getBrokerRequestDetail(requestId: string) {
  const ctx = await requireBroker();
  if (!ctx || !z.string().uuid().safeParse(requestId).success) return null;
  const [r] = await db()
    .select()
    .from(brokerRequests)
    .where(and(eq(brokerRequests.id, requestId), eq(brokerRequests.brokerId, ctx.broker.id)))
    .limit(1);
  if (!r) return null;
  const events = await db()
    .select()
    .from(brokerRequestEvents)
    .where(eq(brokerRequestEvents.requestId, r.id))
    .orderBy(asc(brokerRequestEvents.createdAt));
  const garage = r.garageId
    ? ((
        await db()
          .select({ name: garages.name, phone: garages.phone })
          .from(garages)
          .where(eq(garages.id, r.garageId))
          .limit(1)
      )[0] ?? null)
    : null;
  return {
    request: serializeRequest(r),
    broker: serializeBroker(ctx.broker),
    garage,
    events: events.map((e) => ({
      id: e.id,
      status: e.status,
      actor: e.actor,
      note: e.note,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export async function brokerQuote(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const ctx = await requireBroker();
  if (!ctx) return fail("UNAUTHENTICATED", "Sign in first");
  const parsed = z
    .object({
      requestId: z.string().uuid(),
      officialFee: z.number().min(0).max(1_000_000), // cedis — premium / DVLA fee
      serviceFee: z.number().min(0).max(100_000),
      insurerName: z.string().max(80).optional().or(z.literal("")),
      quoteNote: z.string().max(1000).optional().or(z.literal("")),
    })
    .safeParse(rawInput);
  if (!parsed.success) return fail("VALIDATION", "Enter the amounts");
  const d = parsed.data;

  const [r] = await db()
    .select()
    .from(brokerRequests)
    .where(and(eq(brokerRequests.id, d.requestId), eq(brokerRequests.brokerId, ctx.broker.id)))
    .limit(1);
  if (!r) return fail("NOT_FOUND", "Request not found");
  if (!["requested", "quoted"].includes(r.status))
    return fail("CONFLICT", "This request can no longer be quoted");

  const official = pes(d.officialFee);
  const service = pes(d.serviceFee);
  const total = official + service;
  await db()
    .update(brokerRequests)
    .set({
      status: "quoted",
      officialFee: official,
      serviceFee: service,
      total,
      insurerName: d.insurerName || null,
      quoteNote: d.quoteNote || null,
      quotedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(brokerRequests.id, r.id));
  await logEvent(
    r.id,
    "quoted",
    "broker",
    ctx.userId,
    `Quote GH₵ ${cedi(Number(total))}${d.quoteNote ? ` — ${d.quoteNote}` : ""}`,
  );

  const slug = await garageSlugOf(r.garageId);
  await sendDirectSms(r.requesterPhone, "broker_quote_ready", {
    broker: ctx.broker.businessName,
    amount: cedi(Number(total)),
    kind: r.kind === "dvla" ? "DVLA" : "insurance",
    plate: r.vehiclePlate,
    link: requesterLink(r, slug),
  });
  return { ok: true, data: { ok: true as const } };
}

export async function brokerUpdateRequest(
  rawInput: unknown,
): Promise<ActionResult<{ status: string }>> {
  const ctx = await requireBroker();
  if (!ctx) return fail("UNAUTHENTICATED", "Sign in first");
  const parsed = z
    .object({
      requestId: z.string().uuid(),
      action: z.enum(["decline", "start", "mark_paid", "complete", "note"]),
      note: z.string().max(1000).optional().or(z.literal("")),
      completionRef: z.string().max(80).optional().or(z.literal("")),
      newExpiry: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .or(z.literal("")),
    })
    .safeParse(rawInput);
  if (!parsed.success) return fail("VALIDATION", "Invalid input");
  const d = parsed.data;

  const [r] = await db()
    .select()
    .from(brokerRequests)
    .where(and(eq(brokerRequests.id, d.requestId), eq(brokerRequests.brokerId, ctx.broker.id)))
    .limit(1);
  if (!r) return fail("NOT_FOUND", "Request not found");

  let status = r.status;
  const patch: Partial<typeof brokerRequests.$inferInsert> = { updatedAt: new Date() };
  switch (d.action) {
    case "decline":
      if (!["requested", "quoted"].includes(r.status))
        return fail("CONFLICT", "Only new or quoted requests can be declined");
      status = "declined";
      break;
    case "start":
      if (r.status !== "accepted")
        return fail("CONFLICT", "Wait for the customer to accept your quote");
      status = "in_progress";
      break;
    case "mark_paid":
      if (!["accepted", "in_progress", "completed"].includes(r.status))
        return fail("CONFLICT", "The quote hasn't been accepted yet");
      patch.paidAt = new Date();
      break;
    case "complete":
      if (!["accepted", "in_progress"].includes(r.status))
        return fail("CONFLICT", "Start processing before completing");
      status = "completed";
      patch.completedAt = new Date();
      patch.completionRef = d.completionRef || null;
      patch.newExpiry = d.newExpiry || null;
      break;
    case "note":
      if (!d.note) return fail("VALIDATION", "Write a note");
      break;
  }
  patch.status = status;
  await db().update(brokerRequests).set(patch).where(eq(brokerRequests.id, r.id));
  const eventNote =
    d.action === "mark_paid"
      ? "Payment received"
      : d.action === "complete"
        ? [
            d.completionRef && `Ref ${d.completionRef}`,
            d.newExpiry && `valid until ${d.newExpiry}`,
            d.note,
          ]
            .filter(Boolean)
            .join(" · ") || null
        : d.note || null;
  await logEvent(
    r.id,
    d.action === "note" || d.action === "mark_paid" ? r.status : status,
    "broker",
    ctx.userId,
    eventNote,
  );

  if (status !== r.status) {
    const slug = await garageSlugOf(r.garageId);
    await sendDirectSms(r.requesterPhone, "broker_request_update", {
      plate: r.vehiclePlate,
      kind: r.kind === "dvla" ? "DVLA" : "insurance",
      status: (REQUEST_STATUS[status]?.label ?? status).toLowerCase(),
      broker: ctx.broker.businessName,
      link: requesterLink(r, slug),
    });
  }
  return { ok: true, data: { status } };
}

// ---------------------------------------------------------------------------
// Directory (drivers + garages pick a broker)
// ---------------------------------------------------------------------------

export async function listBrokersFor(rawInput: unknown) {
  const parsed = z
    .object({ kind: z.enum(["insurance", "dvla"]), city: z.string().max(100).optional() })
    .safeParse(rawInput);
  if (!parsed.success) return [];
  const rows = await db()
    .select()
    .from(brokers)
    .where(
      and(
        isNull(brokers.deletedAt),
        eq(brokers.status, "active"),
        or(eq(brokers.kind, parsed.data.kind), eq(brokers.kind, "both")),
      ),
    )
    .orderBy(desc(brokers.isVerified), desc(brokers.ratingAvg), asc(brokers.businessName))
    .limit(100);
  const city = parsed.data.city?.trim().toLowerCase();
  return rows
    .map(serializeBroker)
    .sort(
      (a, b) =>
        Number(Boolean(city && b.city?.toLowerCase() === city)) -
        Number(Boolean(city && a.city?.toLowerCase() === city)),
    );
}

// ---------------------------------------------------------------------------
// Driver side
// ---------------------------------------------------------------------------

const requestSchema = z.object({
  brokerId: z.string().uuid(),
  kind: z.enum(["insurance", "dvla"]),
  serviceType: z.string().min(2).max(40),
  vehiclePlate: z.string().trim().min(3).max(20),
  vehicleMake: z.string().max(60).optional().or(z.literal("")),
  vehicleModel: z.string().max(60).optional().or(z.literal("")),
  vehicleYear: z.number().int().min(1950).max(2100).optional().nullable(),
  currentExpiry: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

async function notifyBrokerOfRequest(
  brokerId: string,
  r: { number: string; kind: string; vehiclePlate: string; requesterName: string },
) {
  const [b] = await db()
    .select({ phone: brokers.phone })
    .from(brokers)
    .where(eq(brokers.id, brokerId))
    .limit(1);
  if (!b) return;
  await sendDirectSms(b.phone, "broker_request_new", {
    kind: r.kind === "dvla" ? "DVLA" : "insurance",
    number: r.number,
    plate: r.vehiclePlate,
    requester: r.requesterName,
    link: appUrl("/broker/requests"),
  });
}

export async function createDriverBrokerRequest(
  rawInput: unknown,
): Promise<ActionResult<{ requestId: string; number: string }>> {
  const userId = await getSessionUserId();
  const phone = await getSessionPhone();
  if (!userId || !phone) return fail("UNAUTHENTICATED", "Sign in with your phone first");
  const parsed = requestSchema.safeParse(rawInput);
  if (!parsed.success) return fail("VALIDATION", "Check the vehicle details");
  const d = parsed.data;

  const [b] = await db()
    .select({ id: brokers.id, kind: brokers.kind, status: brokers.status })
    .from(brokers)
    .where(and(eq(brokers.id, d.brokerId), isNull(brokers.deletedAt)))
    .limit(1);
  if (!b || b.status !== "active")
    return fail("NOT_FOUND", "That broker isn't available right now");
  if (b.kind !== "both" && b.kind !== d.kind)
    return fail("VALIDATION", "That broker doesn't offer this service");

  const { rateLimit, rateLimited } = await import("@/lib/rate-limit");
  const rl = await rateLimit(`broker-req:${phone}`, 10, 3600);
  if (!rl.ok) return rateLimited(rl);

  const [profile] = await db()
    .select({ fullName: portalProfiles.fullName })
    .from(portalProfiles)
    .where(eq(portalProfiles.phone, phone))
    .limit(1);
  const [me] = await db()
    .select({ fullName: users.fullName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const requesterName = profile?.fullName ?? me?.fullName ?? phone;

  const id = uuidv7();
  const number = newNumber();
  await db()
    .insert(brokerRequests)
    .values({
      id,
      number,
      brokerId: b.id,
      kind: d.kind,
      serviceType: d.serviceType,
      source: "driver",
      requesterPhone: phone,
      requesterName,
      requesterUserId: userId,
      vehiclePlate: d.vehiclePlate.toUpperCase(),
      vehicleMake: d.vehicleMake || null,
      vehicleModel: d.vehicleModel || null,
      vehicleYear: d.vehicleYear ?? null,
      currentExpiry: d.currentExpiry || null,
      notes: d.notes || null,
    });
  await logEvent(id, "requested", "driver", userId, d.notes || null);
  await notifyBrokerOfRequest(b.id, {
    number,
    kind: d.kind,
    vehiclePlate: d.vehiclePlate.toUpperCase(),
    requesterName,
  });
  return { ok: true, data: { requestId: id, number } };
}

export async function listMyBrokerRequests() {
  const userId = await getSessionUserId();
  const phone = await getSessionPhone();
  if (!userId) return [];
  const rows = await db()
    .select({
      r: brokerRequests,
      brokerName: brokers.businessName,
      brokerPhone: brokers.phone,
      brokerVerified: brokers.isVerified,
    })
    .from(brokerRequests)
    .innerJoin(brokers, eq(brokerRequests.brokerId, brokers.id))
    .where(
      and(
        eq(brokerRequests.source, "driver"),
        phone
          ? or(eq(brokerRequests.requesterUserId, userId), eq(brokerRequests.requesterPhone, phone))
          : eq(brokerRequests.requesterUserId, userId),
      ),
    )
    .orderBy(desc(brokerRequests.createdAt))
    .limit(100);
  const ids = rows.map((x) => x.r.id);
  const events = ids.length
    ? await db()
        .select()
        .from(brokerRequestEvents)
        .where(inArray(brokerRequestEvents.requestId, ids))
        .orderBy(asc(brokerRequestEvents.createdAt))
    : [];
  return rows.map((x) => ({
    ...serializeRequest(x.r),
    brokerName: x.brokerName,
    brokerPhone: x.brokerPhone,
    brokerVerified: x.brokerVerified,
    events: events
      .filter((e) => e.requestId === x.r.id)
      .map((e) => ({
        id: e.id,
        status: e.status,
        actor: e.actor,
        note: e.note,
        createdAt: e.createdAt.toISOString(),
      })),
  }));
}

async function respond(
  requestId: string,
  action: "accept" | "cancel",
  actor: "driver" | "garage",
  actorUserId: string,
) {
  const [r] = await db()
    .select()
    .from(brokerRequests)
    .where(eq(brokerRequests.id, requestId))
    .limit(1);
  if (!r) return fail("NOT_FOUND", "Request not found");
  if (action === "accept" && r.status !== "quoted")
    return fail("CONFLICT", "There's no quote to accept yet");
  if (action === "cancel" && !["requested", "quoted"].includes(r.status))
    return fail("CONFLICT", "This request can't be cancelled now — call the broker");
  const status = action === "accept" ? "accepted" : "cancelled";
  await db()
    .update(brokerRequests)
    .set({
      status,
      ...(action === "accept" ? { acceptedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(brokerRequests.id, r.id));
  await logEvent(r.id, status, actor, actorUserId, null);

  const [b] = await db()
    .select({ phone: brokers.phone })
    .from(brokers)
    .where(eq(brokers.id, r.brokerId))
    .limit(1);
  if (b) {
    await sendDirectSms(b.phone, "broker_request_reply", {
      requester: r.requesterName,
      action: action === "accept" ? "accepted" : "cancelled",
      plate: r.vehiclePlate,
      number: r.number,
      link: appUrl(`/broker/requests/${r.id}`),
    });
  }
  return { ok: true as const, data: { status } };
}

export async function driverRespondToQuote(
  rawInput: unknown,
): Promise<ActionResult<{ status: string }>> {
  const userId = await getSessionUserId();
  const phone = await getSessionPhone();
  if (!userId) return fail("UNAUTHENTICATED", "Sign in first");
  const parsed = z
    .object({ requestId: z.string().uuid(), action: z.enum(["accept", "cancel"]) })
    .safeParse(rawInput);
  if (!parsed.success) return fail("VALIDATION", "Invalid input");
  const [r] = await db()
    .select({
      requesterUserId: brokerRequests.requesterUserId,
      requesterPhone: brokerRequests.requesterPhone,
      source: brokerRequests.source,
    })
    .from(brokerRequests)
    .where(eq(brokerRequests.id, parsed.data.requestId))
    .limit(1);
  if (!r || r.source !== "driver" || (r.requesterUserId !== userId && r.requesterPhone !== phone))
    return fail("NOT_FOUND", "Request not found");
  return respond(parsed.data.requestId, parsed.data.action, "driver", userId);
}

// ---------------------------------------------------------------------------
// Garage side — hand a renewal over to a broker
// ---------------------------------------------------------------------------

const GARAGE_ROLES = ["owner", "manager", "service_advisor"];

async function requireGarageStaff(garageId: string) {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const rows = await db()
    .select({ role: memberships.role })
    .from(memberships)
    .innerJoin(garages, eq(garages.id, memberships.garageId))
    .where(
      and(
        eq(memberships.garageId, garageId),
        eq(memberships.userId, userId),
        eq(memberships.status, "active"),
        isNull(memberships.deletedAt),
        ne(garages.status, "suspended"),
      ),
    );
  const ok = rows.some((m) => GARAGE_ROLES.includes(m.role));
  return ok ? { userId } : null;
}

export async function garageSendRenewalToBroker(
  rawInput: unknown,
): Promise<ActionResult<{ requestId: string; number: string }>> {
  const parsed = z
    .object({
      garageId: z.string().uuid(),
      renewalId: z.string().uuid(),
      brokerId: z.string().uuid(),
      notes: z.string().max(1000).optional().or(z.literal("")),
    })
    .safeParse(rawInput);
  if (!parsed.success) return fail("VALIDATION", "Choose a broker");
  const d = parsed.data;
  const ctx = await requireGarageStaff(d.garageId);
  if (!ctx)
    return fail("FORBIDDEN", "Only owners, managers and service advisors can hand off renewals");

  const [rn] = await db()
    .select({
      renewal: renewalRequests,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      plate: vehicles.plateNumber,
      make: vehicles.make,
      model: vehicles.model,
      year: vehicles.year,
    })
    .from(renewalRequests)
    .innerJoin(customers, eq(renewalRequests.customerId, customers.id))
    .innerJoin(vehicles, eq(renewalRequests.vehicleId, vehicles.id))
    .where(and(eq(renewalRequests.id, d.renewalId), eq(renewalRequests.garageId, d.garageId)))
    .limit(1);
  if (!rn) return fail("NOT_FOUND", "Renewal not found");

  const [open] = await db()
    .select({ id: brokerRequests.id })
    .from(brokerRequests)
    .where(
      and(
        eq(brokerRequests.renewalRequestId, d.renewalId),
        inArray(brokerRequests.status, [...OPEN_STATUSES]),
      ),
    )
    .limit(1);
  if (open) return fail("CONFLICT", "This renewal is already with a broker");

  const [b] = await db()
    .select({ id: brokers.id, kind: brokers.kind, status: brokers.status })
    .from(brokers)
    .where(and(eq(brokers.id, d.brokerId), isNull(brokers.deletedAt)))
    .limit(1);
  const kind = rn.renewal.kind;
  if (!b || b.status !== "active") return fail("NOT_FOUND", "That broker isn't available");
  if (b.kind !== "both" && b.kind !== kind)
    return fail("VALIDATION", "That broker doesn't handle this renewal type");

  const [g] = await db()
    .select({ name: garages.name, phone: garages.phone })
    .from(garages)
    .where(eq(garages.id, d.garageId))
    .limit(1);
  const serviceType =
    kind === "dvla"
      ? (rn.renewal.dvlaRecordType ?? "roadworthy")
      : (rn.renewal.insurancePolicyType ?? "third_party");

  const id = uuidv7();
  const number = newNumber();
  await db()
    .insert(brokerRequests)
    .values({
      id,
      number,
      brokerId: b.id,
      kind,
      serviceType,
      source: "garage",
      requesterPhone: g?.phone ?? rn.customerPhone,
      requesterName: g?.name ?? "Garage",
      requesterUserId: ctx.userId,
      garageId: d.garageId,
      renewalRequestId: d.renewalId,
      vehiclePlate: rn.plate,
      vehicleMake: rn.make,
      vehicleModel: rn.model,
      vehicleYear: rn.year ?? null,
      notes: [
        `Customer: ${rn.customerName} (${rn.customerPhone})`,
        `Garage ref: ${rn.renewal.number}`,
        d.notes,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  await logEvent(id, "requested", "garage", ctx.userId, d.notes || null);
  await notifyBrokerOfRequest(b.id, {
    number,
    kind,
    vehiclePlate: rn.plate,
    requesterName: g?.name ?? "A garage",
  });
  return { ok: true, data: { requestId: id, number } };
}

export async function listGarageBrokerRequests(garageId: string) {
  if (!z.string().uuid().safeParse(garageId).success) return [];
  const ctx = await requireGarageStaff(garageId);
  if (!ctx) return [];
  const rows = await db()
    .select({ r: brokerRequests, brokerName: brokers.businessName, brokerPhone: brokers.phone })
    .from(brokerRequests)
    .innerJoin(brokers, eq(brokerRequests.brokerId, brokers.id))
    .where(eq(brokerRequests.garageId, garageId))
    .orderBy(desc(brokerRequests.createdAt))
    .limit(200);
  return rows.map((x) => ({
    ...serializeRequest(x.r),
    brokerName: x.brokerName,
    brokerPhone: x.brokerPhone,
  }));
}

export async function garageRespondToQuote(
  rawInput: unknown,
): Promise<ActionResult<{ status: string }>> {
  const parsed = z
    .object({
      garageId: z.string().uuid(),
      requestId: z.string().uuid(),
      action: z.enum(["accept", "cancel"]),
    })
    .safeParse(rawInput);
  if (!parsed.success) return fail("VALIDATION", "Invalid input");
  const ctx = await requireGarageStaff(parsed.data.garageId);
  if (!ctx) return fail("FORBIDDEN", "Not allowed");
  const [r] = await db()
    .select({ garageId: brokerRequests.garageId })
    .from(brokerRequests)
    .where(eq(brokerRequests.id, parsed.data.requestId))
    .limit(1);
  if (!r || r.garageId !== parsed.data.garageId) return fail("NOT_FOUND", "Request not found");
  return respond(parsed.data.requestId, parsed.data.action, "garage", ctx.userId);
}

// ---------------------------------------------------------------------------
// Platform admin
// ---------------------------------------------------------------------------

async function requireAdmin() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const [u] = await db()
    .select({ isPlatformAdmin: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u?.isPlatformAdmin ? userId : null;
}

export async function adminListBrokers() {
  if (!(await requireAdmin())) return [];
  const rows = await db()
    .select({
      b: brokers,
      requests: sql<number>`(select count(*)::int from broker_requests r where r.broker_id = ${brokers.id})`,
    })
    .from(brokers)
    .where(isNull(brokers.deletedAt))
    .orderBy(desc(brokers.createdAt))
    .limit(500);
  return rows.map((x) => ({
    ...serializeBroker(x.b),
    requests: Number(x.requests),
    createdAt: x.b.createdAt.toISOString(),
  }));
}

export async function adminUpdateBroker(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const adminId = await requireAdmin();
  if (!adminId) return fail("FORBIDDEN", "Platform admin only");
  const parsed = z
    .object({
      brokerId: z.string().uuid(),
      status: z.enum(["pending", "active", "suspended"]).optional(),
      isVerified: z.boolean().optional(),
    })
    .safeParse(rawInput);
  if (!parsed.success) return fail("VALIDATION", "Invalid input");
  const d = parsed.data;
  await db()
    .update(brokers)
    .set({
      ...(d.status ? { status: d.status } : {}),
      ...(d.isVerified !== undefined ? { isVerified: d.isVerified } : {}),
      updatedAt: new Date(),
    })
    .where(eq(brokers.id, d.brokerId));
  await writeAuditLog({
    garageId: null,
    actorUserId: adminId,
    action: "broker.admin_update",
    entityType: "broker",
    entityId: d.brokerId,
    after: d as Record<string, unknown>,
  }).catch(() => {});
  return { ok: true, data: { ok: true as const } };
}
