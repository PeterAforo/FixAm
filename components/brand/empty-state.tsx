import { cn } from "@/lib/utils"
import { Torq, type TorqPose } from "./torq"
import type * as React from "react"

export function EmptyState({
  icon,
  pose,
  title,
  description,
  action,
  secondary,
  compact = false,
  className,
}: {
  /** Custom icon. Ignored when `pose` is set. */
  icon?: React.ComponentType<{ className?: string }>
  /** Torq pose — reserved for full-page empty states. */
  pose?: TorqPose
  title: string
  description?: string
  action?: React.ReactNode
  secondary?: React.ReactNode
  /** Inline variant for use inside cards. */
  compact?: boolean
  className?: string
}) {
  const Icon = icon
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        compact
          ? "gap-2 px-4 py-8"
          : "gap-4 rounded-[18px] border border-dashed border-border-strong bg-card/60 px-6 py-14",
        className
      )}
    >
      {pose && !compact ? (
        <Torq pose={pose} size={88} />
      ) : Icon ? (
        <span className={cn("flex items-center justify-center rounded-xl bg-surface-muted text-muted-foreground", compact ? "size-10" : "size-12")}>
          <Icon className={compact ? "size-5" : "size-6"} />
        </span>
      ) : null}
      <div className="max-w-sm space-y-1">
        <p className={cn("font-semibold", compact ? "text-sm" : "font-display text-xl tracking-[-0.02em]")}>{title}</p>
        {description && <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {action}
      {secondary}
    </div>
  )
}
