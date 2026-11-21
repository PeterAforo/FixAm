import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { and, asc, eq, gte, lt, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { bookings, branches, customers, garages, jobTemplates, vehicles } from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { BookingsPanel } from "./bookings-panel"

async function BookingsLoader({
  params,
  searchParams,
}: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ date?: string }>
}) {
  await connection()
  const { garageSlug } = await params
  const { date } = await searchParams

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/bookings`)
  await ensureUser()

  const [garage] = await db().select().from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) redirect("/onboarding")

  const m = await resolveMembership(userId, garage.id)
  if (!m) notFound()
  const principal = { kind: "staff" as const, role: m.role as StaffRole, garageId: garage.id, branchId: m.branchId }
  if (!can(principal, "bookings.manage") && !can(principal, "jobs.view")) notFound()

  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10)
  const from = new Date(`${day}T00:00:00`)
  const to = new Date(from); to.setDate(to.getDate() + 1)

  const [branchRows, tplRows, customerRows, rows] = await Promise.all([
    db().select({ id: branches.id, name: branches.name }).from(branches).where(and(eq(branches.garageId, garage.id), isNull(branches.deletedAt))).orderBy(asc(branches.name)),
    db().select({ id: jobTemplates.id, name: jobTemplates.name }).from(jobTemplates).where(and(eq(jobTemplates.garageId, garage.id), eq(jobTemplates.isActive, true))).orderBy(jobTemplates.name),
    db().select({ id: customers.id, name: customers.fullName }).from(customers).where(and(eq(customers.garageId, garage.id))).orderBy(customers.fullName).limit(500),
    db()
      .select({
        id: bookings.id, branchId: bookings.branchId, branchName: branches.name,
        serviceType: bookings.serviceType, startsAt: bookings.startsAt, endsAt: bookings.endsAt,
        status: bookings.status, source: bookings.source, jobId: bookings.jobId, notes: bookings.notes,
        customerName: customers.fullName, guestName: bookings.guestName, guestPhone: bookings.guestPhone,
        plate: vehicles.plateNumber, make: vehicles.make, model: vehicles.model,
        jobTemplateId: bookings.jobTemplateId,
      })
      .from(bookings)
      .innerJoin(branches, eq(bookings.branchId, branches.id))
      .leftJoin(customers, eq(bookings.customerId, customers.id))
      .leftJoin(vehicles, eq(bookings.vehicleId, vehicles.id))
      .where(and(
        eq(bookings.garageId, garage.id),
        gte(bookings.startsAt, from),
        lt(bookings.startsAt, to),
        sql`${bookings.status} != 'cancelled'`,
      ))
      .orderBy(bookings.startsAt)
      .limit(200),
  ])

  const canManage = can(principal, "bookings.manage")

  return (
    <BookingsPanel
      garageSlug={garageSlug}
      garageId={garage.id}
      day={day}
      canManage={canManage}
      branches={branchRows}
      services={tplRows}
      customers={customerRows}
      bookings={rows.map((b) => ({
        id: b.id,
        branchName: b.branchName,
        customerName: b.customerName ?? b.guestName,
        phone: b.guestPhone,
        serviceType: b.serviceType,
        jobTemplateId: b.jobTemplateId,
        startsAt: b.startsAt.toISOString(),
        endsAt: b.endsAt.toISOString(),
        status: b.status,
        source: b.source,
        jobId: b.jobId,
        vehicleLabel: b.plate ? `${b.plate} ${b.make ?? ""} ${b.model ?? ""}`.trim() : null,
      }))}
    />
  )
}

export default function BookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ garageSlug: string }>
  searchParams: Promise<{ date?: string }>
}) {
  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto max-w-5xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <BookingsLoader params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  )
}
