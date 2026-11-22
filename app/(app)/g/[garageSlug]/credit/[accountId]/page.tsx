import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages, invoices } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { getCreditAccount } from "@/lib/money/credit"
import { CreditAccountPanel } from "./credit-account-panel"

async function Loader({ params }: { params: Promise<{ garageSlug: string; accountId: string }> }) {
  await connection()
  const { garageSlug, accountId } = await params

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/credit/${accountId}`)
  await ensureUser()

  const [garage] = await db().select().from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) redirect("/onboarding")

  const m = await resolveMembership(userId, garage.id)
  if (!m) notFound()
  const principal = { kind: "staff" as const, role: m.role as StaffRole, garageId: garage.id, branchId: m.branchId }
  const canManage = can(principal, "credit_accounts.manage")
  const canCharge = canManage && can(principal, "credit_accounts.exceed_limit")
  const canPay = can(principal, "payments.record")
  if (!canManage && !can(principal, "invoices.view")) notFound()

  const res = await getCreditAccount({ garageId: garage.id, accountId })
  if (!res.ok) notFound()
  const d = res.data

  // issued invoices for this customer not yet on the account — chargeable
  const chargeable = canManage
    ? await db().select({ id: invoices.id, number: invoices.number, balanceDue: invoices.balanceDue })
        .from(invoices)
        .where(and(
          eq(invoices.garageId, garage.id),
          eq(invoices.customerId, d.account.customerId),
          inArray(invoices.status, ["issued", "partially_paid"]),
          isNull(invoices.creditAccountId),
        ))
        .orderBy(invoices.createdAt)
        .limit(100)
    : []

  return (
    <CreditAccountPanel
      garageSlug={garageSlug}
      garageId={garage.id}
      accountId={accountId}
      canManage={canManage}
      canExceed={canCharge}
      canPay={canPay}
      account={d.account}
      customer={d.customer}
      openInvoices={d.openInvoices}
      ageing={d.ageing}
      statements={d.statements}
      chargeable={chargeable.map((i) => ({ id: i.id, number: i.number, balanceDue: Number(i.balanceDue) }))}
    />
  )
}

export default function CreditAccountPage({ params }: { params: Promise<{ garageSlug: string; accountId: string }> }) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-5xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <Loader params={params} />
        </Suspense>
      </div>
    </div>
  )
}
