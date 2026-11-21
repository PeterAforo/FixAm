"use client"

import { cn } from "@/lib/utils"

/** Normalizes a Ghana plate for display: uppercase, keeps hyphen. */
export function normalizePlate(plate: string): string {
  return plate.trim().toUpperCase().replace(/\s+/g, " ")
}

const SIZES = {
  sm: "px-1.5 py-0.5 text-[10px]",
  md: "px-2.5 py-1 text-xs",
  lg: "px-3.5 py-1.5 text-sm",
} as const

/**
 * Ghana-plate inspired chip — spec typography.plate_chip.
 * Original styling (not an official plate reproduction): white bg,
 * carbon border, 3px red/gold/green flag stripe on the left.
 */
export function PlateChip({
  plate,
  size = "md",
  className,
}: {
  plate: string
  size?: keyof typeof SIZES
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-stretch overflow-hidden rounded-md border-[1.5px] border-carbon-800 bg-white font-mono font-semibold uppercase tracking-[0.08em] text-carbon-900",
        SIZES[size],
        className
      )}
    >
      <span className="mr-1.5 flex w-[5px] shrink-0 flex-col" aria-hidden>
        <span className="flex-1 bg-brake-500" />
        <span className="flex-1 bg-sun-400" />
        <span className="flex-1 bg-turbo-500" />
      </span>
      {normalizePlate(plate)}
    </span>
  )
}
