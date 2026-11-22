import type * as React from "react"
import { cn } from "@/lib/utils"
import { cva } from "class-variance-authority"

/** Status → Pit Stop Pop tones (colour + label; icon via children when needed). */
export type StatusKind =
  | "job" | "due" | "payment"

export type StatusTone =
  | "ok" | "warning" | "danger" | "info" | "neutral" | "accent"

const toneColors: Record<StatusTone, { subtle: string; solid: string }> = {
  ok: { subtle: "bg-success-subtle text-foreground", solid: "bg-success text-success-foreground" },
  warning: { subtle: "bg-warning-subtle text-foreground", solid: "bg-warning text-warning-foreground" },
  danger: { subtle: "bg-danger-subtle text-foreground", solid: "bg-danger text-danger-foreground" },
  info: { subtle: "bg-info-subtle text-foreground", solid: "bg-info text-info-foreground" },
  accent: { subtle: "bg-primary-subtle text-primary", solid: "bg-accent text-accent-foreground" },
  neutral: { subtle: "bg-muted text-muted-foreground", solid: "bg-muted text-muted-foreground" },
}

const statusToneVariants = cva(
  "inline-flex items-center gap-1.5 rounded-pill border font-semibold",
  {
    variants: {
      size: {
        sm: "px-2 py-0.5 text-[11px]",
        md: "px-3 py-1 text-xs",
      },
      variant: {
        subtle: "border-transparent",
        solid: "border border-border",
      },
    },
    defaultVariants: { size: "md", variant: "subtle" },
  }
)

const STATUS_TONE_MAP: Record<string, StatusTone> = {
  // jobs
  booked: "info",
  checked_in: "info",
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
  variant = "subtle",
  size = "md",
  icon,
  className,
  children,
}: {
  status?: string
  tone?: StatusTone
  variant?: "subtle" | "solid"
  size?: "sm" | "md"
  icon?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  const resolved = tone ?? (status ? statusTone(status) : "neutral")
  const colors = toneColors[resolved]
  return (
    <span className={cn(statusToneVariants({ size, variant }), colors[variant], className)}>
      {icon}
      {children ?? (status ? status.replace(/_/g, " ") : "status")}
    </span>
  )
}
