"use client"

import { useEffect, useRef, useState } from "react"
import { shareTowLocation } from "@/lib/towing/actions"

/**
 * Shares the operator's location while `on` is true: watches GPS and sends
 * a fix at most every 15 s (drivers see the truck coming on their screen).
 */
export function useLiveLocation(on: boolean) {
  const [state, setState] = useState<"off" | "on" | "denied" | "unavailable">("off")
  const last = useRef(0)
  useEffect(() => {
    if (!on) return
    if (typeof navigator === "undefined" || !navigator.geolocation) { queueMicrotask(() => setState("unavailable")); return }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setState("on")
        if (Date.now() - last.current < 15_000) return
        last.current = Date.now()
        void shareTowLocation({ lat: p.coords.latitude, lng: p.coords.longitude })
      },
      (e) => setState(e.code === e.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    )
    return () => { navigator.geolocation.clearWatch(id); setState("off") }
  }, [on])
  return state
}
