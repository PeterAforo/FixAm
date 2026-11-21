import "server-only"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages, plans, subscriptions } from "@/lib/db/schema"

/** Plan feature check against the garage's active subscription. */
export async function garageHasPlanFeature(garageId: string, feature: string): Promise<boolean> {
  const rows = await db()
    .select({ features: plans.features })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(and(
      eq(subscriptions.garageId, garageId),
      inArray(subscriptions.status, ["trialing", "active", "past_due"]),
    ))
    .limit(1)
  return rows[0]?.features?.includes(feature) ?? false
}

/** Agent renewals require the plan feature; insurance also needs a partner. */
export async function canOfferRenewal(garageId: string, kind: "insurance" | "dvla"): Promise<{ ok: boolean; reason?: string }> {
  if (!(await garageHasPlanFeature(garageId, "agent_renewals"))) {
    return { ok: false, reason: "Your plan doesn't include agent renewals" }
  }
  if (kind === "insurance") {
    const [g] = await db().select({ partnerId: garages.insurancePartnerId })
      .from(garages).where(eq(garages.id, garageId)).limit(1)
    if (!g?.partnerId) {
      return { ok: false, reason: "Link an insurance partner in garage settings first" }
    }
  }
  return { ok: true }
}
