import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { and, eq, ilike, isNull, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { customers, garages } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { normalizeGhPhone } from "@/lib/phone"
import { CustomersPanel } from "./customers-panel"

async function CustomersLoader({
  params,
  searchParams,
}: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ q?: string; type?: string; tag?: string }>
}) {
  await connection()
  const { garageSlug } = await params
  const { q = "", type = "", tag = "" } = await searchParams

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/customers`)
  await ensureUser()

  const [garage] = await db()
    .select()
    .from(garages)
    .where(eq(garages.slug, garageSlug))
    .limit(1)
  if (!garage) redirect("/onboarding")

  const membership = await resolveMembership(userId, garage.id)
  if (!membership) redirect("/onboarding")

  const principal = {
    kind: "staff" as const,
    role: membership.role as StaffRole,
    garageId: garage.id,
    branchId: membership.branchId,
  }
  if (!can(principal, "customers.view")) notFound()

  const term = q.trim()
  const conditions = [
    eq(customers.garageId, garage.id),
    isNull(customers.deletedAt),
  ]

  if (term) {
    const like = `%${term}%`
    const variants = new Set<string>([like])
    const normalized = normalizeGhPhone(term)
    if (normalized) variants.add(`%${normalized.slice(1)}%`) // digits without +
    const digits = term.replace(/\D/g, "")
    if (digits.length >= 3) variants.add(`%${digits}%`)
    conditions.push(
      or(
        ilike(customers.fullName, like),
        ilike(customers.companyName, like),
        ilike(customers.email, like),
        ...[...variants].map((v) => ilike(customers.phone, v))
      )!
    )
  }
  if (type === "individual" || type === "business" || type === "fleet") {
    conditions.push(eq(customers.type, type))
  }
  if (tag.trim()) {
    conditions.push(sql`${customers.tags} @> ARRAY[${tag.trim()}]::text[]`)
  }

  const rows = await db()
    .select({
      id: customers.id,
      fullName: customers.fullName,
      companyName: customers.companyName,
      type: customers.type,
      phone: customers.phone,
      email: customers.email,
      tags: customers.tags,
      preferredChannels: customers.preferredChannels,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .where(and(...conditions))
    .orderBy(customers.fullName)
    .limit(200)

  const [totals] = await db()
    .select({
      total: sql<number>`count(*)::int`,
      fleet: sql<number>`count(*) filter (where ${customers.type} = 'fleet')::int`,
      business: sql<number>`count(*) filter (where ${customers.type} = 'business')::int`,
    })
    .from(customers)
    .where(and(eq(customers.garageId, garage.id), isNull(customers.deletedAt)))

  return (
    <CustomersPanel
      garageSlug={garageSlug}
      garageId={garage.id}
      customers={rows}
      totals={totals ?? { total: 0, fleet: 0, business: 0 }}
      filters={{ q: term, type, tag: tag.trim() }}
      canCreate={can(principal, "customers.create")}
      canUpdate={can(principal, "customers.update")}
    />
  )
}

export default function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ q?: string; type?: string; tag?: string }>
}) {
  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <CustomersLoader params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  )
}
