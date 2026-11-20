import { cn } from "@/lib/utils"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"

export function StatTile({
  label,
  value,
  delta,
  deltaLabel,
  className,
}: {
  label: string
  value: React.ReactNode
  delta?: number
  deltaLabel?: string
  className?: string
}) {
  const positive = (delta ?? 0) >= 0
  return (
    <div
      className={cn(
        "rounded-xl border-2 border-border bg-card p-5 shadow-chunky",
        className
      )}
    >
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-display text-4xl font-extrabold tabular-nums tracking-tight">
        {value}
      </p>
      {delta !== undefined && (
        <p
          className={cn(
            "mt-2 inline-flex items-center gap-1 rounded-pill border-2 border-border px-2.5 py-0.5 text-xs font-bold",
            positive ? "bg-success text-success-foreground" : "bg-danger text-danger-foreground"
          )}
        >
          {positive ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
          {Math.abs(delta)}%{deltaLabel ? ` ${deltaLabel}` : ""}
        </p>
      )}
    </div>
  )
}
