import Link from "next/link"
import { Suspense } from "react"
import { asc, eq } from "drizzle-orm"
import { Check, Minus } from "lucide-react"
import { db } from "@/lib/db"
import { plans } from "@/lib/db/schema"
import { cn } from "@/lib/utils"
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome"

export const metadata = { title: "Pricing" }

const FEATURE_LABELS: Record<string, string> = {
  core_workshop: "Jobs, estimates and check-in",
  invoicing: "Invoices, MoMo and card payments",
  reports_basic: "Daily and monthly reports",
  reports_multi_branch: "Multi-branch reports",
  inventory: "Parts, stock and POS",
  marketplace: "Vendor marketplace",
  auto_reorder: "Automatic parts reordering",
  reminders: "Oil, insurance and DVLA reminders",
  agent_renewals: "Insurance & DVLA agent renewals",
  payment_plans: "Instalment payment plans",
  credit_accounts: "Credit accounts and statements",
  fleet_accounts: "Fleet accounts and manager portal",
  online_catalogue: "Online parts catalogue",
  gamification: "Mechanic streaks and badges",
  custom_branding: "Your branding on customer pages",
  priority_support: "Priority WhatsApp support",
  directory_listing: "Garage directory listing",
}
const labelFor = (f: string) => {
  const l = FEATURE_LABELS[f] ?? f.replace(/_/g, " ")
  return l.charAt(0).toUpperCase() + l.slice(1)
}

const TAGLINES: Record<string, string> = {
  starter: "For small workshops going digital.",
  growth: "For busy garages building repeat revenue.",
  pro: "For multi-branch groups and fleets.",
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-GH")} ${n === 1 ? one : many}`

function Price({ pesewas, dark }: { pesewas: number | bigint | null; dark?: boolean }) {
  const value = pesewas == null ? 0 : Number(pesewas)
  const sub = dark ? "text-[#AEB5C8]" : "text-muted-foreground"
  // Never show GH₵ 0.00 — an unset price reads as an unfinished product.
  if (value <= 0) {
    return (
      <div>
        <div className="font-display text-[40px] font-bold leading-none tracking-[-0.03em]">Free during pilot</div>
        <div className={cn("mt-2 text-sm", sub)}>Monthly price announced at launch</div>
      </div>
    )
  }
  const amount = (value / 100).toLocaleString("en-GH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={cn("text-xl font-semibold", sub)}>GH₵</span>
      <span className="font-display text-[52px] font-bold leading-none tracking-[-0.03em] tabular-nums">{amount}</span>
      <span className={cn("text-[15px]", sub)}>/ month</span>
    </div>
  )
}

type PlanRow = typeof plans.$inferSelect

async function PlansAndCompare() {
  const rows: PlanRow[] = await db().select().from(plans).where(eq(plans.isActive, true)).orderBy(asc(plans.priceMonthly))
  const featuredIdx = rows.length >= 3 ? 1 : -1
  const allFeatures = Array.from(new Set(rows.flatMap((p) => (p.features as string[] | null) ?? [])))

  return (
    <>
      <section className="mx-auto max-w-[1200px] px-6 pt-16 md:px-8">
        <div className="flex flex-wrap items-stretch gap-5">
          {rows.map((p, i) => {
            const features = (p.features as string[] | null) ?? []
            const prev = i > 0 ? new Set(((rows[i - 1]!.features as string[] | null) ?? [])) : null
            const listed = prev ? features.filter((f) => !prev.has(f)) : features
            const dark = i === featuredIdx
            const sub = dark ? "text-[#AEB5C8]" : "text-muted-foreground"
            const stats = [
              { v: p.maxStaff == null ? "Unlimited" : String(p.maxStaff), l: p.maxStaff === 1 ? "staff seat" : "staff seats" },
              { v: p.maxBranches == null ? "Unlimited" : String(p.maxBranches), l: p.maxBranches === 1 ? "branch" : "branches" },
              { v: p.messageAllowance.toLocaleString("en-GH"), l: "messages / mo" },
            ]
            return (
              <article
                key={p.code}
                className={cn(
                  "relative flex min-w-0 flex-[1_1_320px] flex-col gap-6 overflow-hidden rounded-3xl p-8",
                  dark
                    ? "bg-[#0B0F1A] text-[#F4F2EE] shadow-[0_30px_60px_-24px_rgba(11,15,26,0.55)]"
                    : "border border-border bg-card shadow-1"
                )}
              >
                {dark && (
                  <div aria-hidden className="absolute -right-[120px] -top-[120px] size-[360px] bg-[radial-gradient(50%_50%_at_50%_50%,rgba(255,90,31,0.35)_0%,rgba(255,90,31,0)_100%)]" />
                )}
                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-2xl font-semibold">{p.name}</h2>
                    <p className={cn("mt-1.5 text-[15px]", sub)}>{TAGLINES[p.code] ?? ""}</p>
                  </div>
                  {dark && <span className="whitespace-nowrap rounded-full bg-[#C6F432] px-2.5 py-1 text-xs font-semibold text-[#0B0F1A]">Most popular</span>}
                </div>
                <div className="relative"><Price pesewas={p.priceMonthly} dark={dark} /></div>
                <div
                  className={cn(
                    "relative grid grid-cols-3 gap-2 rounded-[14px] border p-3.5 text-center",
                    dark ? "border-white/[0.08] bg-white/5" : "border-border-subtle bg-background"
                  )}
                >
                  {stats.map((s) => (
                    <div key={s.l}>
                      <div className="text-base font-bold">{s.v}</div>
                      <div className={cn("text-xs", sub)}>{s.l}</div>
                    </div>
                  ))}
                </div>
                <Link
                  href="/onboarding"
                  className={cn(
                    "relative rounded-full py-3.5 text-center text-[15px] font-semibold transition-colors",
                    dark
                      ? "bg-[#D4430F] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_24px_-10px_rgba(255,90,31,0.8)] hover:bg-[#B8390A]"
                      : "border border-border-strong bg-card hover:bg-surface-sunken"
                  )}
                >
                  Start free trial
                </Link>
                {prev && <div className={cn("relative text-[13px] font-semibold", sub)}>Everything in {rows[i - 1]!.name}, plus</div>}
                <ul className={cn("relative -mt-2 flex flex-col gap-3 text-[15px]", dark ? "text-[#E3E7F0]" : "text-[#3F3A34]")}>
                  {listed.slice(0, 6).map((f) => (
                    <li key={f} className="flex gap-2.5">
                      <Check className={cn("mt-0.5 size-[18px] shrink-0", dark ? "text-[#C6F432]" : "text-foreground")} strokeWidth={2} />
                      {labelFor(f)}
                    </li>
                  ))}
                </ul>
              </article>
            )
          })}
        </div>
        <p className="mt-5 text-center text-[13px] text-muted-foreground">Need more messages? Add bundles any time from your dashboard.</p>
      </section>

      {rows.length > 0 && (
        <section className="mx-auto max-w-[1200px] px-6 pt-24 md:px-8">
          <h2 className="mb-7 font-display text-4xl font-bold tracking-[-0.03em]">Compare plans</h2>
          <div className="overflow-x-auto rounded-[20px] border border-border bg-card">
            <table className="w-full min-w-[720px] border-collapse text-[15px]">
              <thead>
                <tr className="text-left">
                  <th scope="col" className="border-b border-border px-6 py-[18px] text-[13px] font-semibold text-muted-foreground">Feature</th>
                  {rows.map((p, i) => (
                    <th key={p.code} scope="col" className={cn("w-[18%] border-b border-border px-6 py-[18px] font-semibold", i === featuredIdx && "bg-[#FFF4EE]")}>
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className="border-t border-[#F4F0EA] px-6 py-3.5 text-left font-normal">Staff seats / branches</th>
                  {rows.map((p, i) => (
                    <td key={p.code} className={cn("border-t border-[#F4F0EA] px-6 py-3.5", i === featuredIdx && "bg-[#FFF4EE]")}>
                      {p.maxStaff == null ? "Unlimited" : p.maxStaff} / {p.maxBranches == null ? "Unlimited" : p.maxBranches}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="border-t border-[#F4F0EA] px-6 py-3.5 text-left font-normal">SMS &amp; WhatsApp messages per month</th>
                  {rows.map((p, i) => (
                    <td key={p.code} className={cn("border-t border-[#F4F0EA] px-6 py-3.5 tabular-nums", i === featuredIdx && "bg-[#FFF4EE]")}>
                      {plural(p.messageAllowance, "message", "messages")}
                    </td>
                  ))}
                </tr>
                {allFeatures.map((f) => (
                  <tr key={f}>
                    <th scope="row" className="border-t border-[#F4F0EA] px-6 py-3.5 text-left font-normal">{labelFor(f)}</th>
                    {rows.map((p, i) => {
                      const has = ((p.features as string[] | null) ?? []).includes(f)
                      return (
                        <td key={p.code} className={cn("border-t border-[#F4F0EA] px-6 py-3.5", i === featuredIdx && "bg-[#FFF4EE]")}>
                          {has ? (
                            <Check className="size-[18px]" aria-label="Included" />
                          ) : (
                            <Minus className="size-[18px] text-[#8C857B]" aria-label="Not included" />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}

const FAQ = [
  { q: "What counts as a message?", a: "Each SMS or WhatsApp reminder or notification to a customer. Push and email are free and unlimited." },
  { q: "How do I pay for FixAm?", a: "Monthly, by Mobile Money or card. Cancel any time." },
  { q: "Can you import my customers and parts?", a: "Yes — upload a spreadsheet and we'll help you map it during setup." },
  { q: "Do my customers need to download an app?", a: "No. They get secure links by WhatsApp or SMS, and can sign in to the portal with their phone number." },
]

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader active="Pricing" />

      <section className="mx-auto max-w-[1200px] px-6 pt-20 text-center md:px-8 md:pt-[88px]">
        <div className="text-[13px] font-semibold text-[#B8390A]">Pricing</div>
        <h1 className="mx-auto mt-3.5 max-w-[820px] font-display text-5xl font-bold leading-[1.02] tracking-[-0.035em] md:text-[64px]">
          One plan for every size of garage.
        </h1>
        <p className="mx-auto mt-5 max-w-[600px] text-lg leading-relaxed text-muted-foreground">
          Every plan includes the full workshop, MoMo payments, reminders and the customer portal. SMS and WhatsApp
          messages are included — no surprise bills.
        </p>
        <div className="mt-7 inline-flex flex-wrap justify-center gap-[18px] text-sm text-[#3F3A34]">
          {["14-day free trial", "No card needed", "Pay monthly by MoMo or card"].map((t) => (
            <span key={t} className="inline-flex items-center gap-2"><Check className="size-4 text-[#4E6B07]" strokeWidth={2.4} />{t}</span>
          ))}
        </div>
      </section>

      <Suspense
        fallback={
          <section className="mx-auto flex max-w-[1200px] flex-wrap gap-5 px-6 pt-16 md:px-8">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[560px] flex-[1_1_320px] animate-pulse rounded-3xl border border-border bg-card" />
            ))}
          </section>
        }
      >
        <PlansAndCompare />
      </Suspense>

      <section className="mx-auto max-w-[1200px] px-6 py-24 md:px-8">
        <div className="flex flex-wrap gap-14">
          <div className="flex-[1_1_300px]">
            <h2 className="font-display text-4xl font-bold tracking-[-0.03em]">Questions, answered</h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Still unsure? <Link href="/garages" className="font-semibold text-[#B8390A]">See garages already on FixAm</Link>.
            </p>
          </div>
          <div className="flex flex-[2_1_560px] flex-col">
            {FAQ.map((f, i) => (
              <details key={f.q} open={i === 0} className={cn("border-t border-border py-[22px]", i === FAQ.length - 1 && "border-b")}>
                <summary className="cursor-pointer text-[17px] font-semibold">{f.q}</summary>
                <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
