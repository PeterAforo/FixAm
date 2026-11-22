"use client"
import { useState, useSyncExternalStore } from "react"
import { ChevronRight, Lightbulb, X } from "lucide-react"

const TIPS = [
  "Press Ctrl+K anywhere to search jobs, customers and vehicles instantly.",
  "Check in a customer from the Check-in page — the tracker link is sent automatically.",
  "Build estimates from job findings, then send the link for one-tap approval.",
  "Reminders run nightly — set oil grades and insurance dates on the vehicle profile.",
  "Fleet customers get a consolidated portal view — they can approve estimates in bulk.",
  "Mechanics earn badges and streaks — check My stats to see the weekly rank.",
  "Use POS to sell parts over the counter; stock levels update automatically.",
  "Credit accounts generate monthly statements — find them under Money → Credit accounts.",
]

// Picked once per client bundle; server snapshot is 0 so hydration matches,
// then the random tip swaps in without a mismatch.
const CLIENT_TIP_INDEX = Math.floor(Math.random() * TIPS.length)
const subscribeNoop = () => () => {}

export function HelpTips() {
  const [dismissed, setDismissed] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  const randomIdx = useSyncExternalStore(subscribeNoop, () => CLIENT_TIP_INDEX, () => 0)
  const idx = picked ?? randomIdx
  if (dismissed) return null
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-border bg-card px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
        <Lightbulb className="size-4" />
      </span>
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">Tip · </span>
        <span className="text-muted-foreground">{TIPS[idx]}</span>
      </p>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={() => setPicked((idx + 1) % TIPS.length)}
          aria-label="Next tip"
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-muted hover:text-foreground"
        >
          <ChevronRight className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss tips"
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
