import "server-only"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { stockLevels, stockMovements, stockMovementTypeEnum } from "@/lib/db/schema"
import { uuidv7 } from "@/lib/id"
import { inngest } from "@/lib/inngest/client"

export type StockMovementType = (typeof stockMovementTypeEnum.enumValues)[number]

export type MovementInput = {
  garageId: string
  branchId: string
  partId: string
  /** signed delta for quantity_on_hand */
  quantity: number
  /** movement row type */
  type: StockMovementType
  /** unit cost in pesewas for inbound costing (purchase_receipt/opening_balance/adjustment) */
  unitCost?: bigint | null
  referenceType?: string | null
  referenceId?: string | null
  reason?: string | null
  actorUserId?: string | null
  /** when true, skip the stock_movement insert (internal reserve/issue pairs) */
  skipMovement?: boolean
}

const INBOUND = new Set(["purchase_receipt", "job_return", "pos_return", "transfer_in", "opening_balance", "adjustment"])

/**
 * Apply a stock change: update stock_levels (with weighted-average costing on
 * inbound movements that carry a unit cost) and always write a stock_movement.
 */
export async function applyStockMovement(input: MovementInput) {
  const { garageId, branchId, partId, quantity, type } = input

  const [existing] = await db()
    .select()
    .from(stockLevels)
    .where(and(eq(stockLevels.garageId, garageId), eq(stockLevels.branchId, branchId), eq(stockLevels.partId, partId)))
    .limit(1)

  const oldQty = existing ? Number(existing.quantityOnHand) : 0
  const oldAvg = existing ? Number(existing.averageCost ?? 0) : 0
  const newQty = oldQty + quantity

  let newAvg = oldAvg
  const isInbound = quantity > 0 && INBOUND.has(type)
  if (isInbound && input.unitCost != null && newQty > 0) {
    // WAC in pesewas, scaled by 1000 to keep fractional quantities exact in bigint space
    const scaledOld = BigInt(Math.round(oldQty * 1000)) * BigInt(oldAvg)
    const scaledAdd = BigInt(Math.round(quantity * 1000)) * input.unitCost
    newAvg = Number((scaledOld + scaledAdd) / BigInt(Math.round(newQty * 1000)))
  }

  if (existing) {
    await db().update(stockLevels).set({
      quantityOnHand: String(newQty),
      ...(isInbound && input.unitCost != null ? { averageCost: BigInt(Math.round(newAvg)) } : {}),
      updatedAt: new Date(),
    }).where(eq(stockLevels.id, existing.id))
  } else {
    await db().insert(stockLevels).values({
      id: uuidv7(), garageId, branchId, partId,
      quantityOnHand: String(newQty),
      averageCost: BigInt(Math.round(newAvg)),
    })
  }

  if (!input.skipMovement) {
    await db().insert(stockMovements).values({
      id: uuidv7(), garageId, branchId, partId,
      type,
      quantity: String(quantity),
      unitCost: input.unitCost ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      reason: input.reason ?? null,
      actorUserId: input.actorUserId ?? null,
    })
  }

  // trigger debounced auto-reorder check for this garage (never block the movement)
  try {
    void inngest.send({ name: "fixam/stock.changed", data: { garageId } })
  } catch {
    // inngest unavailable — nightly sweep still covers it
  }
}

/** Reserve stock for an approved estimate/job part (does not change on-hand). */
export async function reserveStock(input: {
  garageId: string; branchId: string; partId: string; quantity: number
}) {
  const [level] = await db().select().from(stockLevels)
    .where(and(eq(stockLevels.garageId, input.garageId), eq(stockLevels.branchId, input.branchId), eq(stockLevels.partId, input.partId)))
    .limit(1)
  const onHand = level ? Number(level.quantityOnHand) : 0
  const reserved = level ? Number(level.quantityReserved) : 0
  if (onHand - reserved < input.quantity) return { ok: false as const, available: onHand - reserved }
  if (level) {
    await db().update(stockLevels).set({
      quantityReserved: String(reserved + input.quantity), updatedAt: new Date(),
    }).where(eq(stockLevels.id, level.id))
  } else {
    await db().insert(stockLevels).values({
      id: uuidv7(), garageId: input.garageId, branchId: input.branchId, partId: input.partId,
      quantityOnHand: "0", quantityReserved: String(input.quantity),
    })
  }
  return { ok: true as const }
}

/** Release a reservation (unused parts returned to available pool). */
export async function releaseReservation(input: {
  garageId: string; branchId: string; partId: string; quantity: number
}) {
  const [level] = await db().select().from(stockLevels)
    .where(and(eq(stockLevels.garageId, input.garageId), eq(stockLevels.branchId, input.branchId), eq(stockLevels.partId, input.partId)))
    .limit(1)
  if (!level) return
  const reserved = Math.max(0, Number(level.quantityReserved) - input.quantity)
  await db().update(stockLevels).set({ quantityReserved: String(reserved), updatedAt: new Date() }).where(eq(stockLevels.id, level.id))
}

/** Issue reserved stock to a job at delivery: on-hand -qty, reserved -qty, movement row. */
export async function issueReservedStock(input: {
  garageId: string; branchId: string; partId: string; quantity: number
  jobId: string; actorUserId?: string | null
}) {
  const [level] = await db().select().from(stockLevels)
    .where(and(eq(stockLevels.garageId, input.garageId), eq(stockLevels.branchId, input.branchId), eq(stockLevels.partId, input.partId)))
    .limit(1)
  if (level) {
    const reserved = Math.max(0, Number(level.quantityReserved) - input.quantity)
    const onHand = Number(level.quantityOnHand) - input.quantity
    await db().update(stockLevels).set({
      quantityOnHand: String(Math.max(0, onHand)),
      quantityReserved: String(reserved),
      updatedAt: new Date(),
    }).where(eq(stockLevels.id, level.id))
  }
  await db().insert(stockMovements).values({
    id: uuidv7(), garageId: input.garageId, branchId: input.branchId, partId: input.partId,
    type: "job_issue", quantity: String(-input.quantity),
    referenceType: "job", referenceId: input.jobId,
    reason: "issued on delivery", actorUserId: input.actorUserId ?? null,
  })
}

/** Return unused reserved stock: reserved -qty (part not fitted). */
export async function returnReservedStock(input: {
  garageId: string; branchId: string; partId: string; quantity: number
}) {
  await releaseReservation(input)
}
