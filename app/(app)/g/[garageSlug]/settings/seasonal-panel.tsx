"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import {
  previewSeasonalMessage,
  setSeasonalEnabled,
  updateSeasonalCampaign,
  type SeasonalCampaignView,
  type SeasonalOverview,
} from "@/lib/seasonal/actions"

const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

const STATUS: Record<string, { label: string; cls: string }> = {
  scheduled: { label: "Scheduled", cls: "bg-sky-50 text-sky-900" },
  sending: { label: "Sending", cls: "bg-amber-50 text-amber-900" },
  sent: { label: "Sent", cls: "bg-emerald-50 text-emerald-900" },
  skipped: { label: "Skipped", cls: "bg-surface-muted text-muted-foreground" },
  expired: { label: "Not sent", cls: "bg-surface-muted text-muted-foreground" },
}

function CampaignRow({ garageId, c: initial }: { garageId: string; c: SeasonalCampaignView }) {
  const [c, setC] = useState(initial)
  const [offer, setOffer] = useState(initial.offerText ?? "")
  const [preview, setPreview] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const editable = c.status === "scheduled" || c.status === "skipped"
  const st = STATUS[c.status] ?? STATUS.scheduled

  const save = (patch: { offerText?: string | null; skip?: boolean }) => {
    setMsg(null)
    start(async () => {
      const r = await updateSeasonalCampaign({ garageId, campaignId: c.id, ...patch })
      if (r.ok) { setC({ ...c, status: r.data.status, offerText: r.data.offerText }); setMsg("Saved") }
      else setMsg(r.error.message)
    })
  }
  const showPreview = () => start(async () => {
    const r = await previewSeasonalMessage({ garageId, season: c.season, offerText: offer || null })
    setPreview(r.ok ? `${r.data.sms}  (${r.data.length} characters)` : r.error.message)
  })

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{c.title}</p>
          <p className="text-xs text-muted-foreground">Sends {day(c.sendOn)}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
      </div>

      {(c.status === "sending" || c.status === "sent") && (
        <p className="mt-2 text-xs text-muted-foreground">
          {c.sentCount} sent{c.recipientsCount > c.sentCount ? ` of ${c.recipientsCount}` : ""}
          {c.failedCount ? ` · ${c.failedCount} failed` : ""}
          {c.skippedCount ? ` · ${c.skippedCount} skipped (opted out or messaged recently)` : ""}
          {` · ${c.bookingsCount} ${c.bookingsCount === 1 ? "booking" : "bookings"} from it`}
        </p>
      )}

      {editable && (
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-medium">
            Add an offer <span className="font-normal text-muted-foreground">(optional, max 80 characters)</span>
            <input
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              value={offer}
              maxLength={80}
              placeholder={c.season === "harmattan" ? "e.g. Free air filter check this month" : "e.g. 10% off wiper blades till end of month"}
              onChange={(e) => setOffer(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {c.status === "scheduled" && <Button size="sm" variant="secondary" disabled={pending || offer === (c.offerText ?? "")} onClick={() => save({ offerText: offer || null })}>Save offer</Button>}
            <Button size="sm" variant="ghost" disabled={pending} onClick={showPreview}>Preview SMS</Button>
            {c.status === "scheduled"
              ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => save({ skip: true })}>Skip this one</Button>
              : <Button size="sm" variant="tonal" disabled={pending} onClick={() => save({ skip: false })}>Send it after all</Button>}
          </div>
          {preview && <p className="rounded-lg bg-surface-sunken p-2 font-mono text-[11px] leading-relaxed">{preview}</p>}
        </div>
      )}
      {msg && <p className="mt-1 text-xs text-muted-foreground" role="status">{msg}</p>}
    </li>
  )
}

/** P8-11: harmattan and rainy-season reminders for this garage's customers. */
export function SeasonalPanel({ garageId, overview }: { garageId: string; overview: SeasonalOverview }) {
  const [enabled, setEnabled] = useState(overview.enabled)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <div id="seasonal" className="mt-3 space-y-4">
      <label className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
        <input
          type="checkbox"
          className="mt-1"
          checked={enabled}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.checked
            setEnabled(v)
            start(async () => {
              const r = await setSeasonalEnabled({ garageId, enabled: v })
              setMsg(r.ok ? "Saved" : r.error.message)
            })
          }}
        />
        <span>
          <span className="block text-sm font-semibold">Send harmattan and rainy-season reminders</span>
          <span className="block text-xs text-muted-foreground">
            FixAm messages your customers when the season changes, with a short checklist and your booking link.
            Timed for your area: {overview.zoneLabel}{overview.region ? ` — ${overview.region}` : " (set your region in your garage profile)"}.
            Only customers you&apos;ve serviced in the last 18 months; never during your quiet hours; anyone can tap a link to stop.
          </span>
          <span className="mt-1 block text-xs">
            About <strong>{overview.reachable}</strong> customers would get the next one{overview.optedOut ? ` · ${overview.optedOut} have said stop` : ""}.
          </span>
          {msg && <span className="mt-1 block text-xs">{msg}</span>}
        </span>
      </label>

      {enabled && overview.campaigns.length > 0 && (
        <ul className="space-y-2">
          {overview.campaigns.map((c) => <CampaignRow key={c.id} garageId={garageId} c={c} />)}
        </ul>
      )}

      {enabled && overview.upcoming.length > 0 && (
        <div className="rounded-xl border border-dashed border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Coming up</p>
          <ul className="mt-2 space-y-1 text-sm">
            {overview.upcoming.map((u) => (
              <li key={`${u.season}-${u.sendOn}`} className="flex justify-between">
                <span>{u.title}</span><span className="text-muted-foreground">{day(u.sendOn)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">You&apos;ll get a notification a week before each one, so you can add an offer or skip it.</p>
        </div>
      )}
    </div>
  )
}
