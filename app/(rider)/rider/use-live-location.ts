"use client"

import { useEffect, useRef } from "react"
import { shareRiderLocation } from "@/lib/riders/actions"

/** Shares the rider's GPS while `on` — at most every 15 s (jobs show live position). */
export function useRiderLocation(on: boolean) {
  const last = useRef(0)
  useEffect(() => {
    if (!on) return
    if (typeof navigator === "undefined" || !navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (Date.now() - last.current < 15_000) return
        last.current = Date.now()
        void shareRiderLocation({ lat: p.coords.latitude, lng: p.coords.longitude })
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [on])
}
