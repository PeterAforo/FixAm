"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { startSubscriptionCheckout } from "@/lib/billing/pay-actions"
import type { BillingOwner } from "@/lib/billing/owners"

export function SubscriptionPayButton({ owner, label }: { owner: BillingOwner; label: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <span className="inline-flex flex-col items-center gap-2">
      <Button
        size="lg"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const input = "garageId" in owner ? { garageId: owner.garageId } : { ownerKind: owner.kind, ownerId: owner.ownerId }
            const res = await startSubscriptionCheckout(input)
            if (!res.ok) {
              setError(res.error?.message ?? "Could not start checkout")
              return
            }
            window.location.href = res.data.checkoutUrl
          })
        }
      >
        {label}
      </Button>
      {error && <span className="text-sm font-medium text-danger">{error}</span>}
    </span>
  )
}
