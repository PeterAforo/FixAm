/** AI + speech adapter interfaces (specs/integrations.json → ai, speech). */

export type AiImage = { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string }

export type AiJsonRequest = {
  /** Registry key, used by the mock to pick a canned answer. */
  promptKey: string
  system: string
  /** User turn text (already PII-minimised). */
  text: string
  images?: AiImage[]
  /** JSON Schema for the answer object. */
  schema: Record<string, unknown>
  maxTokens?: number
  /** Optional mock answer builder — used only by the mock provider. */
  mock?: () => unknown
}

export type AiUsage = { inputTokens: number; outputTokens: number }

export type AiJsonResult = { data: unknown; usage: AiUsage; model: string }

export interface AiProvider {
  readonly name: string
  generateJson(req: AiJsonRequest): Promise<AiJsonResult>
  /** Micro-USD cost of a call with this usage. */
  costMicroUsd(usage: AiUsage, model: string): bigint
}

/** Ghanaian languages FixAm accepts voice notes in. */
export type SpeechLanguage = "tw" | "gaa" | "ee" | "ha" | "en"

export type TranscribeResult = { text: string; language: SpeechLanguage; audioSeconds?: number }

export interface SpeechProvider {
  readonly name: string
  transcribe(input: { audio: Uint8Array; mimeType: string; language: SpeechLanguage }): Promise<TranscribeResult>
  /** Returns null when the provider does not support this pair (caller falls back to the LLM). */
  translate(input: { text: string; from: SpeechLanguage; to: SpeechLanguage }): Promise<string | null>
  costMicroUsd(input: { kind: "asr" | "translate"; audioSeconds?: number; chars?: number }): bigint
}
