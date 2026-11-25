"use client"

import { useState, useSyncExternalStore, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"

const DESKTOP = "(min-width: 768px)"

function subscribe(cb: () => void) {
  const mq = window.matchMedia(DESKTOP)
  mq.addEventListener("change", cb)
  return () => mq.removeEventListener("change", cb)
}

/** True from `md` up. The server renders as desktop so every section ships open. */
function useIsDesktop() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP).matches,
    () => true
  )
}

/**
 * One numbered legal section. Always open on desktop; on phones it folds
 * to its heading so the page reads like a contents list. Jumping to the
 * section's #id opens it (browsers expand <details> on fragment links).
 */
export function LegalSectionFold({
  id,
  index,
  title,
  children,
}: {
  id: string
  index: number
  title: string
  children: ReactNode
}) {
  const desktop = useIsDesktop()
  const [open, setOpen] = useState(false)
  return (
    <details
      id={id}
      open={desktop || open}
      onToggle={(e) => {
        if (!desktop) setOpen(e.currentTarget.open)
      }}
      className="group scroll-mt-24 border-b border-border py-1 md:border-0 md:py-0"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3 md:pointer-events-none md:cursor-default md:py-0 [&::-webkit-details-marker]:hidden">
        <h2 className="font-display text-lg font-semibold tracking-[-0.02em] md:text-2xl">
          <span className="mr-2 text-muted-foreground">{index}.</span>
          {title}
        </h2>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 md:hidden" />
      </summary>
      <div className="mb-4 mt-1 space-y-4 text-[15px] leading-[1.7] text-[#3F3A34] md:mb-0 md:mt-4 md:text-[16px] md:leading-[1.75] [&_a]:font-medium [&_a]:text-[#B8390A] [&_li]:pl-1 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </details>
  )
}
