import "server-only"
import { matchPartTypeText, searchPartTypes, type PartTypeView } from "@/lib/parts-catalog/actions"
import { aiProvider } from "@/lib/integrations/ai"
import { runPrompt, type AiContext } from "@/lib/ai/run"
import { mapPartTypePrompt } from "@/lib/ai/prompts"
import { SURE_MATCH } from "./core"

export type PartTypeGuess = { partTypeId: string; name: string; confidence: number; by: "rules" | "ai" }

/**
 * Free text ("front shocks leaking, replace") → standard part type.
 * Deterministic match first (instant); Claude only when that is unsure and a
 * real AI provider is configured. Returns null when nothing fits.
 */
export async function classifyPartText(text: string, ctx: AiContext = {}): Promise<PartTypeGuess | null> {
  const clean = text.trim()
  if (clean.length < 2) return null
  const matches = await matchPartTypeText(clean)
  const top = matches[0]
  if (top && top.score >= SURE_MATCH) return { partTypeId: top.partType.id, name: top.partType.name, confidence: top.score, by: "rules" }

  if (aiProvider().name !== "mock") {
    const words = clean.toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 4)
    const pool = new Map<string, PartTypeView>()
    for (const m of matches) pool.set(m.partType.id, m.partType)
    for (const w of words) for (const p of await searchPartTypes(w)) if (pool.size < 25) pool.set(p.id, p)
    if (pool.size > 0) {
      const candidates = [...pool.values()].map((p) => ({ id: p.id, name: p.name, category: p.category }))
      const r = await runPrompt(mapPartTypePrompt, { text: clean.slice(0, 500), candidates }, ctx)
      if (r.ok && r.data.partTypeId && pool.has(r.data.partTypeId) && r.data.confidence >= 0.4) {
        return { partTypeId: r.data.partTypeId, name: pool.get(r.data.partTypeId)!.name, confidence: r.data.confidence, by: "ai" }
      }
    }
  }
  return top ? { partTypeId: top.partType.id, name: top.partType.name, confidence: top.score, by: "rules" } : null
}
