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
