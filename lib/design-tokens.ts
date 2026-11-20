/**
 * JS-side brand constants mirroring app/globals.css tokens.
 * Use these where CSS variables can't reach (canvas-confetti, SVG attrs).
 * Keep in sync with specs/design-tokens.json.
 */
export const BRAND = {
  ignition: "#FF5A1F",
  ignitionHover: "#E64510",
  midnight: "#0B1B3F",
  midnightDeep: "#050D20",
  volt: "#C6F432",
  turbo: "#00C2B8",
  cream: "#FFF6EC",
  plate: "#FFD43B",
  warning: "#FFB020",
  danger: "#FF3B5C",
} as const

/** Confetti palette — brand colours only. */
export const CONFETTI_COLORS = [
  BRAND.ignition,
  BRAND.turbo,
  BRAND.volt,
  BRAND.warning,
  BRAND.danger,
  BRAND.midnight,
] as const

/** Default vehicle body tint (midnight). */
export const DEFAULT_VEHICLE_COLOR = BRAND.midnight

export const VEHICLE_TYPE_COLORS = [
  BRAND.ignition,
  BRAND.turbo,
  BRAND.volt,
  BRAND.midnight,
  BRAND.warning,
] as const
