"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** Re-renders the page every few seconds while something is still moving. */
export function AutoRefresh({ active, everyMs = 15_000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => router.refresh(), everyMs)
    return () => clearInterval(t)
  }, [active, everyMs, router])
  return null
}
