"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"
import { Button } from "@/components/brand/button"
import { createCustomer, updateCustomer } from "@/lib/customers/actions"
import { useFocusTrap } from "@/lib/use-focus-trap"

export type CustomerFormValues = {
  id?: string
  type: "individual" | "business" | "fleet"
  fullName: string
  companyName: string
  phone: string
  altPhone: string
  email: string
  whatsappOptIn: boolean
  marketingOptIn: boolean
  preferredChannels: string[]
  tags: string[]
  notes: string
  address: string
}

const EMPTY: CustomerFormValues = {
  type: "individual",
  fullName: "",
  companyName: "",
  phone: "",
  altPhone: "",
  email: "",
  whatsappOptIn: true,
  marketingOptIn: false,
  preferredChannels: ["whatsapp", "sms"],
  tags: [],
  notes: "",
  address: "",
}

const CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
  { value: "push", label: "Push" },
] as const

const inputCls =
  "min-h-11 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"
const labelCls = "text-xs font-semibold text-muted-foreground"

export function CustomerFormDrawer({
  garageId,
  garageSlug,
  open,
  onClose,
  onSaved,
  initial,
}: {
  garageId: string
  garageSlug: string
  open: boolean
  onClose: () => void
  onSaved?: (customerId: string) => void
  initial?: CustomerFormValues
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState<CustomerFormValues>(initial ?? EMPTY)
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(", "))
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, onClose, open)

  // reset when opened with different initial values
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      const v = initial ?? EMPTY
      setForm(v)
      setTagsText(v.tags.join(", "))
      setError(null)
      setFieldErrors({})
      setDuplicate(null)
    }
  }

  if (!open) return null

  const set = <K extends keyof CustomerFormValues>(k: K, v: CustomerFormValues[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  function toggleChannel(ch: string) {
    set(
      "preferredChannels",
      form.preferredChannels.includes(ch)
        ? form.preferredChannels.filter((c) => c !== ch)
        : [...form.preferredChannels, ch]
    )
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    setDuplicate(null)

    const customer = {
      type: form.type,
      fullName: form.fullName.trim(),
      companyName: form.companyName.trim(),
      phone: form.phone.trim(),
      altPhone: form.altPhone.trim(),
      email: form.email.trim(),
      whatsappOptIn: form.whatsappOptIn,
      marketingOptIn: form.marketingOptIn,
      preferredChannels: form.preferredChannels,
      tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
      notes: form.notes.trim(),
      address: form.address.trim(),
    }

    startTransition(async () => {
      const res = form.id
        ? await updateCustomer({ garageId, customerId: form.id, customer })
        : await createCustomer({ garageId, customer })

      if (!res.ok) {
        setError(res.error.message)
        setFieldErrors(res.error.fieldErrors ?? {})
        return
      }
      if (res.data.duplicate) {
        setDuplicate(res.data.duplicate)
        return
      }
      onSaved?.(res.data.customerId)
      onClose()
      router.refresh()
    })
  }

  const fe = (k: string) => fieldErrors[k]?.[0]

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button
        className="absolute inset-0 bg-midnight-950/50"
        onClick={onClose}
        aria-label="Close"
      />
      <div ref={panelRef} tabIndex={-1} className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-background shadow-1 outline-none">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-display text-xl font-semibold">
            {form.id ? "Edit customer" : "New customer"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-surface-muted" aria-label="Close">
            <X className="size-5" />
          </button>
        </header>

        <form onSubmit={submit} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className="block space-y-1">
            <span className={labelCls}>Type</span>
            <select
              className={inputCls}
              value={form.type}
              onChange={(e) => set("type", e.target.value as CustomerFormValues["type"])}
            >
              <option value="individual">Individual</option>
              <option value="business">Business</option>
              <option value="fleet">Fleet</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className={labelCls}>{form.type === "individual" ? "Full name" : "Contact name"}</span>
            <input
              className={inputCls}
              value={form.fullName}
              onChange={(e) => set("fullName", e.target.value)}
              required={form.type === "individual"}
            />
            {fe("fullName") && <span className="text-xs font-semibold text-danger">{fe("fullName")}</span>}
          </label>

          {form.type !== "individual" && (
            <label className="block space-y-1">
              <span className={labelCls}>Company name</span>
              <input
                className={inputCls}
                value={form.companyName}
                onChange={(e) => set("companyName", e.target.value)}
                required
              />
              {fe("companyName") && <span className="text-xs font-semibold text-danger">{fe("companyName")}</span>}
            </label>
          )}

          <label className="block space-y-1">
            <span className={labelCls}>Phone</span>
            <input
              className={`${inputCls} font-mono`}
              inputMode="tel"
              placeholder="0241234567"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              required
            />
            {fe("phone") && <span className="text-xs font-semibold text-danger">{fe("phone")}</span>}
          </label>

          <label className="block space-y-1">
            <span className={labelCls}>Alt phone (optional)</span>
            <input
              className={`${inputCls} font-mono`}
              inputMode="tel"
              value={form.altPhone}
              onChange={(e) => set("altPhone", e.target.value)}
            />
            {fe("altPhone") && <span className="text-xs font-semibold text-danger">{fe("altPhone")}</span>}
          </label>

          <label className="block space-y-1">
            <span className={labelCls}>Email (optional)</span>
            <input
              className={inputCls}
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
            {fe("email") && <span className="text-xs font-semibold text-danger">{fe("email")}</span>}
          </label>

          <fieldset className="space-y-2">
            <legend className={labelCls}>Preferred channels</legend>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map((ch) => {
                const active = form.preferredChannels.includes(ch.value)
                return (
                  <button
                    key={ch.value}
                    type="button"
                    onClick={() => toggleChannel(ch.value)}
                    className={`rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? "border-border bg-primary text-primary-foreground"
                        : "border-border bg-surface text-muted-foreground hover:bg-surface-muted"
                    }`}
                  >
                    {ch.label}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.whatsappOptIn}
                onChange={(e) => set("whatsappOptIn", e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              WhatsApp opt-in
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.marketingOptIn}
                onChange={(e) => set("marketingOptIn", e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              Marketing opt-in
            </label>
          </div>

          <label className="block space-y-1">
            <span className={labelCls}>Tags (comma separated)</span>
            <input
              className={inputCls}
              placeholder="vip, fleet, referred"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
            />
          </label>

          <label className="block space-y-1">
            <span className={labelCls}>Address</span>
            <input className={inputCls} value={form.address} onChange={(e) => set("address", e.target.value)} />
          </label>

          <label className="block space-y-1">
            <span className={labelCls}>Notes</span>
            <textarea
              className={`${inputCls} min-h-24 py-2`}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </label>

          {error && (
            <p role="alert" className="rounded-lg border border-danger bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
              {error}
            </p>
          )}
          {duplicate && (
            <div className="rounded-lg border border-accent bg-accent/10 px-3 py-2 text-sm">
              <p className="font-semibold">A customer with this phone already exists:</p>
              <Link
                href={`/g/${garageSlug}/customers/${duplicate.id}`}
                className="font-semibold text-primary underline"
                onClick={onClose}
              >
                Open {duplicate.name} →
              </Link>
            </div>
          )}
        </form>

        <footer className="border-t border-border px-5 py-4">
          <Button type="button" className="w-full" disabled={pending} onClick={submit}>
            {pending ? "Saving…" : form.id ? "Save changes" : "Create customer"}
          </Button>
        </footer>
      </div>
    </div>
  )
}
