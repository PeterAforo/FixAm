"use server"

import { z } from "zod"
import { and, desc, eq, inArray, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import { escrowHolds, garageSettings, garages, vendorOrderEvents, vendorOrderItems, vendorOrders, vendors } from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can } from "@/lib/auth/permissions"
import { resolveMembership, writeAuditLog } from "@/lib/actions"
import { storageProvider } from "@/lib/integrations/storage"
import { uuidv7 } from "@/lib/id"
import { getHoldForEntity, releaseHold, retryPayout } from "@/lib/escrow/service"
import { decryptPayoutAccount, encryptPayoutAccount, maskPayoutAccount, payoutAccountSchema } from "@/lib/escrow/payout-account"
import { payouts } from "@/lib/db/schema"
import { smsBuyer } from "./notify"

type Fail = { ok: false; error: string }
const fail = (error: string): Fail => ({ ok: false, error })

async function staff(garageId: string, permission: Parameters<typeof can>[1]) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return can({ kind: "staff", role: m.role, garageId, branchId: m.branchId }, permission) ? { userId } : null
}

// ---------------------------------------------------------------------------
// Incoming parts (bought by drivers, delivered to this garage)
// ---------------------------------------------------------------------------

export type IncomingPart = {
  id: string
  number: string
  status: string
  paid: boolean
  holdStatus: string | null
  vendorName: string
  vendorPhone: string
  buyerPhone: string | null
  vehicle: string | null
  fittingFee: number
  riderName: string | null
  riderPhone: string | null
  expectedDeliveryAt: string | null
  receivedAt: string | null
  items: { description: string; quantity: number }[]
}

export async function listIncomingParts(raw: unknown): Promise<IncomingPart[]> {
  const garageId = z.string().uuid().safeParse(raw)
  if (!garageId.success || !(await staff(garageId.data, "purchase_orders.view"))) return []
  const rows = await db()
    .select({ o: vendorOrders, vendorName: vendors.businessName, vendorPhone: vendors.phone, holdStatus: escrowHolds.status })
    .from(vendorOrders)
    .innerJoin(vendors, eq(vendors.id, vendorOrders.vendorId))
    .leftJoin(escrowHolds, and(eq(escrowHolds.entityType, "vendor_order"), eq(escrowHolds.entityId, vendorOrders.id)))
    .where(and(eq(vendorOrders.garageId, garageId.data), eq(vendorOrders.origin, "customer_to_garage"), ne(vendorOrders.status, "cancelled")))
    .orderBy(desc(vendorOrders.createdAt))
    .limit(60)
  const ids = rows.map((r) => r.o.id)
  const items = ids.length
    ? await db().select({ orderId: vendorOrderItems.vendorOrderId, description: vendorOrderItems.description, quantity: vendorOrderItems.quantity }).from(vendorOrderItems).where(inArray(vendorOrderItems.vendorOrderId, ids))
    : []
  return rows.map(({ o, vendorName, vendorPhone, holdStatus }) => ({
    id: o.id,
    number: o.number,
    status: o.status,
    paid: o.paymentStatus === "paid",
    holdStatus,
    vendorName,
    vendorPhone,
    buyerPhone: o.buyerPhone,
    vehicle: o.notes?.startsWith("For ") ? o.notes.slice(4).split(" — ")[0] ?? null : null,
    fittingFee: Number(o.fittingFee),
    riderName: o.riderName,
    riderPhone: o.riderPhone,
    expectedDeliveryAt: o.expectedDeliveryAt?.toISOString() ?? null,
    receivedAt: o.receivedAt?.toISOString() ?? null,
    items: items.filter((i) => i.orderId === o.id).map((i) => ({ description: i.description, quantity: i.quantity })),
  }))
}

const MAX_PHOTO = 6 * 1024 * 1024

/** Garage confirms a driver's part arrived (photo required) → vendor (and fitting fee) released. */
export async function confirmIncomingPart(formData: FormData): Promise<{ ok: true } | Fail> {
  const garageId = String(formData.get("garageId") ?? "")
  const orderId = String(formData.get("orderId") ?? "")
  const photo = formData.get("photo")
  if (!z.string().uuid().safeParse(garageId).success || !z.string().uuid().safeParse(orderId).success) return fail("Invalid order")
  const who = await staff(garageId, "purchase_orders.receive")
  if (!who) return fail("You don't have permission to receive parts")
  if (!(photo instanceof Blob) || photo.size === 0) return fail("Take a photo of the part first")
  if (photo.size > MAX_PHOTO) return fail("Photo is too large (max 6 MB)")
  if (!/^image\//.test(photo.type || "image/jpeg")) return fail("That file isn't a photo")

  const [o] = await db().select().from(vendorOrders).where(and(eq(vendorOrders.id, orderId), eq(vendorOrders.garageId, garageId))).limit(1)
  if (!o) return fail("Order not found")
  if (!["accepted", "packed", "out_for_delivery", "delivered"].includes(o.status)) return fail(`This order is ${o.status.replace(/_/g, " ")}`)

  const key = `vendor-orders/${o.id}/received-${Date.now()}.${(photo.type || "image/jpeg").split("/")[1] ?? "jpg"}`
  await storageProvider().put(key, Buffer.from(await photo.arrayBuffer()), photo.type || "image/jpeg")

  const [updated] = await db()
    .update(vendorOrders)
    .set({ status: "received", receivedAt: new Date(), receivedBy: who.userId, receivedPhotoPath: key, deliveredAt: o.deliveredAt ?? new Date(), updatedAt: new Date() })
    .where(and(eq(vendorOrders.id, o.id), inArray(vendorOrders.status, ["accepted", "packed", "out_for_delivery", "delivered"])))
    .returning({ id: vendorOrders.id })
  if (!updated) return fail("Already received")
  await db().insert(vendorOrderEvents).values({ id: uuidv7(), garageId, vendorOrderId: o.id, status: "received", actorUserId: who.userId, note: "Garage confirmed with photo" })
  await writeAuditLog({ garageId, actorUserId: who.userId, action: "parts_shop.received", entityType: "vendor_order", entityId: o.id, after: { photo: key } }).catch(() => undefined)

  const hold = await getHoldForEntity("vendor_order", o.id)
  if (hold?.status === "held") await releaseHold(hold.id, { actorUserId: who.userId, note: "Garage confirmed receipt with photo" })
  const [g] = await db().select({ name: garages.name }).from(garages).where(eq(garages.id, garageId)).limit(1)
  await smsBuyer(o.buyerPhone, `FixAm: ${g?.name ?? "Your garage"} has received your part (${o.number}). They'll call you to book the fitting.`, `vo-received:${o.id}`)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Settings: customer parts + where FixAm pays this garage
// ---------------------------------------------------------------------------

export type CustomerPartsSettings = { accepts: boolean; fittingFee: number; payoutAccount: string | null; canEdit: boolean }

export async function getCustomerPartsSettings(raw: unknown): Promise<CustomerPartsSettings | null> {
  const garageId = z.string().uuid().safeParse(raw)
  if (!garageId.success) return null
  const viewer = await staff(garageId.data, "garage.settings.manage")
  if (!viewer) return null
  const [row] = await db()
    .select({ accepts: garageSettings.acceptsCustomerParts, fee: garageSettings.customerPartFittingFee, payout: garages.payoutDetailsEncrypted })
    .from(garages)
    .leftJoin(garageSettings, eq(garageSettings.garageId, garages.id))
    .where(eq(garages.id, garageId.data))
    .limit(1)
  return { accepts: row?.accepts ?? true, fittingFee: Number(row?.fee ?? 0n), payoutAccount: maskPayoutAccount(decryptPayoutAccount(row?.payout)), canEdit: true }
}

export async function saveCustomerPartsSettings(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({ garageId: z.string().uuid(), accepts: z.boolean(), fittingFee: z.number().int().min(0).max(10_000_000) }).safeParse(raw)
  if (!parsed.success) return fail("Check the fitting fee")
  const who = await staff(parsed.data.garageId, "garage.settings.manage")
  if (!who) return fail("No permission")
  await db()
    .insert(garageSettings)
    .values({ garageId: parsed.data.garageId, acceptsCustomerParts: parsed.data.accepts, customerPartFittingFee: BigInt(parsed.data.fittingFee) })
    .onConflictDoUpdate({
      target: garageSettings.garageId,
      set: { acceptsCustomerParts: parsed.data.accepts, customerPartFittingFee: BigInt(parsed.data.fittingFee), updatedAt: new Date() },
    })
  await writeAuditLog({ garageId: parsed.data.garageId, actorUserId: who.userId, action: "garage.customer_parts.update", entityType: "garage", entityId: parsed.data.garageId, after: parsed.data }).catch(() => undefined)
  return { ok: true }
}

export async function saveGaragePayoutAccount(raw: unknown): Promise<{ ok: true; account: string } | Fail> {
  const parsed = z.object({ garageId: z.string().uuid(), account: payoutAccountSchema }).safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the payout details")
  const who = await staff(parsed.data.garageId, "garage.settings.manage")
  if (!who) return fail("No permission")
  await db().update(garages).set({ payoutDetailsEncrypted: encryptPayoutAccount(parsed.data.account), updatedAt: new Date() }).where(eq(garages.id, parsed.data.garageId))
  const masked = maskPayoutAccount(parsed.data.account)!
  await writeAuditLog({ garageId: parsed.data.garageId, actorUserId: who.userId, action: "garage.payout_account.update", entityType: "garage", entityId: parsed.data.garageId, after: { account: masked } }).catch(() => undefined)
  const blocked = await db()
    .select({ id: payouts.id })
    .from(payouts)
    .where(and(eq(payouts.recipientType, "garage"), eq(payouts.recipientId, parsed.data.garageId), eq(payouts.status, "needs_attention")))
  for (const b of blocked) await retryPayout(b.id, who.userId).catch(() => undefined)
  return { ok: true, account: masked }
}
