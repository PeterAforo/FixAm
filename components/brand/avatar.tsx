"use client"

import { cn } from "@/lib/utils"

const PALETTE = [
  "bg-ignition-500",
  "bg-turbo-500",
  "bg-violet-500",
  "bg-sun-500",
  "bg-brake-500",
  "bg-volt-600",
]

function hashHue(name: string): number {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % PALETTE.length
}

/** Initials avatar with deterministic warm colour + optional online dot. */
export function Avatar({
  name,
  size = 36,
  online,
  className,
}: {
  name: string
  size?: number
  online?: boolean
  className?: string
}) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "flex items-center justify-center rounded-full font-display font-bold text-white",
          PALETTE[hashHue(name)]
        )}
        style={{ width: size, height: size, fontSize: size * 0.38 }}
        aria-label={name}
      >
        {initials || "?"}
      </span>
      {online !== undefined ? (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border border-card",
            online ? "bg-success" : "bg-muted-foreground/50"
          )}
        />
      ) : null}
    </span>
  )
}
