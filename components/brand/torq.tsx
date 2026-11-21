"use client"

import { cn } from "@/lib/utils"

export type TorqPose =
  | "wave"
  | "thumbs_up"
  | "celebrate"
  | "thinking"
  | "sleeping"
  | "magnifier"
  | "toolbox"
  | "delivery"
  | "oops"
  | "cool_shades"

/**
 * Torq — FixAm's original robot-wrench mascot.
 * Flat vector shapes, renders crisply 24px–240px. Idle blink via CSS
 * (respects prefers-reduced-motion through globals).
 */
export function Torq({
  pose = "wave",
  size = 96,
  className,
}: {
  pose?: TorqPose
  size?: number
  className?: string
}) {
  const uid = `torq-${pose}-${size}`
  const eyesClosed = pose === "sleeping"
  const shades = pose === "cool_shades"

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={`Torq the mascot (${pose.replace("_", " ")})`}
      className={cn("torq-idle", className)}
    >
      <defs>
        <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF7A3D" />
          <stop offset="55%" stopColor="#FF5A1F" />
          <stop offset="100%" stopColor="#ED4410" />
        </linearGradient>
        <linearGradient id={`${uid}-arm`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9C2B0E" />
          <stop offset="100%" stopColor="#7E2610" />
        </linearGradient>
      </defs>

      {/* ground shadow */}
      <ellipse cx="60" cy="110" rx="34" ry="6" fill="#1A1816" opacity="0.12" />

      {/* arms — pose variants */}
      {pose === "wave" && (
        <g stroke={`url(#${uid}-arm)`} strokeWidth="7" strokeLinecap="round" fill="none">
          <path d="M22 74 Q10 62 14 46" />
          <circle cx="14" cy="44" r="6" fill="#FF5A1F" stroke="none" />
          <path d="M98 74 Q110 60 106 44" />
          <circle cx="106" cy="42" r="6" fill="#FF5A1F" stroke="none" />
        </g>
      )}
      {pose === "celebrate" && (
        <g stroke={`url(#${uid}-arm)`} strokeWidth="7" strokeLinecap="round" fill="none">
          <path d="M22 72 Q8 56 12 36" />
          <path d="M98 72 Q112 56 108 36" />
          <circle cx="12" cy="34" r="6" fill="#FF5A1F" stroke="none" />
          <circle cx="108" cy="34" r="6" fill="#FF5A1F" stroke="none" />
        </g>
      )}
      {pose !== "wave" && pose !== "celebrate" && (
        <g stroke={`url(#${uid}-arm)`} strokeWidth="7" strokeLinecap="round" fill="none">
          <path d="M24 76 Q14 84 16 92" />
          <path d="M96 76 Q106 84 104 92" />
          {pose === "thumbs_up" && <path d="M104 78 L112 66" strokeWidth="6" />}
          {pose === "magnifier" && (
            <g>
              <circle cx="104" cy="66" r="9" fill="none" stroke="#00C2B8" strokeWidth="4" />
              <path d="M110 72 L116 78" stroke="#00C2B8" strokeWidth="4" />
            </g>
          )}
          {pose === "toolbox" && (
            <rect x="88" y="82" width="24" height="18" rx="4" fill="#1E2645" stroke="none" />
          )}
        </g>
      )}

      {/* bolt-head body */}
      <rect x="28" y="30" width="64" height="64" rx="18" fill={`url(#${uid}-body)`} stroke="#7E2610" strokeWidth="2.5" />
      {/* top bolt nub */}
      <rect x="50" y="18" width="20" height="14" rx="6" fill="#ED4410" stroke="#7E2610" strokeWidth="2.5" />

      {/* carbon visor */}
      <rect x="36" y="44" width="48" height="26" rx="13" fill="#0A0F1E" />
      {shades ? (
        <g>
          <rect x="40" y="50" width="18" height="10" rx="4" fill="#0A0F1E" stroke="#C6F432" strokeWidth="1.5" />
          <rect x="62" y="50" width="18" height="10" rx="4" fill="#0A0F1E" stroke="#C6F432" strokeWidth="1.5" />
          <path d="M58 54 L62 54" stroke="#C6F432" strokeWidth="1.5" />
        </g>
      ) : eyesClosed ? (
        <g stroke="#C6F432" strokeWidth="2.5" strokeLinecap="round">
          <path d="M44 57 q4 3 8 0" fill="none" />
          <path d="M68 57 q4 3 8 0" fill="none" />
        </g>
      ) : pose === "oops" ? (
        <g fill="#C6F432">
          <circle cx="48" cy="56" r="4" />
          <circle cx="72" cy="56" r="4" />
          <path d="M52 66 q8 -4 16 0" stroke="#C6F432" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </g>
      ) : pose === "thinking" ? (
        <g fill="#C6F432">
          <circle cx="48" cy="56" r="4" />
          <circle cx="72" cy="52" r="4" />
        </g>
      ) : (
        <g fill="#C6F432" className="torq-eyes">
          <circle cx="48" cy="56" r="4.5" />
          <circle cx="72" cy="56" r="4.5" />
        </g>
      )}

      {/* mouth */}
      {pose === "celebrate" || pose === "thumbs_up" ? (
        <path d="M52 74 q8 6 16 0" stroke="#7E2610" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      ) : pose === "sleeping" ? (
        <ellipse cx="60" cy="76" rx="5" ry="3" fill="#7E2610" />
      ) : (
        <path d="M54 74 q6 4 12 0" stroke="#7E2610" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      )}

      {/* wrench emblem on belly */}
      <g transform="translate(60 88)" opacity="0.9">
        <path d="M-7 -1 a4 4 0 1 1 4 4 l-2 5 h4 l2 -5 a4 4 0 1 1 -8 0 z" fill="#FFF3ED" transform="rotate(45)" />
      </g>
    </svg>
  )
}
