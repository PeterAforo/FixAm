import "server-only"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  accountSubscriptions,
  brokers,
  garages,
  plans,
  portalProfiles,
  riders,
  subscriptions,
  towOperators,
  users,
  vendors,
} from "@/lib/db/schema"
import { accessState, garageBilling, type AccessState, type GarageBilling } from "./core"
import type { AccountOwnerKind, PlanAudience } from "./account"

export type BillingOwner =
  | { kind: "garage"; garageId: string }
  | { kind: AccountOwnerKind; ownerId: string }

export type OwnerBilling = GarageBilling & {
  owner: BillingOwner
  priceGhs: number
  returnPath: string
  contactPhone: string | null
  contactName: string | null
}

/** Phone/name/return-path for a subscription owner (for checkout + reminders). */
export async function resolveOwnerContact(owner: BillingOwner): Promise<{ phone: string | null; name: string | null; returnPath: string }> {
  if (owner.kind === "garage") {
    const [g] = await db()
      .select({ phone: garages.phone, name: garages.name, slug: garages.slug })
      .from(garages)
      .where(eq(garages.id, owner.garageId))
      .limit(1)
    return { phone: g?.phone ?? null, name: g?.name ?? null, returnPath: `/g/${g?.slug ?? ""}/settings` }
  }
  switch (owner.kind) {
    case "vendor": {
      const [v] = await db().select({ phone: vendors.phone, name: vendors.businessName }).from(vendors).where(eq(vendors.id, owner.ownerId)).limit(1)
      return { phone: v?.phone ?? null, name: v?.name ?? null, returnPath: "/vendor" }
    }
    case "broker": {
      const [b] = await db().select({ phone: brokers.phone, name: brokers.businessName }).from(brokers).where(eq(brokers.id, owner.ownerId)).limit(1)
      return { phone: b?.phone ?? null, name: b?.name ?? null, returnPath: "/broker" }
    }
    case "tow": {
      const [t] = await db().select({ phone: towOperators.phone, name: towOperators.businessName }).from(towOperators).where(eq(towOperators.id, owner.ownerId)).limit(1)
      return { phone: t?.phone ?? null, name: t?.name ?? null, returnPath: "/tow" }
    }
    case "rider": {
      const [r] = await db()
        .select({ phone: users.phone, name: riders.fullName })
        .from(riders)
        .leftJoin(users, eq(riders.userId, users.id))
        .where(eq(riders.id, owner.ownerId))
        .limit(1)
      return { phone: r?.phone ?? null, name: r?.name ?? null, returnPath: "/rider" }
    }
    case "driver": {
      const [p] = await db().select({ fullName: portalProfiles.fullName }).from(portalProfiles).where(eq(portalProfiles.phone, owner.ownerId)).limit(1)
      return { phone: owner.ownerId, name: p?.fullName ?? null, returnPath: "/portal/settings" }
    }
  }
}

/** Unified billing view for any subscription owner. */
export async function ownerBilling(owner: BillingOwner): Promise<OwnerBilling | null> {
  if (owner.kind === "garage") {
    const b = await garageBilling(owner.garageId)
    if (!b) return null
    const contact = await resolveOwnerContact(owner)
    const priceGhs = await planPriceGhs(b.planCode, "garage")
    return { ...b, owner, priceGhs, returnPath: contact.returnPath, contactPhone: contact.phone, contactName: contact.name }
  }
  const [row] = await db()
    .select({
      planCode: plans.code,
      planName: plans.name,
      features: plans.features,
      maxStaff: plans.maxStaff,
      maxBranches: plans.maxBranches,
      priceMonthly: plans.priceMonthly,
      status: accountSubscriptions.status,
      isComplimentary: accountSubscriptions.isComplimentary,
      trialEndsAt: accountSubscriptions.trialEndsAt,
      currentPeriodEnd: accountSubscriptions.currentPeriodEnd,
    })
    .from(accountSubscriptions)
    .innerJoin(plans, eq(accountSubscriptions.planId, plans.id))
    .where(and(eq(accountSubscriptions.ownerKind, owner.kind), eq(accountSubscriptions.ownerId, owner.ownerId)))
    .limit(1)
  if (!row) return null
  const contact = await resolveOwnerContact(owner)
  return {
    owner,
    planCode: row.planCode,
    planName: row.planName,
    features: row.features ?? [],
    maxStaff: row.maxStaff,
    maxBranches: row.maxBranches,
    status: row.status,
    isComplimentary: row.isComplimentary ?? false,
    trialEndsAt: row.trialEndsAt,
    currentPeriodEnd: row.currentPeriodEnd,
    priceGhs: Number(row.priceMonthly) / 100,
    returnPath: contact.returnPath,
    contactPhone: contact.phone,
    contactName: contact.name,
  }
}

export async function planPriceGhs(planCode: string | null, audience: PlanAudience): Promise<number> {
  if (!planCode) return 0
  const [p] = await db()
    .select({ priceMonthly: plans.priceMonthly })
    .from(plans)
    .where(and(eq(plans.code, planCode), eq(plans.audience, audience)))
    .limit(1)
  return p ? Number(p.priceMonthly) / 100 : 0
}

export function billingAccess(b: OwnerBilling | null): { state: AccessState; reason: string | null } {
  return accessState(b)
}
