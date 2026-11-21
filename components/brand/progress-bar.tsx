"use client"

import { cn } from "@/lib/utils"

export type InstalmentSegment = {
  /** 0 = unpaid/due, 1 = paid. Values between are partial. */
  paid: number
  overdue?: boolean
}

/**
 * Instalment progress bar — paid volt, due sun, overdue brake segments.
 * Spec ProgressBar for plans/instalments.
 */
export function ProgressBar({
  segments,
  className,
}: {
  segments: InstalmentSegment[]
  className?: string
}) {
  return (
    <div className={cn("flex h-2.5 w-full gap-1 overflow-hidden rounded-full bg-muted", className)} role="img" aria-label="Payment plan progress">
      {segments.map((s, i) => {
        const pct = Math.round(Math.max(0, Math.min(1, s.paid)) * 100)
        return (
          <div key={i} className="relative h-full flex-1 overflow-hidden rounded-full bg-muted-foreground/20">
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full transition-[width] duration-base",
                s.overdue ? "bg-danger" : s.paid >= 1 ? "bg-success" : "bg-warning"
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        )
      })}
    </div>
  )
}
