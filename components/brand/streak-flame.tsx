"use client"

import { Flame } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

/** Gamification streak flame — grey when the streak is at risk today. */
export function StreakFlame({
  count,
  atRisk = false,
  size = 20,
  className,
}: {
  count: number
  atRisk?: boolean
  size?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <motion.span
        animate={reduce || atRisk ? undefined : { scale: [1, 1.15, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        className="inline-flex"
      >
        <Flame
          size={size}
          className={atRisk ? "text-muted-foreground" : "text-warning"}
          fill={atRisk ? "none" : "currentColor"}
        />
      </motion.span>
      <span className={cn("font-display text-lg font-bold tabular-nums", atRisk ? "text-muted-foreground" : "text-foreground")}>
        {count}
      </span>
      <span className="text-xs font-semibold text-muted-foreground">day{count === 1 ? "" : "s"}</span>
    </span>
  )
}
