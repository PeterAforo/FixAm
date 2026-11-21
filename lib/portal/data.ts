import "server-only"
import { createHash, randomBytes } from "crypto"
import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  bookings,
  customers,
  documents,
  dueItems,
  garages,
  insurancePolicies,
  invoices,
  jobs,
  odometerReadings,
  paymentPlans,
  instalments,
  renewalRequests,
  vehicles,
  dvlaRecords,
} from "@/lib/db/schema"

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
const OPEN = ["scheduled", "due_soon", "due", "overdue"] as const
const money = (v: unknown) => (v != null ? Number(v as bigint) : null)

/** All customer records across garages matching this phone. */
async function customerRows(phone: string) {
  return db()
    .select({
      id: customers.id, garageId: customers.garageId, fullName: customers.fullName,
      companyName: customers.companyName, phone: customers.phone, type: customers.type,
      preferredChannels: customers.preferredChannels, whatsappOptIn: customers.whatsappOptIn,
      marketingOptIn: customers.marketingOptIn,
      garageName: garages.name, garageSlug: garages.slug,
    })
    .from(customers)
    .innerJoin(garages, eq(customers.garageId, garages.id))
    .where(and(eq(customers.phone, phone), isNull(customers.deletedAt)))
}

/** Fresh public pay token for an invoice; rotates tokenHash. */
async function invoicePayUrl(invoiceId: string): Promise<string> {
  const token = randomBytes(24).toString("hex")
  await db().update(invoices).set({ tokenHash: sha256(token), updatedAt: new Date() }).where(eq(invoices.id, invoiceId))
  return `${APP_URL()}/t/${token}`
}

/** Fresh /i/ token for an instalment's due item. */
async function instalmentPayUrl(dueItemId: string): Promise<string | null> {
  const token = randomBytes(24).toString("hex")
  const [due] = await db().select({ id: dueItems.id, sourceId: dueItems.sourceId })
    .from(dueItems).where(eq(dueItems.id, dueItemId)).limit(1)
  if (!due?.sourceId) return null
  const [inst] = await db().select({ status: instalments.status }).from(instalments).where(eq(instalments.id, due.sourceId)).limit(1)
  if (!inst || ["paid", "waived"].includes(inst.status)) return null
  await db().update(dueItems).set({ actionTokenHash: sha256(token), updatedAt: new Date() }).where(eq(dueItems.id, dueItemId))
  return `${APP_URL()}/i/${token}`
}

export async function getPortalOverview(phone: string) {
  const custs = await customerRows(phone)
  if (!custs.length) return { customers: [], vehicles: [], dueItems: [], invoices: [], bookings: [], renewals: [], plans: [] }
  const customerIds = custs.map((c) => c.id)
  const garageIds = [...new Set(custs.map((c) => c.garageId))]

  const [vehicleRows, dueRows, invoiceRows, bookingRows, renewalRows, planRows] = await Promise.all([
    db().select({
      id: vehicles.id, garageId: vehicles.garageId, plateNumber: vehicles.plateNumber,
      make: vehicles.make, model: vehicles.model, year: vehicles.year, color: vehicles.color,
      bodyType: vehicles.bodyType, fuelType: vehicles.fuelType,
      lastOdometerKm: vehicles.lastOdometerKm, lastOdometerAt: vehicles.lastOdometerAt,
      ownerId: vehicles.currentOwnerId,
    }).from(vehicles)
      .where(and(inArray(vehicles.currentOwnerId, customerIds), inArray(vehicles.garageId, garageIds), isNull(vehicles.deletedAt)))
      .orderBy(desc(vehicles.createdAt)).limit(50),
    db().select().from(dueItems)
      .where(and(inArray(dueItems.customerId, customerIds), inArray(dueItems.garageId, garageIds), inArray(dueItems.status, [...OPEN])))
      .orderBy(dueItems.effectiveDueDate).limit(50),
    db().select().from(invoices)
      .where(and(inArray(invoices.customerId, customerIds), inArray(invoices.garageId, garageIds), inArray(invoices.status, ["issued", "partially_paid", "paid"])))
      .orderBy(desc(invoices.createdAt)).limit(50),
    db().select({
      id: bookings.id, garageId: bookings.garageId, branchId: bookings.branchId,
      startsAt: bookings.startsAt, endsAt: bookings.endsAt, status: bookings.status,
      serviceType: bookings.serviceType, guestPlate: bookings.guestPlate,
      garageName: garages.name,
    }).from(bookings)
      .innerJoin(garages, eq(bookings.garageId, garages.id))
      .where(and(inArray(bookings.customerId, customerIds), inArray(bookings.garageId, garageIds)))
      .orderBy(desc(bookings.startsAt)).limit(30),
    db().select({
      id: renewalRequests.id, garageId: renewalRequests.garageId, kind: renewalRequests.kind,
      status: renewalRequests.status, number: renewalRequests.number,
      vehicleId: renewalRequests.vehicleId, total: renewalRequests.total,
      garageName: garages.name,
    }).from(renewalRequests)
      .innerJoin(garages, eq(renewalRequests.garageId, garages.id))
      .where(and(inArray(renewalRequests.customerId, customerIds), inArray(renewalRequests.garageId, garageIds)))
      .orderBy(desc(renewalRequests.updatedAt)).limit(30),
    db().select({
      plan: paymentPlans, garageName: garages.name,
    }).from(paymentPlans)
      .innerJoin(garages, eq(paymentPlans.garageId, garages.id))
      .where(and(inArray(paymentPlans.customerId, customerIds), inArray(paymentPlans.garageId, garageIds), eq(paymentPlans.status, "active")))
      .limit(20),
  ])

  // pay links for open invoices
  const invoiceList = await Promise.all(invoiceRows.map(async (inv) => ({
    id: inv.id,
    number: inv.number,
    garageId: inv.garageId,
    garageName: custs.find((c) => c.garageId === inv.garageId)?.garageName ?? "",
    status: inv.status,
    total: money(inv.total),
    balanceDue: money(inv.balanceDue),
    issuedAt: inv.issuedAt?.toISOString() ?? inv.createdAt.toISOString(),
    payUrl: Number(inv.balanceDue) > 0 && ["issued", "partially_paid"].includes(inv.status)
      ? await invoicePayUrl(inv.id) : null,
  })))

  // instalment links via their due items
  const planList = await Promise.all(planRows.map(async ({ plan, garageName }) => {
    const instRows = await db().select().from(instalments).where(eq(instalments.paymentPlanId, plan.id))
      .orderBy(instalments.sequence)
    const dueRowsForPlan = await db().select({ id: dueItems.id, sourceId: dueItems.sourceId })
      .from(dueItems).where(and(eq(dueItems.sourceType, "instalment"), eq(dueItems.garageId, plan.garageId), inArray(dueItems.status, [...OPEN])))
    const dueBySource = new Map(dueRowsForPlan.filter((d) => d.sourceId).map((d) => [d.sourceId!, d.id]))
    return {
      id: plan.id, garageName, invoiceId: plan.invoiceId,
      totalAmount: money(plan.totalAmount), status: plan.status,
      instalments: await Promise.all(instRows.map(async (i) => ({
        id: i.id, sequence: i.sequence, dueDate: i.dueDate,
        amount: money(i.amount), amountPaid: money(i.amountPaid),
        status: i.status,
        payUrl: dueBySource.has(i.id) ? await instalmentPayUrl(dueBySource.get(i.id)!) : null,
      }))),
    }
  }))

  // ring data: current insurance end, earliest DVLA expiry, next service due
  const vIds = vehicleRows.map((v) => v.id)
  const [insEndRows, dvlaEndRows] = vIds.length ? await Promise.all([
    db().select({ vehicleId: insurancePolicies.vehicleId, endDate: insurancePolicies.endDate })
      .from(insurancePolicies)
      .where(and(inArray(insurancePolicies.vehicleId, vIds), eq(insurancePolicies.isCurrent, true))),
    db().select({ vehicleId: dvlaRecords.vehicleId, expiryDate: dvlaRecords.expiryDate })
      .from(dvlaRecords)
      .where(and(inArray(dvlaRecords.vehicleId, vIds), eq(dvlaRecords.isCurrent, true))),
  ]) : [[], []]

  const daysUntil = (d: string | Date | null): number | null => {
    if (!d) return null
    const dt = typeof d === "string" ? new Date(`${d}T00:00:00Z`) : d
    return Math.ceil((dt.getTime() - Date.now()) / 86_400_000)
  }
  const ringFor = (days: number | null): { status: "ok" | "soon" | "overdue" | "unknown"; nextDue?: string } => {
    if (days == null) return { status: "unknown" }
    const nextDue = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
    if (days < 0) return { status: "overdue", nextDue }
    if (days <= 14) return { status: "soon", nextDue }
    return { status: "ok", nextDue }
  }

  const vehicleList = vehicleRows.map((v) => {
    const insEnd = insEndRows.filter((r) => r.vehicleId === v.id).map((r) => r.endDate).sort()[0] ?? null
    const dvlaEnd = dvlaEndRows.filter((r) => r.vehicleId === v.id).map((r) => r.expiryDate).sort()[0] ?? null
    const serviceDue = dueRows
      .filter((d) => d.vehicleId === v.id && (d.type === "oil_change" || d.type === "general_service"))
      .map((d) => d.effectiveDueDate).sort()[0] ?? null
    return {
      ...v,
      garageName: custs.find((c) => c.garageId === v.garageId)?.garageName ?? "",
      lastOdometerKm: v.lastOdometerKm,
      lastOdometerAt: v.lastOdometerAt?.toISOString() ?? null,
      rings: {
        oil: ringFor(daysUntil(serviceDue)),
        insurance: ringFor(daysUntil(insEnd)),
        dvla: ringFor(daysUntil(dvlaEnd)),
        issues: { status: "unknown" as const },
      },
    }
  })

  const dueList = dueRows.map((d) => ({
    id: d.id, type: d.type, title: d.title,
    effectiveDueDate: d.effectiveDueDate, vehicleId: d.vehicleId,
    status: d.status,
    vehicleLabel: (() => {
      const v = vehicleRows.find((x) => x.id === d.vehicleId)
      return v ? [v.make, v.model, v.plateNumber].filter(Boolean).join(" ") : ""
    })(),
  }))

  return {
    customers: custs.map((c) => ({ ...c, garageName: c.garageName })),
    vehicles: vehicleList,
    dueItems: dueList,
    invoices: invoiceList,
    plans: planList,
    bookings: bookingRows.map((b) => ({ ...b, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString() })),
    renewals: renewalRows.map((r) => ({ ...r, total: money(r.total) })),
  }
}

export async function getPortalVehicle(phone: string, vehicleId: string) {
  const custs = await customerRows(phone)
  if (!custs.length) return null
  const customerIds = custs.map((c) => c.id)
  const garageIds = [...new Set(custs.map((c) => c.garageId))]

  const [v] = await db().select().from(vehicles)
    .where(and(
      eq(vehicles.id, vehicleId),
      inArray(vehicles.currentOwnerId, customerIds),
      inArray(vehicles.garageId, garageIds),
      isNull(vehicles.deletedAt),
    )).limit(1)
  if (!v?.currentOwnerId) return null

  const [jobRows, odoRows, docRows, dueRows, insRows, dvlaRows] = await Promise.all([
    db().select({
      id: jobs.id, number: jobs.number, status: jobs.status,
      complaint: jobs.complaint, promisedAt: jobs.promisedAt,
      checkedInAt: jobs.checkedInAt, readyAt: jobs.readyAt, deliveredAt: jobs.deliveredAt,
      createdAt: jobs.createdAt,
    }).from(jobs)
      .where(and(eq(jobs.vehicleId, v.id), eq(jobs.garageId, v.garageId)))
      .orderBy(desc(jobs.createdAt)).limit(30),
    db().select().from(odometerReadings)
      .where(and(eq(odometerReadings.vehicleId, v.id), eq(odometerReadings.garageId, v.garageId)))
      .orderBy(desc(odometerReadings.readAt)).limit(20),
    db().select().from(documents)
      .where(and(eq(documents.vehicleId, v.id), eq(documents.garageId, v.garageId)))
      .orderBy(desc(documents.createdAt)).limit(30),
    db().select().from(dueItems)
      .where(and(eq(dueItems.vehicleId, v.id), inArray(dueItems.status, [...OPEN])))
      .orderBy(dueItems.effectiveDueDate).limit(20),
    db().select().from(insurancePolicies)
      .where(and(eq(insurancePolicies.vehicleId, v.id), eq(insurancePolicies.garageId, v.garageId), eq(insurancePolicies.isCurrent, true)))
      .orderBy(desc(insurancePolicies.endDate)).limit(3),
    db().select().from(dvlaRecords)
      .where(and(eq(dvlaRecords.vehicleId, v.id), eq(dvlaRecords.garageId, v.garageId), eq(dvlaRecords.isCurrent, true)))
      .orderBy(desc(dvlaRecords.expiryDate)).limit(5),
  ])

  const garageName = custs.find((c) => c.garageId === v.garageId)?.garageName ?? ""

  return {
    vehicle: {
      id: v.id, plateNumber: v.plateNumber, make: v.make, model: v.model, year: v.year,
      color: v.color, bodyType: v.bodyType, fuelType: v.fuelType, vin: v.vin,
      lastOdometerKm: v.lastOdometerKm, lastOdometerAt: v.lastOdometerAt?.toISOString() ?? null,
      catalogMakeId: v.catalogMakeId, catalogModelId: v.catalogModelId,
      garageId: v.garageId, garageName,
    },
    jobs: jobRows.map((j) => ({
      ...j,
      createdAt: j.createdAt.toISOString(),
      promisedAt: j.promisedAt?.toISOString() ?? null,
      checkedInAt: j.checkedInAt?.toISOString() ?? null,
      readyAt: j.readyAt?.toISOString() ?? null,
      deliveredAt: j.deliveredAt?.toISOString() ?? null,
    })),
    odometer: odoRows.map((o) => ({ ...o, readAt: o.readAt.toISOString() })),
    documents: docRows.map((d) => ({
      id: d.id, type: d.type, fileName: d.fileName,
      expiresOn: d.expiresOn,
    })),
    dueItems: dueRows.map((d) => ({
      id: d.id, type: d.type, title: d.title, effectiveDueDate: d.effectiveDueDate,
      status: d.status, dueMileageKm: d.dueMileageKm,
    })),
    insurance: insRows.map((p) => ({
      id: p.id, insurerName: p.insurerName, policyType: p.policyType,
      endDate: p.endDate, policyNumber: p.policyNumber,
    })),
    dvla: dvlaRows.map((r) => ({ id: r.id, type: r.type, expiryDate: r.expiryDate, referenceNumber: r.referenceNumber })),
  }
}
