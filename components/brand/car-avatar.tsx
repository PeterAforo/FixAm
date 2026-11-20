import { cn } from "@/lib/utils"

export type VehicleType =
  | "sedan" | "hatchback" | "suv" | "pickup" | "van"
  | "bus" | "truck" | "motorbike" | "other"

/**
 * Chunky SVG vehicle silhouettes — midnight outline, tinted body.
 * viewBox 0 0 96 48 for all variants.
 */
const PATHS: Record<VehicleType, React.ReactNode> = {
  sedan: (
    <>
      <path d="M8 34 L14 22 Q16 18 22 17 L30 15 Q36 9 46 9 L60 9 Q68 9 74 15 L82 18 Q88 19 90 24 L92 34 Z" />
      <circle cx="28" cy="35" r="6" />
      <circle cx="68" cy="35" r="6" />
    </>
  ),
  hatchback: (
    <>
      <path d="M10 34 L16 24 Q18 20 24 19 L34 17 L38 11 Q40 8 46 8 L58 8 Q66 8 72 14 L84 18 Q90 20 91 26 L92 34 Z" />
      <circle cx="30" cy="35" r="6" />
      <circle cx="66" cy="35" r="6" />
    </>
  ),
  suv: (
    <>
      <path d="M6 34 L8 20 Q9 14 16 13 L22 12 L26 7 Q28 4 34 4 L62 4 Q70 4 75 10 L84 14 Q91 16 92 22 L93 34 Z" />
      <circle cx="27" cy="35" r="7" />
      <circle cx="69" cy="35" r="7" />
    </>
  ),
  pickup: (
    <>
      <path d="M6 34 L8 22 Q9 16 16 15 L24 14 L28 9 Q30 6 36 6 L50 6 L52 14 L78 14 Q88 15 90 22 L92 34 Z" />
      <path d="M54 18 L54 32 L88 32 L88 18 Z" opacity="0.35" />
      <circle cx="27" cy="35" r="6" />
      <circle cx="72" cy="35" r="6" />
    </>
  ),
  van: (
    <>
      <path d="M6 34 L6 16 Q6 8 14 8 L66 8 Q76 8 82 14 L90 20 Q93 23 93 28 L93 34 Z" />
      <path d="M68 12 L88 12 L88 30 L68 30 Z" opacity="0.35" />
      <circle cx="24" cy="35" r="6" />
      <circle cx="74" cy="35" r="6" />
    </>
  ),
  bus: (
    <>
      <path d="M6 34 L6 12 Q6 6 12 6 L84 6 Q92 6 92 14 L92 34 Z" />
      <rect x="14" y="11" width="12" height="8" rx="1" opacity="0.4" />
      <rect x="30" y="11" width="12" height="8" rx="1" opacity="0.4" />
      <rect x="46" y="11" width="12" height="8" rx="1" opacity="0.4" />
      <rect x="62" y="11" width="12" height="8" rx="1" opacity="0.4" />
      <circle cx="24" cy="35" r="6" />
      <circle cx="72" cy="35" r="6" />
    </>
  ),
  truck: (
    <>
      <path d="M4 34 L4 14 Q4 8 10 8 L46 8 L52 16 L78 16 Q88 17 90 24 L92 34 Z" />
      <rect x="10" y="12" width="30" height="14" opacity="0.3" />
      <circle cx="22" cy="35" r="6" />
      <circle cx="70" cy="35" r="6" />
    </>
  ),
  motorbike: (
    <>
      <circle cx="26" cy="34" r="9" />
      <circle cx="70" cy="34" r="9" />
      <path d="M26 34 L40 22 L52 22 L56 30 L70 34 M40 22 L36 14 L48 14" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  other: (
    <>
      <path d="M12 34 Q12 20 30 18 L44 16 Q52 8 64 10 L78 14 Q88 18 88 28 L88 34 Z" />
      <circle cx="30" cy="35" r="6" />
      <circle cx="70" cy="35" r="6" />
    </>
  ),
}

export function CarAvatar({
  type = "sedan",
  color = "var(--color-midnight-700)",
  className,
  title,
}: {
  type?: VehicleType
  color?: string
  className?: string
  title?: string
}) {
  return (
    <svg
      viewBox="0 0 96 48"
      role={title ? "img" : "presentation"}
      aria-label={title}
      className={cn("h-auto w-full", className)}
    >
      <g
        fill={color}
        stroke="var(--color-midnight-700)"
        strokeWidth="3"
        strokeLinejoin="round"
      >
        {PATHS[type]}
      </g>
    </svg>
  )
}
