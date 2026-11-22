"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { CloudOff, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange)
  window.addEventListener("offline", onChange)
  return () => {
    window.removeEventListener("online", onChange)
    window.removeEventListener("offline", onChange)
  }
}

/**
 * Slim offline banner — spec OfflineBanner.
 * Shows sync queue count while offline; flashes "All synced" briefly on reconnect.
 */
export function OfflineBanner({ queueCount = 0 }: { queueCount?: number }) {
  // Server snapshot is `true` so SSR/hydration never render the banner;
  // the real navigator.onLine value applies after hydration.
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
  const [justSynced, setJustSynced] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const on = () => {
      setJustSynced(true)
      timer = setTimeout(() => setJustSynced(false), 2000)
    }
    const off = () => setJustSynced(false)
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    return () => {
      window.removeEventListener("online", on)
      window.removeEventListener("offline", off)
      if (timer) clearTimeout(timer)
    }
  }, [])

  if (online && !justSynced) return null

  return (
    <div
      role="status"
      className={cn(
        "flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold",
        online ? "bg-success-subtle text-foreground" : "bg-warning-subtle text-foreground"
      )}
    >
      {online ? (
        <>
          <RefreshCw className="size-3.5" /> All synced
        </>
      ) : (
        <>
          <CloudOff className="size-3.5" />
          Offline{queueCount > 0 ? ` — ${queueCount} change${queueCount === 1 ? "" : "s"} queued` : " — changes will sync"}
        </>
      )}
    </div>
  )
}
