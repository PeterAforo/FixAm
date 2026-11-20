import { cn } from "@/lib/utils"
import { cva } from "class-variance-authority"

/** Job / due-item / payment status → Pit Stop Pop colours (spec design-tokens). */
export type StatusKind =
  | "job" | "due" | "payment"

export type StatusTone =
  | "ok" | "warning" | "danger" | "info" | "neutral" | "accent"

const statusToneVariants = cva(
  "inline-flex items-center gap-1.5 rounded-pill border-2 border-border px-3 py-1 text-xs font-bold uppercase tracking-wide",
  {
    variants: {
      tone: {
        ok: "bg-success text-success-foreground",
        warning: "bg-warning text-warning-foreground",
        danger: "bg-danger text-danger-foreground",
        info: "bg-info text-info-foreground",
        accent: "bg-accent text-accent-foreground",
        neutral: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
)

const STATUS_TONE_MAP: Record<string, StatusTone> = {
  // jobs
  booked: "info",
  in_progress: "accent",
  awaiting_approval: "warning",
  approved: "ok",
  completed: "ok",
  // due items
  upcoming: "info",
  due_soon: "warning",
  overdue: "danger",
  done: "ok",
  // payments
  pending: "warning",
  paid: "ok",
  partial: "accent",
  refunded: "neutral",
  void: "danger",
  failed: "danger",
}

export function statusTone(status: string): StatusTone {
  return STATUS_TONE_MAP[status] ?? "neutral"
}

export function StatusPill({
  status,
  tone,
  className,
  children,
}: {
  status?: string
  tone?: StatusTone
  className?: string
  children?: React.ReactNode
}) {
  const resolved = tone ?? (status ? statusTone(status) : "neutral")
  return (
    <span className={cn(statusToneVariants({ tone: resolved }), className)}>
      {children ?? (status ? status.replace(/_/g, " ") : "status")}
    </span>
  )
}
