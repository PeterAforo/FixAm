"use client"

import { useState } from "react"
import { Send } from "lucide-react"
import { cn } from "@/lib/utils"

const fieldCls =
  "h-12 w-full rounded-xl border border-input bg-card px-3.5 text-[15px] text-foreground outline-none transition-shadow placeholder:text-[#8C857B] focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

const TOPICS = ["Setting up my garage", "Pricing and plans", "Selling parts as a vendor", "Partnerships", "Something else"]

/**
 * Composes the message into the visitor's email app (no backend required).
 * Swap `submit` for a server action when a support inbox / CRM is connected.
 */
export function ContactForm({ email }: { email: string }) {
  const [topic, setTopic] = useState(TOPICS[0]!)
  const [sent, setSent] = useState(false)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const garage = String(f.get("garage") ?? "").trim()
    const lines = [
      `Name: ${f.get("name")}`,
      `Phone: ${f.get("phone")}`,
      ...(garage ? [`Garage: ${garage}`] : []),
      `Topic: ${topic}`,
      "",
      String(f.get("message") ?? ""),
    ]
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(`[FixAm] ${topic}`)}&body=${encodeURIComponent(lines.join("\n"))}`
    setSent(true)
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <fieldset>
        <legend className="text-sm font-medium">What can we help with?</legend>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {TOPICS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTopic(t)}
              aria-pressed={topic === t}
              className={cn(
                "rounded-full border px-3.5 py-2 text-sm transition-colors",
                topic === t ? "border-foreground bg-foreground text-background" : "border-border-strong bg-card hover:bg-surface-sunken"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="text-sm font-medium">Your name</span>
          <input name="name" required autoComplete="name" className={fieldCls} />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium">Phone number</span>
          <input name="phone" required type="tel" autoComplete="tel" placeholder="024 123 4567" className={fieldCls} />
        </label>
      </div>
      <label className="block space-y-2">
        <span className="text-sm font-medium">Garage or business name <span className="font-normal text-muted-foreground">(optional)</span></span>
        <input name="garage" className={fieldCls} />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium">Message</span>
        <textarea
          name="message"
          required
          rows={5}
          placeholder="Tell us about your workshop — how many bays, staff and branches you have."
          className={`${fieldCls} h-auto resize-y py-3`}
        />
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-glow-primary transition-colors hover:bg-primary-hover"
        >
          <Send className="size-4" /> Send message
        </button>
        {sent && <p className="text-sm text-muted-foreground">Your email app should open with the message ready to send.</p>}
      </div>
    </form>
  )
}
