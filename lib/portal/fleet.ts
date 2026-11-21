import "server-only"
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  creditAccounts, customers, estimates, garages, jobItems, jobs, vehicles,
} from "@/lib/db/schema"
import { garageBilling } from "@/lib/billing/core"

const money = (v: unknown) => (v != null ? Number(v as bigint) : null)

/**
 * Fleet dashboard for portal users whose customer record is type='fleet'.
 * Returns per-customer consolidated views gated by the garage's
 * `fleet_accounts` plan feature.
 */
export async function getFleetDashboard(phone: string) {
  const custRows = await db()
    .select({
      id: customers.id, garageId: customers.garageId, fullName: customers.fullName,
      companyName: customers.companyName, phone: customers.phone, type: customers.type,
      garageName: garages.name, garageSlug: garages.slug,
    })
    .from(customers)
    .innerJoin(garages, eq(customers.garageId, garages.id))
    .where(and(eq(customers.phone, phone), eq(customers.type, "fleet"), isNull(customers.deletedAt)))

  const fleets = []
  for (const c of custRows) {
    const billing = await garageBilling(c.garageId)
    const enabled = billing?.features.includes("fleet_accounts") ?? false

    const vehicleRows = await db()
      .select({
        id: vehicles.id, plateNumber: vehicles.plateNumber, make: vehicles.make,
        model: vehicles.model, year: vehicles.year, lastOdometerKm: vehicles.lastOdometerKm,
      })
      .from(vehicles)
      .where(and(eq(vehicles.currentOwnerId, c.id), eq(vehicles.garageId, c.garageId), isNull(vehicles.deletedAt)))
      .orderBy(vehicles.plateNumber)

    const vehicleIds = vehicleRows.map((v) => v.id)

    // Pending estimates across all fleet vehicles
    const pendingEstimates = vehicleIds.length
      ? await db()
          .select({
            id: estimates.id, number: estimates.number, version: estimates.version,
            total: estimates.total, status: estimates.status,
            vehicleId: jobs.vehicleId, plateNumber: vehicles.plateNumber,
          })
          .from(estimates)
          .innerJoin(jobs, eq(jobs.id, estimates.jobId))
          .innerJoin(vehicles, eq(vehicles.id, jobs.vehicleId))
          .where(and(
            eq(estimates.garageId, c.garageId),
            inArray(jobs.vehicleId, vehicleIds),
            inArray(estimates.status, ["sent", "partially_approved"]),
          ))
          .orderBy(desc(estimates.updatedAt))
          .limit(50)
      : []

    // Consolidated credit position
    const [credit] = await db()
      .select({ balance: creditAccounts.balance, creditLimit: creditAccounts.creditLimit, status: creditAccounts.status })
      .from(creditAccounts)
      .where(and(eq(creditAccounts.garageId, c.garageId), eq(creditAccounts.customerId, c.id)))
      .limit(1)

    // Per-vehicle spend: delivered jobs' item totals
    const spendRows = vehicleIds.length
      ? await db()
          .select({
            vehicleId: jobs.vehicleId,
            jobsCount: sql<number>`count(distinct ${jobs.id})::int`,
            spend: sql<bigint>`coalesce(sum(round(${jobItems.unitPrice} * ${jobItems.quantity}) - coalesce(${jobItems.discountAmount},0)),0)`,
          })
          .from(jobs)
          .innerJoin(jobItems, eq(jobItems.jobId, jobs.id))
          .where(and(
            eq(jobs.garageId, c.garageId),
            inArray(jobs.vehicleId, vehicleIds),
            inArray(jobs.status, ["delivered", "closed"]),
            isNull(jobs.deletedAt),
          ))
          .groupBy(jobs.vehicleId)
      : []
    const spendByVehicle = new Map(spendRows.map((r) => [r.vehicleId, { jobsCount: r.jobsCount, spend: money(r.spend) ?? 0 }]))

    fleets.push({
      customer: c,
      featureEnabled: enabled,
      vehicles: vehicleRows.map((v) => ({
        ...v,
        jobsCount: spendByVehicle.get(v.id)?.jobsCount ?? 0,
        totalSpend: spendByVehicle.get(v.id)?.spend ?? 0,
      })),
      pendingEstimates: pendingEstimates.map((e) => ({
        id: e.id, number: e.number, version: e.version,
        total: money(e.total) ?? 0, status: e.status,
        vehicleId: e.vehicleId, plateNumber: e.plateNumber,
      })),
      credit: credit ? { balance: money(credit.balance) ?? 0, creditLimit: money(credit.creditLimit) ?? 0, status: credit.status } : null,
    })
  }

  return fleets
}
