"use server";
import { z } from "zod";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  users,
  vendors,
  vendorMembers,
  vendorProducts,
  partTypes,
  vendorOrders,
  vendorOrderItems,
  vendorOrderEvents,
  vendorReviews,
} from "@/lib/db/schema";
import { writeAuditLog, type ActionResult } from "@/lib/actions";
import { getSessionUserId } from "@/lib/auth/ensure-user";
import { can, type Principal } from "@/lib/auth/permissions";
import { parseVendorProductsCsv, type VendorCsvIssue } from "./csv";
import { uuidv7 } from "@/lib/id";
import { encryptPayoutAccount, parseFreeTextMomo } from "@/lib/escrow/payout-account";
import { getHoldForEntity, refundHold, scheduleAutoRelease } from "@/lib/escrow/service";
import { deliveryProvider } from "@/lib/integrations/delivery";
import { smsBuyer } from "@/lib/parts-shop/notify";
import { garages } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Membership resolution
// ---------------------------------------------------------------------------

export async function resolveVendorMembership(userId: string) {
  const [row] = await db()
    .select({ vendor: vendors, role: vendorMembers.role })
    .from(vendorMembers)
    .innerJoin(vendors, eq(vendorMembers.vendorId, vendors.id))
    .where(
      and(
        eq(vendorMembers.userId, userId),
        eq(vendorMembers.status, "active"),
        isNull(vendors.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

function legacyPayout(method: string | undefined, text: string | undefined): string | null {
  if (method === "bank") return null;
  const acct = parseFreeTextMomo(text);
  return acct ? encryptPayoutAccount(acct) : null;
}

function vendorPrincipal(role: string): Principal {
  return { kind: "vendor", vendorRole: role === "vendor_owner" ? "owner" : "staff" };
}

async function requireVendor(userId: string) {
  const m = await resolveVendorMembership(userId);
  if (!m) return null;
  return { vendor: m.vendor, role: m.role, principal: vendorPrincipal(m.role) };
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export async function vendorSignup(rawInput: unknown): Promise<ActionResult<{ vendorId: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } };
  const existing = await resolveVendorMembership(userId);
  if (existing)
    return { ok: false, error: { code: "CONFLICT", message: "You already have a vendor account" } };

  const parsed = z
    .object({
      businessName: z.string().min(2).max(200),
      phone: z.string().min(9).max(20),
      email: z.string().email().optional().or(z.literal("")),
      city: z.string().max(100).optional(),
      region: z.string().max(100).optional(),
      categories: z.array(z.string().max(60)).max(10).default([]),
      deliveryZones: z
        .array(
          z.object({
            region: z.string().max(100),
            city: z.string().max(100).optional(),
            fee: z.number().min(0).optional(),
            etaHours: z.number().min(0).optional(),
          }),
        )
        .max(50)
        .default([]),
      payoutMethod: z.enum(["momo", "bank"]).optional(),
      payoutDetails: z.string().max(500).optional(),
      planCode: z.string().min(1).max(40).optional(),
    })
    .safeParse(rawInput);
  if (!parsed.success)
    return { ok: false, error: { code: "VALIDATION", message: "Check the highlighted fields" } };
  const d = parsed.data;

  const { resolvePlanCode, createTrialSubscription } = await import("@/lib/billing/account");
  const planCode = await resolvePlanCode("vendor", d.planCode);
  if (!planCode)
    return {
      ok: false,
      error: { code: "INTERNAL", message: "No vendor plans configured — contact support" },
    };

  const [user] = await db()
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const slug =
    d.businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) +
    "-" +
    uuidv7().slice(0, 8);

  const vendorId = uuidv7();
  await db().transaction(async (tx) => {
    await tx.insert(vendors).values({
      id: vendorId,
      businessName: d.businessName,
      slug,
      phone: d.phone,
      email: d.email || user?.email || null,
      city: d.city || null,
      region: d.region || null,
      categories: d.categories,
      deliveryZones: d.deliveryZones.map((z) => ({ ...z, fee: z.fee ?? 0 })),
      payoutMethod: d.payoutMethod ?? null,
      // Free-text MoMo line → encrypted payout account when it parses; otherwise set in Payouts.
      payoutDetailsEncrypted: legacyPayout(d.payoutMethod, d.payoutDetails),
      status: "pending",
    });
    await tx.insert(vendorMembers).values({
      id: uuidv7(),
      vendorId,
      userId,
      role: "vendor_owner",
    });
    await createTrialSubscription({ ownerKind: "vendor", ownerId: vendorId, planCode }, tx);
  });

  await writeAuditLog({
    garageId: null,
    actorUserId: userId,
    action: "vendor.signup",
    entityType: "vendor",
    entityId: vendorId,
    after: { businessName: d.businessName, city: d.city },
  }).catch(() => {});
  return { ok: true, data: { vendorId } };
}

export async function updateVendorProfile(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } };
  const ctx = await requireVendor(userId);
  if (!ctx || !can(ctx.principal, "vendor.settings.manage")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Vendor owner only" } };
  }

  const parsed = z
    .object({
      phone: z.string().min(9).max(20).optional(),
      email: z.string().email().optional().or(z.literal("")),
      address: z.string().max(300).optional(),
      city: z.string().max(100).optional(),
      region: z.string().max(100).optional(),
      categories: z.array(z.string().max(60)).max(10).optional(),
      deliveryZones: z
        .array(
          z.object({
            region: z.string().max(100),
            city: z.string().max(100).optional(),
            fee: z.number().min(0).optional(),
            etaHours: z.number().min(0).optional(),
          }),
        )
        .max(50)
        .optional(),
      payoutMethod: z.enum(["momo", "bank"]).optional(),
      payoutDetails: z.string().max(500).optional(),
      logoUrl: z.string().url().optional().or(z.literal("")),
      /** Shop pin for the public /parts "near me" finder (Ghana, roughly). */
      gpsLat: z.number().min(4).max(11.5).optional(),
      gpsLng: z.number().min(-3.5).max(1.5).optional(),
    })
    .safeParse(rawInput);
  if (!parsed.success)
    return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } };
  const d = parsed.data;

  await db()
    .update(vendors)
    .set({
      ...(d.phone !== undefined ? { phone: d.phone } : {}),
      ...(d.email !== undefined ? { email: d.email || null } : {}),
      ...(d.address !== undefined ? { address: d.address || null } : {}),
      ...(d.city !== undefined ? { city: d.city || null } : {}),
      ...(d.region !== undefined ? { region: d.region || null } : {}),
      ...(d.categories !== undefined ? { categories: d.categories } : {}),
      ...(d.deliveryZones !== undefined
        ? { deliveryZones: d.deliveryZones.map((z) => ({ ...z, fee: z.fee ?? 0 })) }
        : {}),
      // Payout accounts are managed in Payouts (saveVendorPayoutAccount); a parsable MoMo line is still accepted.
      ...(d.payoutDetails && legacyPayout(d.payoutMethod, d.payoutDetails)
        ? {
            payoutMethod: "momo",
            payoutDetailsEncrypted: legacyPayout(d.payoutMethod, d.payoutDetails),
          }
        : {}),
      ...(d.logoUrl !== undefined ? { logoUrl: d.logoUrl || null } : {}),
      ...(d.gpsLat !== undefined && d.gpsLng !== undefined
        ? { gpsLat: d.gpsLat.toFixed(6), gpsLng: d.gpsLng.toFixed(6) }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(vendors.id, ctx.vendor.id));

  await writeAuditLog({
    garageId: null,
    actorUserId: userId,
    action: "vendor.profile.update",
    entityType: "vendor",
    entityId: ctx.vendor.id,
    after: { ...d, payoutDetails: d.payoutDetails ? "[redacted]" : undefined } as Record<
      string,
      unknown
    >,
  }).catch(() => {});
  return { ok: true, data: { ok: true as const } };
}

// ---------------------------------------------------------------------------
// Dashboard data
// ---------------------------------------------------------------------------

export async function getVendorDashboard() {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false as const };
  const ctx = await requireVendor(userId);
  if (!ctx) return { ok: true as const, data: null };
  const { vendor } = ctx;

  const [orderRows, productCount, reviewRows] = await Promise.all([
    db()
      .select({
        id: vendorOrders.id,
        number: vendorOrders.number,
        status: vendorOrders.status,
        total: vendorOrders.total,
        subtotal: vendorOrders.subtotal,
        commissionAmount: vendorOrders.commissionAmount,
        paymentStatus: vendorOrders.paymentStatus,
        expectedDeliveryAt: vendorOrders.expectedDeliveryAt,
        createdAt: vendorOrders.createdAt,
        origin: vendorOrders.origin,
        destinationType: vendorOrders.destinationType,
        deliveryAddress: vendorOrders.deliveryAddress,
        deliveryCity: vendorOrders.deliveryCity,
        buyerPhone: vendorOrders.buyerPhone,
        riderName: vendorOrders.riderName,
        riderPhone: vendorOrders.riderPhone,
        courier: vendorOrders.courier,
        courierReference: vendorOrders.courierReference,
        garageName: garages.name,
      })
      .from(vendorOrders)
      .leftJoin(garages, eq(garages.id, vendorOrders.garageId))
      .where(eq(vendorOrders.vendorId, vendor.id))
      .orderBy(desc(vendorOrders.createdAt))
      .limit(100),
    db()
      .select({ count: sql<string>`count(*)` })
      .from(vendorProducts)
      .where(and(eq(vendorProducts.vendorId, vendor.id), eq(vendorProducts.isActive, true))),
    db()
      .select({
        rating: vendorReviews.rating,
        comment: vendorReviews.comment,
        createdAt: vendorReviews.createdAt,
      })
      .from(vendorReviews)
      .where(eq(vendorReviews.vendorId, vendor.id))
      .orderBy(desc(vendorReviews.createdAt))
      .limit(20),
  ]);

  const salesTotal = orderRows.reduce((s, o) => s + Number(o.subtotal), 0);
  const commissionTotal = orderRows.reduce((s, o) => s + Number(o.commissionAmount), 0);

  return {
    ok: true as const,
    data: {
      vendor: {
        id: vendor.id,
        businessName: vendor.businessName,
        status: vendor.status,
        isVerified: vendor.isVerified,
        phone: vendor.phone,
        email: vendor.email,
        city: vendor.city,
        region: vendor.region,
        gpsLat: vendor.gpsLat != null ? Number(vendor.gpsLat) : null,
        gpsLng: vendor.gpsLng != null ? Number(vendor.gpsLng) : null,
        categories: vendor.categories,
        deliveryZones: vendor.deliveryZones,
        payoutMethod: vendor.payoutMethod,
        ratingAvg: vendor.ratingAvg != null ? Number(vendor.ratingAvg) : null,
        ratingCount: vendor.ratingCount,
      },
      role: ctx.role,
      orders: orderRows.map((o) => ({
        ...o,
        total: Number(o.total),
        subtotal: Number(o.subtotal),
        commissionAmount: Number(o.commissionAmount),
        expectedDeliveryAt: o.expectedDeliveryAt?.toISOString() ?? null,
        createdAt: o.createdAt.toISOString(),
      })),
      productCount: Number(productCount[0]?.count ?? 0),
      salesTotal,
      commissionTotal,
      reviews: reviewRows,
      canManage: can(ctx.principal, "vendor.catalogue.manage"),
      canFulfil: can(ctx.principal, "vendor.orders.fulfil"),
      canSettings: can(ctx.principal, "vendor.settings.manage"),
      canPayouts: can(ctx.principal, "vendor.payouts.view"),
    },
  };
}

// ---------------------------------------------------------------------------
// Product catalogue
// ---------------------------------------------------------------------------

export async function listVendorProducts(rawInput: unknown) {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false as const };
  const parsed = z.object({ q: z.string().optional() }).safeParse(rawInput);
  const ctx = await requireVendor(userId);
  if (!ctx || !can(ctx.principal, "vendor.catalogue.manage")) return { ok: false as const };

  const rows = await db()
    .select()
    .from(vendorProducts)
    .where(
      and(
        eq(vendorProducts.vendorId, ctx.vendor.id),
        parsed.success && parsed.data.q
          ? or(
              ilike(vendorProducts.name, `%${parsed.data.q}%`),
              ilike(vendorProducts.sku, `%${parsed.data.q}%`),
            )
          : undefined,
      ),
    )
    .orderBy(vendorProducts.name)
    .limit(500);

  return {
    ok: true as const,
    data: rows.map((p) => ({
      ...p,
      price: Number(p.price),
      compatibleVehicles: p.compatibleVehicles,
      photos: p.photos,
    })),
  };
}

export async function upsertVendorProduct(
  rawInput: unknown,
): Promise<ActionResult<{ productId: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } };
  const ctx = await requireVendor(userId);
  if (!ctx || !can(ctx.principal, "vendor.catalogue.manage")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } };
  }

  const parsed = z
    .object({
      productId: z.string().uuid().optional(),
      sku: z.string().min(1).max(60),
      name: z.string().min(1).max(200),
      brand: z.string().max(100).optional(),
      category: z.string().min(1).max(100),
      description: z.string().max(2000).optional(),
      unit: z.string().max(20).optional(),
      price: z.number().min(0), // cedis
      stockStatus: z.enum(["in_stock", "low", "out", "on_order"]).optional(),
      quantityAvailable: z.number().int().min(0).optional(),
      minOrderQty: z.number().int().min(1).optional(),
      leadTimeHours: z.number().int().min(0).optional(),
      isActive: z.boolean().optional(),
      partTypeId: z.string().uuid().nullable().optional(),
      condition: z.enum(["genuine", "aftermarket", "home_used"]).nullable().optional(),
      fitMake: z.string().max(60).nullable().optional(),
      fitModel: z.string().max(60).nullable().optional(),
      fitYearFrom: z.number().int().min(1950).max(2100).nullable().optional(),
      fitYearTo: z.number().int().min(1950).max(2100).nullable().optional(),
      oemNumber: z.string().max(60).nullable().optional(),
      warrantyDays: z.number().int().min(0).max(3650).nullable().optional(),
    })
    .safeParse(rawInput);
  if (!parsed.success)
    return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } };
  const d = parsed.data;

  const values = {
    sku: d.sku.trim(),
    name: d.name.trim(),
    brand: d.brand || null,
    category: d.category.trim(),
    description: d.description || null,
    unit: d.unit || "pcs",
    price: BigInt(Math.round(d.price * 100)),
    stockStatus: d.stockStatus ?? null,
    quantityAvailable: d.quantityAvailable ?? null,
    minOrderQty: d.minOrderQty ?? 1,
    leadTimeHours: d.leadTimeHours ?? null,
    isActive: d.isActive ?? true,
    partTypeId: d.partTypeId ?? null,
    condition: d.condition ?? null,
    fitMake: d.fitMake?.trim() || null,
    fitModel: d.fitModel?.trim() || null,
    fitYearFrom: d.fitYearFrom ?? null,
    fitYearTo: d.fitYearTo ?? null,
    oemNumber: d.oemNumber?.trim() || null,
    warrantyDays: d.warrantyDays ?? null,
    updatedAt: new Date(),
  };
  if (values.fitYearFrom && values.fitYearTo && values.fitYearFrom > values.fitYearTo) {
    return {
      ok: false,
      error: { code: "VALIDATION", message: "'Year from' must be before 'year to'" },
    };
  }

  if (d.productId) {
    await db()
      .update(vendorProducts)
      .set(values)
      .where(and(eq(vendorProducts.id, d.productId), eq(vendorProducts.vendorId, ctx.vendor.id)));
    return { ok: true, data: { productId: d.productId } };
  }
  const productId = uuidv7();
  try {
    await db()
      .insert(vendorProducts)
      .values({ id: productId, vendorId: ctx.vendor.id, garageId: null, ...values });
  } catch {
    return { ok: false, error: { code: "CONFLICT", message: `SKU "${d.sku}" already exists` } };
  }
  return { ok: true, data: { productId } };
}

export async function importVendorProductsCsv(
  rawInput: unknown,
): Promise<ActionResult<{ inserted: number; updated: number; issues: VendorCsvIssue[] }>> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } };
  const ctx = await requireVendor(userId);
  if (!ctx || !can(ctx.principal, "vendor.catalogue.manage")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } };
  }
  const parsed = z.object({ csvText: z.string().min(10).max(2_000_000) }).safeParse(rawInput);
  if (!parsed.success)
    return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } };

  const { rows, issues } = parseVendorProductsCsv(parsed.data.csvText);
  if (rows.length === 0) return { ok: true, data: { inserted: 0, updated: 0, issues } };

  const existing = await db()
    .select({ id: vendorProducts.id, sku: vendorProducts.sku })
    .from(vendorProducts)
    .where(eq(vendorProducts.vendorId, ctx.vendor.id));
  const bySku = new Map(existing.map((e) => [e.sku.toLowerCase(), e.id]));
  const types = await db()
    .select({ id: partTypes.id, slug: partTypes.slug, name: partTypes.name })
    .from(partTypes);
  const typeByKey = new Map<string, string>();
  for (const t of types) {
    typeByKey.set(t.slug.toLowerCase(), t.id);
    typeByKey.set(t.name.toLowerCase(), t.id);
  }

  let inserted = 0,
    updated = 0;
  for (const r of rows) {
    const existingId = bySku.get(r.sku.toLowerCase());
    const values = {
      name: r.name,
      brand: r.brand || null,
      category: r.category,
      unit: r.unit || "pcs",
      price: BigInt(Math.round((r.price ?? 0) * 100)),
      stockStatus: r.stockStatus ?? null,
      quantityAvailable: r.quantityAvailable ?? null,
      minOrderQty: r.minOrderQty ?? 1,
      leadTimeHours: r.leadTimeHours ?? null,
      ...(r.partType ? { partTypeId: typeByKey.get(r.partType.toLowerCase()) ?? null } : {}),
      ...(r.condition ? { condition: r.condition } : {}),
      ...(r.fitMake !== undefined ? { fitMake: r.fitMake || null } : {}),
      ...(r.fitModel !== undefined ? { fitModel: r.fitModel || null } : {}),
      ...(r.fitYearFrom !== undefined ? { fitYearFrom: r.fitYearFrom ?? null } : {}),
      ...(r.fitYearTo !== undefined ? { fitYearTo: r.fitYearTo ?? null } : {}),
      ...(r.oemNumber !== undefined ? { oemNumber: r.oemNumber || null } : {}),
      ...(r.warrantyDays !== undefined ? { warrantyDays: r.warrantyDays ?? null } : {}),
      updatedAt: new Date(),
    };
    if (r.partType && !typeByKey.has(r.partType.toLowerCase())) {
      issues.push({
        row: r.row,
        sku: r.sku,
        message: `unknown part type "${r.partType}" — imported without one`,
      });
    }
    if (existingId) {
      await db().update(vendorProducts).set(values).where(eq(vendorProducts.id, existingId));
      updated++;
    } else {
      await db()
        .insert(vendorProducts)
        .values({ id: uuidv7(), vendorId: ctx.vendor.id, garageId: null, sku: r.sku, ...values });
      inserted++;
    }
  }
  return { ok: true, data: { inserted, updated, issues } };
}

// ---------------------------------------------------------------------------
// Order fulfilment
// ---------------------------------------------------------------------------

const ORDER_FLOW = ["placed", "accepted", "packed", "out_for_delivery", "delivered"] as const;

export async function fulfilVendorOrder(
  rawInput: unknown,
): Promise<ActionResult<{ status: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } };
  const parsed = z
    .object({
      orderId: z.string().uuid(),
      action: z.enum(["accept", "reject", "packed", "out_for_delivery", "delivered", "cancel"]),
      note: z.string().max(300).optional(),
      // out_for_delivery: own rider, FixAm rider or partner courier
      courier: z.enum(["vendor", "partner", "fixam_rider"]).optional(),
      riderName: z.string().trim().max(80).optional(),
      riderPhone: z.string().trim().max(20).optional(),
    })
    .safeParse(rawInput);
  if (!parsed.success)
    return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } };
  const d = parsed.data;

  const ctx = await requireVendor(userId);
  if (!ctx || !can(ctx.principal, "vendor.orders.fulfil")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } };
  }

  const [order] = await db()
    .select()
    .from(vendorOrders)
    .where(and(eq(vendorOrders.id, d.orderId), eq(vendorOrders.vendorId, ctx.vendor.id)))
    .limit(1);
  if (!order) return { ok: false, error: { code: "NOT_FOUND", message: "Order not found" } };

  const current = order.status as string;
  const idx = ORDER_FLOW.indexOf(current as (typeof ORDER_FLOW)[number]);
  let nextStatus: string;
  if (d.action === "accept") nextStatus = "accepted";
  else if (d.action === "reject" || d.action === "cancel") nextStatus = "cancelled";
  else {
    const targetIdx = ORDER_FLOW.indexOf(d.action as (typeof ORDER_FLOW)[number]);
    if (idx < 0 || targetIdx !== idx + 1) {
      return {
        ok: false,
        error: { code: "VALIDATION", message: `Cannot move from ${current} to ${d.action}` },
      };
    }
    nextStatus = d.action;
  }

  // Paid driver orders must be paid before they leave the shop.
  if (
    order.buyerUserId &&
    order.paymentStatus !== "paid" &&
    ["packed", "out_for_delivery", "delivered"].includes(nextStatus)
  ) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Wait for the payment to confirm before sending this order",
      },
    };
  }

  let courierPatch: Partial<typeof vendorOrders.$inferInsert> = {};
  if (nextStatus === "out_for_delivery" && order.destinationType !== "pickup") {
    if (d.courier === "partner") {
      const [g] = order.garageId
        ? await db()
            .select({
              name: garages.name,
              phone: garages.phone,
              address: garages.address,
              city: garages.city,
            })
            .from(garages)
            .where(eq(garages.id, order.garageId))
            .limit(1)
        : [null];
      const booking = await deliveryProvider().book({
        orderNumber: order.number,
        pickup: {
          name: ctx.vendor.businessName,
          phone: ctx.vendor.phone,
          address: ctx.vendor.address,
          city: ctx.vendor.city,
        },
        dropoff: g
          ? { name: g.name, phone: g.phone, address: g.address, city: g.city }
          : {
              name: "Customer",
              phone: order.buyerPhone,
              address: order.deliveryAddress,
              city: order.deliveryCity,
            },
      });
      courierPatch = {
        courier: "partner",
        courierReference: booking.reference,
        riderName: booking.riderName ?? null,
        riderPhone: booking.riderPhone ?? null,
      };
    } else if (d.courier === "fixam_rider") {
      // P8-18: offer the run to approved FixAm riders, nearest first.
      const { dispatchFixamRider } = await import("@/lib/riders/actions");
      const [g] = order.garageId
        ? await db()
            .select({
              name: garages.name,
              phone: garages.phone,
              address: garages.address,
              city: garages.city,
            })
            .from(garages)
            .where(eq(garages.id, order.garageId))
            .limit(1)
        : [null];
      const res = await dispatchFixamRider({
        vendorOrderId: order.id,
        vendorUserId: userId,
        pickup: {
          name: ctx.vendor.businessName,
          phone: ctx.vendor.phone,
          address: ctx.vendor.address,
          city: ctx.vendor.city,
        },
        dropoff: g
          ? { name: g.name, phone: g.phone, address: g.address, city: g.city }
          : {
              name: "Customer",
              phone: order.buyerPhone,
              address: order.deliveryAddress,
              city: order.deliveryCity,
            },
      });
      if (!res.ok) return { ok: false, error: { code: "VALIDATION", message: res.error } };
      courierPatch = { courier: "fixam_rider", courierReference: res.number };
    } else if (d.riderName || d.riderPhone) {
      courierPatch = {
        courier: "vendor",
        riderName: d.riderName || null,
        riderPhone: d.riderPhone || null,
      };
    } else if (order.buyerUserId) {
      return {
        ok: false,
        error: {
          code: "VALIDATION",
          message: "Add the rider's name and phone, book a FixAm rider, or book a partner courier",
        },
      };
    }
  }

  await db()
    .update(vendorOrders)
    .set({
      status: nextStatus as never,
      ...(nextStatus === "delivered" ? { deliveredAt: new Date() } : {}),
      ...courierPatch,
      updatedAt: new Date(),
    })
    .where(eq(vendorOrders.id, order.id));

  if (order.buyerPhone) {
    const rider = courierPatch.riderName
      ? ` Rider: ${courierPatch.riderName}${courierPatch.riderPhone ? ` ${courierPatch.riderPhone}` : ""}.`
      : courierPatch.courierReference
        ? ` Courier ref ${courierPatch.courierReference}.`
        : "";
    const msg =
      nextStatus === "accepted"
        ? `FixAm: ${ctx.vendor.businessName} accepted your order ${order.number}.`
        : nextStatus === "out_for_delivery"
          ? `FixAm: your part ${order.number} is on the way.${rider}`
          : nextStatus === "delivered"
            ? order.destinationType === "garage"
              ? `FixAm: ${order.number} was delivered to your garage.`
              : `FixAm: ${order.number} delivered. Confirm you have it in FixAm so the seller is paid.`
            : nextStatus === "cancelled"
              ? `FixAm: ${ctx.vendor.businessName} couldn't fulfil ${order.number}. If you paid, your refund is on its way.`
              : null;
    if (msg) await smsBuyer(order.buyerPhone, msg, `vo-${nextStatus}:${order.id}`);
  }

  await db()
    .insert(vendorOrderEvents)
    .values({
      id: uuidv7(),
      vendorOrderId: order.id,
      garageId: order.garageId,
      status: nextStatus as never,
      actorUserId: userId,
      note: d.note ?? null,
    });

  // Escrow: delivery starts the buyer-protection clock; a cancelled paid order is refunded.
  const hold = await getHoldForEntity("vendor_order", order.id);
  if (hold?.status === "held") {
    if (nextStatus === "delivered") await scheduleAutoRelease(hold.id).catch(() => undefined);
    if (nextStatus === "cancelled")
      await refundHold(hold.id, {
        actorUserId: userId,
        note: `Vendor cancelled${d.note ? `: ${d.note}` : ""}`,
      }).catch(() => undefined);
  }

  return { ok: true, data: { status: nextStatus } };
}

export async function listVendorOrderDetail(rawInput: unknown) {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false as const };
  const parsed = z.object({ orderId: z.string().uuid() }).safeParse(rawInput);
  if (!parsed.success) return { ok: false as const };
  const ctx = await requireVendor(userId);
  if (!ctx) return { ok: false as const };

  const [order] = await db()
    .select()
    .from(vendorOrders)
    .where(and(eq(vendorOrders.id, parsed.data.orderId), eq(vendorOrders.vendorId, ctx.vendor.id)))
    .limit(1);
  if (!order) return { ok: true as const, data: null };

  const items = await db()
    .select({
      id: vendorOrderItems.id,
      description: vendorOrderItems.description,
      quantity: vendorOrderItems.quantity,
      unitPrice: vendorOrderItems.unitPrice,
      quantityDelivered: vendorOrderItems.quantityDelivered,
      quantityReceived: vendorOrderItems.quantityReceived,
    })
    .from(vendorOrderItems)
    .where(eq(vendorOrderItems.vendorOrderId, order.id));

  const events = await db()
    .select()
    .from(vendorOrderEvents)
    .where(eq(vendorOrderEvents.vendorOrderId, order.id))
    .orderBy(vendorOrderEvents.createdAt);

  return {
    ok: true as const,
    data: {
      id: order.id,
      number: order.number,
      status: order.status,
      total: Number(order.total),
      subtotal: Number(order.subtotal),
      deliveryFee: Number(order.deliveryFee ?? 0),
      commissionAmount: Number(order.commissionAmount ?? 0),
      paymentStatus: order.paymentStatus,
      expectedDeliveryAt: order.expectedDeliveryAt?.toISOString() ?? null,
      items: items.map((i) => ({ ...i, unitPrice: Number(i.unitPrice) })),
      events: events.map((e) => ({
        status: e.status,
        note: e.note,
        at: e.createdAt.toISOString(),
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Platform admin — vendor approval
// ---------------------------------------------------------------------------

async function requirePlatformAdmin(userId: string) {
  const [u] = await db()
    .select({ isPlatformAdmin: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u?.isPlatformAdmin === true;
}

export async function adminListVendors(rawInput: unknown) {
  const userId = await getSessionUserId();
  if (!userId || !(await requirePlatformAdmin(userId))) return { ok: false as const };
  const parsed = z.object({ status: z.string().optional() }).safeParse(rawInput);

  const rows = await db()
    .select()
    .from(vendors)
    .where(
      and(
        isNull(vendors.deletedAt),
        parsed.success && parsed.data.status
          ? eq(vendors.status, parsed.data.status as never)
          : undefined,
      ),
    )
    .orderBy(desc(vendors.createdAt))
    .limit(300);

  return {
    ok: true as const,
    data: rows.map((v) => ({
      id: v.id,
      businessName: v.businessName,
      slug: v.slug,
      phone: v.phone,
      email: v.email,
      city: v.city,
      region: v.region,
      categories: v.categories,
      status: v.status,
      isVerified: v.isVerified,
      ratingAvg: v.ratingAvg != null ? Number(v.ratingAvg) : null,
      ratingCount: v.ratingCount,
      createdAt: v.createdAt.toISOString(),
    })),
  };
}

export async function adminSetVendorStatus(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId();
  if (!userId || !(await requirePlatformAdmin(userId))) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Platform admin only" } };
  }
  const parsed = z
    .object({
      vendorId: z.string().uuid(),
      status: z.enum(["approved", "suspended", "pending"]),
    })
    .safeParse(rawInput);
  if (!parsed.success)
    return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } };
  const d = parsed.data;

  await db()
    .update(vendors)
    .set({ status: d.status, updatedAt: new Date() })
    .where(eq(vendors.id, d.vendorId));
  await writeAuditLog({
    garageId: null,
    actorUserId: userId,
    action: "admin.vendor.status",
    entityType: "vendor",
    entityId: d.vendorId,
    after: { status: d.status },
  }).catch(() => {});
  return { ok: true, data: { ok: true as const } };
}

/** P6-06 — grant or revoke the verified badge (business credentials checked). */
export async function adminSetVendorVerified(
  rawInput: unknown,
): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId();
  if (!userId || !(await requirePlatformAdmin(userId))) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Platform admin only" } };
  }
  const parsed = z
    .object({
      vendorId: z.string().uuid(),
      verified: z.boolean(),
    })
    .safeParse(rawInput);
  if (!parsed.success)
    return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } };
  const d = parsed.data;

  const [v] = await db()
    .select({ status: vendors.status })
    .from(vendors)
    .where(eq(vendors.id, d.vendorId))
    .limit(1);
  if (!v) return { ok: false, error: { code: "NOT_FOUND", message: "Vendor not found" } };
  if (d.verified && v.status !== "approved") {
    return {
      ok: false,
      error: { code: "CONFLICT", message: "Approve the vendor before verifying" },
    };
  }

  await db()
    .update(vendors)
    .set({
      isVerified: d.verified,
      verifiedAt: d.verified ? new Date() : null,
      verifiedBy: d.verified ? userId : null,
      updatedAt: new Date(),
    })
    .where(eq(vendors.id, d.vendorId));
  await writeAuditLog({
    garageId: null,
    actorUserId: userId,
    action: d.verified ? "admin.vendor.verify" : "admin.vendor.unverify",
    entityType: "vendor",
    entityId: d.vendorId,
    after: { verified: d.verified },
  }).catch(() => {});
  return { ok: true, data: { ok: true as const } };
}
