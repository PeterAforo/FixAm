"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { pop } from "@/lib/motion"

/** Achievement badge — circular, gradient when unlocked, greyscale when locked. */
export function Badge({
  label,
  unlocked = true,
  progress,
  icon,
  size = 64,
  className,
}: {
  label: string
  unlocked?: boolean
  /** 0–1 progress hint for locked badges. */
  progress?: number
  icon?: React.ReactNode
  size?: number
  className?: string
}) {
  return (
    <motion.div
      variants={pop}
      initial="hidden"
      animate="show"
      className={cn("flex flex-col items-center gap-1.5", className)}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-full border-2 border-border font-display font-bold",
          unlocked
            ? "bg-[image:linear-gradient(135deg,#7C6CFF,#5E4DF0)] text-white shadow-pop"
            : "bg-muted text-muted-foreground grayscale"
        )}
        style={{ width: size, height: size }}
        title={label}
      >
        {icon ?? <span className="text-lg">{label.slice(0, 1)}</span>}
      </div>
      <span className={cn("max-w-20 text-center text-[10px] font-bold leading-tight", unlocked ? "text-foreground" : "text-muted-foreground")}>
        {label}
      </span>
      {!unlocked && progress !== undefined ? (
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      ) : null}
    </motion.div>
  )
}
