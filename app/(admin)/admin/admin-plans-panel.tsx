"use client"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { adminUpsertPlan } from "@/lib/admin/plan-actions"

const inputCls =
  "min-h-10 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

const AUDIENCES = [
  { value: "garage", label: "Garage" },
  { value: "driver", label: "Driver" },
  { value: "vendor", label: "Parts seller" },
  { value: "broker", label: "Broker" },
  { value: "tow", label: "Towing" },
  { value: "rider", label: "Rider" },
] as const

const FEATURE_LABELS: Record<string, string> = {
  core_workshop: "Core workshop",
  invoicing: "Invoicing & receipts",
  reports_basic: "Basic reports",
  reports_multi_branch: "Multi-branch reports",
  inventory: "Parts inventory",
  marketplace: "Vendor marketplace",
  auto_reorder: "Auto reorder",
  reminders: "Reminders engine",
  agent_renewals: "Agent renewals",
  payment_plans: "Payment plans",
  credit_accounts: "Credit accounts",
  fleet_accounts: "Fleet accounts",
  online_catalogue: "Online catalogue",
  gamification: "Gamification",
  custom_branding: "Custom branding",
  priority_support: "Priority support",
  directory_listing: "Directory listing",
}
const FEATURE_KEYS = Object.keys(FEATURE_LABELS)

type Plan = {
  id: string
  code: string
  name: string
  audience: string
  tagline: string | null
  priceGhs: number
  maxBranches: number | null
  maxStaff: number | null
  messageAllowance: number
  features: string[] | null
  isActive: boolean | null
}

type Form = {
  planId: string
  code: string
  name: string
  audience: string
  tagline: string
  priceGhs: string
  maxBranches: string
  maxStaff: string
  messageAllowance: string
  features: string[]
  isActive: boolean
}

const EMPTY: Form = {
  planId: "",
  code: "",
  name: "",
  audience: "garage",
  tagline: "",
  priceGhs: "",
  maxBranches: "",
  maxStaff: "",
  messageAllowance: "0",
  features: [],
  isActive: true,
}

const audienceLabel = (a: string) => AUDIENCES.find((x) => x.value === a)?.label ?? a

export function AdminPlansPanel({ plans }: { plans: Plan[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState<Form>(EMPTY)
  const [filter, setFilter] = useState<string>("all")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const shown = plans.filter((p) => filter === "all" || p.audience === filter)

  const edit = (p: Plan) =>
    setForm({
      planId: p.id,
      code: p.code,
      name: p.name,
      audience: p.audience,
      tagline: p.tagline ?? "",
      priceGhs: String(p.priceGhs),
      maxBranches: p.maxBranches == null ? "" : String(p.maxBranches),
      maxStaff: p.maxStaff == null ? "" : String(p.maxStaff),
      messageAllowance: String(p.messageAllowance),
      features: p.features ?? [],
      isActive: p.isActive !== false,
    })

  const toggleFeature = (k: string) =>
    setForm((f) => ({ ...f, features: f.features.includes(k) ? f.features.filter((x) => x !== k) : [...f.features, k] }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    startTransition(async () => {
      const res = await adminUpsertPlan({
        planId: form.planId || undefined,
        code: form.code,
        name: form.name,
        audience: form.audience,
        tagline: form.tagline,
        priceGhs: Number(form.priceGhs),
        maxBranches: form.maxBranches === "" ? null : Number(form.maxBranches),
        maxStaff: form.maxStaff === "" ? null : Number(form.maxStaff),
        messageAllowance: Number(form.messageAllowance) || 0,
        features: form.features,
        isActive: form.isActive,
      })
      if (!res.ok) {
        setMsg({ ok: false, text: res.error?.message ?? "Save failed" })
        return
      }
      setMsg({ ok: true, text: form.planId ? "Plan saved." : "Plan created." })
      setForm(EMPTY)
      router.refresh()
    })
  }

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[{ value: "all", label: "All" }, ...AUDIENCES].map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => setFilter(a.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === a.value ? "bg-primary text-primary-foreground" : "bg-surface-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {shown.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {p.name}
                    {p.isActive === false ? " (inactive)" : ""}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {audienceLabel(p.audience)} · {p.code} · GH₵{p.priceGhs.toFixed(2)}/mo
                    {p.tagline ? ` · ${p.tagline}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => edit(p)}>
                  Edit
                </Button>
              </CardContent>
            </Card>
          ))}
          {shown.length === 0 && <p className="text-sm text-muted-foreground">No plans in this audience yet.</p>}
        </div>
      </div>

      <Card>
        <CardContent className="p-5">
          <h3 className="font-display text-base font-bold">{form.planId ? "Edit plan" : "New plan"}</h3>
          <form onSubmit={submit} className="mt-3 grid gap-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                className={inputCls}
                placeholder="Code * (e.g. pro)"
                required
                disabled={!!form.planId}
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
              <select
                className={inputCls}
                value={form.audience}
                disabled={!!form.planId}
                onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}
              >
                {AUDIENCES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <input
              className={inputCls}
              placeholder="Plan name *"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              className={inputCls}
              placeholder="Tagline (optional)"
              value={form.tagline}
              onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
            />
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs font-medium text-muted-foreground">
                Price / month (GH₵) *
                <input
                  className={`${inputCls} mt-1`}
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={form.priceGhs}
                  onChange={(e) => setForm((f) => ({ ...f, priceGhs: e.target.value }))}
                />
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                Max staff (blank = ∞)
                <input
                  className={`${inputCls} mt-1`}
                  type="number"
                  min="0"
                  value={form.maxStaff}
                  onChange={(e) => setForm((f) => ({ ...f, maxStaff: e.target.value }))}
                />
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                Max branches (blank = ∞)
                <input
                  className={`${inputCls} mt-1`}
                  type="number"
                  min="0"
                  value={form.maxBranches}
                  onChange={(e) => setForm((f) => ({ ...f, maxBranches: e.target.value }))}
                />
              </label>
            </div>
            <label className="text-xs font-medium text-muted-foreground">
              Monthly message allowance
              <input
                className={`${inputCls} mt-1`}
                type="number"
                min="0"
                required
                value={form.messageAllowance}
                onChange={(e) => setForm((f) => ({ ...f, messageAllowance: e.target.value }))}
              />
            </label>
            <fieldset>
              <legend className="text-xs font-medium text-muted-foreground">Features</legend>
              <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
                {FEATURE_KEYS.map((k) => (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.features.includes(k)} onChange={() => toggleFeature(k)} />
                    {FEATURE_LABELS[k]}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
              Active (visible at signup)
            </label>
            <div className="flex items-center gap-2 pt-1">
              <Button type="submit" disabled={pending}>
                {form.planId ? "Save changes" : "Create plan"}
              </Button>
              {form.planId && (
                <Button type="button" variant="secondary" onClick={() => setForm(EMPTY)}>
                  Cancel
                </Button>
              )}
              {msg && <p className={`text-sm font-semibold ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
