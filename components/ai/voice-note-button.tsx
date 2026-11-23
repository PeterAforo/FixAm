"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { Loader2, Mic, Square } from "lucide-react"
import { transcribeVoiceNoteAction } from "@/lib/ai/actions"
import type { SpeechLanguage } from "@/lib/integrations/ai/types"

const LANGS: { code: SpeechLanguage; label: string }[] = [
  { code: "en", label: "English" },
  { code: "tw", label: "Twi" },
  { code: "gaa", label: "Ga" },
  { code: "ee", label: "Ewe" },
  { code: "ha", label: "Hausa" },
]

const MAX_SECONDS = 120

export type VoiceNoteValue = { transcript: string; english: string; language: SpeechLanguage }

/**
 * Record a voice note in English, Twi, Ga, Ewe or Hausa → transcript + English.
 * `onResult` receives both; callers usually drop `english` into a text box.
 */
export function VoiceNoteButton({
  onResult,
  garageId,
  defaultLanguage = "tw",
  className,
}: {
  onResult: (v: VoiceNoteValue) => void
  garageId?: string
  defaultLanguage?: SpeechLanguage
  className?: string
}) {
  const [language, setLanguage] = useState<SpeechLanguage>(defaultLanguage)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])

  useEffect(() => {
    if (!recording) return
    const t = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [recording])

  useEffect(() => {
    if (recording && elapsed >= MAX_SECONDS) recorder.current?.stop()
  }, [recording, elapsed])

  async function start() {
    setError(null)
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice notes aren't supported in this browser — please type instead.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m))
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunks.current = []
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        setRecording(false)
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" })
        send(blob)
      }
      recorder.current = rec
      rec.start()
      setElapsed(0)
      setRecording(true)
    } catch {
      setError("Microphone permission was blocked — allow it in your browser settings.")
    }
  }

  function send(blob: Blob) {
    const fd = new FormData()
    fd.set("audio", blob, "voice-note")
    fd.set("language", language)
    if (garageId) fd.set("garageId", garageId)
    startTransition(async () => {
      const r = await transcribeVoiceNoteAction(fd)
      if (r.ok) onResult({ transcript: r.transcript, english: r.english, language: r.language })
      else setError(r.message)
    })
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <select
          aria-label="Language you will speak"
          value={language}
          disabled={recording || pending}
          onChange={(e) => setLanguage(e.target.value as SpeechLanguage)}
          className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        {recording ? (
          <button
            type="button"
            onClick={() => recorder.current?.stop()}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white"
          >
            <Square className="size-4" /> Stop · {String(Math.floor(elapsed / 60))}:{String(elapsed % 60).padStart(2, "0")}
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={pending}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold hover:bg-muted disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4" />}
            {pending ? "Listening…" : "Speak instead"}
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
