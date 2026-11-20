import { cn } from "@/lib/utils"
import { formatGHS } from "@/lib/money"

export function MoneyText({
  pesewas,
  className,
  tabular = true,
}: {
  pesewas: bigint | number | string
  className?: string
  tabular?: boolean
}) {
  const value = BigInt(pesewas)
  const negative = value < 0n
  return (
    <span
      className={cn(
        "font-mono font-medium",
        tabular && "tabular-nums",
        negative && "text-danger",
        className
      )}
    >
      {formatGHS(value)}
    </span>
  )
}
