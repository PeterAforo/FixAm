import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  customers,
  documents,
  dueItems,
  garages,
  insurancePartners,
  insurancePolicies,
  dvlaRecords,
  jobs,
  odometerReadings,
  vehicleOwnerships,
  vehicles,
} from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { predictOdometer } from "@/lib/domain/mileage"
import type { RingStatus } from "@/components/brand/vehicle-health-card"
import { computeFixAmScore } from "@/lib/domain/fixam-score"
import { VehicleProfilePanel } from "./vehicle-profile-panel"
import { listCatalogueGrouped } from "@/lib/catalogue"

function daysUntil(date: Date | string | null): number | null {
  if (!date) return null
  const d = typeof date === "string" ? new Date(`${date}T00:00:00Z`) : date
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000)
}

function ringFor(days: number | null): { status: RingStatus; nextDue?: string } {
  if (days == null) return { status: "unknown" }
  const due = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
  if (days < 0) return { status: "overdue", nextDue: due }
  if (days <= 14) return { status: "soon", nextDue: due }
  return { status: "ok", nextDue: due }
}

async function VehicleLoader({
  params,
}: {
  params: Promise<{ garageSlug: string; vehicleId: string }>
}) {
  await connection()
  const { garageSlug, vehicleId } = await params

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/vehicles/${vehicleId}`)
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
  if (!can(principal, "vehicles.view")) notFound()

  const [vehicle] = await db()
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.garageId, garage.id), isNull(vehicles.deletedAt)))
    .limit(1)
  if (!vehicle) notFound()

  const owner = vehicle.currentOwnerId
    ? (await db().select().from(customers).where(eq(customers.id, vehicle.currentOwnerId)).limit(1))[0] ?? null
    : null

  const [
    ownershipRows,
    readingRows,
    docRows,
    openDueItems,
    insuranceRows,
    dvlaRows,
    jobRows,
    allCustomers,
  ] = await Promise.all([
    db()
      .select({
        id: vehicleOwnerships.id,
        fromDate: vehicleOwnerships.fromDate,
        toDate: vehicleOwnerships.toDate,
        isPrimary: vehicleOwnerships.isPrimary,
        customerName: customers.fullName,
      })
      .from(vehicleOwnerships)
      .leftJoin(customers, eq(vehicleOwnerships.customerId, customers.id))
      .where(and(eq(vehicleOwnerships.vehicleId, vehicle.id), eq(vehicleOwnerships.garageId, garage.id)))
      .orderBy(desc(vehicleOwnerships.fromDate)),
    db()
      .select()
      .from(odometerReadings)
      .where(and(eq(odometerReadings.vehicleId, vehicle.id), eq(odometerReadings.garageId, garage.id)))
      .orderBy(desc(odometerReadings.readAt))
      .limit(30),
    db()
      .select()
      .from(documents)
      .where(and(eq(documents.vehicleId, vehicle.id), eq(documents.garageId, garage.id)))
      .orderBy(desc(documents.createdAt))
      .limit(50),
    db()
      .select()
      .from(dueItems)
      .where(
        and(
          eq(dueItems.vehicleId, vehicle.id),
          eq(dueItems.garageId, garage.id),
          inArray(dueItems.status, ["scheduled", "due_soon", "overdue"])
        )
      ),
    db()
      .select({
        policy: insurancePolicies,
        partnerName: insurancePartners.name,
      })
      .from(insurancePolicies)
      .leftJoin(insurancePartners, eq(insurancePolicies.partnerId, insurancePartners.id))
      .where(and(eq(insurancePolicies.vehicleId, vehicle.id), eq(insurancePolicies.garageId, garage.id), eq(insurancePolicies.isCurrent, true)))
      .orderBy(desc(insurancePolicies.endDate))
      .limit(3)
      .then((rows) => rows.map((r) => ({ ...r.policy, partnerName: r.partnerName }))),
    db()
      .select()
      .from(dvlaRecords)
      .where(and(eq(dvlaRecords.vehicleId, vehicle.id), eq(dvlaRecords.garageId, garage.id), eq(dvlaRecords.isCurrent, true)))
      .orderBy(desc(dvlaRecords.expiryDate))
      .limit(5),
    db()
      .select({
        id: jobs.id,
        number: jobs.number,
        status: jobs.status,
        complaint: jobs.complaint,
        promisedAt: jobs.promisedAt,
        createdAt: jobs.createdAt,
      })
      .from(jobs)
      .where(and(eq(jobs.vehicleId, vehicle.id), eq(jobs.garageId, garage.id), isNull(jobs.deletedAt)))
      .orderBy(desc(jobs.createdAt))
      .limit(15),
    db()
      .select({ id: customers.id, name: customers.fullName, phone: customers.phone })
      .from(customers)
      .where(and(eq(customers.garageId, garage.id), isNull(customers.deletedAt)))
      .orderBy(customers.fullName)
      .limit(500),
  ])

  // Health rings
  const oilItem = openDueItems.find((d) => d.type === "oil_change")
  const oilRing = oilItem
    ? ringFor(daysUntil(oilItem.effectiveDueDate))
    : { status: "unknown" as RingStatus }
  const insEnd = insuranceRows[0]?.endDate ?? null
  const insRing = insEnd ? ringFor(daysUntil(insEnd)) : { status: "unknown" as RingStatus }
  const dvlaEnd = dvlaRows
    .map((d) => d.expiryDate)
    .filter(Boolean)
    .sort()[0]
  const dvlaRing = dvlaEnd ? ringFor(daysUntil(dvlaEnd)) : { status: "unknown" as RingStatus }
  const openJobs = jobRows.filter((j) => !["delivered", "closed"].includes(j.status))
  const issueRing: { status: RingStatus; nextDue?: string } =
    openJobs.length === 0
      ? { status: "ok" }
      : { status: openJobs.some((j) => j.status === "quality_check" || j.status === "ready") ? "soon" : "overdue" }

  // FixAm Score — due items not already covered by the four rings
  const RING_TYPES = new Set(["oil_change", "insurance", "roadworthy", "registration_licence", "drivers_licence"])
  const todayISO = new Date().toISOString().slice(0, 10)
  const otherDue = openDueItems.filter((d) => !RING_TYPES.has(d.type))
  const otherDueOverdue = otherDue.filter((d) => d.status === "overdue" || d.effectiveDueDate <= todayISO).length
  const otherDueSoon = otherDue.filter((d) => d.status === "due_soon" || d.status === "due" || d.status === "scheduled").length
  const fixamScore = computeFixAmScore({
    oil: oilRing, insurance: insRing, dvla: dvlaRing, issues: issueRing,
    otherDueSoon, otherDueOverdue,
  })

  // Mileage estimate
  const validReadings = readingRows.filter((r) => r.status === "valid")
  const lastValid = validReadings[0] ?? null
  const kmPerDay = vehicle.kmPerDay != null ? Number(vehicle.kmPerDay) : null
  const predictedOdo =
    lastValid && kmPerDay != null
      ? predictOdometer(
          { km: lastValid.readingKm, at: lastValid.readAt, status: "valid" },
          kmPerDay,
          new Date()
        )
      : null
  const nextMileageDue = openDueItems
    .filter((d) => d.dueMileageKm != null && !["completed", "dismissed"].includes(d.status))
    .sort((a, b) => (a.effectiveDueDate < b.effectiveDueDate ? -1 : 1))[0]

  // Timeline: odometer + ownership + docs + jobs merged
  type TL = { at: Date; kind: string; title: string; detail?: string; tone?: string }
  const timeline: TL[] = []
  for (const r of readingRows) {
    timeline.push({
      at: r.readAt,
      kind: "odometer",
      title: `${r.readingKm.toLocaleString()} km`,
      detail: `${r.source.replace(/_/g, " ")}${r.status === "flagged" ? " · flagged" : r.status === "rejected" ? " · rejected" : ""}`,
      tone: r.status === "flagged" ? "warning" : r.status === "rejected" ? "danger" : "ok",
    })
  }
  for (const o of ownershipRows) {
    timeline.push({
      at: new Date(`${o.fromDate}T00:00:00Z`),
      kind: "ownership",
      title: `Owner: ${o.customerName ?? "—"}`,
      detail: o.toDate ? `until ${o.toDate}` : "current",
    })
  }
  for (const d of docRows) {
    timeline.push({
      at: d.createdAt,
      kind: "document",
      title: `Document: ${d.type.replace(/_/g, " ")}`,
      detail: d.fileName ?? undefined,
    })
  }
  for (const j of jobRows) {
    timeline.push({
      at: j.createdAt,
      kind: "job",
      title: `Job ${j.number}`,
      detail: j.status.replace(/_/g, " "),
      tone: j.status,
    })
  }
  timeline.sort((a, b) => b.at.getTime() - a.at.getTime())

  return (
    <VehicleProfilePanel
      garageSlug={garageSlug}
      garageId={garage.id}
      garageName={garage.name}
      vehicle={{
        id: vehicle.id,
        plateNumber: vehicle.plateNumber,
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        color: vehicle.color,
        colorHex: vehicle.colorHex,
        bodyType: vehicle.bodyType,
        fuelType: vehicle.fuelType,
        transmission: vehicle.transmission,
        engineSize: vehicle.engineSize,
        usage: vehicle.usage,
        notes: vehicle.notes,
        lastOdometerKm: vehicle.lastOdometerKm,
        lastOdometerAt: vehicle.lastOdometerAt?.toISOString() ?? null,
        kmPerDay: vehicle.kmPerDay != null ? Number(vehicle.kmPerDay) : null,
        kmPerDayConfidence: vehicle.kmPerDayConfidence,
      }}
      owner={owner ? { id: owner.id, name: owner.fullName || owner.companyName || owner.phone, phone: owner.phone } : null}
      ownerships={ownershipRows.map((o) => ({
        id: o.id,
        fromDate: o.fromDate,
        toDate: o.toDate,
        isPrimary: o.isPrimary ?? false,
        customerName: o.customerName,
      }))}
      readings={readingRows.map((r) => ({
        id: r.id,
        readingKm: r.readingKm,
        readAt: r.readAt.toISOString(),
        source: r.source,
        status: r.status,
        flagReason: r.flagReason,
        odometerReplaced: r.odometerReplaced,
      }))}
      documents={docRows.map((d) => ({
        id: d.id,
        type: d.type,
        fileName: d.fileName,
        mimeType: d.mimeType,
        expiresOn: d.expiresOn,
        storagePath: d.storagePath,
        createdAt: d.createdAt.toISOString(),
      }))}
      dueItems={openDueItems.map((d) => ({
        id: d.id,
        type: d.type,
        title: d.title,
        effectiveDueDate: d.effectiveDueDate,
        predictedDueDate: d.predictedDueDate,
        dueMileageKm: d.dueMileageKm,
        status: d.status,
      }))}
      insurance={insuranceRows.map((p) => ({
        id: p.id,
        insurerName: p.insurerName,
        partnerName: p.partnerName,
        policyType: p.policyType,
        policyNumber: p.policyNumber,
        stickerNumber: p.stickerNumber,
        startDate: p.startDate,
        endDate: p.endDate,
        premium: p.premium != null ? Number(p.premium) : null,
        isCurrent: p.isCurrent ?? true,
      }))}
      dvla={dvlaRows.map((r) => ({
        id: r.id,
        type: r.type,
        referenceNumber: r.referenceNumber,
        expiryDate: r.expiryDate,
      }))}
      jobs={jobRows}
      timeline={timeline.slice(0, 40)}
      rings={{ oil: oilRing, insurance: insRing, dvla: dvlaRing, issues: issueRing }}
      fixamScore={fixamScore}
      mileage={{
        kmPerDay,
        confidence: (vehicle.kmPerDayConfidence as "high" | "medium" | "low" | null) ?? null,
        predictedOdometer: predictedOdo,
        lastValidKm: lastValid?.readingKm ?? null,
        lastValidAt: lastValid?.readAt.toISOString() ?? null,
        nextDue: nextMileageDue
          ? {
              title: nextMileageDue.title,
              effectiveDueDate: nextMileageDue.effectiveDueDate,
              predictedDueDate: nextMileageDue.predictedDueDate,
              dueMileageKm: nextMileageDue.dueMileageKm,
            }
          : null,
      }}
      customerOptions={allCustomers}
      catalogue={await listCatalogueGrouped()}
      canRecordOdometer={can(principal, "vehicles.odometer.record")}
      canOverrideOdometer={can(principal, "vehicles.odometer.override")}
      canUpdateVehicle={can(principal, "vehicles.update")}
    />
  )
}

export default function VehiclePage({ params }: { params: Promise<{ garageSlug: string; vehicleId: string }> }) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-6xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <VehicleLoader params={params} />
        </Suspense>
      </div>
    </div>
  )
}
