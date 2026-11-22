"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { StatusPill, statusTone } from "@/components/brand/status-pill"
import { sendReminderNow, upsertMessageTemplate } from "@/lib/reminders/actions"

type Data = Extract<Awaited<ReturnType<typeof import("@/lib/reminders/actions").listRemindersData>>, { ok: true }>["data"]

const inputCls = "min-h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

export function RemindersPanel({ garageId, data }: { garageId: string; data: Data }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [tab, setTab] = useState<"upcoming" | "sent" | "templates">("upcoming")
  const [msg, setMsg] = useState<string | null>(null)
  const [editTpl, setEditTpl] = useState<Data["templates"][number] | null>(null)
  const [tplForm, setTplForm] = useState({ body: "", subject: "", isActive: true })

  const upcoming = data.items
  const overdue = upcoming.filter((i) => i.daysUntil != null && i.daysUntil < 0)
  const dueSoon = upcoming.filter((i) => i.daysUntil != null && i.daysUntil >= 0)

  function sendNow(dueItemId: string) {
    startTransition(async () => {
      const res = await sendReminderNow({ garageId, dueItemId })
      setMsg(res.ok ? "Reminder sent" : res.error.message)
      router.refresh()
    })
  }

  function openTpl(t: Data["templates"][number]) {
    setEditTpl(t)
    setTplForm({ body: t.body, subject: t.subject ?? "", isActive: t.isActive ?? true })
  }

  function saveTpl(e: React.FormEvent) {
    e.preventDefault()
    if (!editTpl) return
    startTransition(async () => {
      const res = await upsertMessageTemplate({
        garageId, key: editTpl.key, channel: editTpl.channel as never,
        subject: tplForm.subject || undefined, body: tplForm.body,
        isActive: tplForm.isActive,
      })
      if (!res.ok) { setMsg(res.error.message); return }
      setMsg("Template saved"); setEditTpl(null); router.refresh()
    })
  }

  function resetTpl(t: Data["templates"][number]) {
    startTransition(async () => {
      const res = await upsertMessageTemplate({ garageId, key: t.key, channel: t.channel as never, body: t.body, resetToDefault: true })
      if (!res.ok) { setMsg(res.error.message); return }
      setMsg("Reset to platform default"); router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em]">Reminders</h1>
          <p className="text-sm text-muted-foreground">{upcoming.length} open items · {overdue.length} overdue · hourly engine scan</p>
        </div>
        <div className="flex gap-2">
          {(["upcoming", "sent", "templates"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {msg && <p className="rounded-lg bg-info/10 px-3 py-2 text-sm">{msg}</p>}

      {tab === "upcoming" && (
        <div className="space-y-4">
          {overdue.length > 0 && (
            <section>
              <h2 className="mb-2 text-[15px] font-semibold text-danger">Overdue</h2>
              <DueTable items={overdue} canSend={data.canSend} pending={pending} onSend={sendNow} />
            </section>
          )}
          <section>
            <h2 className="mb-2 text-[15px] font-semibold">Upcoming &amp; due</h2>
            <DueTable items={dueSoon} canSend={data.canSend} pending={pending} onSend={sendNow} />
          </section>
        </div>
      )}

      {tab === "sent" && (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted/40 text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-3">When</th><th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Template</th><th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Status</th><th className="px-4 py-3">Converted</th>
              </tr>
            </thead>
            <tbody>
              {data.sends.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No messages yet</td></tr>}
              {data.sends.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="px-4 py-3 text-xs">{s.sentAt?.slice(0, 16).replace("T", " ") ?? s.createdAt.slice(0, 16).replace("T", " ")}</td>
                  <td className="px-4 py-3 capitalize">{s.channel}</td>
                  <td className="px-4 py-3 font-mono text-xs">{s.templateKey}</td>
                  <td className="px-4 py-3 text-xs">{s.dueItemCount}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={s.status} tone={statusTone(s.status)} />
                    {s.failedReason && <p className="mt-1 text-xs text-danger">{s.failedReason}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {s.convertedBookingId && <span className="text-success">booking ✓</span>}
                    {s.convertedRenewalId && <span className="text-success"> renewal ✓</span>}
                    {!s.convertedBookingId && !s.convertedRenewalId && "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}

      {tab === "templates" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Garage overrides replace the platform default. Edits apply to future sends only.</p>
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-3">Key</th><th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3">Override</th><th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.templates.map((t) => (
                  <tr key={`${t.key}-${t.channel}-${t.id}`} className="border-b last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">{t.key}</td>
                    <td className="px-4 py-3 capitalize">{t.channel}</td>
                    <td className="px-4 py-3 text-xs">{t.isOverride ? <StatusPill status="override" tone="info" /> : <span className="text-muted-foreground">platform</span>}</td>
                    <td className="px-4 py-3 text-right">
                      {data.canManage && (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" className="!min-h-8 px-2 text-xs" onClick={() => openTpl(t)}>Edit</Button>
                          {t.isOverride && <Button variant="ghost" className="!min-h-8 px-2 text-xs text-danger" onClick={() => resetTpl(t)}>Reset</Button>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>
        </div>
      )}

      {editTpl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditTpl(null)}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-5">
              <h3 className="text-[15px] font-semibold">{editTpl.key} · {editTpl.channel}</h3>
              {editTpl.isOverride && <p className="mt-1 text-xs text-muted-foreground">Currently overriding platform default.</p>}
              {!editTpl.isOverride && editTpl.platformBody && (
                <p className="mt-2 rounded-lg bg-muted p-2 text-xs text-muted-foreground">Default: {editTpl.platformBody.slice(0, 140)}{editTpl.platformBody.length > 140 ? "…" : ""}</p>
              )}
              <form onSubmit={saveTpl} className="mt-3 space-y-3">
                {editTpl.channel === "email" && (
                  <input value={tplForm.subject} onChange={(e) => setTplForm({ ...tplForm, subject: e.target.value })} placeholder="Subject" className={inputCls} />
                )}
                <textarea value={tplForm.body} onChange={(e) => setTplForm({ ...tplForm, body: e.target.value })} rows={5} className={inputCls} required />
                <p className="text-xs text-muted-foreground">Variables: {"{{customer_first_name}} {{garage_name}} {{vehicle}} {{plate}} {{due_title}} {{due_date}} {{action_url}} {{due_items}}"}</p>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={tplForm.isActive} onChange={(e) => setTplForm({ ...tplForm, isActive: e.target.checked })} /> Active
                </label>
                <div className="flex gap-2">
                  <Button type="submit" disabled={pending}>Save override</Button>
                  <Button type="button" variant="secondary" onClick={() => setEditTpl(null)}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function DueTable(props: { items: Data["items"]; canSend: boolean; pending: boolean; onSend: (id: string) => void }) {
  const { items, canSend, pending, onSend } = props
  if (items.length === 0) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nothing here — nice.</CardContent></Card>
  }
  return (
    <Card><CardContent className="p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-muted/40 text-left text-xs font-medium text-muted-foreground">
            <th className="px-4 py-3">Due item</th><th className="px-4 py-3">Customer / vehicle</th>
            <th className="px-4 py-3">Effective</th><th className="px-4 py-3">In</th>
            <th className="px-4 py-3">Status</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-b last:border-0">
              <td className="px-4 py-3"><p className="font-medium">{i.title}</p><p className="text-xs capitalize text-muted-foreground">{i.type.replace(/_/g, " ")}</p></td>
              <td className="px-4 py-3 text-xs">{i.customerName}<br /><span className="text-muted-foreground">{[i.make, i.model, i.plate].filter(Boolean).join(" ")}</span></td>
              <td className="px-4 py-3 text-xs">{i.effective ?? "—"}{i.dueMileageKm ? ` · ${i.dueMileageKm}km` : ""}</td>
              <td className="px-4 py-3 text-xs tabular-nums">{i.daysUntil == null ? "—" : i.daysUntil < 0 ? `${-i.daysUntil}d overdue` : i.daysUntil === 0 ? "today" : `${i.daysUntil}d`}</td>
              <td className="px-4 py-3"><StatusPill status={i.computedStatus} tone={statusTone(i.computedStatus)} /></td>
              <td className="px-4 py-3 text-xs tabular-nums">{i.escalationStage}</td>
              <td className="px-4 py-3 text-right">{canSend && <Button variant="ghost" className="!min-h-8 px-2 text-xs" disabled={pending} onClick={() => onSend(i.id)}>Send now</Button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardContent></Card>
  )
}
