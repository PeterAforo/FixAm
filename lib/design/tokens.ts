/**
 * Typed design tokens for non-CSS consumers (charts, canvas, PDF/email templates).
 * Source of truth: docs/devin-spec/specs/ui-ux.json — keep in sync with app/globals.css.
 */

export const brand = {
  ignition: {
    50: "#FFF3ED", 100: "#FFE2D3", 200: "#FFC2A6", 300: "#FF9B70",
    400: "#FF7A3D", 500: "#FF5A1F", 600: "#ED4410", 700: "#C4350C",
    800: "#9C2B0E", 900: "#7E2610", 950: "#441005",
  },
  volt: {
    300: "#DCFA7A", 400: "#C6F432", 500: "#A6D914", 600: "#7FA80C",
  },
  turbo: {
    300: "#5FE3DA", 400: "#00C2B8", 500: "#00A39B", 600: "#008079",
  },
  sun: { 400: "#FFC53D", 500: "#FFB020", 600: "#E09200" },
  brake: { 400: "#FF6680", 500: "#FF3B5C", 600: "#E01E43" },
  violet: { 400: "#9B8CFF", 500: "#7C6CFF", 600: "#5E4DF0" },
} as const

export const sand = {
  0: "#FFFFFF", 25: "#FDFBF8", 50: "#FAF7F2", 100: "#F3EEE6",
  200: "#E7E0D5", 300: "#D3CABC", 400: "#A79E91", 500: "#7D766C",
  600: "#5B554D", 700: "#3F3B36", 800: "#2A2724", 900: "#1A1816",
} as const

export const carbon = {
  50: "#E9ECF5", 100: "#C9D0E3", 200: "#9AA5C4", 300: "#6B78A0",
  400: "#46527A", 500: "#2D375B", 600: "#1E2645", 700: "#151C36",
  800: "#0F1529", 900: "#0A0F1E", 950: "#060914",
} as const

export const gradients = {
  ignite: "linear-gradient(135deg, #FF7A3D 0%, #FF5A1F 45%, #ED4410 100%)",
  igniteGlow: "radial-gradient(60% 60% at 50% 0%, rgba(255,90,31,0.35) 0%, rgba(255,90,31,0) 100%)",
  voltSuccess: "linear-gradient(135deg, #DCFA7A 0%, #C6F432 100%)",
  carbonHero: "linear-gradient(180deg, #151C36 0%, #0A0F1E 100%)",
} as const

export const radius = { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, pill: 9999 } as const

export const motion = {
  durations: { instant: 80, fast: 140, base: 220, slow: 360, page: 280, celebration: 1400 },
  easing: {
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    emphasized: "cubic-bezier(0.3, 0, 0, 1.2)",
    exit: "cubic-bezier(0.4, 0, 1, 1)",
  },
} as const

export const space = {
  unit: 4,
  scale: [0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128],
  pageGutter: { mobile: 16, tablet: 24, desktop: 32 },
} as const
