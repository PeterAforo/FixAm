import type * as React from "react"
import { cn } from "@/lib/utils"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"

export function StatTile({
  label,
  value,
  delta,
  deltaLabel,
  icon,
  hint,
  className,
}: {
  label: string
  value: React.ReactNode
  delta?: number
  deltaLabel?: string
  icon?: React.ReactNode
  hint?: React.ReactNode
  className?: string
}) {
  const positive = (delta ?? 0) >= 0
  return (
    <div
      className={cn(
        "flex flex-col rounded-[18px] border border-border bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        {icon ? (
          <span className="flex size-8 items-center justify-center rounded-lg bg-surface-muted text-muted-foreground [&>svg]:size-4">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-3 font-display text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{value}</p>
      {(delta !== undefined || hint) && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          {delta !== undefined && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold",
                positive ? "bg-success-subtle text-[#4E6B07]" : "bg-danger-subtle text-[#B3122F]"
              )}
            >
              {positive ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {Math.abs(delta)}%
            </span>
          )}
          {deltaLabel || hint}
        </div>
      )}
    </div>
  )
}
