import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"
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
import { formatGHS } from "@/lib/money"
import { PrintButton } from "./print-button"

export async function PrintInvoiceLoader({
  params,
  searchParams,
}: {
  params: Promise<{ invoiceId: string }>
  searchParams: Promise<{ format?: string }>
}) {
  await connection()
  const { invoiceId } = await params
  const { format } = await searchParams
  const thermal = format === "thermal"

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/print/invoices/${invoiceId}`)
  await ensureUser()

  const [inv] = await db().select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1)
  if (!inv) notFound()

  const m = await resolveMembership(userId, inv.garageId)
  if (!m) notFound()

  const [garage, lines, customer, vehicle, branch] = await Promise.all([
    db().select().from(garages).where(eq(garages.id, inv.garageId)).limit(1).then((r) => r[0] ?? null),
    db().select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id)).orderBy(asc(invoiceLines.sortOrder)),
    inv.customerId ? db().select().from(customers).where(eq(customers.id, inv.customerId)).limit(1).then((r) => r[0] ?? null) : Promise.resolve(null),
    inv.vehicleId ? db().select().from(vehicles).where(eq(vehicles.id, inv.vehicleId)).limit(1).then((r) => r[0] ?? null) : Promise.resolve(null),
    inv.branchId ? db().select().from(branches).where(eq(branches.id, inv.branchId)).limit(1).then((r) => r[0] ?? null) : Promise.resolve(null),
  ])
  if (!garage) notFound()

  const brand = garage.brandColor ?? "#0f172a"
  const today = new Date().toLocaleDateString("en-GH", { day: "numeric", month: "long", year: "numeric" })

  return (
    <div className={`mx-auto bg-white p-6 text-neutral-900 ${thermal ? "max-w-[80mm]" : "max-w-[210mm]"}`}>
      <style>{`
        @media print {
          @page { size: ${thermal ? "80mm auto" : "A4"}; margin: 8mm; }
          body { margin: 0; }
          .no-print { display: none !important; }
        }
        body { font-family: ui-sans-serif, system-ui, sans-serif; }
      `}</style>

      <div className="no-print mb-4 flex gap-2">
        <PrintButton />
        <a href={`/print/invoices/${inv.id}${thermal ? "" : "?format=thermal"}`} className="rounded-lg border px-3 py-1.5 text-sm">
          {thermal ? "A4 view" : "80mm view"}
        </a>
        <a
          href={`/api/pdf/invoices/${inv.id}${thermal ? "?format=thermal" : ""}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border px-3 py-1.5 text-sm font-semibold"
        >
          Download PDF
        </a>
      </div>

      {/* Header */}
      <header className="flex items-start justify-between border-b-2 pb-3" style={{ borderColor: brand }}>
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- print view renders arbitrary garage logo URLs */}
          {garage.logoUrl && <img src={garage.logoUrl} alt="" className="h-12 w-12 rounded-lg object-contain" />}
          <div>
            <h1 className="text-xl font-bold" style={{ color: brand }}>{garage.name}</h1>
            <p className="text-xs text-neutral-600">
              {[garage.address, garage.city].filter(Boolean).join(", ")}
              {garage.phone ? ` · ${garage.phone}` : ""}
            </p>
            {garage.tin && <p className="text-xs text-neutral-600">TIN: {garage.tin}</p>}
            {branch && <p className="text-xs text-neutral-600">Branch: {branch.name}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold uppercase tracking-wide" style={{ color: brand }}>
            {inv.status === "void" ? "VOID" : "INVOICE"}
          </p>
          <p className="font-mono text-sm font-semibold">{inv.number ?? "DRAFT"}</p>
          <p className="text-xs text-neutral-600">{today}</p>
        </div>
      </header>

      {/* Bill to */}
      <section className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase text-neutral-500">Bill to</p>
          <p className="font-semibold">{customer?.fullName ?? "Walk-in customer"}</p>
          {customer?.phone && <p>{customer.phone}</p>}
        </div>
        <div className="text-right">
          <p><span className="text-neutral-500">Issued:</span> {inv.issueDate ?? "—"}</p>
          <p><span className="text-neutral-500">Due:</span> {inv.dueDate ?? "On receipt"}</p>
          {vehicle && <p><span className="text-neutral-500">Vehicle:</span> {vehicle.plateNumber} {vehicle.make ?? ""} {vehicle.model ?? ""}</p>}
        </div>
      </section>

      {/* Lines */}
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-y-2 text-left text-xs uppercase" style={{ borderColor: brand }}>
            <th className="py-1.5 pr-2">Item</th>
            <th className="py-1.5 pr-2 text-right">Qty</th>
            {!thermal && <th className="py-1.5 pr-2 text-right">Unit</th>}
            <th className="py-1.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-neutral-200">
              <td className="py-1.5 pr-2">
                {l.description}
                {(() => {
                  const taxes = l.taxBreakdown as { code: string; rate_bp: number }[] | null
                  return taxes?.length ? (
                    <span className="block text-[10px] text-neutral-500">
                      {taxes.map((t) => `${t.code} ${(t.rate_bp / 100).toFixed(0)}%`).join(" · ")}
                    </span>
                  ) : null
                })()}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{Number(l.quantity)}</td>
              {!thermal && <td className="py-1.5 pr-2 text-right tabular-nums">{formatGHS(l.unitPrice)}</td>}
              <td className="py-1.5 text-right tabular-nums">{formatGHS(l.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <section className={`mt-4 ${thermal ? "" : "ml-auto max-w-xs"}`}>
        <dl className="space-y-0.5 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{formatGHS(inv.subtotal)}</dd></div>
          {Number(inv.discountTotal) > 0 && <div className="flex justify-between"><dt>Discount</dt><dd className="tabular-nums">−{formatGHS(inv.discountTotal)}</dd></div>}
          {Number(inv.taxTotal) > 0 && <div className="flex justify-between"><dt>Tax</dt><dd className="tabular-nums">{formatGHS(inv.taxTotal)}</dd></div>}
          <div className="flex justify-between border-t-2 pt-1 font-bold" style={{ borderColor: brand }}>
            <dt>Total</dt><dd className="tabular-nums">{formatGHS(inv.total)}</dd>
          </div>
          {Number(inv.depositApplied ?? 0) > 0 && <div className="flex justify-between"><dt>Deposit applied</dt><dd className="tabular-nums">−{formatGHS(inv.depositApplied ?? 0n)}</dd></div>}
          <div className="flex justify-between"><dt>Paid</dt><dd className="tabular-nums">{formatGHS(inv.amountPaid)}</dd></div>
          <div className="flex justify-between font-bold"><dt>Balance due</dt><dd className="tabular-nums">{formatGHS(inv.balanceDue)}</dd></div>
        </dl>
      </section>

      {inv.notes && <p className="mt-4 text-xs text-neutral-600">Notes: {inv.notes}</p>}
      {garage.invoiceFooter && <p className="mt-4 border-t pt-2 text-center text-xs text-neutral-500">{garage.invoiceFooter}</p>}
      {inv.status === "void" && (
        <p className="mt-2 text-center text-xs font-semibold text-red-600">
          VOID{inv.voidReason ? ` — ${inv.voidReason}` : ""}
        </p>
      )}
      <p className="mt-6 text-center text-[10px] text-neutral-400">Generated by FixAm · {garage.name}</p>
    </div>
  )
}
