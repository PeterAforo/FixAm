import { cn } from "@/lib/utils"
import { Wrench } from "lucide-react"
import type * as React from "react"

export function EmptyState({
  icon: Icon = Wrench,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-border bg-surface-muted/50 px-6 py-12 text-center",
        className
      )}
    >
      <span className="flex size-16 items-center justify-center rounded-full border-2 border-border bg-card shadow-chunky-sm">
        <Icon className="size-8 text-primary" />
      </span>
      <div className="space-y-1">
        <p className="font-display text-xl font-bold">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}
