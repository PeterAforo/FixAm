"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export type PlanOption = {
  code: string
  name: string
  tagline: string | null
  priceGhs: number
  messageAllowance: number
  features: string[]
}

const FEATURE_LABELS: Record<string, string> = {
  core_workshop: "Full workshop management",
  invoicing: "Invoicing & receipts",
  reports_basic: "Sales & profit reports",
  reports_multi_branch: "Multi-branch reports",
  inventory: "Parts inventory & POS",
  marketplace: "Vendor marketplace",
  auto_reorder: "Automatic reordering",
  reminders: "Service & renewal reminders",
  agent_renewals: "Insurance & DVLA renewals",
  payment_plans: "Instalment plans",
  credit_accounts: "Customer credit accounts",
  fleet_accounts: "Fleet accounts",
  online_catalogue: "Online parts catalogue",
  gamification: "Mechanic rewards",
  custom_branding: "Custom branding",
  priority_support: "Priority support",
  directory_listing: "Directory listing",
}

/**
 * Radio-card plan picker shown as the last onboarding step. The customer
 * chooses a tier; billing starts after the 14-day trial.
 */
export function PlanPicker({
  plans,
  value,
  onChange,
}: {
  plans: PlanOption[]
  value: string
  onChange: (code: string) => void
}) {
  if (plans.length === 0) {
    return <p className="text-sm text-muted-foreground">Plans are being finalized — you can pick one later in Settings.</p>
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {plans.map((p) => {
        const selected = p.code === value
        const feats = (p.features ?? []).slice(0, 6)
        return (
          <button
            key={p.code}
            type="button"
            onClick={() => onChange(p.code)}
            aria-pressed={selected}
            className={cn(
              "relative rounded-2xl border-2 p-4 text-left transition-all",
              selected ? "border-[#FF5A1F] bg-[#FFF1E8] shadow-sm" : "border-border bg-card hover:border-foreground/30"
            )}
          >
            {selected && (
              <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-[#FF5A1F] text-white">
                <Check className="size-3.5" strokeWidth={3} />
              </span>
            )}
            <p className="font-display text-lg font-bold">{p.name}</p>
            {p.tagline && <p className="text-xs text-muted-foreground">{p.tagline}</p>}
            <p className="mt-2">
              <span className="font-display text-2xl font-bold tabular-nums">GH₵{p.priceGhs.toFixed(2)}</span>
              <span className="text-sm text-muted-foreground">/month</span>
            </p>
            <ul className="mt-3 space-y-1 text-[13px] text-muted-foreground">
              {feats.map((f) => (
                <li key={f} className="flex gap-1.5">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-[#B8390A]" />
                  {FEATURE_LABELS[f] ?? f}
                </li>
              ))}
              {p.messageAllowance > 0 && (
                <li className="flex gap-1.5">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-[#B8390A]" />
                  {p.messageAllowance.toLocaleString()} messages/mo included
                </li>
              )}
            </ul>
          </button>
        )
      })}
    </div>
  )
}
