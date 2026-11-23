import { Suspense } from "react"
import Link from "next/link"
import { connection } from "next/server"
import { Inbox, Search } from "lucide-react"
import { listBrokerRequests } from "@/lib/brokers/actions"
import { EmptyState } from "@/components/brand/empty-state"
import { RequestRow } from "../request-row"
import { cn } from "@/lib/utils"

const FILTERS = [
  { value: "open", label: "Open" },
  { value: "requested", label: "New" },
  { value: "quoted", label: "Quoted" },
  { value: "accepted", label: "Accepted" },
  { value: "in_progress", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "all", label: "All" },
]

type Search = Promise<{ status?: string; q?: string }>

async function RequestsList({ searchParams }: { searchParams: Search }) {
  await connection()
  const { status = "open", q = "" } = await searchParams
  const rows = await listBrokerRequests({ status, q: q || undefined })

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 md:px-8 md:py-8">
      <div>
        <h1 className="font-display text-[30px] font-bold leading-tight tracking-[-0.03em]">Renewal requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">From drivers and garages. Quote quickly — the first good quote usually wins.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1.5" aria-label="Filter requests">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={`/broker/requests?status=${f.value}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={cn(
                "inline-flex h-9 items-center rounded-full border px-3.5 text-sm transition-colors",
                status === f.value ? "border-foreground bg-foreground font-medium text-background" : "border-border bg-card hover:border-border-strong"
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <form className="relative w-full sm:w-72" action="/broker/requests">
          <input type="hidden" name="status" value={status} />
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Plate, name, phone or BRQ-…"
            className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"
          />
        </form>
      </div>

      <section className="overflow-hidden rounded-[18px] border border-border bg-card">
        {rows.length ? (
          <div className="divide-y divide-border">{rows.map((r) => <RequestRow key={r.id} r={r} />)}</div>
        ) : (
          <EmptyState
            compact
            icon={Inbox}
            title={q ? "No matches" : "Nothing here yet"}
            description={q ? "Try a different plate or name." : "When drivers or garages send you a renewal, it shows up here and we text you."}
          />
        )}
      </section>
    </div>
  )
}

export default function BrokerRequestsPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[1200px] animate-pulse rounded-2xl bg-muted" />}>
      <RequestsList searchParams={searchParams} />
    </Suspense>
  )
}
