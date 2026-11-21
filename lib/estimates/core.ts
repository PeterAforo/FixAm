import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  approvals, estimates, jobItems, jobStatusEvents, jobs,
} from "@/lib/db/schema"
import { writeAuditLog, type ActionResult } from "@/lib/actions"
import { garageTaxContext } from "@/lib/money/tax-context"
import { computeTaxTotals } from "@/lib/domain/tax"
import { reserveStock, releaseReservation } from "@/lib/parts/stock"
import { uuidv7 } from "@/lib/id"

/** Shared estimate finalisation — used by magic-link, on-behalf and portal flows. */
export async function finalizeApproval(args: {
  garageId: string
  estimate: typeof estimates.$inferSelect
  approvedIds: string[]
  declinedIds: string[]
  method: "magic_link" | "on_behalf_in_person" | "on_behalf_phone" | "portal"
  onBehalfUserId: string | null
  onBehalfReason: string | null
  signatureName?: string | null
  signaturePath?: string | null
  actorUserId: string | null
  auditAction: string
}): Promise<ActionResult<{ status: string }>> {
  const { estimate: est } = args
  const items = await db()
    .select()
    .from(jobItems)
    .where(and(eq(jobItems.estimateId, est.id), eq(jobItems.garageId, args.garageId)))

  const approvedSet = new Set(args.approvedIds)
  const declinedSet = new Set(args.declinedIds)
  const decided = new Set([...args.approvedIds, ...args.declinedIds])

  const statusFor = (id: string) =>
    approvedSet.has(id) ? "approved" : declinedSet.has(id) ? "declined" : null

  for (const i of items) {
    const s = statusFor(i.id)
    if (s) await db().update(jobItems).set({ approvalStatus: s as "approved" | "declined", updatedAt: new Date() }).where(eq(jobItems.id, i.id))
  }

  // Stock reservation on newly approved part lines; release on newly declined.
  const stockItems = items.filter((i) => i.partId && i.type === "part")
  if (stockItems.length > 0) {
    const [job] = await db().select({ branchId: jobs.branchId }).from(jobs).where(eq(jobs.id, est.jobId)).limit(1)
    if (job) {
      for (const i of stockItems) {
        const qty = Number(i.quantity)
        if (approvedSet.has(i.id) && i.approvalStatus !== "approved") {
          await reserveStock({ garageId: args.garageId, branchId: job.branchId, partId: i.partId!, quantity: qty })
        } else if (declinedSet.has(i.id) && i.approvalStatus === "approved") {
          await releaseReservation({ garageId: args.garageId, branchId: job.branchId, partId: i.partId!, quantity: qty })
        }
      }
    }
  }

  const allApproved = items.every((i) => approvedSet.has(i.id) || (!decided.has(i.id) && i.approvalStatus === "approved"))
  const allDeclined = items.every((i) => declinedSet.has(i.id))
  const newStatus = allApproved ? "approved" : allDeclined ? "declined" : "partially_approved"

  const { rules, pricesIncludeTax } = await garageTaxContext(args.garageId)
  let approvedTotal = 0
  for (const i of items) {
    const isApproved = approvedSet.has(i.id) || i.approvalStatus === "approved"
    if (!isApproved) continue
    const t = computeTaxTotals(
      [{ type: i.type, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), discountAmount: Number(i.discountAmount ?? 0), taxCodes: i.taxCodes ?? undefined }],
      rules,
      pricesIncludeTax
    )
    approvedTotal += t.total
  }

  const [jobRow] = await db().select({ customerId: jobs.customerId }).from(jobs).where(eq(jobs.id, est.jobId)).limit(1)

  await db().insert(approvals).values({
    id: uuidv7(),
    garageId: args.garageId,
    estimateId: est.id,
    method: args.method,
    approvedItemIds: args.approvedIds,
    declinedItemIds: args.declinedIds,
    approvedTotal: BigInt(approvedTotal),
    signaturePath: args.signaturePath ?? null,
    customerId: jobRow?.customerId ?? null,
    onBehalfUserId: args.onBehalfUserId,
    onBehalfReason: args.onBehalfReason,
    createdAt: new Date(),
  })

  await db().update(estimates).set({ status: newStatus as "approved" | "declined" | "partially_approved", updatedAt: new Date() }).where(eq(estimates.id, est.id))

  if (newStatus === "approved" || newStatus === "declined") {
    const [job] = await db().select().from(jobs).where(eq(jobs.id, est.jobId)).limit(1)
    if (job && ["estimate_sent", "approved", "declined"].includes(job.status)) {
      const to = newStatus === "approved" ? "approved" : "declined"
      await db().update(jobs).set({ status: to as "approved" | "declined", updatedAt: new Date() }).where(eq(jobs.id, job.id))
      await db().insert(jobStatusEvents).values({
        id: uuidv7(), garageId: args.garageId, jobId: job.id,
        fromStatus: job.status as never, toStatus: to as never,
        note: args.method === "magic_link" ? "Customer approved estimate" : `Approved via ${args.method}`,
        customerVisible: true, actorUserId: args.actorUserId, createdAt: new Date(),
      })
    }
  }

  await writeAuditLog({
    garageId: args.garageId, actorUserId: args.actorUserId, action: args.auditAction,
    entityType: "estimate", entityId: est.id,
    after: { status: newStatus, approved: args.approvedIds.length, declined: args.declinedIds.length, signer: args.signatureName ?? null },
  })

  return { ok: true, data: { status: newStatus } }
}
