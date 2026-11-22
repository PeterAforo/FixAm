import { cn } from "@/lib/utils"
import { CarAvatar, type VehicleType } from "./car-avatar"

export type RingStatus = "ok" | "soon" | "overdue" | "unknown"

const RING_TONES: Record<RingStatus, string> = {
  ok: "stroke-success",
  soon: "stroke-warning",
  overdue: "stroke-danger",
  unknown: "stroke-muted-foreground/40",
}

const RING_TEXT: Record<RingStatus, string> = {
  ok: "text-success",
  soon: "text-warning",
  overdue: "text-danger",
  unknown: "text-muted-foreground",
}

function HealthRing({
  label,
  status,
  nextDue,
}: {
  label: string
  status: RingStatus
  nextDue?: string
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative size-14">
        <svg viewBox="0 0 44 44" className="size-14 -rotate-90">
          <circle
            cx="22" cy="22" r="18" fill="none"
            className="stroke-border-subtle"
            strokeWidth="5"
          />
          <circle
            cx="22" cy="22" r="18" fill="none"
            className={cn("transition-[stroke-dashoffset] duration-slow", RING_TONES[status])}
            strokeWidth="5" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 18}
            strokeDashoffset={status === "unknown" ? 2 * Math.PI * 18 : 2 * Math.PI * 18 * 0.25}
          />
        </svg>
        <span className={cn("absolute inset-0 flex items-center justify-center font-display text-[9px] font-bold uppercase leading-none", RING_TEXT[status])}>
          {label}
        </span>
      </div>
      <span className="text-center text-[11px] font-semibold leading-tight text-muted-foreground">
        {nextDue ?? "—"}
      </span>
    </div>
  )
}

export function VehicleHealthCard({
  plate,
  nickname,
  type = "sedan",
  color,
  oil,
  insurance,
  dvla,
  issues,
  score,
  className,
}: {
  plate: string
  nickname?: string
  type?: VehicleType
  color?: string
  oil: { status: RingStatus; nextDue?: string }
  insurance: { status: RingStatus; nextDue?: string }
  dvla: { status: RingStatus; nextDue?: string }
  issues: { status: RingStatus; nextDue?: string }
  /** FixAm Score 0–100 + tips (spec: vehicle care score). */
  score?: { score: number; tips: string[] }
  className?: string
}) {
  const scoreTone =
    score == null ? "text-muted-foreground" : score.score >= 80 ? "text-success" : score.score >= 50 ? "text-warning" : "text-danger"
  return (
    <div className={cn("overflow-hidden rounded-xl border-2 border-border bg-card shadow-chunky", className)}>
      {score && (
        <div className="flex items-center gap-4 border-b border-border bg-gradient-to-r from-primary/10 via-transparent to-transparent px-5 py-4">
          <div className="relative size-16 shrink-0">
            <svg viewBox="0 0 44 44" className="size-16 -rotate-90">
              <circle cx="22" cy="22" r="18" fill="none" className="stroke-border-subtle" strokeWidth="5" />
              <circle
                cx="22" cy="22" r="18" fill="none"
                className={cn("transition-[stroke-dashoffset] duration-slow", score.score >= 80 ? "stroke-success" : score.score >= 50 ? "stroke-warning" : "stroke-danger")}
                strokeWidth="5" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 18}
                strokeDashoffset={2 * Math.PI * 18 * (1 - score.score / 100)}
              />
            </svg>
            <span className={cn("absolute inset-0 flex items-center justify-center font-display text-sm font-bold", scoreTone)}>
              {score.score}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-display text-sm font-bold uppercase tracking-wide">FixAm Score</p>
            {score.tips.length > 0 ? (
              <ul className="mt-0.5 space-y-0.5">
                {score.tips.map((t) => (
                  <li key={t} className="truncate text-xs text-muted-foreground">· {t}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground">All covered — nice work.</p>
            )}
          </div>
        </div>
      )}
      <div className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm font-bold tracking-widest">
            <span className="rounded-sm border-2 border-midnight-700 bg-plate px-1.5 py-0.5 text-midnight-900">
              {plate.toUpperCase()}
            </span>
          </p>
          {nickname && <p className="mt-1 font-display text-lg font-bold">{nickname}</p>}
        </div>
      </div>
      <CarAvatar type={type} color={color} className="my-3 max-h-24" title={`${nickname ?? "Vehicle"} ${plate}`} />
      <div className="mt-2 grid grid-cols-4 gap-1">
        <HealthRing label="Oil" {...oil} />
        <HealthRing label="Insurance" {...insurance} />
        <HealthRing label="DVLA" {...dvla} />
        <HealthRing label="Issues" {...issues} />
      </div>
      </div>
    </div>
  )
}
