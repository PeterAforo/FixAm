import { z } from "zod"
import { rulesTriage, SPECIALTY_IDS } from "@/lib/repair-requests/core"
import { rulesJobNotes } from "@/lib/jobs/voice-notes-core"
import { WA_ACTIONS } from "@/lib/whatsapp/core"
import { rulesDtcExplanation } from "@/lib/obd/explain-core"

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

/** OBD fault codes → plain-language explanation (P8-13). */
export const explainDtcsPrompt = definePrompt({
  key: "explain_dtcs",
  version: 1,
  system:
    "You are an experienced Ghanaian auto mechanic explaining OBD-II fault codes to a driver or a junior mechanic. " +
    "For each code, explain in one or two short sentences what it means for THIS car and what usually causes it, using simple English. " +
    "Use the standard meaning given, but note when the brand commonly uses the code differently. Severity: stop = stop driving or risk " +
    "serious damage/safety; soon = fix within days; monitor = can wait but should be checked. List likely replacement parts by common " +
    "names, most likely first, and say when a cheap check (fuel cap, loose connector, cleaning) should come before buying parts. " +
    "Consider codes together — one fault often triggers others (e.g. misfires causing catalyst codes). Never invent codes.",
  render: (i: {
    vehicle: string | null
    codes: { code: string; kind: string; meaning: string; known: boolean }[]
    milOn: boolean | null
    live: Record<string, number | undefined>
    freezeFrame: Record<string, unknown> | null
  }) =>
    `Vehicle: ${i.vehicle ?? "unknown"}\nCheck-engine light: ${i.milOn == null ? "unknown" : i.milOn ? "ON" : "off"}\n` +
    `Live data: ${JSON.stringify(i.live)}\nFreeze frame: ${i.freezeFrame ? JSON.stringify(i.freezeFrame) : "none"}\n\nCodes:\n` +
    i.codes.map((c) => `- ${c.code} (${c.kind}): ${c.meaning}${c.known ? "" : " [generic description only]"}`).join("\n"),
  output: z.object({
    summary: z.string().min(1).max(500),
    overallSeverity: z.enum(["stop", "soon", "monitor"]),
    codes: z.array(z.object({
      code: z.string(),
      explanation: z.string().min(1).max(400),
      severity: z.enum(["stop", "soon", "monitor"]),
      likelyParts: z.array(z.string().min(1).max(80)).max(5),
      checkFirst: z.string().max(200).nullable(),
    })).max(20),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      overallSeverity: { type: "string", enum: ["stop", "soon", "monitor"] },
      codes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            code: { type: "string" },
            explanation: { type: "string" },
            severity: { type: "string", enum: ["stop", "soon", "monitor"] },
            likelyParts: { type: "array", items: { type: "string" } },
            checkFirst: { type: ["string", "null"] },
          },
          required: ["code", "explanation", "severity", "likelyParts", "checkFirst"],
        },
      },
    },
    required: ["summary", "overallSeverity", "codes"],
  },
  mock: (i) => rulesDtcExplanation(i.codes.map((c) => c.code)),
  maxTokens: 1500,
})

const waIntentOut = z.object({
  action: z.enum(WA_ACTIONS),
  params: z.record(z.string(), z.unknown()).default({}),
  confidence: z.number().min(0).max(1),
})

/** P8-19: WhatsApp assistant — pick the ONE action the customer's message needs. */
export const whatsappIntentPrompt = definePrompt({
  key: "whatsapp_intent",
  version: 1,
  system:
    "You are the intent router for FixAm, a Ghana vehicle-repair app answering WhatsApp messages for ONE garage. " +
    "Read the customer's latest message (English or translated) and choose exactly one action:\n" +
    "- job_status: they ask if their car/vehicle/job is ready or its status. params.plate = the plate they mention, or \"mine\" if none.\n" +
    "- opening_hours: opening hours, location, directions, phone number, address.\n" +
    "- book: they want to book/reschedule a service visit. params = { service (short description), date (YYYY-MM-DD if mentioned), time (HH:MM 24h if mentioned), plate? }.\n" +
    "- repair_request: they describe a car problem and want a garage to look at it. params = { complaint (their words, concise), plate? }.\n" +
    "- send_links: they ask for their estimate, approval link, payment link or tracker.\n" +
    "- reply: general question or anything else — params.text = a short friendly answer you compose yourself (max 300 chars, plain text, no markdown).\n" +
    "- handoff: they ask for a human, are angry, the request is unclear after one try, or involves money disputes/accidents. params.text = short holding message.\n" +
    "Never invent prices or job details. If unsure between actions, prefer handoff. Messages may be informal Ghanaian English.",
  render: (i: { message: string; customerName: string | null; vehicles: string[]; activeJobs: { plate: string | null; status: string }[]; garageName: string }) =>
    `Garage: ${i.garageName}\nCustomer: ${i.customerName ?? "unknown"}\nTheir vehicles: ${i.vehicles.join(", ") || "unknown"}\nActive jobs: ${i.activeJobs.map((j) => `${j.plate ?? "?"} (${j.status})`).join(", ") || "none"}\n\nLatest message: ${i.message}`,
  output: waIntentOut,
  jsonSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: [...WA_ACTIONS] },
      params: { type: "object" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["action", "params", "confidence"],
  },
  mock: () => ({ action: "reply" as const, params: { text: "Thanks for messaging! A member of the team will reply shortly." }, confidence: 0.4 }),
  maxTokens: 300,
})

/** P8-19: compose the final WhatsApp reply from the tool result — short, warm, plain text. */
export const whatsappReplyPrompt = definePrompt({
  key: "whatsapp_reply",
  version: 1,
  system:
    "You write short WhatsApp replies for FixAm, a Ghana vehicle-repair garage assistant. " +
    "Rules: max 600 characters, plain text (no markdown, * is ok for emphasis sparingly), friendly Ghanaian tone, " +
    "answer ONLY from the facts given — never invent prices, dates or statuses. If facts are missing, say a team member will confirm. " +
    "End with one clear next step when useful. Output just the message text.",
  render: (i: { facts: string; customerMessage: string }) =>
    `Customer said: ${i.customerMessage}\n\nFacts from the garage system:\n${i.facts}`,
  output: z.object({ reply: z.string().min(1).max(1200) }),
  jsonSchema: { type: "object", properties: { reply: { type: "string" } }, required: ["reply"] },
  mock: (i) => ({ reply: i.facts.slice(0, 300) || "Thanks — the team will get back to you." }),
  maxTokens: 300,
})

const inspectionReportOut = z.object({
  summary: z.string().min(20).max(3000),
  costs: z.array(z.object({
    item: z.string().min(2).max(120),
    estimatePesewas: z.number().int().min(0).max(50_000_000),
    note: z.string().max(300).optional(),
  })).max(15),
})

/** P8-20: pre-purchase inspection report � plain-language summary + repair cost estimates. */
export const inspectionReportPrompt = definePrompt({
  key: "inspection_report",
  version: 1,
  system:
    "You write pre-purchase vehicle inspection reports for FixAm, a Ghana garage app. " +
    "The buyer is deciding whether to buy a used car. From the checklist results, OBD data and test-drive notes:\n" +
    "1) summary: plain language, 3-6 short paragraphs. Lead with the overall verdict (buy / buy with repairs / walk away), " +
    "then the important findings grouped by severity. Mention flood/accident signs prominently if found. Ghanaian context (harmattan dust, trotro use, flooded roads).\n" +
    "2) costs: estimated repair costs in GHANA CEDI PESEWAS (1 cedi = 100 pesewas) for each item needing attention or failed � " +
    "only items that plausibly need money spent. Ground each estimate in the garage's own recent price list when a similar line exists; " +
    "otherwise use typical Ghana market prices. These are ESTIMATES, not quotes � say so implicitly by keeping them itemised.\n" +
    "Never invent checklist results. If a section is mostly unanswered, say coverage was partial.",
  render: (i: {
    vehicle: Record<string, unknown>
    sections: { section: string; pass: number; attention: number; fail: number; na: number }[]
    flagged: { label: string; result: string; note: string | null }[]
    obdSummary: string
    priceHints: string[]
    testDriveNotes: string
  }) =>
    `Vehicle: ${JSON.stringify(i.vehicle)}\n\nChecklist by section (pass/attention/fail/not-applicable):\n${i.sections.map((s) => `- ${s.section}: ${s.pass}/${s.attention}/${s.fail}/${s.na}`).join("\n")}\n\nFlagged items:\n${i.flagged.map((f) => `- [${f.result}] ${f.label}${f.note ? ` � ${f.note}` : ""}`).join("\n") || "none"}\n\nOBD: ${i.obdSummary}\n\nTest drive notes: ${i.testDriveNotes || "none"}\n\nGarage recent price hints (avg prices, pesewas):\n${i.priceHints.join("\n") || "none"}`,
  output: inspectionReportOut,
  jsonSchema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      costs: {
        type: "array",
        items: {
          type: "object",
          properties: {
            item: { type: "string" },
            estimatePesewas: { type: "integer" },
            note: { type: "string" },
          },
          required: ["item", "estimatePesewas"],
        },
      },
    },
    required: ["summary", "costs"],
  },
  mock: (i) => ({
    summary: `Inspection complete. ${i.flagged.length} item(s) need attention out of the checklist. Overall condition assessment pending full review.`,
    costs: i.flagged.slice(0, 5).map((f) => ({ item: f.label, estimatePesewas: 50_000 })),
  }),
  maxTokens: 1200,
})
