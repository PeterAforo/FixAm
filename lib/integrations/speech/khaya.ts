import type { SpeechLanguage, SpeechProvider, TranscribeResult } from "../ai/types"

/**
 * Khaya AI (GhanaNLP) — ASR and translation for Ghanaian languages.
 *
 * Env: KHAYA_API_KEY (required), KHAYA_BASE_URL (default https://translation-api.ghananlp.org),
 * KHAYA_ASR_PATH (default /asr/v1/transcribe), KHAYA_TRANSLATE_PATH (default /v1/translate),
 * KHAYA_ASR_PRICE_PER_MIN_USD / KHAYA_TRANSLATE_PRICE_PER_KCHAR_USD (default 0 — set to your plan).
 * Paths are configurable because Khaya has moved them between API versions —
 * check your Khaya dashboard. Audio should be 16 kHz mono WAV for best results.
 */

/** Khaya's ASR language codes. */
export const KHAYA_ASR_CODE: Record<SpeechLanguage, string> = { tw: "tw", gaa: "gaa", ee: "ee", ha: "ha", en: "en" }

/** Khaya's translation codes (pairs are "<from>-<to>"). */
export const KHAYA_MT_CODE: Partial<Record<SpeechLanguage, string>> = { tw: "tw", gaa: "gaa", ee: "ee", ha: "ha", en: "en" }

export function khayaPair(from: SpeechLanguage, to: SpeechLanguage): string | null {
  const a = KHAYA_MT_CODE[from]
  const b = KHAYA_MT_CODE[to]
  if (!a || !b || a === b) return null
  // Khaya translates to/from English only.
  if (a !== "en" && b !== "en") return null
  return `${a}-${b}`
}

function num(envKey: string): number {
  const v = Number(process.env[envKey])
  return Number.isFinite(v) && v > 0 ? v : 0
}

export function createKhayaProvider(fetchImpl: typeof fetch = fetch): SpeechProvider {
  const base = (process.env.KHAYA_BASE_URL || "https://translation-api.ghananlp.org").replace(/\/$/, "")
  const asrPath = process.env.KHAYA_ASR_PATH || "/asr/v1/transcribe"
  const mtPath = process.env.KHAYA_TRANSLATE_PATH || "/v1/translate"

  function headers(contentType: string): Record<string, string> {
    const key = process.env.KHAYA_API_KEY
    if (!key) throw new Error("KHAYA_API_KEY is not set")
    // Older keys use the APIM header, newer ones a bearer token — sending both is harmless.
    return { "Ocp-Apim-Subscription-Key": key, Authorization: `Bearer ${key}`, "Content-Type": contentType, "Cache-Control": "no-cache" }
  }

  return {
    name: "khaya",
    async transcribe({ audio, mimeType, language }): Promise<TranscribeResult> {
      const url = `${base}${asrPath}?language=${encodeURIComponent(KHAYA_ASR_CODE[language])}`
      const res = await fetchImpl(url, { method: "POST", headers: headers(mimeType || "audio/wav"), body: audio as BodyInit })
      const raw = await res.text()
      if (!res.ok) throw new Error(`Khaya ASR ${res.status}: ${raw.slice(0, 200)}`)
      return { text: parseText(raw), language }
    },
    async translate({ text, from, to }) {
      const pair = khayaPair(from, to)
      if (!pair) return null
      const res = await fetchImpl(`${base}${mtPath}`, {
        method: "POST",
        headers: headers("application/json"),
        body: JSON.stringify({ in: text, lang: pair }),
      })
      const raw = await res.text()
      if (!res.ok) throw new Error(`Khaya translate ${res.status}: ${raw.slice(0, 200)}`)
      return parseText(raw)
    },
    costMicroUsd({ kind, audioSeconds, chars }) {
      if (kind === "asr") return BigInt(Math.round(((audioSeconds ?? 0) / 60) * num("KHAYA_ASR_PRICE_PER_MIN_USD") * 1e6))
      return BigInt(Math.round(((chars ?? 0) / 1000) * num("KHAYA_TRANSLATE_PRICE_PER_KCHAR_USD") * 1e6))
    },
  }
}

/** Khaya returns either a bare JSON string, a plain string, or an object with text/translation. */
export function parseText(raw: string): string {
  try {
    const v = JSON.parse(raw) as unknown
    if (typeof v === "string") return v.trim()
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>
      for (const k of ["text", "transcript", "translation", "output", "result"]) {
        if (typeof o[k] === "string") return (o[k] as string).trim()
      }
    }
  } catch {
    // not JSON
  }
  return raw.trim().replace(/^"|"$/g, "")
}
