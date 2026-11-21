"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Pencil, Plus, Power } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { EmptyState } from "@/components/brand/empty-state"
import { StatusPill } from "@/components/brand/status-pill"
import {
  createJobTemplate,
  setJobTemplateActive,
  updateJobTemplate,
} from "@/lib/job-templates/actions"

type DefaultItem = { type: string; description: string; quantity: number; unitPricePesewas: number }
type ChecklistItem = { label: string; required: boolean }

export type TemplateRow = {
  id: string
  name: string
  description: string | null
  defaultItems: unknown
  checklist: unknown
  estimatedMinutes: number | null
  depositPercent: number | null
  createsDueItemType: string | null
  isActive: boolean
}

const DUE_TYPES = [
  ["", "— none —"],
  ["oil_change", "Oil change"],
  ["general_service", "General service"],
  ["insurance", "Insurance"],
  ["roadworthy", "Roadworthy"],
  ["registration_licence", "Registration/licence"],
  ["drivers_licence", "Driver's licence"],
  ["instalment", "Instalment"],
  ["credit_statement", "Credit statement"],
  ["custom", "Custom"],
] as const

const inputCls =
  "min-h-10 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
const labelCls = "text-xs font-bold uppercase tracking-wide text-muted-foreground"

function asItems(v: unknown): DefaultItem[] {
  return Array.isArray(v) ? (v as DefaultItem[]) : []
}
function asChecklist(v: unknown): ChecklistItem[] {
  return Array.isArray(v) ? (v as ChecklistItem[]) : []
}

type FormState = {
  id?: string
  name: string
  description: string
  estimatedMinutes: string
  depositPercent: string
  createsDueItemType: string
  isActive: boolean
  itemsText: string
  checklistText: string
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  estimatedMinutes: "",
  depositPercent: "",
  createsDueItemType: "",
  isActive: true,
  itemsText: "",
  checklistText: "",
}

function formFromTemplate(t: TemplateRow): FormState {
  return {
    id: t.id,
    name: t.name,
    description: t.description ?? "",
    estimatedMinutes: t.estimatedMinutes?.toString() ?? "",
    depositPercent: t.depositPercent?.toString() ?? "",
    createsDueItemType: t.createsDueItemType ?? "",
    isActive: t.isActive,
    itemsText: asItems(t.defaultItems)
      .map((i) => `${i.description} | ${i.quantity} | ${(i.unitPricePesewas / 100).toFixed(2)}`)
      .join("\n"),
    checklistText: asChecklist(t.checklist)
      .map((c) => `${c.label}${c.required ? " (required)" : ""}`)
      .join("\n"),
  }
}

/** Parse "desc | qty | priceGHS" lines into default items. */
function parseItems(text: string): DefaultItem[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [desc, qty, price] = line.split("|").map((s) => s.trim())
      return {
        type: "labour",
        description: desc ?? "",
        quantity: qty ? Number(qty) : 1,
        unitPricePesewas: price ? Math.round(Number(price) * 100) : 0,
      }
    })
}

function parseChecklist(text: string): ChecklistItem[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const required = /\(required\)\s*$/i.test(line)
      return { label: line.replace(/\s*\(required\)\s*$/i, "").trim(), required }
    })
}

export function TemplatesPanel({
  garageSlug,
  garageId,
  templates,
}: {
  garageSlug: string
  garageId: string
  templates: TemplateRow[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState<FormState | null>(null)
  const [error, setError] = useState<string | null>(null)

  function submit() {
    if (!form) return
    setError(null)
    const template = {
      name: form.name,
      description: form.description || undefined,
      estimatedMinutes: form.estimatedMinutes ? Number(form.estimatedMinutes) : null,
      depositPercent: form.depositPercent ? Number(form.depositPercent) : null,
      createsDueItemType: (form.createsDueItemType || null) as "oil_change" | null,
      isActive: form.isActive,
      defaultItems: parseItems(form.itemsText),
      checklist: parseChecklist(form.checklistText),
    }
    startTransition(async () => {
      const res = form.id
        ? await updateJobTemplate({ garageId, templateId: form.id, template })
        : await createJobTemplate({ garageId, template })
      if (!res.ok) {
        setError(res.error.message)
        return
      }
      setForm(null)
      router.refresh()
    })
  }

  function toggle(t: TemplateRow) {
    startTransition(async () => {
      await setJobTemplateActive({ garageId, templateId: t.id, isActive: !t.isActive })
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href={`/g/${garageSlug}/settings`} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
            ← Settings
          </Link>
          <h1 className="mt-1 font-display text-3xl font-bold">Job templates</h1>
          <p className="text-muted-foreground">
            Reusable job blueprints — default items, checklists, estimates and due-item triggers.
          </p>
        </div>
        {!form && (
          <Button onClick={() => { setForm(EMPTY_FORM); setError(null) }}>
            <Plus className="size-4" /> New template
          </Button>
        )}
      </header>

      {form && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="font-display text-lg font-bold">{form.id ? "Edit template" : "New template"}</h2>
            {error && <p className="rounded-lg border-2 border-danger bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Name *</label>
                <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Oil service — fully synthetic" />
              </div>
              <div>
                <label className={labelCls}>Creates due item</label>
                <select className={inputCls} value={form.createsDueItemType} onChange={(e) => setForm({ ...form, createsDueItemType: e.target.value })}>
                  {DUE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={labelCls}>Description</label>
              <input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={labelCls}>Est. minutes</label>
                <input className={inputCls} type="number" min={0} value={form.estimatedMinutes} onChange={(e) => setForm({ ...form, estimatedMinutes: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Deposit %</label>
                <input className={inputCls} type="number" min={0} max={100} value={form.depositPercent} onChange={(e) => setForm({ ...form, depositPercent: e.target.value })} />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm font-semibold">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                Active
              </label>
            </div>

            <div>
              <label className={labelCls}>Default items — one per line: description | qty | price (GH₵)</label>
              <textarea
                className={`${inputCls} min-h-28 py-2 font-mono text-xs`}
                placeholder={"Engine oil 5W-30 | 4 | 180.00\nOil filter | 1 | 45.00\nLabour | 1.5 | 150.00"}
                value={form.itemsText}
                onChange={(e) => setForm({ ...form, itemsText: e.target.value })}
              />
            </div>

            <div>
              <label className={labelCls}>Checklist — one per line, append &quot;(required)&quot;</label>
              <textarea
                className={`${inputCls} min-h-24 py-2 font-mono text-xs`}
                placeholder={"Check oil level\nInspect brakes (required)\nTest battery"}
                value={form.checklistText}
                onChange={(e) => setForm({ ...form, checklistText: e.target.value })}
              />
            </div>

            <div className="flex gap-2">
              <Button disabled={pending || !form.name.trim()} onClick={submit}>
                {pending ? "Saving…" : form.id ? "Save changes" : "Create template"}
              </Button>
              <Button variant="ghost" onClick={() => setForm(null)}>
                <ArrowLeft className="size-4" /> Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {templates.length === 0 && !form ? (
        <EmptyState
          pose="toolbox"
          title="No templates yet"
          description="Create templates like Oil service or Brake pads to speed up check-in and estimates."
          action={<Button onClick={() => setForm(EMPTY_FORM)}><Plus className="size-4" /> New template</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map((t) => {
            const items = asItems(t.defaultItems)
            const checks = asChecklist(t.checklist)
            return (
              <Card key={t.id} className={t.isActive ? "" : "opacity-60"}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display text-lg font-bold">{t.name}</h3>
                      {t.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{t.description}</p>}
                    </div>
                    <StatusPill tone={t.isActive ? "ok" : "neutral"}>{t.isActive ? "active" : "inactive"}</StatusPill>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                    {t.estimatedMinutes != null && (
                      <span className="rounded-pill border border-border bg-surface-muted px-2 py-0.5 font-semibold">
                        ~{Math.round(t.estimatedMinutes / 60 * 10) / 10}h
                      </span>
                    )}
                    {t.depositPercent != null && t.depositPercent > 0 && (
                      <span className="rounded-pill border border-border bg-surface-muted px-2 py-0.5 font-semibold">
                        {t.depositPercent}% deposit
                      </span>
                    )}
                    {t.createsDueItemType && (
                      <span className="rounded-pill border border-border bg-surface-muted px-2 py-0.5 font-semibold">
                        → {t.createsDueItemType.replace(/_/g, " ")}
                      </span>
                    )}
                    <span className="rounded-pill border border-border bg-surface-muted px-2 py-0.5 font-semibold">
                      {items.length} items
                    </span>
                    <span className="rounded-pill border border-border bg-surface-muted px-2 py-0.5 font-semibold">
                      {checks.length} checks
                    </span>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => { setForm(formFromTemplate(t)); setError(null) }}>
                      <Pencil className="size-4" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => toggle(t)}>
                      <Power className="size-4" /> {t.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
