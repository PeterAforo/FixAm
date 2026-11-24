import type { ReactNode } from "react"
import { CreditCard } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { ownerBilling, billingAccess, type BillingOwner } from "@/lib/billing/owners"
import { SubscriptionPayButton } from "./pay-button"

/**
 * Wraps a workspace's pages: shows a grace banner while payment is overdue,
 * and a full paywall once the subscription lapses past the grace window.
 */
export async function SubscriptionGate({ owner, children }: { owner: BillingOwner; children: ReactNode }) {
  const b = await ownerBilling(owner)
  if (!b) return <>{children}</>
  const { state, reason } = billingAccess(b)
  if (state === "ok") return <>{children}</>

  if (state === "grace") {
    return (
      <>
        <div className="border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-center text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          Your {b.planName} subscription needs attention ({reason}). You can still work — please renew soon.
        </div>
        {children}
      </>
    )
  }

  const trialEnded = b.status === "trialing" || b.trialEndsAt
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <CreditCard className="size-7" />
          </span>
          <h1 className="mt-4 font-display text-2xl font-bold">
            {trialEnded ? "Your free trial has ended" : "Subscription lapsed"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {b.planName} is GH₵{b.priceGhs.toFixed(2)}/month
            {b.trialEndsAt ? ` · trial ended ${b.trialEndsAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
            {b.currentPeriodEnd ? ` · last paid until ${b.currentPeriodEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
            . Pay to keep your account running — everything is preserved.
          </p>
          <div className="mt-6 flex justify-center">
            <SubscriptionPayButton owner={owner} label={b.priceGhs > 0 ? `Pay GH₵${b.priceGhs.toFixed(2)} now` : "Contact support"} />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Pay by Mobile Money or card. Your subscription activates as soon as payment confirms.</p>
        </CardContent>
      </Card>
    </div>
  )
}
