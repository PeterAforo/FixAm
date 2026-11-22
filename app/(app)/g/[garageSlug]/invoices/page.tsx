import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { and, desc, eq, ilike, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { branches, customers, garages, invoices } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { InvoicesPanel } from "./invoices-panel"

const STATUSES = ["", "draft", "issued", "partially_paid", "paid", "void"] as const

async function InvoicesLoader({
  params,
  searchParams,
}: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  await connection()
  const { garageSlug } = await params
  const { status, q } = await searchParams

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/invoices`)
  await ensureUser()

  const [garage] = await db().select().from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) redirect("/onboarding")

  const m = await resolveMembership(userId, garage.id)
  if (!m) notFound()
  const principal = { kind: "staff" as const, role: m.role as StaffRole, garageId: garage.id, branchId: m.branchId }
  if (!can(principal, "invoices.view")) notFound()

  const statusFilter = STATUSES.includes(status as never) ? (status as string) : ""
  const term = (q ?? "").trim()

  const rows = await db()
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      source: invoices.source,
      total: invoices.total,
      amountPaid: invoices.amountPaid,
      balanceDue: invoices.balanceDue,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      createdAt: invoices.createdAt,
      branchName: branches.name,
      customerName: customers.fullName,
    })
    .from(invoices)
    .leftJoin(branches, eq(invoices.branchId, branches.id))
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .where(and(
      eq(invoices.garageId, garage.id),
      statusFilter ? eq(invoices.status, statusFilter as never) : undefined,
      term
        ? or(
            ilike(invoices.number, `%${term}%`),
            ilike(customers.fullName, `%${term}%`),
            ilike(customers.phone, `%${term}%`),
          )
        : undefined,
    ))
    .orderBy(desc(invoices.createdAt))
    .limit(300)

  const [customerOptions] = await Promise.all([
    db().select({ id: customers.id, name: customers.fullName, phone: customers.phone })
      .from(customers)
      .where(eq(customers.garageId, garage.id))
      .orderBy(customers.fullName)
      .limit(500),
  ])

  const canCreate = can(principal, "invoices.create")
  const canIssue = can(principal, "invoices.issue")
  const canVoid = can(principal, "invoices.void")

  return (
    <InvoicesPanel
      garageSlug={garageSlug}
      garageId={garage.id}
      status={statusFilter}
      q={term}
      canCreate={canCreate}
      canIssue={canIssue}
      canVoid={canVoid}
      customers={customerOptions}
      rows={rows.map((r) => ({
        id: r.id,
        number: r.number,
        status: r.status,
        source: r.source,
        total: Number(r.total),
        amountPaid: Number(r.amountPaid),
        balanceDue: Number(r.balanceDue),
        issueDate: r.issueDate,
        dueDate: r.dueDate,
        createdAt: r.createdAt.toISOString(),
        branchName: r.branchName,
        customerName: r.customerName,
      }))}
    />
  )
}

export default function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-6xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <InvoicesLoader params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  )
}
