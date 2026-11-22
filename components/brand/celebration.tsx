"use client"

import { motion } from "framer-motion"
import { X } from "lucide-react"
import { fireConfetti } from "./confetti"
import { Torq } from "./torq"
import type { TorqPose } from "./torq"
import { Button } from "./button"

/**
 * Milestone celebration card — spec celebrations.triggers.
 * Only for positive moments: payment received, job ready, renewal done,
 * streak milestone, onboarding. Never for refunds/credit notes/errors.
 */
export function Celebration({
  title,
  body,
  pose = "celebrate",
  action,
  onClose,
}: {
  title: string
  body?: string
  pose?: TorqPose
  action?: React.ReactNode
  onClose?: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <motion.div
        initial={{ scale: 0.5, opacity: 0, rotate: -6 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        className="relative w-full max-w-sm rounded-3xl border border-border bg-card p-8 text-center shadow-4"
      >
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 rounded-full p-2 text-muted-foreground hover:bg-surface-muted"
          >
            <X className="size-4" />
          </button>
        ) : null}
        <div className="mx-auto w-fit">
          <Torq pose={pose} size={120} />
        </div>
        <h2 className="mt-4 font-display text-2xl font-semibold tracking-[-0.02em]">{title}</h2>
        {body ? <p className="mt-1 text-sm text-muted-foreground">{body}</p> : null}
        <div className="mt-6 flex justify-center gap-3">
          {action}
          <Button variant="ghost" size="sm" onClick={() => { fireConfetti(); onClose?.() }}>
            Nice!
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
