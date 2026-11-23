import "server-only"
import type { AiProvider, SpeechProvider } from "./ai/types"
import { createClaudeProvider } from "./ai/claude"
import { createMockAiProvider } from "./ai/mock"
import { createKhayaProvider } from "./speech/khaya"
import { createMockSpeechProvider } from "./speech/mock"

/**
 * AI_PROVIDER=claude|mock, SPEECH_PROVIDER=khaya|mock.
 * A real provider without its key falls back to the mock (with a warning),
 * so local dev and previews never break.
 */

let ai: AiProvider | undefined
let speech: SpeechProvider | undefined

export function aiProvider(): AiProvider {
  if (ai) return ai
  const selected = process.env.AI_PROVIDER ?? (process.env.ANTHROPIC_API_KEY ? "claude" : "mock")
  if (selected === "claude" && process.env.ANTHROPIC_API_KEY) ai = createClaudeProvider()
  else {
    if (selected !== "mock") console.warn(`[integrations] AI_PROVIDER=${selected} unavailable (missing key?); using mock`)
    ai = createMockAiProvider()
  }
  return ai
}

export function speechProvider(): SpeechProvider {
  if (speech) return speech
  const selected = process.env.SPEECH_PROVIDER ?? (process.env.KHAYA_API_KEY ? "khaya" : "mock")
  if (selected === "khaya" && process.env.KHAYA_API_KEY) speech = createKhayaProvider()
  else {
    if (selected !== "mock") console.warn(`[integrations] SPEECH_PROVIDER=${selected} unavailable (missing key?); using mock`)
    speech = createMockSpeechProvider()
  }
  return speech
}

export type { AiProvider, SpeechProvider }
export type { AiImage, SpeechLanguage } from "./ai/types"
