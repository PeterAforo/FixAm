"use client"

import { useEffect, useState } from "react"
import { CloudOff, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Slim offline banner — spec OfflineBanner.
 * Shows sync queue count while offline; flashes "All synced" briefly on reconnect.
 */
export function OfflineBanner({ queueCount = 0 }: { queueCount?: number }) {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine))
  const [justSynced, setJustSynced] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const on = () => {
      setOnline(true)
      setJustSynced(true)
      timer = setTimeout(() => setJustSynced(false), 2000)
    }
    const off = () => {
      setOnline(false)
      setJustSynced(false)
    }
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
