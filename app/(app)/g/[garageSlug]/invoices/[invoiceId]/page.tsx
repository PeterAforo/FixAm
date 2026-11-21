import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"
import { and, asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  branches,
  customers,
  garages,
  invoiceLines,
  invoices,
  users,
  vehicles,
} from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { InvoiceDetailPanel } from "./invoice-detail-panel"

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ garageSlug: string; invoiceId: string }>
}) {
  await connection()
  const { garageSlug, invoiceId } = await params

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/invoices/${invoiceId}`)
  await ensureUser()

  const [garage] = await db().select().from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) redirect("/onboarding")

  const m = await resolveMembership(userId, garage.id)
  if (!m) notFound()
  const principal = { kind: "staff" as const, role: m.role as StaffRole, garageId: garage.id, branchId: m.branchId }
  if (!can(principal, "invoices.view")) notFound()

  const [inv] = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.garageId, garage.id)))
    .limit(1)
  if (!inv) notFound()

  const [lines, customer, vehicle, branch, issuer] = await Promise.all([
    db().select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id)).orderBy(asc(invoiceLines.sortOrder)),
    inv.customerId
      ? db().select().from(customers).where(eq(customers.id, inv.customerId)).limit(1).then((r) => r[0] ?? null)
      : Promise.resolve(null),
    inv.vehicleId
      ? db().select().from(vehicles).where(eq(vehicles.id, inv.vehicleId)).limit(1).then((r) => r[0] ?? null)
      : Promise.resolve(null),
    inv.branchId
      ? db().select().from(branches).where(eq(branches.id, inv.branchId)).limit(1).then((r) => r[0] ?? null)
      : Promise.resolve(null),
    inv.issuedBy
      ? db().select({ fullName: users.fullName }).from(users).where(eq(users.id, inv.issuedBy)).limit(1).then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ])

  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto max-w-4xl">
        <InvoiceDetailPanel
          garageSlug={garageSlug}
          garageId={garage.id}
          canIssue={can(principal, "invoices.issue")}
          canVoid={can(principal, "invoices.void")}
          canCredit={can(principal, "credit_notes.create")}
          canRecordPayment={can(principal, "payments.record")}
          invoice={{
            id: inv.id,
            number: inv.number,
            status: inv.status,
            source: inv.source,
            sourceId: inv.sourceId,
            issueDate: inv.issueDate,
            dueDate: inv.dueDate,
            subtotal: Number(inv.subtotal),
            discountTotal: Number(inv.discountTotal),
            taxTotal: Number(inv.taxTotal),
            total: Number(inv.total),
            amountPaid: Number(inv.amountPaid),
            balanceDue: Number(inv.balanceDue),
            depositApplied: Number(inv.depositApplied ?? 0),
            notes: inv.notes,
            voidReason: inv.voidReason,
            issuedAt: inv.issuedAt?.toISOString() ?? null,
            createdAt: inv.createdAt.toISOString(),
          }}
          customer={customer ? { fullName: customer.fullName, phone: customer.phone } : null}
          vehicle={vehicle ? { plateNumber: vehicle.plateNumber, make: vehicle.make, model: vehicle.model } : null}
          branchName={branch?.name ?? null}
          issuerName={issuer?.fullName ?? null}
          lines={lines.map((l) => ({
            id: l.id,
            type: l.type,
            description: l.description,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
            discountAmount: Number(l.discountAmount ?? 0),
            lineTotal: Number(l.lineTotal),
            taxes: (l.taxBreakdown as { code: string; rate_bp: number; amount: number }[] | null) ?? [],
          }))}
        />
      </div>
    </div>
  )
}
