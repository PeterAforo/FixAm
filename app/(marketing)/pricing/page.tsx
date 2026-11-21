import Link from "next/link"
import { Suspense } from "react"
import { asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { plans } from "@/lib/db/schema"

const ghc = (pesewas: number | bigint | null) =>
  pesewas == null ? "Custom" : `GH₵ ${(Number(pesewas) / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`

const FEATURE_LABELS: Record<string, string> = {
  core_workshop: "Jobs, estimates & check-in",
  invoicing: "Invoicing & payments",
  reports_basic: "Basic reports",
  reports_multi_branch: "Multi-branch reports",
  inventory: "Parts & inventory",
  marketplace: "Marketplace",
  auto_reorder: "Automatic reordering",
  reminders: "Service & renewal reminders",
  agent_renewals: "Insurance & DVLA agent renewals",
  payment_plans: "Instalment payment plans",
  credit_accounts: "Credit accounts & statements",
  fleet_accounts: "Fleet accounts & manager portal",
  online_catalogue: "Online parts catalogue",
  gamification: "Mechanic badges & leaderboard",
  custom_branding: "Custom branding",
  priority_support: "Priority support",
}

async function PlansGrid() {
  const planRows = await db().select().from(plans).where(eq(plans.isActive, true)).orderBy(asc(plans.priceMonthly))
  const popularCode = planRows.length > 1 ? planRows[1]!.code : null

  return (
    <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-20 md:grid-cols-3">
      {planRows.map((p) => {
        const features = (p.features as string[] | null) ?? []
        const popular = p.code === popularCode
        return (
          <div key={p.code} className={`rounded-2xl border-2 p-6 ${popular ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
            {popular && <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">Most popular</p>}
            <h2 className="font-display text-2xl font-bold capitalize">{p.name}</h2>
            <p className="mt-4 font-display text-3xl font-extrabold">
              {ghc(p.priceMonthly)}
              <span className="text-sm font-semibold text-muted-foreground">/month</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {p.maxStaff == null ? "Unlimited staff" : `Up to ${p.maxStaff} staff`} · {p.maxBranches == null ? "unlimited branches" : `up to ${p.maxBranches} branches`} · {p.messageAllowance.toLocaleString()} messages/mo
            </p>
            <ul className="mt-5 space-y-2 text-sm">
              {features.map((f) => (
                <li key={f} className="flex gap-2"><span className="text-success">✓</span>{FEATURE_LABELS[f] ?? f.replace(/_/g, " ")}</li>
              ))}
            </ul>
            <Link
              href="/onboarding"
              className={`mt-6 block rounded-pill border-2 px-4 py-3 text-center font-display text-sm font-bold uppercase tracking-wide ${
                popular ? "border-border bg-primary text-primary-foreground" : "border-border bg-secondary text-secondary-foreground"
              }`}
            >
              Start free trial
            </Link>
          </div>
        )
      })}
    </section>
  )
}

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b-2 border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-display text-xl font-bold">FixAm</Link>
          <Link href="/login" className="text-sm font-semibold text-primary hover:underline">Garage sign in</Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-16 text-center">
        <h1 className="font-display text-4xl font-extrabold">Simple pricing for Ghanaian garages</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Every plan includes the full workshop OS — jobs, estimates, invoicing, reminders and the customer portal.
          Upgrade when you need renewals, credit or fleet tools.
        </p>
      </section>

      <Suspense
        fallback={
          <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-20 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-96 animate-pulse rounded-2xl border-2 border-border bg-card" />
            ))}
          </section>
        }
      >
        <PlansGrid />
      </Suspense>
    </main>
  )
}
