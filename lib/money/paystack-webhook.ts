import "server-only"
import { randomBytes } from "crypto"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { branches, garages, invoices, payments } from "@/lib/db/schema"
import { paymentProvider } from "@/lib/integrations/payments"
import { applyPaymentToInvoice } from "./payments-core"
import { nextDocNumber } from "./sequence"
import { sendPaymentReceipt } from "./payments"
import { writeAuditLog } from "@/lib/actions"

/**
 * Paystack webhook domain handler. The route dedupes by webhook_events;
 * this settles the payment exactly once — replayed charge.success events
 * find status="succeeded" and return early.
 */
export async function handlePaystackEvent(event: {
  event?: string
  data?: { reference?: string; amount?: number; currency?: string }
}) {
  const type = event.event ?? ""
  const reference = event.data?.reference
  if (!reference || !type.startsWith("charge.")) return

  const [p] = await db().select().from(payments).where(eq(payments.paystackReference, reference)).limit(1)
  if (!p) return // not one of ours (e.g. subscription billing — P5)

  if (type === "charge.failed") {
    if (p.status === "pending") {
      await db().update(payments).set({ status: "failed", updatedAt: new Date() }).where(eq(payments.id, p.id))
    }
    return
  }

  if (type !== "charge.success") return
  if (p.status === "succeeded") return // webhook replay — already counted

  // Webhook-only verification: never trust the payload alone.
  const verification = await paymentProvider().verify(reference)
  if (verification.status !== "success") {
    if (verification.status === "failed") {
      await db().update(payments).set({ status: "failed", updatedAt: new Date() }).where(eq(payments.id, p.id))
    }
    return
  }

  // settle: receipt number + allocation + invoice update
  let receiptNumber = p.receiptNumber
  if (!receiptNumber) {
    let branchId = p.branchId
    if (!branchId) {
      const [def] = await db().select({ id: branches.id }).from(branches)
        .where(and(eq(branches.garageId, p.garageId), eq(branches.isDefault, true))).limit(1)
      branchId = def?.id ?? null
    }
    if (!branchId) {
      const [any] = await db().select({ id: branches.id }).from(branches)
        .where(eq(branches.garageId, p.garageId)).limit(1)
      branchId = any?.id ?? null
    }
    if (branchId) receiptNumber = await nextDocNumber(p.garageId, branchId, "RCT", "RCT")
  }

  await db().update(payments).set({
    status: "succeeded",
    paidAt: new Date(),
    receiptNumber,
    externalReference: p.externalReference ?? randomBytes(24).toString("hex"),
    updatedAt: new Date(),
  }).where(eq(payments.id, p.id))

  if (p.invoiceId) {
    if (p.instalmentId) {
      const { settleInstalmentPayment } = await import("./instalments")
      await settleInstalmentPayment({
        garageId: p.garageId,
        instalmentId: p.instalmentId,
        invoiceId: p.invoiceId,
        paymentId: p.id,
        amountPesewas: p.amount,
      })
    } else {
      await applyPaymentToInvoice(db(), {
        garageId: p.garageId,
        paymentId: p.id,
        invoiceId: p.invoiceId,
        amountPesewas: p.amount,
      })
    }
  }

  await writeAuditLog({
    garageId: p.garageId,
    actorUserId: null,
    action: "payment.webhook_settle",
    entityType: "payment",
    entityId: p.id,
    after: { reference, amount: Number(p.amount), receiptNumber },
  })

  await sendPaymentReceipt(p.id).catch(() => undefined)
}

/** Public receipt lookup by token (stored in payments.external_reference). */
export async function getPublicReceipt(token: string) {
  const [p] = await db().select().from(payments).where(eq(payments.externalReference, token)).limit(1)
  if (!p || p.status !== "succeeded") return null
  const [inv] = p.invoiceId
    ? await db().select().from(invoices).where(eq(invoices.id, p.invoiceId)).limit(1)
    : [null]
  const [gr] = await db().select({ name: garages.name }).from(garages)
    .where(eq(garages.id, p.garageId)).limit(1)
  return {
    receiptNumber: p.receiptNumber,
    amount: Number(p.amount),
    method: p.method,
    paidAt: p.paidAt?.toISOString() ?? null,
    invoiceNumber: inv?.number ?? null,
    invoiceBalance: inv ? Number(inv.balanceDue) : null,
    garageName: gr?.name ?? "Garage",
  }
}
