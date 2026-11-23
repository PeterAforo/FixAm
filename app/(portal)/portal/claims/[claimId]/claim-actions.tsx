"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { cancelMyClaim } from "@/lib/claims/actions"

export function ClaimActions({ claimId, status }: { claimId: string; status: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  if (!["draft", "submitted"].includes(status)) return null
  return (
    <div className="flex flex-wrap items-center gap-3 pb-8">
      {status === "draft" && (
        <Button asChild><Link href={`/portal/claims/${claimId}/edit`}>Continue claim</Link></Button>
      )}
      <Button
        variant="danger"
        loading={pending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const res = await cancelMyClaim({ claimId })
            if (!res.ok) { setError(res.error); return }
            router.push("/portal/claims")
          })
        }}
      >
        Withdraw claim
      </Button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  )
}
