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
  className?: string
}) {
  return (
    <div className={cn("rounded-xl border-2 border-border bg-card p-5 shadow-chunky", className)}>
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
  )
}
