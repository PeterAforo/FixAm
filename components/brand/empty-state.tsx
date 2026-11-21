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
  className,
}: {
  /** Custom icon (legacy). Ignored when `pose` is set. */
  icon?: React.ComponentType<{ className?: string }>
  /** Torq pose — spec: empty states get a mascot moment. */
  pose?: TorqPose
  title: string
  description?: string
  action?: React.ReactNode
  secondary?: React.ReactNode
  className?: string
}) {
  const Icon = icon
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-border bg-surface-muted/50 px-6 py-12 text-center",
        className
      )}
    >
      {pose ? (
        <Torq pose={pose} size={96} />
      ) : Icon ? (
        <span className="flex size-16 items-center justify-center rounded-full border-2 border-border bg-card shadow-1">
          <Icon className="size-8 text-primary" />
        </span>
      ) : null}
      <div className="space-y-1">
        <p className="font-display text-xl font-bold">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
      {secondary}
    </div>
  )
}
