"use client"

import { Check, Clock, Loader2, RotateCcw, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export type SyncState = "queued" | "syncing" | "synced" | "failed"

const META: Record<SyncState, { icon: typeof Clock; cls: string; label: string }> = {
  queued: { icon: Clock, cls: "text-warning", label: "Queued" },
  syncing: { icon: Loader2, cls: "text-info", label: "Syncing" },
  synced: { icon: Check, cls: "text-success", label: "Synced" },
  failed: { icon: XCircle, cls: "text-danger", label: "Failed" },
}

/** Per-item offline sync indicator — spec SyncBadge (mechanic screens). */
export function SyncBadge({ state, onRetry, className }: { state: SyncState; onRetry?: () => void; className?: string }) {
  const { icon: Icon, cls, label } = META[state]
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide", cls, className)}>
      <Icon className={cn("size-3.5", state === "syncing" && "animate-spin")} />
      {label}
      {state === "failed" && onRetry ? (
        <button type="button" onClick={onRetry} aria-label="Retry sync" className="ml-0.5 rounded p-0.5 hover:bg-surface-muted">
          <RotateCcw className="size-3" />
        </button>
      ) : null}
    </span>
  )
}
