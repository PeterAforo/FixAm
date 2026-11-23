import { Suspense } from "react"
import Link from "next/link"
import { connection } from "next/server"
import { ArrowRight, BadgeCheck, Clock, Inbox, Percent, Wallet } from "lucide-react"
import { getBrokerDashboard } from "@/lib/brokers/actions"
import { RequestRow } from "./request-row"
import { kindLabel } from "@/lib/brokers/catalog"
import { formatGHS } from "@/lib/money"
import { StatTile } from "@/components/brand/stat-tile"
import { EmptyState } from "@/components/brand/empty-state"

async function Overview() {
  await connection()
  const d = await getBrokerDashboard()
  if (!d) return null
  const max = Math.max(1, ...d.weeks.map((w) => w.fees))
  const first = d.broker.businessName

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{kindLabel(d.broker.kind)} broker</p>
          <h1 className="mt-1 font-display text-[30px] font-bold leading-tight tracking-[-0.03em]">
            {d.counts.requested ? `${d.counts.requested} new request${d.counts.requested === 1 ? "" : "s"} waiting` : `Welcome back, ${first}`}
          </h1>
        </div>
        <Link href="/broker/requests?status=requested" className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-glow-primary hover:bg-primary-hover">
          Open inbox <ArrowRight className="size-4" />
        </Link>
      </div>

      {!d.broker.isVerified && (
        <div className="flex flex-wrap items-center gap-3 rounded-[18px] border border-[#F3D9A4] bg-[#FFF7E6] px-5 py-4 text-sm text-[#6B5320] dark:border-[#FFB020]/30 dark:bg-[#FFB020]/10 dark:text-[#FFD27A]">
          <BadgeCheck className="size-5 shrink-0" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Get your Verified badge.</span> Add your {d.broker.kind === "dvla" ? "DVLA agent" : "NIC licence"} number — verified brokers appear first to drivers and garages.
          </p>
          <Link href="/broker/settings" className="font-semibold underline underline-offset-4">Add details</Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="New requests" value={d.counts.requested} icon={<Inbox />} hint={`${d.counts.open} open in total`} />
        <StatTile label="Fees earned this month" value={formatGHS(d.feesThisMonth)} icon={<Wallet />} hint={`${d.completedThisMonth} completed`} />
        <StatTile label="Quote win rate" value={d.winRate != null ? `${d.winRate}%` : "—"} icon={<Percent />} hint="Quotes customers accepted" />
        <StatTile label="Avg. time to quote" value={d.avgResponseHrs != null ? `${d.avgResponseHrs}h` : "—"} icon={<Clock />} hint="Faster quotes win more jobs" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-[18px] border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-semibold">Needs your action</h2>
            <Link href="/broker/requests" className="text-sm font-medium text-[#B8390A] hover:text-[#8F2C08]">All requests</Link>
          </div>
          {d.needsAction.length ? (
            <div className="divide-y divide-border">{d.needsAction.map((r) => <RequestRow key={r.id} r={r} />)}</div>
          ) : (
            <EmptyState compact icon={Inbox} title="You're all caught up" description="New renewal requests from drivers and garages land here." />
          )}
        </section>

        <section className="rounded-[18px] border border-border bg-card p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Fees, last 8 weeks</h2>
            <span className="text-xs text-muted-foreground">Completed jobs</span>
          </div>
          <div className="mt-6 flex h-40 items-end gap-2">
            {d.weeks.map((w) => (
              <div key={w.label} className="flex flex-1 flex-col items-center gap-2">
                <div
                  title={formatGHS(w.fees)}
                  className="w-full rounded-t-md bg-[linear-gradient(180deg,#FF7A3D,#D4430F)] transition-all"
                  style={{ height: `${Math.max(4, (w.fees / max) * 100)}%`, opacity: w.fees ? 1 : 0.25 }}
                />
                <span className="text-[10px] text-muted-foreground">{w.label}</span>
              </div>
            ))}
          </div>
          <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-4 text-center text-sm">
            <div><dt className="text-xs text-muted-foreground">Quoted</dt><dd className="mt-1 font-semibold">{d.counts.quoted}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Accepted</dt><dd className="mt-1 font-semibold">{d.counts.accepted}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Processing</dt><dd className="mt-1 font-semibold">{d.counts.inProgress}</dd></div>
          </dl>
        </section>
      </div>
    </div>
  )
}

export default function BrokerHome() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[1200px] animate-pulse rounded-2xl bg-muted p-8" />}>
      <Overview />
    </Suspense>
  )
}
