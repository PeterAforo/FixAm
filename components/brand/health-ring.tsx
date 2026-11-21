"use client"

import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

export type RingStatus = "ok" | "soon" | "overdue" | "unknown"

const RING_TONE: Record<RingStatus, string> = {
  ok: "stroke-success",
  soon: "stroke-warning",
  overdue: "stroke-danger",
  unknown: "stroke-muted-foreground/40",
}

const TRACK = "stroke-muted"

/**
 * Circular progress ring with icon centre — spec HealthRing.
 * Fills gently on first view (spring); static under reduced motion.
 */
export function HealthRing({
  value,
  max = 100,
  status = "unknown",
  size = 56,
  strokeWidth = 6,
  label,
  children,
  className,
}: {
  /** 0–max progress. */
  value: number
  max?: number
  status?: RingStatus
  size?: number
  strokeWidth?: number
  label?: string
  children?: React.ReactNode
  className?: string
}) {
  const reduce = useReducedMotion()
  const pct = Math.max(0, Math.min(1, value / max))
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <motion.svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={label}
        initial={reduce ? false : { rotate: -90 }}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={strokeWidth} className={TRACK} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className={RING_TONE[status]}
          strokeDasharray={c}
          initial={reduce ? { strokeDashoffset: c * (1 - pct) } : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 20 }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <g transform={`translate(${size / 2} ${size / 2})`}>{children}</g>
      </motion.svg>
      {label ? <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span> : null}
    </div>
  )
}
