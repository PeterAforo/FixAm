import "server-only"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { obdScans, partTypes } from "@/lib/db/schema"
import { runPrompt, type AiContext } from "@/lib/ai/run"
import { explainDtcsPrompt } from "@/lib/ai/prompts"
import { matchPartTypeText } from "@/lib/parts-catalog/actions"
import { describeDtc, type Severity } from "./dtc-library"
import { rulesDtcExplanation } from "./explain-core"
import type { Dtc, LiveData } from "./protocol"
import type { FreezeFrame } from "./elm327"

export type ExplainedCode = {
  code: string
  kind: Dtc["kind"]
  title: string
  system: string
  explanation: string
  severity: Severity
  checkFirst: string | null
  partTypes: { id: string; name: string }[]
}

export type ScanExplanation = { summary: string; overallSeverity: Severity | null; codes: ExplainedCode[]; by: string }

/**
 * Library meaning + AI explanation for each code, with likely parts mapped
 * to the standard parts list (so vendor offers can be shown). Never throws.
 */
export async function explainScan(input: {
  vehicle: string | null
  dtcs: Dtc[]
  milOn: boolean | null
  live: LiveData
  freezeFrame: FreezeFrame | null
  ctx: AiContext
}): Promise<ScanExplanation> {
  if (!input.dtcs.length) {
    return { summary: rulesDtcExplanation([]).summary, overallSeverity: null, codes: [], by: "rules" }
  }
  const infos = input.dtcs.map((d) => ({ dtc: d, info: describeDtc(d.code) }))
  const r = await runPrompt(
    explainDtcsPrompt,
    {
      vehicle: input.vehicle,
      codes: infos.map(({ dtc, info }) => ({ code: dtc.code, kind: dtc.kind, meaning: info.title, known: info.known })),
      milOn: input.milOn,
      live: { ...input.live },
      freezeFrame: input.freezeFrame,
    },
    input.ctx,
  )
  const ai = r.ok ? r.data : rulesDtcExplanation(input.dtcs.map((d) => d.code))
  const byCode = new Map(ai.codes.map((c) => [c.code.toUpperCase(), c]))

  // Library slugs first (curated), then the AI's part names matched to the list.
  const slugs = [...new Set(infos.flatMap((x) => x.info.parts))]
  const bySlug = new Map(
    (slugs.length ? await db().select({ id: partTypes.id, name: partTypes.name, slug: partTypes.slug }).from(partTypes).where(inArray(partTypes.slug, slugs)) : [])
      .map((p) => [p.slug, { id: p.id, name: p.name }]),
  )

  const codes: ExplainedCode[] = []
  for (const { dtc, info } of infos) {
    const a = byCode.get(dtc.code)
    const parts: { id: string; name: string }[] = []
    const add = (p: { id: string; name: string } | undefined) => { if (p && !parts.some((x) => x.id === p.id) && parts.length < 4) parts.push(p) }
    for (const s of info.parts) add(bySlug.get(s))
    for (const name of a?.likelyParts ?? []) {
      const m = (await matchPartTypeText(name))[0]
      if (m && m.score >= 0.5) add({ id: m.partType.id, name: m.partType.name })
    }
    // The library's "stop" is a safety floor the AI can't lower.
    const severity: Severity = info.severity === "stop" ? "stop" : a?.severity ?? info.severity
    codes.push({
      code: dtc.code,
      kind: dtc.kind,
      title: info.title,
      system: info.system,
      explanation: a?.explanation ?? `${info.title}.`,
      severity,
      checkFirst: a?.checkFirst ?? info.tip ?? null,
      partTypes: parts,
    })
  }
  const rank = { stop: 0, soon: 1, monitor: 2 } as const
  codes.sort((x, y) => rank[x.severity] - rank[y.severity])
  return { summary: ai.summary, overallSeverity: codes[0]?.severity ?? null, codes, by: r.ok ? r.provider : "rules" }
}

/** A driver's scan, if it's theirs (for attaching to a repair request). */
export async function scanForUser(scanId: string, userId: string) {
  const [r] = await db().select().from(obdScans).where(and(eq(obdScans.id, scanId), eq(obdScans.userId, userId), eq(obdScans.source, "driver"))).limit(1)
  return r ?? null
}

/** Links a driver's scan to the repair request they just posted (server only). */
export async function linkScanToRequest(scanId: string, requestId: string, userId: string): Promise<void> {
  await db().update(obdScans).set({ repairRequestId: requestId })
    .where(and(eq(obdScans.id, scanId), eq(obdScans.userId, userId), eq(obdScans.source, "driver")))
}
