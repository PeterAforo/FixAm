import { NextResponse } from "next/server"
import { asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  branches,
  customers,
  garages,
  invoiceLines,
  invoices,
  vehicles,
} from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { renderInvoicePdf, type InvoicePdfData } from "@/lib/pdf/invoice"

export const runtime = "nodejs"

/** GET /api/pdf/invoices/[id]?format=a4|thermal — authenticated PDF download. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  const userId = await getSessionUserId()
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  await ensureUser()

  const { invoiceId } = await params
  const thermal = new URL(req.url).searchParams.get("format") === "thermal"

  const [inv] = await db().select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1)
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 })

  const m = await resolveMembership(userId, inv.garageId)
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 })

  const [garage, lines, customer, vehicle, branch] = await Promise.all([
    db().select().from(garages).where(eq(garages.id, inv.garageId)).limit(1).then((r) => r[0] ?? null),
    db().select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id)).orderBy(asc(invoiceLines.sortOrder)),
    inv.customerId ? db().select().from(customers).where(eq(customers.id, inv.customerId)).limit(1).then((r) => r[0] ?? null) : Promise.resolve(null),
    inv.vehicleId ? db().select().from(vehicles).where(eq(vehicles.id, inv.vehicleId)).limit(1).then((r) => r[0] ?? null) : Promise.resolve(null),
    inv.branchId ? db().select().from(branches).where(eq(branches.id, inv.branchId)).limit(1).then((r) => r[0] ?? null) : Promise.resolve(null),
  ])
  if (!garage) return NextResponse.json({ error: "not found" }, { status: 404 })

  const data: InvoicePdfData = {
    garage: {
      name: garage.name,
      address: garage.address,
      city: garage.city,
      phone: garage.phone,
      tin: garage.tin,
      invoiceFooter: garage.invoiceFooter,
      brandColor: garage.brandColor,
    },
    branchName: branch?.name ?? null,
    invoice: {
      number: inv.number,
      status: inv.status,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      subtotal: inv.subtotal,
      discountTotal: inv.discountTotal,
      taxTotal: inv.taxTotal,
      total: inv.total,
      depositApplied: inv.depositApplied,
      amountPaid: inv.amountPaid,
      balanceDue: inv.balanceDue,
      notes: inv.notes,
      voidReason: inv.voidReason,
    },
    customer: customer ? { fullName: customer.fullName, phone: customer.phone } : null,
    vehicle: vehicle
      ? { plateNumber: vehicle.plateNumber, make: vehicle.make, model: vehicle.model, year: vehicle.year }
      : null,
    lines: lines.map((l) => ({
      description: l.description,
      quantity: Number(l.quantity),
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
      taxBreakdown: (l.taxBreakdown as { code: string; rate_bp: number }[] | null) ?? null,
    })),
  }

  const pdf = await renderInvoicePdf(data, thermal)
  const filename = `invoice-${inv.number ?? inv.id}${thermal ? "-thermal" : ""}.pdf`
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  })
}
