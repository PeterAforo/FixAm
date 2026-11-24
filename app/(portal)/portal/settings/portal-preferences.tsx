"use client"

import { useEffect, useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { updatePortalPreferences } from "@/lib/portal/actions"
import { requestDataDeletion, requestDataExport } from "@/lib/privacy/actions"

export type PortalPrefs = {
  preferredChannels: string[]
  marketingOptIn: boolean
  seasonalTips: boolean
  linkedGarages: number
}

const CHANNELS: { key: "whatsapp" | "sms" | "push" | "email"; label: string; hint: string }[] = [
  { key: "whatsapp", label: "WhatsApp", hint: "Reminders, job updates and payment links" },
  { key: "sms", label: "SMS", hint: "Works on any phone, even without data" },
  { key: "push", label: "App notifications", hint: "When FixAm is on your home screen" },
  { key: "email", label: "Email", hint: "Receipts and invoices" },
]

/** Notification channels + what we send. Moved here from the driver home page. */
export function PortalNotificationsCard({ prefs }: { prefs: PortalPrefs }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [channels, setChannels] = useState<string[]>(prefs.preferredChannels)
  const [marketing, setMarketing] = useState(prefs.marketingOptIn)
  const [seasonal, setSeasonal] = useState(prefs.seasonalTips)

  function save() {
    setMsg(null)
    start(async () => {
      const res = await updatePortalPreferences({
        // WhatsApp consent follows the WhatsApp channel box.
        whatsappOptIn: channels.includes("whatsapp"),
        preferredChannels: channels,
        marketingOptIn: marketing,
        seasonalTips: seasonal,
      })
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error.message })
    })
  }

  return (
    <Card><CardContent className="space-y-5 p-5">
      <div>
        <h2 className="font-display text-base font-bold">Notifications</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {prefs.linkedGarages > 0
            ? "How your garages and FixAm reach you about your car."
            : "These apply once a garage adds you as a customer."}
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Reach me by</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {CHANNELS.map((c) => (
            <label key={c.key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[var(--primary)]"
                checked={channels.includes(c.key)}
                onChange={(e) => setChannels(e.target.checked ? [...channels, c.key] : channels.filter((x) => x !== c.key))}
              />
              <span>
                <span className="block text-sm font-medium">{c.label}</span>
                <span className="block text-xs text-muted-foreground">{c.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {channels.length === 0 && <p className="text-xs font-medium text-danger">Pick at least one way to reach you.</p>}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Also send me</legend>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={seasonal} onChange={(e) => setSeasonal(e.target.checked)} />
          Harmattan and rainy-season car-care tips
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
          Offers and promotions from my garages
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={save} disabled={pending || channels.length === 0}>Save notifications</Button>
        {msg && <span className={msg.ok ? "text-sm font-medium text-success" : "text-sm font-medium text-danger"}>{msg.text}</span>}
      </div>
      <InstallPrompt />
    </CardContent></Card>
  )
}

/** Data Protection Act (Act 843) export / deletion requests. */
export function PortalPrivacyCard() {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <Card><CardContent className="space-y-3 p-5 text-sm">
      <h2 className="font-display text-base font-bold">Your data</h2>
      <p className="text-muted-foreground">Under Ghana&apos;s Data Protection Act, 2012 (Act 843) you can ask for a copy of your data or have it deleted.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => {
          const res = await requestDataExport()
          setMsg(res.ok ? "Export requested — the platform team will send your data." : res.error.message)
        })}>Request data export</Button>
        <Button size="sm" variant="danger" disabled={pending} onClick={() => {
          if (!confirm("This will permanently anonymise your customer records. Continue?")) return
          start(async () => {
            const res = await requestDataDeletion()
            setMsg(res.ok ? "Deletion requested — records will be anonymised after review." : res.error.message)
          })
        }}>Request data deletion</Button>
      </div>
      {msg && <p className="font-medium text-success">{msg}</p>}
    </CardContent></Card>
  )
}

function InstallPrompt() {
  const [deferred, setDeferred] = useState<{ prompt: () => Promise<void> } | null>(null)
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferred(e as unknown as { prompt: () => Promise<void> })
    }
    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])
  if (!deferred) return <p className="text-xs text-muted-foreground">Tip: add FixAm to your home screen to get app notifications.</p>
  return (
    <Button size="sm" variant="secondary" onClick={async () => {
      await deferred.prompt()
      setDeferred(null)
    }}>Install the FixAm app</Button>
  )
}
