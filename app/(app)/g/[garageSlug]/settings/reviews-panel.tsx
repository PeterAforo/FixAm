"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { Button } from "@/components/brand/button"
import { setGarageReviewStatus } from "@/lib/discovery/coverage-actions"

export type ReviewRow = {
  id: string
  rating: number
  comment: string | null
  status: string
  portalPhone: string
  createdAt: string
}

export function ReviewsPanel({ garageId, reviews }: { garageId: string; reviews: ReviewRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function setStatus(id: string, status: "published" | "hidden") {
    startTransition(async () => {
      const res = await setGarageReviewStatus({ garageId, reviewId: id, status })
      if (res.ok) router.refresh()
    })
  }

  if (!reviews.length) {
    return <p className="mt-3 text-sm text-muted-foreground">No reviews yet — customers can rate you from their portal vehicle page.</p>
  }

  return (
    <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card">
      {reviews.map((r) => (
        <li key={r.id} className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {r.portalPhone.slice(-4).padStart(r.portalPhone.length, "•")} · {r.createdAt}
              </span>
            </p>
            {r.comment && <p className="mt-1 text-sm">{r.comment}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`rounded-pill px-2 py-0.5 text-xs font-semibold ${r.status === "published" ? "bg-success/15 text-success" : "bg-surface-muted text-muted-foreground"}`}>
              {r.status}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setStatus(r.id, r.status === "published" ? "hidden" : "published")}
            >
              {r.status === "published" ? "Hide" : "Publish"}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
