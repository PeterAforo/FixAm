"use client"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { CheckCircle2, ExternalLink, Loader2, MessageSquare, Wallet, XCircle } from "lucide-react"
import {
  adminRemoveIntegration,
  adminSaveIntegration,
  adminSetIntegrationActive,
  adminTestSmsProvider,
  type IntegrationView,
} from "@/lib/admin/integration-actions"
import { CATEGORY_LABEL, PROVIDERS, type IntegrationCategory, type ProviderDef } from "@/lib/integrations/registry"
import { cn } from "@/lib/utils"

const inputCls =
  "min-h-10 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

const CATEGORY_ICON = { payments: Wallet, sms: MessageSquare } as const
const CATEGORY_NOTE: Record<IntegrationCategory, string> = {
  payments:
    "Switching gateway affects new payments only. Payments already started are checked with the gateway that took them. Payouts to garages, sellers, tow operators and riders always use theTeller.",
  sms: "Sign-in codes, reminders and receipts go through the provider that is switched on. Send a test first.",
}

export function AdminIntegrationsPanel({ items, env }: { items: IntegrationView[]; env: Record<IntegrationCategory, string> }) {
  const categories: IntegrationCategory[] = ["payments", "sms"]
  return (
    <div className="mt-6 space-y-8">
      {categories.map((cat) => {
        const Icon = CATEGORY_ICON[cat]
        const defs = PROVIDERS.filter((p) => p.category === cat)
        const active = items.find((i) => i.category === cat && i.isActive)
        const activeName = active ? defs.find((d) => d.provider === active.provider)?.name : null
        return (
          <section key={cat} className="rounded-2xl border border-border bg-card">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h2 className="text-base font-semibold">{CATEGORY_LABEL[cat]}</h2>
                  <p className="mt-0.5 max-w-2xl text-[13px] text-muted-foreground">{CATEGORY_NOTE[cat]}</p>
                </div>
              </div>
              <p className="rounded-full bg-surface-muted px-3 py-1.5 text-[13px]">
                Now using: <span className="font-semibold">{activeName ?? env[cat]}</span>
              </p>
            </div>
            <div className="divide-y divide-border">
              {defs.map((def) => (
                <ProviderRow key={def.provider} def={def} item={items.find((i) => i.category === cat && i.provider === def.provider)!} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function ProviderRow({ def, item }: { def: ProviderDef; item: IntegrationView }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {}
    for (const f of def.fields) v[f.key] = f.secret ? "" : (item.values[f.key] ?? (f.options?.[0]?.value ?? ""))
    return v
  })
  const [phone, setPhone] = useState("")
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const run = (fn: () => Promise<{ ok: boolean; error?: { message: string }; data?: unknown }>, okText: string) => {
    setMsg(null)
    start(async () => {
      const res = await fn()
      if (!res.ok) setMsg({ ok: false, text: res.error?.message ?? "Something went wrong" })
      else {
        const dataMsg = (res.data as { message?: string } | undefined)?.message
        setMsg({ ok: true, text: dataMsg ?? okText })
        router.refresh()
      }
    })
  }

  const status = item.isActive
    ? { label: "On", cls: "bg-success-subtle text-success" }
    : item.configured
      ? { label: "Saved", cls: "bg-surface-muted text-foreground" }
      : { label: "Not set up", cls: "bg-surface-muted text-muted-foreground" }

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {def.name}
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", status.cls)}>{status.label}</span>
          </p>
          <p className="text-[13px] text-muted-foreground">
            {def.description}
            {def.docsUrl && (
              <>
                {" "}
                <a href={def.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                  Docs <ExternalLink className="size-3" aria-hidden />
                </a>
              </>
            )}
          </p>
          {def.note && <p className="mt-1 text-[12px] text-muted-foreground">{def.note}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {item.configured && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  () => adminSetIntegrationActive({ category: def.category, provider: def.provider, active: !item.isActive }),
                  item.isActive ? "Switched off — server settings apply again." : `${def.name} is now on.`
                )
              }
              className={cn(
                "h-9 rounded-full px-4 text-[13px] font-semibold disabled:opacity-60",
                item.isActive ? "border border-border bg-card hover:bg-surface-muted" : "bg-foreground text-background"
              )}
            >
              {item.isActive ? "Switch off" : "Switch on"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="h-9 rounded-full border border-border bg-card px-4 text-[13px] font-medium hover:bg-surface-muted"
          >
            {item.configured ? (open ? "Close" : "Edit") : open ? "Close" : "Set up"}
          </button>
        </div>
      </div>

      {item.lastTestAt && (
        <p className={cn("mt-2 flex items-center gap-1.5 text-[12px]", item.lastTestOk ? "text-success" : "text-danger")}>
          {item.lastTestOk ? <CheckCircle2 className="size-3.5" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
          Last test {new Date(item.lastTestAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}:{" "}
          {item.lastTestMessage}
        </p>
      )}

      {open && (
        <form
          className="mt-4 grid gap-3 rounded-xl border border-border bg-surface-muted/30 p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => adminSaveIntegration({ category: def.category, provider: def.provider, values }), "Saved.")
          }}
        >
          {def.fields.map((f) => {
            const saved = f.secret && item.secretsSet.includes(f.key)
            return (
              <label key={f.key} className={cn("grid gap-1 text-sm", f.multiline && "sm:col-span-2")}>
                <span className="font-medium">
                  {f.label}
                  {f.required && <span className="text-danger"> *</span>}
                </span>
                {f.options ? (
                  <select className={inputCls} value={values[f.key]} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}>
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : f.multiline ? (
                  <textarea
                    rows={3}
                    className={cn(inputCls, "py-2 font-mono text-[13px]")}
                    placeholder={f.placeholder}
                    value={values[f.key]}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                ) : (
                  <input
                    type={f.secret ? "password" : "text"}
                    autoComplete="off"
                    className={inputCls}
                    placeholder={saved ? "Saved — leave blank to keep" : f.placeholder}
                    value={values[f.key]}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                )}
                {f.help && <span className="text-[12px] text-muted-foreground">{f.help}</span>}
              </label>
            )
          })}
          <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
            {item.configured && !item.isActive ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => adminRemoveIntegration({ category: def.category, provider: def.provider }), "Removed.")}
                className="h-9 rounded-full px-3 text-[13px] font-medium text-danger hover:bg-danger-subtle disabled:opacity-60"
              >
                Remove saved settings
              </button>
            ) : (
              <span />
            )}
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold text-background disabled:opacity-60"
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Save
            </button>
          </div>
        </form>
      )}

      {def.category === "sms" && item.configured && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => adminTestSmsProvider({ provider: def.provider, phone }), "Test sent.")
          }}
        >
          <label className="sr-only" htmlFor={`test-${def.provider}`}>Phone number for a test SMS</label>
          <input
            id={`test-${def.provider}`}
            inputMode="tel"
            placeholder="024 000 0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={cn(inputCls, "w-44")}
          />
          <button
            type="submit"
            disabled={pending || !phone}
            className="h-10 rounded-full border border-border bg-card px-4 text-[13px] font-medium hover:bg-surface-muted disabled:opacity-60"
          >
            Send test SMS
          </button>
        </form>
      )}

      {msg && (
        <p role="status" className={cn("mt-3 text-sm", msg.ok ? "text-success" : "font-medium text-danger")}>
          {msg.text}
        </p>
      )}
    </div>
  )
}
