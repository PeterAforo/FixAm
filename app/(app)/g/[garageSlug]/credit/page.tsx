import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { customers, garages } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { listCreditAccounts } from "@/lib/money/credit"
import { CreditAccountsPanel } from "./credit-accounts-panel"

async function Loader({ params }: { params: Promise<{ garageSlug: string }> }) {
  await connection()
  const { garageSlug } = await params

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/credit`)
  await ensureUser()

  const [garage] = await db().select().from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) redirect("/onboarding")

  const m = await resolveMembership(userId, garage.id)
  if (!m) notFound()
  const principal = { kind: "staff" as const, role: m.role as StaffRole, garageId: garage.id, branchId: m.branchId }
  const canManage = can(principal, "credit_accounts.manage")
  const canView = canManage || can(principal, "invoices.view")
  if (!canView) notFound()

  const [accountsRes, customerRows] = await Promise.all([
    listCreditAccounts({ garageId: garage.id }),
    db().select({ id: customers.id, name: customers.fullName, phone: customers.phone })
      .from(customers).where(eq(customers.garageId, garage.id)).orderBy(customers.fullName).limit(500),
  ])

  return (
    <CreditAccountsPanel
      garageSlug={garageSlug}
      garageId={garage.id}
      canManage={canManage}
      accounts={accountsRes.ok ? accountsRes.data : []}
      customers={customerRows}
    />
  )
}

export default function CreditPage({ params }: { params: Promise<{ garageSlug: string }> }) {
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
