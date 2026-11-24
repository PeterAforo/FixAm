import Link from "next/link"
import { CheckCircle2, ChevronRight } from "lucide-react"
import type { AdminAttention } from "@/lib/admin/overview"

export type Analytics = {
  activeGarages: number
  mrrPesewas: number
  activeSubs: number
  pastDue: number
  trialing: number
  cancelled: number
  messagesUsed: number
  messagesAllowance: number
  renewalsTotal: number
  renewalsCompleted: number
  activeMembers: number
} | null

function ghp(pesewas: number) {
  return `GH₵${(pesewas / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function Kpi({ label, value, note, good }: { label: string; value: string; note: string; good?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-display text-[36px] font-bold leading-none tabular-nums">{value}</p>
      <p className={good ? "mt-2 text-[13px] font-medium text-success" : "mt-2 text-[13px] text-muted-foreground"}>{note}</p>
    </div>
  )
}

/** Overview: four headline numbers, subscription health and the approvals queue. */
export function AdminAnalyticsPanel({
  analytics,
  attention,
  branches,
  complimentary,
}: {
  analytics: Analytics
  attention: AdminAttention
  branches: number
  complimentary: number
}) {
  if (!analytics) return <p className="mt-6 text-sm text-muted-foreground">Analytics unavailable.</p>
  const a = analytics
  const subsTotal = a.activeSubs + a.trialing + a.pastDue + a.cancelled
  const mrrNote = [complimentary ? `${complimentary} complimentary` : null, a.trialing ? `${a.trialing} on trial` : null].filter(Boolean).join(" · ") || `${a.activeSubs} paying`
  const msgNote = a.messagesAllowance > 0 ? `of ${a.messagesAllowance.toLocaleString()} allowance this cycle` : "No messages sent yet"

  const health = [
    { label: "Active", n: a.activeSubs, color: "bg-secondary" },
    { label: "Trial", n: a.trialing, color: "bg-primary" },
    { label: "Past due", n: a.pastDue, color: "bg-warning" },
    { label: "Cancelled", n: a.cancelled, color: "bg-border-strong" },
  ]

  const queue = [
    { label: "Parts sellers to approve", n: attention.vendorsPending, href: "/admin/approvals#vendors" },
    { label: "Riders to approve", n: attention.ridersPending, href: "/admin/approvals#riders" },
    { label: "Brokers & DVLA agents to verify", n: attention.brokersUnverified, href: "/admin/approvals#brokers" },
    { label: "Tow operators to verify", n: attention.towUnverified, href: "/admin/approvals" },
    { label: "Payment disputes", n: attention.disputes, href: "/admin/payments" },
    { label: "Payouts needing a hand", n: attention.payoutsNeedAttention, href: "/admin/payments" },
    { label: "Privacy requests", n: attention.privacyOpen, href: "/admin/privacy" },
  ].filter((q) => q.n > 0)

  return (
    <div className="mt-7 flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Active garages"
          value={a.activeGarages.toLocaleString()}
          note={attention.newGaragesThisMonth ? `+${attention.newGaragesThisMonth} this month` : "No new garages this month"}
          good={attention.newGaragesThisMonth > 0}
        />
        <Kpi label="Monthly revenue (MRR)" value={ghp(a.mrrPesewas)} note={mrrNote} />
        <Kpi label="Active staff" value={a.activeMembers.toLocaleString()} note={`Across ${branches} branch${branches === 1 ? "" : "es"}`} />
        <Kpi label="Messages sent" value={a.messagesUsed.toLocaleString()} note={msgNote} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Subscription health</h2>
            <Link href="/admin/garages" className="text-[13px] font-medium text-primary hover:underline">See garages</Link>
          </div>
          <div
            className="flex h-3 overflow-hidden rounded-full bg-surface-muted"
            role="img"
            aria-label={health.map((h) => `${h.n} ${h.label.toLowerCase()}`).join(", ")}
          >
            {subsTotal > 0 && health.map((h) => (h.n > 0 ? <div key={h.label} className={h.color} style={{ width: `${(h.n / subsTotal) * 100}%` }} /> : null))}
          </div>
          <dl className="grid grid-cols-4 gap-2 text-[13px]">
            {health.map((h) => (
              <div key={h.label}>
                <dt className="flex items-center gap-1.5 text-muted-foreground"><span className={`size-2 rounded-sm ${h.color}`} />{h.label}</dt>
                <dd className="mt-0.5 text-xl font-semibold tabular-nums">{h.n}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[13px] text-muted-foreground">
            Renewal requests: {a.renewalsCompleted} of {a.renewalsTotal} completed
          </p>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Needs your attention</h2>
            <Link href="/admin/approvals" className="text-[13px] font-medium text-primary hover:underline">All approvals</Link>
          </div>
          {queue.length === 0 ? (
            <div className="flex items-start gap-3 rounded-xl bg-success/10 p-4 text-sm">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
              <div>
                <p className="font-semibold">All clear</p>
                <p className="text-muted-foreground">No sellers, brokers, tow operators or riders waiting, and no disputes or stuck payouts.</p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {queue.map((q) => (
                <li key={q.label}>
                  <Link href={q.href} className="flex items-center gap-3 py-2.5 text-sm hover:text-primary">
                    <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary tabular-nums">{q.n}</span>
                    <span className="flex-1">{q.label}</span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
