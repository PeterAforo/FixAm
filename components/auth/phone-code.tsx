"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

export const authInputCls =
  "h-12 w-full rounded-xl border border-input bg-card px-3.5 text-base text-foreground outline-none transition-shadow placeholder:text-[#8C857B] focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

/** Ghana phone input with a fixed +233 prefix. Value is what the user typed (local format). */
export function PhoneField({
  value,
  onChange,
  autoFocus,
  id = "phone",
}: {
  value: string
  onChange: (v: string) => void
  autoFocus?: boolean
  id?: string
}) {
  return (
    <span className="flex h-12 overflow-hidden rounded-xl border border-input bg-card transition-shadow focus-within:border-foreground focus-within:ring-4 focus-within:ring-[#FF5A1F]/15">
      <span className="flex items-center gap-2 border-r border-input bg-background px-3.5 text-[15px] font-medium">
        <span aria-hidden className="flex h-3.5 w-5 flex-col overflow-hidden rounded-[2px]">
          <span className="flex-1 bg-[#CE1126]" />
          <span className="relative flex-1 bg-[#FCD116]">
            <span className="absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-black" />
          </span>
          <span className="flex-1 bg-[#006B3F]" />
        </span>
        +233
      </span>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        required
        autoFocus={autoFocus}
        placeholder="24 123 4567"
        className="min-w-0 flex-1 bg-transparent px-3.5 text-base tracking-wide outline-none placeholder:text-[#8C857B]"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d\s+]/g, ""))}
      />
    </span>
  )
}

/** Turn "24 123 4567" / "0241234567" / "+233…" into something normalizeGhPhone accepts. */
export function toGhInput(raw: string) {
  const d = raw.replace(/\D/g, "")
  if (d.startsWith("233")) return d
  if (d.startsWith("0")) return d
  return `0${d}`
}

/** Six single-digit boxes; supports paste and SMS autofill. */
export function OtpBoxes({
  value,
  onChange,
  onComplete,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  onComplete?: (v: string) => void
  disabled?: boolean
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "")

  useEffect(() => {
    refs.current[0]?.focus()
  }, [])

  function setAt(i: number, d: string) {
    const next = (value.slice(0, i) + d + value.slice(i + 1)).replace(/\D/g, "").slice(0, 6)
    onChange(next)
    if (d && i < 5) refs.current[i + 1]?.focus()
    if (next.length === 6) onComplete?.(next)
  }

  return (
    <div className="flex justify-between gap-2" onPaste={(e) => {
      const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
      if (!text) return
      e.preventDefault()
      onChange(text)
      refs.current[Math.min(text.length, 5)]?.focus()
      if (text.length === 6) onComplete?.(text)
    }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          maxLength={6}
          disabled={disabled}
          value={d}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "")
            if (v.length > 1) {
              // SMS autofill drops the whole code into one box
              const text = v.slice(0, 6)
              onChange(text)
              if (text.length === 6) onComplete?.(text)
              return
            }
            setAt(i, v)
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !d && i > 0) refs.current[i - 1]?.focus()
            if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus()
            if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus()
          }}
          className={cn(
            "h-14 w-full min-w-0 rounded-xl border bg-card text-center font-mono text-2xl font-semibold outline-none transition-shadow focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15 disabled:opacity-60",
            d ? "border-foreground" : "border-input"
          )}
        />
      ))}
    </div>
  )
}

/** Seconds left until `deadline` (ms timestamp); ticks once a second. */
export function useCountdown(deadline: number) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [deadline])
  if (now === null) return 0
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}
