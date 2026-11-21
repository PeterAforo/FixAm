import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { and, eq, ilike, isNull, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { customers, garages, vehicles } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { plateSearchKey } from "@/lib/vehicles/plate"
import { VehiclesPanel } from "./vehicles-panel"

async function VehiclesLoader({
  params,
  searchParams,
}: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ q?: string }>
}) {
  await connection()
  const { garageSlug } = await params
  const { q = "" } = await searchParams

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/vehicles`)
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
  if (!can(principal, "vehicles.view")) notFound()

  const term = q.trim()
  const conditions = [
    eq(vehicles.garageId, garage.id),
    isNull(vehicles.deletedAt),
  ]

  if (term) {
    const plateKey = plateSearchKey(term)
    const like = `%${term}%`
    conditions.push(
      or(
        plateKey.length >= 2 ? ilike(vehicles.plateSearch, `%${plateKey}%`) : undefined,
        ilike(vehicles.plateNumber, like),
        ilike(vehicles.make, like),
        ilike(vehicles.model, like),
        ilike(vehicles.vin, like)
      )!
    )
  }

  const rows = await db()
    .select({
      id: vehicles.id,
      plateNumber: vehicles.plateNumber,
      make: vehicles.make,
      model: vehicles.model,
      year: vehicles.year,
      color: vehicles.color,
      colorHex: vehicles.colorHex,
      bodyType: vehicles.bodyType,
      usage: vehicles.usage,
      lastOdometerKm: vehicles.lastOdometerKm,
      lastOdometerAt: vehicles.lastOdometerAt,
      kmPerDay: vehicles.kmPerDay,
      kmPerDayConfidence: vehicles.kmPerDayConfidence,
      ownerName: customers.fullName,
      ownerPhone: customers.phone,
    })
    .from(vehicles)
    .leftJoin(customers, eq(vehicles.currentOwnerId, customers.id))
    .where(and(...conditions))
    .orderBy(vehicles.plateNumber)
    .limit(200)

  const [totals] = await db()
    .select({ total: sql<number>`count(*)::int` })
    .from(vehicles)
    .where(and(eq(vehicles.garageId, garage.id), isNull(vehicles.deletedAt)))

  // Customer options for the create drawer
  const customerOptions = await db()
    .select({ id: customers.id, name: customers.fullName, phone: customers.phone })
    .from(customers)
    .where(and(eq(customers.garageId, garage.id), isNull(customers.deletedAt)))
    .orderBy(customers.fullName)
    .limit(500)

  return (
    <VehiclesPanel
      garageSlug={garageSlug}
      garageId={garage.id}
      vehicles={rows}
      total={totals?.total ?? 0}
      filters={{ q: term }}
      canCreate={can(principal, "vehicles.create")}
      canUpdate={can(principal, "vehicles.update")}
      customerOptions={customerOptions}
    />
  )
}

export default function VehiclesPage({
  params,
  searchParams,
}: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ q?: string }>
}) {
  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <VehiclesLoader params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  )
}
