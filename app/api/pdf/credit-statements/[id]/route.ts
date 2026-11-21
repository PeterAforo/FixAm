import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { creditAccounts, creditStatements, customers, garages } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { renderCreditStatementPdf } from "@/lib/pdf/statements"

/** GET /api/pdf/credit-statements/[id] — authenticated statement PDF download. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId()
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  await ensureUser()

  const { id } = await params
  const [stmt] = await db().select().from(creditStatements).where(eq(creditStatements.id, id)).limit(1)
  if (!stmt) return NextResponse.json({ error: "not found" }, { status: 404 })

  const m = await resolveMembership(userId, stmt.garageId)
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 })

  const [acct] = await db().select().from(creditAccounts).where(eq(creditAccounts.id, stmt.creditAccountId)).limit(1)
  const [garage] = await db().select().from(garages).where(eq(garages.id, stmt.garageId)).limit(1)
  const [cust] = acct
    ? await db().select({ fullName: customers.fullName, phone: customers.phone }).from(customers).where(eq(customers.id, acct.customerId)).limit(1)
    : [null]
  if (!garage || !acct || !cust) return NextResponse.json({ error: "not found" }, { status: 404 })

  const pdf = await renderCreditStatementPdf({
    garage: {
      name: garage.name, address: garage.address, city: garage.city,
      phone: garage.phone, tin: garage.tin, brandColor: garage.brandColor,
    },
    customer: cust,
    account: { paymentTermsDays: acct.paymentTermsDays },
    statement: {
      periodStart: stmt.periodStart,
      periodEnd: stmt.periodEnd,
      openingBalance: stmt.openingBalance,
      charges: stmt.charges,
      payments: stmt.payments,
      closingBalance: stmt.closingBalance,
      ageing: stmt.ageing as { current?: number; d31_60?: number; d61_90?: number; d90_plus?: number } | null,
      sentAt: stmt.sentAt?.toISOString() ?? null,
    },
  })

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="statement-${stmt.periodStart}-${stmt.periodEnd}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
