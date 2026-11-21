import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { and, asc, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  bays,
  branches,
  customers,
  garages,
  jobTemplates,
  memberships,
  users,
  vehicles,
} from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { CheckInPanel } from "./check-in-panel"

async function CheckInLoader({ params }: { params: Promise<{ garageSlug: string }> }) {
  await connection()
  const { garageSlug } = await params

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/check-in`)
  await ensureUser()

  const [garage] = await db().select().from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) redirect("/onboarding")

  const membership = await resolveMembership(userId, garage.id)
  if (!membership) redirect("/onboarding")

  const principal = {
    kind: "staff" as const,
    role: membership.role as StaffRole,
    garageId: garage.id,
    branchId: membership.branchId,
  }
  if (!can(principal, "jobs.create")) notFound()

  const [branchRows, bayRows, customerRows, vehicleRows, templateRows, staffRows] = await Promise.all([
    db().select().from(branches).where(and(eq(branches.garageId, garage.id), isNull(branches.deletedAt))).orderBy(asc(branches.name)),
    db().select().from(bays).where(and(eq(bays.garageId, garage.id), eq(bays.isActive, true), isNull(bays.deletedAt))).orderBy(asc(bays.name)),
    db()
      .select({ id: customers.id, name: customers.fullName, phone: customers.phone, type: customers.type })
      .from(customers)
      .where(and(eq(customers.garageId, garage.id), isNull(customers.deletedAt)))
      .orderBy(customers.fullName)
      .limit(500),
    db()
      .select({
        id: vehicles.id,
        plateNumber: vehicles.plateNumber,
        make: vehicles.make,
        model: vehicles.model,
        year: vehicles.year,
        ownerId: vehicles.currentOwnerId,
        lastOdometerKm: vehicles.lastOdometerKm,
      })
      .from(vehicles)
      .where(and(eq(vehicles.garageId, garage.id), isNull(vehicles.deletedAt)))
      .orderBy(vehicles.plateNumber)
      .limit(1000),
    db()
      .select({
        id: jobTemplates.id,
        name: jobTemplates.name,
        estimatedMinutes: jobTemplates.estimatedMinutes,
        createsDueItemType: jobTemplates.createsDueItemType,
      })
      .from(jobTemplates)
      .where(and(eq(jobTemplates.garageId, garage.id), eq(jobTemplates.isActive, true)))
      .orderBy(jobTemplates.name),
    db()
      .select({
        userId: memberships.userId,
        role: memberships.role,
        branchId: memberships.branchId,
        name: users.fullName,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(and(eq(memberships.garageId, garage.id), eq(memberships.status, "active"))),
  ])

  return (
    <CheckInPanel
      garageSlug={garageSlug}
      garageId={garage.id}
      defaultBranchId={membership.branchId}
      branches={branchRows.map((b) => ({ id: b.id, name: b.name, code: b.code }))}
      bays={bayRows.map((b) => ({ id: b.id, name: b.name, branchId: b.branchId }))}
      customers={customerRows}
      vehicles={vehicleRows.map((v) => ({
        id: v.id,
        plate: v.plateNumber,
        label: `${v.plateNumber} · ${v.make} ${v.model}${v.year ? ` ${v.year}` : ""}`,
        ownerId: v.ownerId,
        lastOdometerKm: v.lastOdometerKm,
      }))}
      templates={templateRows}
      staff={staffRows
        .filter((s): s is typeof s & { userId: string } => Boolean(s.userId))
        .map((s) => ({ userId: s.userId, name: s.name, role: s.role, branchId: s.branchId }))}
    />
  )
}

export default function CheckInPage({ params }: { params: Promise<{ garageSlug: string }> }) {
  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto max-w-4xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <CheckInLoader params={params} />
        </Suspense>
      </div>
    </div>
  )
}
