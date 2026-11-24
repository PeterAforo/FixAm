import { Suspense } from "react"
import { getPublicEstimate } from "@/lib/estimates/actions"
import { getTrackerData } from "@/lib/tracker/actions"
import { getPublicInvoiceByToken } from "@/lib/money/payments"
import { getPublicReminder } from "@/lib/reminders/public-actions"
import { ApprovalPanel } from "./approval-panel"
import { TrackerPanel } from "./tracker-panel"
import { InvoicePayPanel } from "./invoice-pay-panel"
import { ReminderPanel } from "./reminder-panel"
import { PayLaterCard } from "@/components/financing/pay-later-card"
import { getPayLater } from "@/lib/financing/actions"
import { HandoverView } from "@/components/pickups/handover-view"
import { AutoRefresh } from "@/components/pickups/auto-refresh"
import { runsForJobToken } from "@/lib/pickups/service"

async function TokenView({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ payment?: string }> }) {
  const { token } = await params
  const { payment } = await searchParams

  // Estimate approval links and job tracker links share /t/[token];
  // estimate hashes live on estimates.token_hash, tracker hashes on
  // jobs.tracker_token_hash — try estimate first, then tracker.
  const estRes = await getPublicEstimate({ token })
  const est = estRes.ok ? estRes.data : null

  // P8-14: pay later (approval page and invoice page).
  const payLater = est ? await getPayLater({ token }).catch(() => null) : null

  if (est) {
    return (
      <main className="min-h-dvh bg-background">
        <div className="mx-auto max-w-lg px-4 py-8">
          <header className="mb-6 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{est.garageName}</p>
            <h1 className="mt-1 font-display text-3xl font-bold">Estimate {est.number}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {est.vehiclePlate ?? ""} {est.customerName ? `· ${est.customerName}` : ""}
            </p>
            {est.validUntil && <p className="mt-1 text-xs text-muted-foreground">Valid until {est.validUntil}</p>}
          </header>
          {payment === "success" && <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">Payment received — your parts are ordered and will be delivered to {est.garageName}. FixAm holds the money until they arrive.</p>}
          {payment === "pending" && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">Waiting for your payment to confirm — you&apos;ll get an SMS once it does.</p>}
          {payment === "failed" && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-900">The parts payment didn&apos;t go through. Ask {est.garageName} to resend, or pay from your FixAm account.</p>}
          <ApprovalPanel token={token} estimate={est} />
          {payLater && <PayLaterCard token={token} initial={payLater} />}
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Powered by FixAm · Questions? Contact the garage directly.
          </p>
        </div>
      </main>
    )
  }

  const invRes = await getPublicInvoiceByToken({ token })
  const inv = invRes.ok ? invRes.data : null

  const invPayLater = inv ? await getPayLater({ token }).catch(() => null) : null

  if (inv) {
    return (
      <main className="min-h-dvh bg-background">
        <div className="mx-auto max-w-lg px-4 py-8">
          <header className="mb-6 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{inv.garageName}</p>
            <h1 className="mt-1 font-display text-3xl font-bold">Invoice {inv.number}</h1>
            {inv.customerName && <p className="mt-1 text-sm text-muted-foreground">{inv.customerName}</p>}
            {inv.dueDate && <p className="mt-1 text-xs text-muted-foreground">Due {inv.dueDate}</p>}
          </header>
          <InvoicePayPanel
            token={token}
            invoice={{
              id: inv.id,
              number: inv.number,
              status: inv.status,
              balanceDue: inv.balanceDue,
              formatted: inv.formatted,
            }}
          />
          {invPayLater && <PayLaterCard token={token} initial={invPayLater} />}
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Powered by FixAm · Questions? Contact the garage directly.
          </p>
        </div>
      </main>
    )
  }

  const remRes = await getPublicReminder({ token })
  const rem = remRes.ok ? remRes.data : null

  if (rem) {
    return (
      <main className="min-h-dvh bg-background">
        <div className="mx-auto max-w-lg px-4 py-8">
          <header className="mb-6 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{rem.garageName}</p>
            <h1 className="mt-1 font-display text-3xl font-bold">Service reminders</h1>
            {rem.customerName && <p className="mt-1 text-sm text-muted-foreground">Hi {rem.customerName}</p>}
          </header>
          <ReminderPanel
            token={token}
            garageId={rem.garageId}
            garageName={rem.garageName}
            garageSlug={rem.garageSlug}
            garagePhone={rem.garagePhone}
            customerName={rem.customerName}
            customerPhone={rem.customerPhone}
            branches={rem.branches}
            items={rem.items}
          />
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
      <main className="flex min-h-dvh items-center justify-center bg-background p-8">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-2xl font-bold">Link expired</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This link is invalid or has expired. Please contact the garage for a new one.
          </p>
        </div>
      </main>
    )
  }

  // P8-16: pickup / return runs and handover reports on the job tracker.
  const handover = await runsForJobToken(token).catch(() => ({ runs: [], comparison: null }))
  return (
    <>
      <TrackerPanel token={token} initial={trk} />
      {handover.runs.length > 0 && (
        <div className="mx-auto max-w-lg px-4 pb-10">
          <AutoRefresh active={handover.runs.some((r) => ["scheduled", "assigned", "en_route", "arrived"].includes(r.status))} />
          <h2 className="mb-3 font-display text-lg font-semibold">Pickup &amp; drop-off</h2>
          <HandoverView runs={handover.runs} comparison={handover.comparison} />
        </div>
      )}
    </>
  )
}

export default function MagicLinkPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ payment?: string }> }) {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" /></div>}>
      <TokenView params={params} searchParams={searchParams} />
    </Suspense>
  )
}
