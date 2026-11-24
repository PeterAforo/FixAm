"use server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { accountSubscriptions, subscriptions } from "@/lib/db/schema"
import { writeAuditLog, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { paymentProvider } from "@/lib/integrations/payments"
import { nextPaymentReference } from "@/lib/payments/reference"
import { ownerBilling, resolveOwnerContact, type BillingOwner } from "./owners"
import type { AccountOwnerKind } from "./account"

const ownerSchema = z.union([
  z.object({ garageId: z.string().uuid() }),
  z.object({ ownerKind: z.enum(["driver", "vendor", "broker", "tow", "rider"]), ownerId: z.string().min(1).max(80) }),
])

function toOwner(input: z.infer<typeof ownerSchema>): BillingOwner {
  return "garageId" in input ? { kind: "garage", garageId: input.garageId } : { kind: input.ownerKind as AccountOwnerKind, ownerId: input.ownerId }
}

/**
 * Start a theTeller checkout for one month of the owner's current plan.
 * Stores the pending reference on the subscription; reconcileReference()
 * activates the subscription when the payment confirms.
 */
export async function startSubscriptionCheckout(rawInput: unknown): Promise<ActionResult<{ checkoutUrl: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = ownerSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const owner = toOwner(parsed.data)

  const b = await ownerBilling(owner)
  if (!b) return { ok: false, error: { code: "NOT_FOUND", message: "No subscription found" } }
  if (b.isComplimentary) return { ok: false, error: { code: "CONFLICT", message: "This subscription is complimentary" } }
  if (b.priceGhs <= 0) {
    return { ok: false, error: { code: "CONFLICT", message: "This plan has no price set yet — contact FixAm support" } }
  }

  const reference = await nextPaymentReference()
  const amountPesewas = BigInt(Math.round(b.priceGhs * 100))

  // Record the pending reference before redirecting to checkout.
  if (owner.kind === "garage") {
    const [sub] = await db().select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.garageId, owner.garageId)).limit(1)
    if (!sub) return { ok: false, error: { code: "NOT_FOUND", message: "No subscription found" } }
    await db().update(subscriptions).set({ pendingPaymentReference: reference, updatedAt: new Date() }).where(eq(subscriptions.id, sub.id))
  } else {
    await db()
      .update(accountSubscriptions)
      .set({ pendingPaymentReference: reference, updatedAt: new Date() })
      .where(and(eq(accountSubscriptions.ownerKind, owner.kind), eq(accountSubscriptions.ownerId, owner.ownerId)))
  }

  try {
    const res = await paymentProvider().initializeCheckout({
      reference,
      amountPesewas,
      description: `FixAm ${b.planName} — ${b.contactName ?? "subscription"}`.slice(0, 100),
      phone: b.contactPhone ?? undefined,
      returnPath: `${b.returnPath}?payment=return`,
      metadata: { subscription: "true", ownerKind: owner.kind, ownerId: "garageId" in owner ? owner.garageId : owner.ownerId },
    })
    await writeAuditLog({
      garageId: owner.kind === "garage" ? owner.garageId : null,
      actorUserId: userId,
      action: "subscription.checkout_started",
      entityType: "subscription",
      entityId: reference,
      after: { ownerKind: owner.kind, planCode: b.planCode, amountPesewas: amountPesewas.toString() },
    }).catch(() => {})
    return { ok: true, data: { checkoutUrl: res.authorizationUrl } }
  } catch (e) {
    // Clear the pending ref so the poller doesn't chase a checkout that never opened.
    if (owner.kind === "garage") {
      await db().update(subscriptions).set({ pendingPaymentReference: null, updatedAt: new Date() }).where(eq(subscriptions.garageId, owner.garageId))
    } else {
      await db()
        .update(accountSubscriptions)
        .set({ pendingPaymentReference: null, updatedAt: new Date() })
        .where(and(eq(accountSubscriptions.ownerKind, owner.kind), eq(accountSubscriptions.ownerId, owner.ownerId)))
    }
    return { ok: false, error: { code: "INTERNAL", message: e instanceof Error ? e.message : "Could not start checkout" } }
  }
}

/** Billing summary for the signed-in user's workspace (used by gate + settings). */
export async function getOwnerBilling(rawInput: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const }
  const parsed = ownerSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }
  const b = await ownerBilling(toOwner(parsed.data))
  if (!b) return { ok: true as const, data: null }
  const { accessState } = await import("./core")
  const { state, reason } = accessState(b)
  return {
    ok: true as const,
    data: {
      planCode: b.planCode,
      planName: b.planName,
      priceGhs: b.priceGhs,
      status: b.status,
      isComplimentary: b.isComplimentary,
      trialEndsAt: b.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: b.currentPeriodEnd?.toISOString() ?? null,
      accessState: state,
      accessReason: reason,
      returnPath: b.returnPath,
    },
  }
}

export { resolveOwnerContact }
