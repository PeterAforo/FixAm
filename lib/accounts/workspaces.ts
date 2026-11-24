import "server-only"
import { cookies } from "next/headers"
import { and, desc, eq, isNull, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import { formatGhPhone } from "@/lib/phone"
import { rankWorkspaces } from "./workspace-menu"
import {
  brokerMembers,
  brokers,
  customers,
  garages,
  memberships,
  portalProfiles,
  towOperatorMembers,
  towOperators,
  riders,
  users,
  vendorMembers,
  vendors,
} from "@/lib/db/schema"

export type WorkspaceType = "admin" | "driver" | "garage" | "vendor" | "broker" | "tow" | "rider"

export type Workspace = {
  key: string // e.g. garage:pitstop-motors
  type: WorkspaceType
  name: string
  subtitle: string
  href: string
  /** Garage staff role (owner, mechanic…) — decides which garage menu items show. */
  role?: string
}

export const WORKSPACE_COOKIE = "fixam_ws"

export const WORKSPACE_LABEL: Record<WorkspaceType, string> = {
  admin: "Platform",
  driver: "My cars",
  garage: "Garage",
  vendor: "Parts shop",
  broker: "Broker",
  tow: "Towing",
  rider: "Rider",
}

const PLATFORM_SLUG = "fixam-platform"

/** Every workspace the user can open, in a stable order. */
export async function listMyWorkspaces(userId: string): Promise<Workspace[]> {
  const [me] = await db()
    .select({ phone: users.phone, fullName: users.fullName, isPlatformAdmin: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  const [garageRows, vendorRows, brokerRows, driverProfile, driverCustomer, towRows, riderRows] = await Promise.all([
    db()
      .select({ slug: garages.slug, name: garages.name, city: garages.city, role: memberships.role, status: garages.status })
      .from(memberships)
      .innerJoin(garages, eq(memberships.garageId, garages.id))
      .where(
        and(
          eq(memberships.userId, userId),
          eq(memberships.status, "active"),
          isNull(memberships.deletedAt),
          isNull(garages.deletedAt),
          ne(garages.slug, PLATFORM_SLUG)
        )
      )
      .orderBy(desc(memberships.createdAt)),
    db()
      .select({ id: vendors.id, name: vendors.businessName, city: vendors.city, status: vendors.status })
      .from(vendorMembers)
      .innerJoin(vendors, eq(vendorMembers.vendorId, vendors.id))
      .where(and(eq(vendorMembers.userId, userId), eq(vendorMembers.status, "active"), isNull(vendors.deletedAt))),
    db()
      .select({ id: brokers.id, name: brokers.businessName, kind: brokers.kind, city: brokers.city })
      .from(brokerMembers)
      .innerJoin(brokers, eq(brokerMembers.brokerId, brokers.id))
      .where(and(eq(brokerMembers.userId, userId), eq(brokerMembers.status, "active"), isNull(brokers.deletedAt))),
    me?.phone
      ? db().select({ fullName: portalProfiles.fullName }).from(portalProfiles).where(eq(portalProfiles.phone, me.phone)).limit(1)
      : Promise.resolve([]),
    me?.phone
      ? db().select({ id: customers.id }).from(customers).where(eq(customers.phone, me.phone)).limit(1)
      : Promise.resolve([]),
    db()
      .select({ id: towOperators.id, name: towOperators.businessName, city: towOperators.city })
      .from(towOperatorMembers)
      .innerJoin(towOperators, eq(towOperatorMembers.operatorId, towOperators.id))
      .where(and(eq(towOperatorMembers.userId, userId), eq(towOperatorMembers.status, "active"), isNull(towOperators.deletedAt))),
    db()
      .select({ id: riders.id, name: riders.fullName, status: riders.status })
      .from(riders)
      .where(and(eq(riders.userId, userId), isNull(riders.deletedAt))),
  ])

  const out: Workspace[] = []
  if (me?.isPlatformAdmin) {
    out.push({
      key: "platform",
      type: "admin",
      name: "FixAm Admin",
      subtitle: "Platform administration",
      href: "/admin",
    })
  }
  for (const g of garageRows) {
    // A user can hold several roles in one garage — show the garage once.
    if (out.some((w) => w.key === `garage:${g.slug}`)) continue
    out.push({
      key: `garage:${g.slug}`,
      type: "garage",
      name: g.name,
      subtitle: g.status === "suspended" ? "Suspended by FixAm" : `${String(g.role).replace(/_/g, " ")}${g.city ? ` · ${g.city}` : ""}`,
      href: `/g/${g.slug}`,
      role: String(g.role),
    })
  }
  for (const v of vendorRows) {
    out.push({
      key: `vendor:${v.id}`,
      type: "vendor",
      name: v.name,
      subtitle: `Parts shop${v.status === "pending" ? " · awaiting approval" : v.city ? ` · ${v.city}` : ""}`,
      href: "/vendor",
    })
  }
  for (const b of brokerRows) {
    const kind = b.kind === "dvla" ? "DVLA agent" : b.kind === "both" ? "Insurance & DVLA" : "Insurance broker"
    out.push({
      key: `broker:${b.id}`,
      type: "broker",
      name: b.name,
      subtitle: `${kind}${b.city ? ` · ${b.city}` : ""}`,
      href: "/broker",
    })
  }
  for (const t of towRows) {
    out.push({ key: `tow:${t.id}`, type: "tow", name: t.name, subtitle: `Towing${t.city ? ` · ${t.city}` : ""}`, href: "/tow" })
  }
  for (const r of riderRows) {
    out.push({
      key: `rider:${r.id}`,
      type: "rider",
      name: r.name ?? "Rider",
      subtitle: `Deliveries${r.status === "pending" ? " · awaiting approval" : r.status === "suspended" ? " · suspended" : ""}`,
      href: "/rider",
    })
  }
  if ((driverProfile as unknown[]).length || (driverCustomer as unknown[]).length) {
    out.push({
      key: "driver",
      type: "driver",
      name: "My cars",
      subtitle: me?.phone ? formatGhPhone(me.phone) : "Driver",
      href: "/portal",
    })
  }
  return out
}


/** The user's saved default workspace, if it's still theirs. */
export async function savedDefaultWorkspace(userId: string, list: Workspace[]): Promise<Workspace | null> {
  const [me] = await db().select({ key: users.defaultWorkspace }).from(users).where(eq(users.id, userId)).limit(1)
  return (me?.key && list.find((w) => w.key === me.key)) || null
}

/**
 * Where to land after sign-in: the saved default → the workspace last used on
 * this device → the highest-ranked one. Never the picker.
 */
export async function landingWorkspace(userId: string, list: Workspace[]): Promise<Workspace | null> {
  if (!list.length) return null
  return (await savedDefaultWorkspace(userId, list)) ?? (await preferredWorkspace(list)) ?? rankWorkspaces(list)[0]!
}

/** The workspace the user last opened (cookie), if it's still theirs. */
export async function preferredWorkspace(list: Workspace[]): Promise<Workspace | null> {
  const jar = await cookies()
  const key = jar.get(WORKSPACE_COOKIE)?.value
  return (key && list.find((w) => w.key === key)) || null
}
