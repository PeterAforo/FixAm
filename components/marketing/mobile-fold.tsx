"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Phone-only tabs for two side-by-side panels. From `md` up both panels
 * show next to each other and the tab buttons disappear.
 */
export function AudienceTabs({
  tabs,
  className,
}: {
  tabs: { label: string; panel: ReactNode }[]
  className?: string
}) {
  const [active, setActive] = useState(0)
  return (
    <div className={className}>
      <div role="tablist" className="mb-4 flex rounded-full border border-border bg-card p-1 md:hidden">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            type="button"
            role="tab"
            aria-selected={active === i}
            onClick={() => setActive(i)}
            className={cn(
              "h-10 flex-1 rounded-full text-sm font-semibold transition-colors",
              active === i ? "bg-foreground text-background" : "text-muted-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-6">
        {tabs.map((t, i) => (
          <div
            key={t.label}
            role="tabpanel"
            className={cn("min-w-0 flex-[1_1_480px]", active === i ? "flex" : "hidden md:flex")}
          >
            {t.panel}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Shows only the first `visible` children on phones, with a button to
 * reveal the rest. Everything shows from `md` up.
 */
export function PhoneShowMore({
  children,
  className,
  label = "See all features",
}: {
  children: ReactNode
  className?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className={cn(className, !open && "max-md:[&>*:nth-child(n+4)]:hidden")}>{children}</div>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-border bg-card text-sm font-semibold md:hidden"
        >
          {label} <ChevronDown className="size-4" />
        </button>
      )}
    </>
  )
}

/**
 * Hides its content behind a button on phones; always open from `md` up.
 */
export function PhoneCollapse({
  children,
  label,
  className,
}: {
  children: ReactNode
  label: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 w-full items-center justify-between rounded-2xl border border-border bg-card px-4 text-[15px] font-semibold md:hidden"
      >
        {label}
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      <div className={cn(!open && "max-md:hidden", open && "max-md:mt-3")}>{children}</div>
    </div>
  )
}
