import "server-only"
import { and, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { partPhotoScans } from "@/lib/db/schema"
import { runPrompt, type AiContext } from "@/lib/ai/run"
import { identifyPartPrompt } from "@/lib/ai/prompts"
import { listPartTypes, matchPartTypeText } from "@/lib/parts-catalog/actions"
import { isSure, mergeChoices, numberCandidates, type Candidate, type ImageType } from "./core"

export type PartPhotoResult = {
  scanId: string | null
  notAPart: boolean
  sure: boolean
  candidates: Candidate[]
  condition: "good" | "worn" | "damaged" | "unclear"
  conditionNote: string | null
  partNumber: string | null
  fitmentHint: string | null
  by: string
}

/**
 * Photo (+ optional words) → likely part types. Text the person typed and
 * any part number read off the photo are matched against the parts list too,
 * so the answer is useful even when the photo is poor. Never throws.
 */
export async function identifyPartPhoto(input: {
  image: { mediaType: ImageType; base64: string }
  note?: string | null
  vehicle?: string | null
  source: "driver" | "garage" | "request"
  ctx: AiContext
}): Promise<PartPhotoResult> {
  const note = input.note?.trim().slice(0, 300) || null
  const all = await listPartTypes()
  const textMatches = note ? (await matchPartTypeText(note)).map((m) => ({ id: m.partType.id, score: m.score })) : []
  const numbered = numberCandidates(all, textMatches.map((m) => m.id))

  const r = await runPrompt(identifyPartPrompt, { candidates: numbered, vehicle: input.vehicle ?? null, note }, input.ctx, { images: [input.image] })

  let partNumber: string | null = null
  let result: Omit<PartPhotoResult, "scanId">
  if (r.ok) {
    partNumber = r.data.partNumber
    // A readable part number/brand can name the part too ("NGK" → spark plug).
    const pnMatches = partNumber ? (await matchPartTypeText(partNumber)).map((m) => ({ id: m.partType.id, score: m.score })) : []
    const candidates = r.data.notAPart ? [] : mergeChoices(numbered, r.data.choices, [...textMatches, ...pnMatches])
    result = {
      notAPart: r.data.notAPart && candidates.length === 0,
      sure: isSure(candidates),
      candidates,
      condition: r.data.condition,
      conditionNote: r.data.conditionNote,
      partNumber,
      fitmentHint: r.data.fitmentHint,
      by: r.provider,
    }
  } else {
    const candidates = mergeChoices(numbered, [], textMatches)
    result = { notAPart: false, sure: false, candidates, condition: "unclear", conditionNote: null, partNumber: null, fitmentHint: null, by: "rules" }
  }

  let scanId: string | null = null
  try {
    const [row] = await db().insert(partPhotoScans).values({
      source: input.source,
      userId: input.ctx.userId ?? null,
      garageId: input.ctx.garageId ?? null,
      topPartTypeId: result.candidates[0]?.id ?? null,
      topConfidence: result.candidates[0] ? result.candidates[0].confidence.toFixed(2) : null,
      sure: result.sure,
      notAPart: result.notAPart,
      condition: result.condition,
      provider: result.by,
    }).returning({ id: partPhotoScans.id })
    scanId = row?.id ?? null
  } catch {
    // logging is best-effort
  }
  return { scanId, ...result }
}

/** The person confirmed which part it is (feeds the accuracy figure). */
export async function recordPhotoChoice(scanId: string, partTypeId: string, userId: string | null): Promise<void> {
  await db().update(partPhotoScans)
    .set({ chosenPartTypeId: partTypeId, chosenAt: new Date() })
    .where(and(
      eq(partPhotoScans.id, scanId),
      isNull(partPhotoScans.chosenAt),
      userId ? eq(partPhotoScans.userId, userId) : isNull(partPhotoScans.userId),
    ))
}

/** Last 30 days: how often the AI's top choice was the part people picked. */
export async function photoScanAccuracy(days = 30): Promise<{ scans: number; confirmed: number; topRight: number; accuracy: number | null; sureRate: number | null }> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const [r] = await db().execute<{ scans: number; confirmed: number; top_right: number; sure: number }>(sql`
    select count(*)::int as scans,
      count(*) filter (where chosen_part_type_id is not null)::int as confirmed,
      count(*) filter (where chosen_part_type_id is not null and chosen_part_type_id = top_part_type_id)::int as top_right,
      count(*) filter (where sure)::int as sure
    from part_photo_scans where created_at >= ${since}
  `)
  const scans = Number(r?.scans ?? 0)
  const confirmed = Number(r?.confirmed ?? 0)
  const topRight = Number(r?.top_right ?? 0)
  return { scans, confirmed, topRight, accuracy: confirmed ? topRight / confirmed : null, sureRate: scans ? Number(r?.sure ?? 0) / scans : null }
}
