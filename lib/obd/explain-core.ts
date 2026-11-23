/**
 * Fault-code explanation without AI (P8-13): built from the library, used
 * when no AI key is set or the AI call fails.
 */
import { PART_TYPE_SEED } from "@/lib/parts-catalog/seed"
import { describeDtc, worstSeverity, type Severity } from "./dtc-library"

const NAME_BY_SLUG = new Map(PART_TYPE_SEED.map((p) => [p.slug, p.name]))

export type DtcExplanation = {
  summary: string
  overallSeverity: Severity
  codes: { code: string; explanation: string; severity: Severity; likelyParts: string[]; checkFirst: string | null }[]
}

export function rulesDtcExplanation(codes: string[]): DtcExplanation {
  const infos = codes.map(describeDtc)
  const worst = worstSeverity(infos) ?? "monitor"
  const summary = !infos.length
    ? "No fault codes are stored. If the car still has a problem, describe it to a mechanic."
    : worst === "stop"
      ? `${infos.length} fault ${infos.length === 1 ? "code" : "codes"} found — at least one needs attention right away.`
      : `${infos.length} fault ${infos.length === 1 ? "code" : "codes"} found. Have ${infos.length === 1 ? "it" : "them"} checked ${worst === "soon" ? "in the next few days" : "at your next service"}.`
  return {
    summary,
    overallSeverity: worst,
    codes: infos.map((d) => ({
      code: d.code,
      explanation: d.title + ".",
      severity: d.severity,
      likelyParts: d.parts.map((s) => NAME_BY_SLUG.get(s) ?? s),
      checkFirst: d.tip ?? null,
    })),
  }
}
