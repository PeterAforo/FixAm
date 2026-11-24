import "server-only"
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { customers, garages, jobs, portalVehicles, subscriptions, users, vehicles, vendorOrders } from "@/lib/db/schema"
import { adminAttention, approvalsWaiting } from "@/lib/admin/overview"
import type { Workspace } from "./workspaces"

export type WorkspaceStat = { label: string; value: number }

const count = sql<number>`count(*)::int`
const CLOSED_JOBS = ["delivered", "closed", "cancelled", "declined"] as const

/**
 * A few live numbers per workspace for the account picker. Best effort: a
 * failed lookup just shows the workspace without numbers.
 */
export async function workspaceStats(userId: string, list: Workspace[]): Promise<Record<string, WorkspaceStat[]>> {
  const out: Record<string, WorkspaceStat[]> = {}
  const [me] = await db().select({ phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1)

  await Promise.all(
    list.map(async (w) => {
      try {
        if (w.type === "admin") {
          const [[g], [s], a] = await Promise.all([
            db().select({ n: count }).from(garages).where(and(isNull(garages.deletedAt), eq(garages.status, "active"))),
            db().select({ n: count }).from(subscriptions).where(eq(subscriptions.status, "trialing")),
            adminAttention(),
          ])
          out[w.key] = [
            { label: "Active garages", value: g?.n ?? 0 },
            { label: "On trial", value: s?.n ?? 0 },
            { label: "Approvals waiting", value: approvalsWaiting(a) },
          ]
        } else if (w.type === "garage") {
          const slug = w.key.slice("garage:".length)
          const [garage] = await db().select({ id: garages.id }).from(garages).where(eq(garages.slug, slug)).limit(1)
          if (!garage) return
          const [[open], [ready]] = await Promise.all([
            db().select({ n: count }).from(jobs).where(and(eq(jobs.garageId, garage.id), isNull(jobs.deletedAt), notInArray(jobs.status, [...CLOSED_JOBS]))),
            db().select({ n: count }).from(jobs).where(and(eq(jobs.garageId, garage.id), isNull(jobs.deletedAt), eq(jobs.status, "ready"))),
          ])
          out[w.key] = [
            { label: "Open jobs", value: open?.n ?? 0 },
            { label: "Ready to collect", value: ready?.n ?? 0 },
          ]
        } else if (w.type === "vendor") {
          const vendorId = w.key.slice("vendor:".length)
          const [[placed], [moving]] = await Promise.all([
            db().select({ n: count }).from(vendorOrders).where(and(eq(vendorOrders.vendorId, vendorId), eq(vendorOrders.status, "placed"))),
            db().select({ n: count }).from(vendorOrders).where(and(eq(vendorOrders.vendorId, vendorId), inArray(vendorOrders.status, ["accepted", "packed", "out_for_delivery"]))),
          ])
          out[w.key] = [
            { label: "New orders", value: placed?.n ?? 0 },
            { label: "In progress", value: moving?.n ?? 0 },
          ]
        } else if (w.type === "driver" && me?.phone) {
          const phone = me.phone
          const custs = await db().select({ id: customers.id }).from(customers).where(eq(customers.phone, phone))
          const [[own], garageCars] = await Promise.all([
            db().select({ n: count }).from(portalVehicles).where(eq(portalVehicles.phone, phone)),
            custs.length
              ? db().select({ n: count }).from(vehicles).where(and(inArray(vehicles.currentOwnerId, custs.map((c) => c.id)), isNull(vehicles.deletedAt)))
              : Promise.resolve([{ n: 0 }]),
          ])
          out[w.key] = [{ label: "Cars", value: (own?.n ?? 0) + (garageCars[0]?.n ?? 0) }]
        }
      } catch {
        // Numbers are a nice-to-have; never break the picker over them.
      }
    })
  )
  return out
}
