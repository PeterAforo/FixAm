/**
 * Part recognition from photos (P8-12) — pure helpers, no database.
 */

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
export type ImageType = (typeof IMAGE_TYPES)[number]

/** Top choice must be at least this sure, and this far ahead of the next, to skip the "pick one" step. */
export const SURE_CONFIDENCE = 0.75
export const SURE_MARGIN = 0.2

export type Candidate = { id: string; name: string; category: string; confidence: number }

export function isImageType(t: string): t is ImageType {
  return (IMAGE_TYPES as readonly string[]).includes(t)
}

/** Detects JPEG / PNG / WebP from the first bytes (don't trust the browser's label). */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png"
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp"
  return null
}

/**
 * Numbers the parts list for the prompt, with any text matches (from what
 * the person typed or a part number) first so they are easy to pick.
 */
export function numberCandidates<T extends { id: string; name: string; category: string }>(all: T[], preferredIds: string[] = []): { n: number; id: string; name: string; category: string }[] {
  const pref = new Set(preferredIds)
  const ordered = [...all.filter((p) => pref.has(p.id)).sort((a, b) => preferredIds.indexOf(a.id) - preferredIds.indexOf(b.id)), ...all.filter((p) => !pref.has(p.id))]
  return ordered.map((p, i) => ({ n: i + 1, id: p.id, name: p.name, category: p.category }))
}

/**
 * Merges the model's numbered choices with text matches: unknown numbers are
 * dropped, duplicates keep the higher confidence, a text match agreeing with
 * the photo nudges confidence up. Best first, at most 5.
 */
export function mergeChoices(
  numbered: { n: number; id: string; name: string; category: string }[],
  choices: { n: number; confidence: number }[],
  textMatches: { id: string; score: number }[] = [],
): Candidate[] {
  const byN = new Map(numbered.map((c) => [c.n, c]))
  const byId = new Map(numbered.map((c) => [c.id, c]))
  const out = new Map<string, Candidate>()
  for (const ch of choices) {
    const c = byN.get(ch.n)
    if (!c) continue
    const conf = Math.max(0, Math.min(1, ch.confidence))
    const prev = out.get(c.id)
    if (!prev || prev.confidence < conf) out.set(c.id, { id: c.id, name: c.name, category: c.category, confidence: conf })
  }
  for (const t of textMatches) {
    const c = byId.get(t.id)
    if (!c) continue
    const prev = out.get(t.id)
    if (prev) prev.confidence = Math.min(0.99, prev.confidence + 0.15 * t.score)
    else if (t.score >= 0.6) out.set(t.id, { id: c.id, name: c.name, category: c.category, confidence: Math.min(0.6, t.score * 0.7) })
  }
  return [...out.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5)
    .map((c) => ({ ...c, confidence: Math.round(c.confidence * 100) / 100 }))
}

/** Sure enough to go straight to offers? */
export function isSure(candidates: Candidate[]): boolean {
  const [a, b] = candidates
  if (!a) return false
  return a.confidence >= SURE_CONFIDENCE && a.confidence - (b?.confidence ?? 0) >= SURE_MARGIN
}

/** Accuracy for the evaluation script: share of cases where the expected part is the top choice. */
export function topOneAccuracy(results: { expected: string; got: string | null }[]): number {
  if (!results.length) return 0
  return results.filter((r) => r.got === r.expected).length / results.length
}
