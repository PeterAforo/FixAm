import { z } from "zod"

/**
 * Prompt registry. Every AI feature registers a prompt here with a version,
 * a zod schema for its answer, the JSON Schema sent to the model, and a mock
 * answer for keyless dev. Bump `version` when the prompt text changes.
 */
export type PromptDef<TInput, TOutput> = {
  key: string
  version: number
  system: string
  render: (input: TInput) => string
  output: z.ZodType<TOutput>
  jsonSchema: Record<string, unknown>
  mock: (input: TInput) => TOutput
  maxTokens?: number
}

export function definePrompt<TInput, TOutput>(def: PromptDef<TInput, TOutput>) {
  return def
}

const LANG_NAME = { tw: "Twi (Akan)", gaa: "Ga", ee: "Ewe", ha: "Hausa", en: "English" } as const
export type PromptLanguage = keyof typeof LANG_NAME

/** Fallback translation when Khaya lacks a pair (or is down). */
export const translatePrompt = definePrompt({
  key: "translate",
  version: 1,
  system:
    "You translate short messages between Ghanaian languages and English for a vehicle-repair app. " +
    "Keep car-part names accurate (use common Ghanaian English terms, e.g. 'shock absorber', 'brake pads'). " +
    "Do not add or remove information. Placeholders like [phone] must be kept as-is.",
  render: (i: { text: string; from: PromptLanguage; to: PromptLanguage }) =>
    `Translate from ${LANG_NAME[i.from]} to ${LANG_NAME[i.to]}:\n\n${i.text}`,
  output: z.object({ translation: z.string().min(1) }),
  jsonSchema: {
    type: "object",
    properties: { translation: { type: "string" } },
    required: ["translation"],
  },
  mock: (i) => ({ translation: i.from === i.to ? i.text : `[${i.from}→${i.to}] ${i.text}` }),
  maxTokens: 800,
})

/** Map a mechanic's free-text finding to one of FixAm's standard part types (P8-04). */
export const mapPartTypePrompt = definePrompt({
  key: "map_part_type",
  version: 1,
  system:
    "You map car-repair notes from Ghanaian garages to a standard parts list. Notes may mix English, pidgin and Twi " +
    "and use street names (e.g. 'shock' = shock absorber, 'plugs' = spark plugs, 'pads' = brake pads). " +
    "Choose the single part that must be REPLACED, only from the candidates given. If no part needs replacing or none fits, return null.",
  render: (i: { text: string; candidates: { id: string; name: string; category: string }[] }) =>
    `Note: ${i.text}\n\nCandidates:\n${i.candidates.map((c) => `- ${c.id} | ${c.name} (${c.category})`).join("\n")}`,
  output: z.object({ partTypeId: z.string().nullable(), confidence: z.number().min(0).max(1) }),
  jsonSchema: {
    type: "object",
    properties: {
      partTypeId: { type: ["string", "null"], description: "id of the chosen candidate, or null" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["partTypeId", "confidence"],
  },
  mock: (i) => ({ partTypeId: i.candidates[0]?.id ?? null, confidence: i.candidates[0] ? 0.5 : 0 }),
  maxTokens: 200,
})
