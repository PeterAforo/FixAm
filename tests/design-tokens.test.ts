import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * WCAG contrast checks for Pit Stop Pop token pairs (spec requirement:
 * ≥4.5:1 for normal text; ≥3:1 allowed for large/bold UI text). */

const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8")

function parseBlock(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "s"))
  if (!match) throw new Error(`Block not found: ${selector}`)
  const vars: Record<string, string> = {}
  for (const decl of match[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    vars[`--${decl[1]}`] = decl[2].trim()
  }
  return vars
}

function luminance(hex: string): number {
  const n = hex.replace("#", "")
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1! + 0.05) / (l2! + 0.05)
}

const light = parseBlock(":root")
const dark = parseBlock(".dark")

/** Pairs that must hit AA normal text (4.5). */
const AA_PAIRS: Array<[string, string, string]> = [
  ["background", "foreground", "body text"],
  ["card", "card-foreground", "card text"],
  ["muted", "muted-foreground", "muted text"],
  ["accent", "accent-foreground", "accent text"],
  ["secondary", "secondary-foreground", "secondary text"],
  ["info", "info-foreground", "info badge"],
  ["success", "success-foreground", "success badge"],
  ["warning", "warning-foreground", "warning badge"],
  ["popover", "popover-foreground", "popover text"],
]

/** Bold UI pairs allowed at 3:1 (large/bold text per WCAG 1.4.3). */
const BOLD_PAIRS: Array<[string, string, string]> = [
  ["primary", "primary-foreground", "primary button"],
  ["danger", "danger-foreground", "danger button"],
]

describe("Pit Stop Pop contrast", () => {
  for (const theme of [
    { name: "light", vars: light },
    { name: "dark (workshop)", vars: dark },
  ]) {
    describe(theme.name, () => {
      for (const [bg, fg, label] of AA_PAIRS) {
        it(`${label}: ${bg}/${fg} ≥ 4.5:1`, () => {
          expect(contrast(theme.vars[`--${bg}`]!, theme.vars[`--${fg}`]!)).toBeGreaterThanOrEqual(4.5)
        })
      }
      for (const [bg, fg, label] of BOLD_PAIRS) {
        it(`${label}: ${bg}/${fg} ≥ 3:1 (bold UI)`, () => {
          expect(contrast(theme.vars[`--${bg}`]!, theme.vars[`--${fg}`]!)).toBeGreaterThanOrEqual(3)
        })
      }
    })
  }
})
