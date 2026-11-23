"use server"

import { getSessionUserId } from "@/lib/auth/ensure-user"
import { rateLimit } from "@/lib/rate-limit"
import { transcribeVoiceNote, type VoiceNoteResult } from "./speech"
import type { SpeechLanguage } from "@/lib/integrations/ai"

const LANGS: SpeechLanguage[] = ["en", "tw", "gaa", "ee", "ha"]
const MAX_BYTES = 5 * 1024 * 1024 // ~2–3 min of compressed audio

/**
 * Voice note → transcript + English. Used by the complaint box, the job card
 * and WhatsApp intake. Works for signed-out drivers too (rate-limited by key).
 */
export async function transcribeVoiceNoteAction(formData: FormData): Promise<VoiceNoteResult> {
  const file = formData.get("audio")
  const language = String(formData.get("language") ?? "en") as SpeechLanguage
  const garageId = (formData.get("garageId") as string | null) || null
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, message: "No recording received." }
  if (file.size > MAX_BYTES) return { ok: false, message: "That recording is too long — keep it under 2 minutes." }
  if (!LANGS.includes(language)) return { ok: false, message: "Unsupported language." }

  const userId = await getSessionUserId()
  const rl = await rateLimit(`voice:${userId ?? (formData.get("clientKey") as string | null) ?? "anon"}`, 20, 3600)
  if (!rl.ok) return { ok: false, message: `Too many voice notes — try again in ${Math.ceil(rl.retryAfterSec / 60)} min.` }

  const audio = new Uint8Array(await file.arrayBuffer())
  return transcribeVoiceNote({ audio, mimeType: file.type || "audio/webm", language }, { userId, garageId })
}
