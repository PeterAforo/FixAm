"use client"

import { motion, useReducedMotion, type Variants } from "framer-motion"
import type { ComponentProps } from "react"

export const EASE_SPRING = [0.34, 1.56, 0.64, 1] as const
export const EASE_OUT = [0.22, 1, 0.36, 1] as const

/** Card hover lift — apply via className or wrap with this. */
export const cardLift: Variants = {
  rest: { y: 0 },
  hover: { y: -4, transition: { duration: 0.18, ease: EASE_OUT } },
}

/** Status-change bounce. */
export const statusBounce: Variants = {
  initial: { scale: 0.6, opacity: 0 },
  animate: { scale: 1, opacity: 1, transition: { type: "spring", stiffness: 500, damping: 22 } },
}

/** List-enter stagger container + item. */
export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
}
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE_OUT } },
}

/** Reduced-motion-safe fade (instant opacity only). */
export function FadeIn({
  children,
  className,
  delay = 0,
  ...props
}: ComponentProps<typeof motion.div> & { delay?: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduce ? { duration: 0 } : { duration: 0.2, delay, ease: EASE_OUT }}
      {...props}
    >
      {children}
    </motion.div>
  )
}
