"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { saveWhatsAppSettings } from "@/lib/whatsapp/actions"

export function WhatsAppPanel(props: {
  garageId: string
  whatsappNumber: string | null
  phoneNumberId: string | null
  aiEnabled: boolean
}) {
  const [pending, start] = useTransition()
  const [number, setNumber] = useState(props.whatsappNumber ?? "")
  const [phoneNumberId, setPhoneNumberId] = useState(props.phoneNumberId ?? "")
  const [aiEnabled, setAiEnabled] = useState(props.aiEnabled)
  const [msg, setMsg] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function save(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      const res = await saveWhatsAppSettings({
        garageId: props.garageId,
        whatsappNumber: number || undefined,
        whatsappPhoneNumberId: phoneNumberId || undefined,
        whatsappAiEnabled: aiEnabled,
      })
      if (!res.ok) { setMsg(res.error?.message ?? "Couldn't save"); setSaved(false); return }
      setMsg(null); setSaved(true)
    })
  }

  return (
    <form onSubmit={save} className="mt-3 space-y-4 rounded-2xl border border-border bg-card p-5">
      <div>
        <label className="text-sm font-semibold">Your WhatsApp number</label>
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="+233 24 000 0000"
          className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none focus:border-foreground"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Leave blank to use the shared FixAm WhatsApp number. Customers who message this number reach this garage&apos;s inbox.
        </p>
      </div>
      <div>
        <label className="text-sm font-semibold">WhatsApp phone number ID (optional)</label>
        <input
          value={phoneNumberId}
          onChange={(e) => setPhoneNumberId(e.target.value)}
          placeholder="From Meta → WhatsApp → API setup"
          className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none focus:border-foreground"
        />
        <p className="mt-1 text-xs text-muted-foreground">Only needed if your garage has its own WhatsApp Business number.</p>
      </div>
      <label className="flex items-start gap-3 rounded-xl border border-border p-3.5">
        <input
          type="checkbox"
          checked={aiEnabled}
          onChange={(e) => { setAiEnabled(e.target.checked); setSaved(false) }}
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          <span className="block text-sm font-semibold">Let the AI assistant reply</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Answers job status, hours, bookings and repair requests over WhatsApp — voice notes included. Staff can take over any conversation in the inbox.
          </span>
        </span>
      </label>
      {msg && <p className="rounded-xl border border-danger/30 bg-danger-subtle px-4 py-3 text-sm font-medium text-danger">{msg}</p>}
      {saved && <p className="text-sm font-semibold text-success">Saved.</p>}
      <Button type="submit" loading={pending}>Save WhatsApp settings</Button>
    </form>
  )
}
