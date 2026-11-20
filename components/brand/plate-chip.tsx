import { cn } from "@/lib/utils"

/** Normalizes a Ghana plate for display: uppercase, keeps hyphen. */
export function normalizePlate(plate: string): string {
  return plate.trim().toUpperCase().replace(/\s+/g, " ")
}

export function PlateChip({
  plate,
  className,
}: {
  plate: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border-2 border-midnight-700 bg-plate px-2.5 py-0.5",
        "font-mono text-sm font-bold tracking-widest text-midnight-900",
        className
      )}
    >
      {normalizePlate(plate)}
    </span>
  )
}
