"use client"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { adminSavePlatformSettings } from "@/lib/admin/settings-actions"
import type { PlatformSettings } from "@/lib/platform/settings"

const inputCls =
  "h-10 w-24 rounded-lg border-2 border-border bg-surface px-3 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"

type Row = { key: keyof Form; label: string; help: string; unit: "%" | "quotes" | "garages"; step: string }

type Form = {
  vendorCommissionPct: string
  vendorProCommissionPct: string
  towCommissionPct: string
  riderCommissionPct: string
  brokerFreeQuotesPerMonth: string
  freeGaragePlaces: string
}

const ROWS: Row[] = [
  { key: "vendorCommissionPct", label: "Parts seller order fee", help: "Taken from each paid marketplace order (Seller plan).", unit: "%", step: "0.5" },
  { key: "vendorProCommissionPct", label: "Seller Pro order fee", help: "The lower fee for sellers on Seller Pro.", unit: "%", step: "0.5" },
  { key: "towCommissionPct", label: "Tow fee", help: "Kept from each tow paid by MoMo before the operator is paid.", unit: "%", step: "0.5" },
  { key: "riderCommissionPct", label: "Rider fee", help: "Kept from each delivery fee before the rider is paid.", unit: "%", step: "0.5" },
  { key: "brokerFreeQuotesPerMonth", label: "Free broker quotes", help: "Quotes a broker on the free plan can send each month.", unit: "quotes", step: "1" },
  { key: "freeGaragePlaces", label: "Free garage places", help: "How many garages you can make free (Garages → ⋯ → Make free).", unit: "garages", step: "1" },
]

const toForm = (s: PlatformSettings): Form => ({
  vendorCommissionPct: String(s.vendorCommissionBp / 100),
  vendorProCommissionPct: String(s.vendorProCommissionBp / 100),
  towCommissionPct: String(s.towCommissionBp / 100),
  riderCommissionPct: String(s.riderCommissionBp / 100),
  brokerFreeQuotesPerMonth: String(s.brokerFreeQuotesPerMonth),
  freeGaragePlaces: String(s.freeGaragePlaces),
})

/** Fees FixAm takes on marketplace work, plus allowances. */
export function AdminFeesPanel({ settings, freeUsed }: { settings: PlatformSettings; freeUsed: number | null }) {
  const router = useRouter()
  const [form, setForm] = useState<Form>(() => toForm(settings))
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    const num = (k: keyof Form) => Number(form[k])
    start(async () => {
      const res = await adminSavePlatformSettings({
        vendorCommissionPct: num("vendorCommissionPct"),
        vendorProCommissionPct: num("vendorProCommissionPct"),
        towCommissionPct: num("towCommissionPct"),
        riderCommissionPct: num("riderCommissionPct"),
        brokerFreeQuotesPerMonth: Math.round(num("brokerFreeQuotesPerMonth")),
        freeGaragePlaces: Math.round(num("freeGaragePlaces")),
      })
      if (!res.ok) return setMsg({ ok: false, text: res.error.message })
      setForm(toForm(res.data))
      setMsg({ ok: true, text: "Saved. New orders, tows and deliveries use these rates." })
      router.refresh()
    })
  }

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold">Fees &amp; free places</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          What FixAm keeps on marketplace work. Changes apply to new orders, tows and deliveries, not ones already paid.
        </p>
      </div>
      <form onSubmit={save} className="divide-y divide-border">
        {ROWS.map((r) => (
          <label key={r.key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <span className="min-w-0">
              <span className="block text-sm font-medium">{r.label}</span>
              <span className="block text-[13px] text-muted-foreground">
                {r.help}
                {r.key === "freeGaragePlaces" && freeUsed !== null ? ` ${freeUsed} in use now.` : ""}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={r.step}
                value={form[r.key]}
                onChange={(e) => setForm((f) => ({ ...f, [r.key]: e.target.value }))}
                className={inputCls}
                aria-label={r.label}
              />
              <span className="w-14 text-sm text-muted-foreground">{r.unit}</span>
            </span>
          </label>
        ))}
        <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-3.5">
          {msg && (
            <p role="status" className={msg.ok ? "text-sm text-success" : "text-sm font-medium text-danger"}>
              {msg.text}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold text-background disabled:opacity-60"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save fees
          </button>
        </div>
      </form>
    </section>
  )
}
