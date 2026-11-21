"use client"
import { useState } from "react"
import { Card, CardContent } from "@/components/brand/card"
import { Button } from "@/components/brand/button"

const TIPS = [
  "Press Ctrl+K anywhere to search jobs, customers and vehicles instantly.",
  "Check in a customer from the Check-in page — the tracker link is sent automatically.",
  "Build estimates from job findings, then send the magic link for one-tap approval.",
  "Reminders run nightly — set oil grades and insurance dates on the vehicle profile.",
  "Fleet customers get a consolidated portal view — approve estimates in bulk there.",
  "Mechanics earn badges and streaks — check My stats to see your weekly rank.",
  "Use Pos to sell parts over the counter; stock levels update automatically.",
  "Credit accounts generate monthly statements — find them under Money → Credit.",
]

export function HelpTips() {
  const [dismissed, setDismissed] = useState(false)
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * TIPS.length))
  if (dismissed) return null
  return (
    <Card className="border-2 border-primary/30 bg-primary/5">
      <CardContent className="flex items-start gap-3 p-4">
        <span className="text-2xl" aria-hidden>💡</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Did you know?</p>
          <p className="mt-1 text-sm">{TIPS[idx]}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" onClick={() => setIdx((i) => (i + 1) % TIPS.length)} aria-label="Next tip">→</Button>
          <Button variant="ghost" size="sm" onClick={() => setDismissed(true)} aria-label="Dismiss tips">×</Button>
        </div>
      </CardContent>
    </Card>
  )
}
