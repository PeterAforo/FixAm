import { cn } from "@/lib/utils"

/**
 * Subtle kente-inspired geometric divider — original pattern, used sparingly
 * on marketing and celebration surfaces per spec illustration_style.
 */
export function KenteDivider({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-1.5 w-full overflow-hidden rounded-full" , className)} aria-hidden>
      <span className="flex-1 bg-brake-500" />
      <span className="flex-1 bg-sun-500" />
      <span className="flex-1 bg-volt-500" />
      <span className="flex-1 bg-turbo-500" />
      <span className="flex-1 bg-violet-500" />
      <span className="flex-1 bg-ignition-500" />
    </div>
  )
}
