"use client"

import confetti from "canvas-confetti"
import { useReducedMotion } from "framer-motion"

// Mirrors the Pit Stop Pop brand tokens — canvas-confetti needs literal
// colours (CSS vars are not resolved for canvas fills).
const BRAND_COLORS = ["#FF5A1F", "#00C2B8", "#C6F432", "#FFB020", "#FF3B5C", "#1A1816"]

/** Fire a brand-colour confetti burst. No-op when reduced motion is preferred. */
export function fireConfetti(origin?: { x: number; y: number }) {
  if (typeof window === "undefined") return
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
  confetti({
    particleCount: 90,
    spread: 75,
    origin: origin ?? { x: 0.5, y: 0.6 },
    colors: BRAND_COLORS,
    disableForReducedMotion: true,
  })
}

/** Hook variant for components. */
export function useConfetti() {
  const reduce = useReducedMotion()
  return (origin?: { x: number; y: number }) => {
    if (reduce) return
    fireConfetti(origin)
  }
}
