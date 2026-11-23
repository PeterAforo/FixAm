import "server-only"
import { speechProvider, type SpeechLanguage } from "@/lib/integrations/ai"
import { logCall, runPrompt, type AiContext } from "./run"
import { translatePrompt } from "./prompts"

export const VOICE_LANGUAGES: { code: SpeechLanguage; label: string }[] = [
  { code: "en", label: "English" },
  { code: "tw", label: "Twi" },
  { code: "gaa", label: "Ga" },
  { code: "ee", label: "Ewe" },
  { code: "ha", label: "Hausa" },
]

export type VoiceNoteResult =
  | { ok: true; transcript: string; english: string; language: SpeechLanguage; translatedBy: string }
  | { ok: false; message: string }

/**
 * Voice note → transcript (Khaya ASR) → English (Khaya MT, falling back to Claude).
 */
export async function transcribeVoiceNote(
  input: { audio: Uint8Array; mimeType: string; language: SpeechLanguage },
  ctx: AiContext = {}
): Promise<VoiceNoteResult> {
  const sp = speechProvider()
  const started = Date.now()
  let transcript: string
  let audioSeconds: number | undefined
  try {
    const r = await sp.transcribe(input)
    transcript = r.text
    audioSeconds = r.audioSeconds ?? estimateSeconds(input.audio.byteLength, input.mimeType)
    await logCall({ ctx, kind: "asr", provider: sp.name, audioSeconds, cost: sp.costMicroUsd({ kind: "asr", audioSeconds }), status: "ok", started })
  } catch (e) {
    await logCall({ ctx, kind: "asr", provider: sp.name, cost: 0n, status: "error", errorCode: "PROVIDER", started })
    console.error("[speech] transcribe failed:", (e as Error).message)
    return { ok: false, message: "We couldn't hear that clearly — please try again or type it." }
  }
  if (!transcript.trim()) return { ok: false, message: "We couldn't hear anything — please try again." }

  const t = await translateText({ text: transcript, from: input.language, to: "en" }, ctx)
  return { ok: true, transcript, english: t.text, language: input.language, translatedBy: t.by }
}

/** Translate with Khaya first, then Claude. Falls back to the original text. */
export async function translateText(
  input: { text: string; from: SpeechLanguage; to: SpeechLanguage },
  ctx: AiContext = {}
): Promise<{ text: string; by: string }> {
  if (input.from === input.to) return { text: input.text, by: "none" }
  const sp = speechProvider()
  const started = Date.now()
  try {
    const out = await sp.translate(input)
    if (out) {
      await logCall({ ctx, kind: "translate", provider: sp.name, cost: sp.costMicroUsd({ kind: "translate", chars: input.text.length }), status: "ok", started })
      return { text: out, by: sp.name }
    }
  } catch (e) {
    await logCall({ ctx, kind: "translate", provider: sp.name, cost: 0n, status: "error", errorCode: "PROVIDER", started })
    console.error("[speech] translate failed:", (e as Error).message)
  }
  const llm = await runPrompt(translatePrompt, input, ctx)
  if (llm.ok) return { text: llm.data.translation, by: llm.provider }
  return { text: input.text, by: "none" }
}

/** Rough duration when the provider doesn't report one (16 kHz mono 16-bit WAV ≈ 32 KB/s; compressed ≈ 4 KB/s). */
export function estimateSeconds(bytes: number, mimeType: string): number {
  const perSec = /wav|wave|x-wav/.test(mimeType) ? 32000 : 4000
  return Math.max(1, Math.round(bytes / perSec))
}
