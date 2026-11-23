import { z } from "zod"
import { rulesTriage, SPECIALTY_IDS } from "@/lib/repair-requests/core"
import { rulesJobNotes } from "@/lib/jobs/voice-notes-core"

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

/** Complaint-first triage (P8-06). */
export const triagePrompt = definePrompt({
  key: "triage",
  version: 1,
  system:
    "You are an experienced Ghanaian auto mechanic triaging a driver's complaint before they visit a garage. " +
    "Be practical and honest; never claim certainty. Give likely causes, how urgent it is (stop_driving when continuing is unsafe " +
    "or will cause serious damage), a realistic Ghana repair cost range in GHS (parts + labour, Accra prices), the garage specialty " +
    "needed, likely replacement parts using common names, and up to 3 short follow-up questions. Use simple English a driver understands.",
  render: (i: { complaint: string; vehicle: string | null; warningLights: string[]; photoCount: number }) =>
    `Vehicle: ${i.vehicle ?? "unknown"}\nWarning lights on: ${i.warningLights.length ? i.warningLights.join(", ") : "none reported"}\n` +
    `Photos attached: ${i.photoCount}\n\nComplaint: ${i.complaint}`,
  output: z.object({
    summary: z.string().min(1).max(400),
    likelyCauses: z.array(z.object({ cause: z.string().min(1).max(200), likelihood: z.enum(["high", "medium", "low"]) })).min(1).max(5),
    urgency: z.enum(["stop_driving", "soon", "can_wait"]),
    safetyNote: z.string().max(300).nullable(),
    costRangeGhs: z.object({ min: z.number().min(0), max: z.number().min(0) }),
    specialty: z.enum(SPECIALTY_IDS),
    likelyParts: z.array(z.string().min(1).max(80)).max(6),
    followUps: z.array(z.string().min(1).max(160)).max(3),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      likelyCauses: { type: "array", items: { type: "object", properties: { cause: { type: "string" }, likelihood: { type: "string", enum: ["high", "medium", "low"] } }, required: ["cause", "likelihood"] } },
      urgency: { type: "string", enum: ["stop_driving", "soon", "can_wait"] },
      safetyNote: { type: ["string", "null"] },
      costRangeGhs: { type: "object", properties: { min: { type: "number" }, max: { type: "number" } }, required: ["min", "max"] },
      specialty: { type: "string", enum: [...SPECIALTY_IDS] },
      likelyParts: { type: "array", items: { type: "string" } },
      followUps: { type: "array", items: { type: "string" } },
    },
    required: ["summary", "likelyCauses", "urgency", "safetyNote", "costRangeGhs", "specialty", "likelyParts", "followUps"],
  },
  mock: (i) => rulesTriage(i.complaint, i.warningLights),
  maxTokens: 900,
})

/** Mechanic's voice note → draft job card entries for review (P8-08). Nothing is saved without confirmation. */
export const jobNotesPrompt = definePrompt({
  key: "job_notes",
  version: 1,
  system:
    "You turn a Ghanaian mechanic's spoken job notes (already translated to English, may be informal) into draft job card entries. " +
    "Findings = problems seen on the car (severity urgent|recommended|can_wait, recommendation replace|repair|monitor). " +
    "Tasks = work steps to do. Parts = parts to fit with quantity. Labour = labour lines with estimated hours. " +
    "Only include what the mechanic actually said; do not invent prices. Keep titles short (under 60 characters).",
  render: (i: { notes: string; vehicle: string | null; complaint: string | null }) =>
    `Vehicle: ${i.vehicle ?? "unknown"}\nCustomer complaint: ${i.complaint ?? "—"}\n\nMechanic's notes: ${i.notes}`,
  output: z.object({
    findings: z.array(z.object({ title: z.string().min(1).max(120), description: z.string().max(400).nullable(), severity: z.enum(["urgent", "recommended", "can_wait"]), recommendation: z.enum(["replace", "repair", "monitor"]) })).max(10),
    tasks: z.array(z.object({ title: z.string().min(1).max(120) })).max(15),
    parts: z.array(z.object({ description: z.string().min(1).max(120), quantity: z.number().min(0.25).max(100) })).max(15),
    labour: z.array(z.object({ description: z.string().min(1).max(120), hours: z.number().min(0).max(100) })).max(10),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      findings: { type: "array", items: { type: "object", properties: { title: { type: "string" }, description: { type: ["string", "null"] }, severity: { type: "string", enum: ["urgent", "recommended", "can_wait"] }, recommendation: { type: "string", enum: ["replace", "repair", "monitor"] } }, required: ["title", "description", "severity", "recommendation"] } },
      tasks: { type: "array", items: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } },
      parts: { type: "array", items: { type: "object", properties: { description: { type: "string" }, quantity: { type: "number" } }, required: ["description", "quantity"] } },
      labour: { type: "array", items: { type: "object", properties: { description: { type: "string" }, hours: { type: "number" } }, required: ["description", "hours"] } },
    },
    required: ["findings", "tasks", "parts", "labour"],
  },
  mock: (i) => rulesJobNotes(i.notes),
  maxTokens: 1200,
})

/** Photo → part type (P8-12). Candidates are numbered so the model answers with small integers, not ids. */
export const identifyPartPrompt = definePrompt({
  key: "identify_part",
  version: 1,
  system:
    "You are an experienced Ghanaian auto-parts dealer looking at a photo of a car part, sent by a driver or a mechanic. " +
    "Identify which part it is, choosing ONLY from the numbered list. Give up to 5 choices, best first, each with a confidence " +
    "from 0 to 1 (be honest: blurry or unusual photos get low confidence). Also judge the condition you can see, read any part " +
    "number or brand printed on it, and say anything that helps fitment (position such as front/rear/left/right, engine or model " +
    "clues). If the photo is not a car part, set notAPart true and return no choices.",
  render: (i: { candidates: { n: number; name: string; category: string }[]; vehicle: string | null; note: string | null }) =>
    `Vehicle: ${i.vehicle ?? "unknown"}\n` +
    `What the person said: ${i.note?.trim() ? i.note.trim() : "nothing"}\n\n` +
    `Parts list:\n${i.candidates.map((c) => `${c.n}. ${c.name} (${c.category})`).join("\n")}`,
  output: z.object({
    notAPart: z.boolean(),
    choices: z.array(z.object({ n: z.number().int().min(1), confidence: z.number().min(0).max(1) })).max(5),
    condition: z.enum(["good", "worn", "damaged", "unclear"]),
    conditionNote: z.string().max(200).nullable(),
    partNumber: z.string().max(60).nullable(),
    fitmentHint: z.string().max(200).nullable(),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      notAPart: { type: "boolean" },
      choices: {
        type: "array",
        items: { type: "object", properties: { n: { type: "integer" }, confidence: { type: "number", minimum: 0, maximum: 1 } }, required: ["n", "confidence"] },
      },
      condition: { type: "string", enum: ["good", "worn", "damaged", "unclear"] },
      conditionNote: { type: ["string", "null"] },
      partNumber: { type: ["string", "null"], description: "Part number or brand printed on the part, if readable" },
      fitmentHint: { type: ["string", "null"], description: "Position/engine/model clues for fitment" },
    },
    required: ["notAPart", "choices", "condition", "conditionNote", "partNumber", "fitmentHint"],
  },
  // Keyless dev: the caller puts text matches first, so offer them as unsure choices.
  mock: (i) => ({
    notAPart: false,
    choices: i.candidates.slice(0, 3).map((c, idx) => ({ n: c.n, confidence: idx === 0 && i.note ? 0.45 : 0.2 })),
    condition: "unclear" as const,
    conditionNote: null,
    partNumber: null,
    fitmentHint: null,
  }),
  maxTokens: 400,
})
