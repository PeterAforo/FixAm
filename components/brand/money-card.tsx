import { cn } from "@/lib/utils"
import { formatGHS } from "@/lib/money"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"

export type MoneyCardTone = "ignite" | "carbon" | "turbo" | "violet"

const TONES: Record<MoneyCardTone, string> = {
  ignite: "bg-[image:var(--gradient-ignite)]",
  carbon: "bg-[image:var(--gradient-carbon-hero)]",
  turbo: "bg-[image:linear-gradient(135deg,#00C2B8,#008079)]",
  violet: "bg-[image:linear-gradient(135deg,#9B8CFF,#5E4DF0)]",
}

/** Revolut-style gradient money card — spec Card variant "money". */
export function MoneyCard({
  label,
  pesewas,
  delta,
  deltaLabel,
  tone = "ignite",
  sparkline,
  className,
}: {
  label: string
  pesewas: bigint | number
  delta?: number
  deltaLabel?: string
  tone?: MoneyCardTone
  sparkline?: number[]
  className?: string
}) {
  const negative = BigInt(pesewas) < 0n
  const positive = (delta ?? 0) >= 0
  const max = sparkline?.length ? Math.max(...sparkline.map(Math.abs), 1) : 1

  return (
    <div className={cn("relative overflow-hidden rounded-2xl p-5 text-white shadow-3", TONES[tone], className)}>
      <p className="text-xs font-semibold uppercase tracking-widest text-white/70">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold tabular-nums tracking-tight">
        {formatGHS(BigInt(pesewas))}
      </p>
      <div className="mt-2 flex items-end justify-between gap-3">
        {delta !== undefined ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold",
              positive ? "bg-volt-400 text-carbon-900" : "bg-brake-400 text-white"
            )}
          >
            {positive ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {Math.abs(delta)}%{deltaLabel ? ` ${deltaLabel}` : ""}
          </span>
        ) : (
          <span />
        )}
        {sparkline && sparkline.length > 1 ? (
          <svg viewBox="0 0 80 24" className="h-6 w-20 opacity-80" aria-hidden>
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              points={sparkline
                .map((v, i) => `${(i / (sparkline.length - 1)) * 80},${22 - (Math.abs(v) / max) * 20}`)
                .join(" ")}
            />
          </svg>
        ) : null}
      </div>
      {negative ? <span className="sr-only">negative amount</span> : null}
    </div>
  )
}
