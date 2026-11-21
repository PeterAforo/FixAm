import "server-only"
import { and, eq } from "drizzle-orm"
import type { db as DbFn } from "@/lib/db"
import { invoices, paymentAllocations } from "@/lib/db/schema"

type Db = ReturnType<typeof DbFn>

/**
 * Apply a succeeded payment to its invoice: create the allocation and
 * recompute amountPaid / balanceDue / status. Idempotent per payment —
 * callers must only invoke this once per payment (guard on payment.status).
 */
export async function applyPaymentToInvoice(
  database: Db,
  args: { garageId: string; paymentId: string; invoiceId: string; amountPesewas: bigint }
): Promise<{ balanceDue: bigint; fullyPaid: boolean }> {
  const [inv] = await database
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, args.invoiceId), eq(invoices.garageId, args.garageId)))
    .limit(1)
  if (!inv || inv.status === "void" || inv.status === "draft" || inv.status === "written_off") {
    return { balanceDue: inv?.balanceDue ?? 0n, fullyPaid: false }
  }

  // allocation capped at the outstanding balance
  const applied = args.amountPesewas > inv.balanceDue ? inv.balanceDue : args.amountPesewas
  if (applied <= 0n) return { balanceDue: inv.balanceDue, fullyPaid: Number(inv.balanceDue) <= 0 }

  await database.insert(paymentAllocations).values({
    garageId: args.garageId,
    paymentId: args.paymentId,
    invoiceId: inv.id,
    amount: applied,
  })

  const amountPaid = inv.amountPaid + applied
  const balanceDue = inv.balanceDue - applied
  const status =
    balanceDue <= 0n ? "paid" : amountPaid > 0n ? "partially_paid" : inv.status

  await database
    .update(invoices)
    .set({
      amountPaid,
      balanceDue: balanceDue < 0n ? 0n : balanceDue,
      status: status as typeof inv.status,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, inv.id))

  return { balanceDue: balanceDue < 0n ? 0n : balanceDue, fullyPaid: balanceDue <= 0n }
}

/** Reverse an allocation amount from an invoice (refunds). */
export async function reverseInvoicePayment(
  database: Db,
  args: { garageId: string; invoiceId: string; amountPesewas: bigint }
): Promise<void> {
  const [inv] = await database
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, args.invoiceId), eq(invoices.garageId, args.garageId)))
    .limit(1)
  if (!inv || inv.status === "void") return

  const amountPaid = inv.amountPaid - args.amountPesewas < 0n ? 0n : inv.amountPaid - args.amountPesewas
  const balanceDue = inv.balanceDue + args.amountPesewas
  const status = balanceDue >= inv.total ? "issued" : amountPaid > 0n ? "partially_paid" : "issued"

  await database
    .update(invoices)
    .set({
      amountPaid,
      balanceDue,
      status: status as typeof inv.status,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, inv.id))
}
