import type { Transition, Variants } from "framer-motion"

/** Motion presets per specs/ui-ux.json → tokens.motion. */

export const DURATION = {
  instant: 0.08,
  fast: 0.14,
  base: 0.22,
  slow: 0.36,
  page: 0.28,
  celebration: 1.4,
} as const

export const EASE = {
  standard: [0.2, 0, 0, 1],
  emphasized: [0.3, 0, 0, 1.2],
  exit: [0.4, 0, 1, 1],
} as const

export const SPRING = {
  snappy: { type: "spring", stiffness: 500, damping: 34 },
  gentle: { type: "spring", stiffness: 260, damping: 30 },
  bouncy: { type: "spring", stiffness: 520, damping: 18 },
  sheet: { type: "spring", stiffness: 380, damping: 36 },
} as const satisfies Record<string, Transition>

/** Page enter: fade up 8px. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.page, ease: EASE.standard } },
}

/** Stagger container + item (max 6 staggered items per spec). */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.03 } },
}
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.fast, ease: EASE.standard } },
}

/** Bottom sheet / side sheet enter. */
export const sheet: Variants = {
  hidden: { y: "100%", opacity: 0.6 },
  show: { y: 0, opacity: 1, transition: SPRING.sheet },
  exit: { y: "100%", opacity: 0, transition: { duration: DURATION.base, ease: EASE.exit } },
}

/** Playful pop (badges, mascot bubbles, celebration cards). */
export const pop: Variants = {
  hidden: { scale: 0.6, opacity: 0 },
  show: { scale: 1, opacity: 1, transition: SPRING.bouncy },
}

/** Milestone celebration: overshoot + settle. */
export const celebrate: Variants = {
  hidden: { scale: 0.5, opacity: 0, rotate: -6 },
  show: {
    scale: 1,
    opacity: 1,
    rotate: 0,
    transition: { duration: DURATION.celebration / 1000, ease: EASE.emphasized },
  },
}

/** Checklist tick / kanban drop settle. */
export const tick: Variants = {
  hidden: { scale: 0.4, opacity: 0 },
  show: { scale: 1, opacity: 1, transition: SPRING.snappy },
}

/** New-row highlight flash: primary-subtle → transparent, 1.2s. */
export const rowFlash: Variants = {
  hidden: { backgroundColor: "var(--primary-subtle)" },
  show: { backgroundColor: "transparent", transition: { duration: 1.2, ease: "linear" } },
}

/** Press feedback for tappable surfaces. */
export const press = {
  whileTap: { scale: 0.97, transition: SPRING.snappy },
} as const
