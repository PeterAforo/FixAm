"use client"

import { useState, useSyncExternalStore, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"

const DESKTOP = "(min-width: 768px)"

function subscribe(cb: () => void) {
  const mq = window.matchMedia(DESKTOP)
  mq.addEventListener("change", cb)
  return () => mq.removeEventListener("change", cb)
}

/** True from `md` up. The server renders as desktop so content ships open. */
export function useIsDesktop() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP).matches, () => true)
}

/**
 * A page section that is always open on desktop and folds to its heading on
 * phones, so long settings pages read as a short list. Each section keeps
 * its own Save button inside.
 */
export function FoldSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  const desktop = useIsDesktop()
  const [open, setOpen] = useState(false)
  return (
    <details
      open={desktop || open}
      onToggle={(e) => {
        if (!desktop) setOpen(e.currentTarget.open)
      }}
      className="group border-b border-border md:border-0"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 md:pointer-events-none md:min-h-0 md:cursor-default [&::-webkit-details-marker]:hidden">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 md:hidden" />
      </summary>
      <div className="pb-5 md:pb-0">{children}</div>
    </details>
  )
}
