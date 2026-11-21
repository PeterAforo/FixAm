import { Suspense } from "react"
import { getPublicEstimate } from "@/lib/estimates/actions"
import { getTrackerData } from "@/lib/tracker/actions"
import { ApprovalPanel } from "./approval-panel"
import { TrackerPanel } from "./tracker-panel"

async function TokenView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  // Estimate approval links and job tracker links share /t/[token];
  // estimate hashes live on estimates.token_hash, tracker hashes on
  // jobs.tracker_token_hash — try estimate first, then tracker.
  const estRes = await getPublicEstimate({ token })
  const est = estRes.ok ? estRes.data : null

  if (est) {
    return (
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-lg px-4 py-8">
          <header className="mb-6 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{est.garageName}</p>
            <h1 className="mt-1 font-display text-3xl font-bold">Estimate {est.number}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {est.vehiclePlate ?? ""} {est.customerName ? `· ${est.customerName}` : ""}
            </p>
            {est.validUntil && <p className="mt-1 text-xs text-muted-foreground">Valid until {est.validUntil}</p>}
          </header>
          <ApprovalPanel token={token} estimate={est} />
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Powered by FixAm · Questions? Contact the garage directly.
          </p>
        </div>
      </main>
    )
  }

  const trkRes = await getTrackerData({ token })
  const trk = trkRes.ok ? trkRes.data : null

  if (!trk) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-2xl font-bold">Link expired</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This link is invalid or has expired. Please contact the garage for a new one.
          </p>
        </div>
      </main>
    )
  }

  return <TrackerPanel token={token} initial={trk} />
}

export default function MagicLinkPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" /></div>}>
      <TokenView params={params} />
    </Suspense>
  )
}
