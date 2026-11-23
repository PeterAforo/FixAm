"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

/** Multi-select pill group. */
export function Chips({ options, value, onChange, max }: { options: string[]; value: string[]; onChange: (v: string[]) => void; max?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o)
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : max && value.length >= max ? value : [...value, o])}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors",
              on ? "border-foreground bg-foreground font-medium text-background" : "border-border bg-card text-foreground hover:border-border-strong"
            )}
          >
            {on && <Check className="size-3.5" strokeWidth={3} />}
            {o}
          </button>
        )
      })}
    </div>
  )
}

/** Single-select segmented control. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="grid rounded-xl bg-surface-muted p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 rounded-[9px] text-sm transition-colors",
            value === o.value ? "bg-card font-semibold text-foreground shadow-1" : "font-medium text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
