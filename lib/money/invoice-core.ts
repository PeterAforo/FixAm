import { and, eq, inArray } from "drizzle-orm"
import type { db as DbType } from "@/lib/db"
import { garageSettings, invoiceLines, invoices, jobItems } from "@/lib/db/schema"
import { computeTaxTotals, type TaxRule } from "@/lib/domain/tax"
import { uuidv7 } from "@/lib/id"

type Db = ReturnType<typeof DbType>

/** Build a draft invoice from a job's approved items. Shared by the
 *  ready-transition hook and the manual create action. */
export async function buildInvoiceFromJob(
  database: Db,
  args: { garageId: string; jobId: string; branchId: string | null; customerId: string; vehicleId: string; actorUserId?: string | null }
): Promise<{ invoiceId: string } | { error: string }> {
  const items = await database
    .select()
    .from(jobItems)
    .where(and(eq(jobItems.jobId, args.jobId), eq(jobItems.garageId, args.garageId)))

  const billable = items.filter((i) => i.approvalStatus === "approved" || i.approvalStatus === "pending")
  if (billable.length === 0) return { error: "No billable items on this job" }

  const [settings] = await database
    .select({ taxRules: garageSettings.taxRules, pricesIncludeTax: garageSettings.pricesIncludeTax })
    .from(garageSettings)
    .where(eq(garageSettings.garageId, args.garageId))
    .limit(1)

  const rules = ((settings?.taxRules as { code: string; rate_bp: number; applies_to: string[]; compound: boolean; enabled: boolean }[] | null) ?? [])
    .filter((r) => r.enabled !== false)
    .map((r) => ({ code: r.code, rate_bp: Number(r.rate_bp), applies_to: r.applies_to ?? [], compound: !!r.compound, enabled: true })) as TaxRule[]
  const pricesIncludeTax = !!settings?.pricesIncludeTax

  const taxed = computeTaxTotals(
    billable.map((i) => ({
      type: i.type,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      discountAmount: Number(i.discountAmount ?? 0),
      taxCodes: i.taxCodes ?? undefined,
    })),
    rules,
    pricesIncludeTax
  )

  // skip if a live invoice already exists for this job
  const [existing] = await database
    .select({ id: invoices.id, status: invoices.status })
    .from(invoices)
    .where(and(eq(invoices.source, "job"), eq(invoices.sourceId, args.jobId), eq(invoices.garageId, args.garageId), inArray(invoices.status, ["draft", "issued", "partially_paid", "paid"])))
    .limit(1)
  if (existing) return { invoiceId: existing.id }

  const invoiceId = uuidv7()
  await database.insert(invoices).values({
    id: invoiceId,
    garageId: args.garageId,
    branchId: args.branchId,
    source: "job",
    sourceId: args.jobId,
    customerId: args.customerId,
    vehicleId: args.vehicleId,
    status: "draft",
    subtotal: BigInt(taxed.subtotal),
    discountTotal: BigInt(taxed.discountTotal),
    taxTotal: BigInt(taxed.taxTotal),
    total: BigInt(taxed.total),
    balanceDue: BigInt(taxed.total),
  })

  await database.insert(invoiceLines).values(
    billable.map((i, idx) => {
      const t = taxed.lines[idx]!
      return {
        garageId: args.garageId,
        invoiceId,
        type: i.type,
        description: i.description,
        partId: i.partId,
        jobItemId: i.id,
        quantity: String(i.quantity),
        unitPrice: BigInt(i.unitPrice),
        discountAmount: BigInt(i.discountAmount ?? 0),
        taxBreakdown: t.taxes,
        lineTotal: BigInt(t.lineTotal),
        sortOrder: idx,
      }
    })
  )

  return { invoiceId }
}
