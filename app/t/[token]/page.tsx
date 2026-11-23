import { Suspense } from "react"
import { getPublicEstimate } from "@/lib/estimates/actions"
import { getTrackerData } from "@/lib/tracker/actions"
import { getPublicInvoiceByToken } from "@/lib/money/payments"
import { getPublicReminder } from "@/lib/reminders/public-actions"
import { ApprovalPanel } from "./approval-panel"
import { TrackerPanel } from "./tracker-panel"
import { InvoicePayPanel } from "./invoice-pay-panel"
import { ReminderPanel } from "./reminder-panel"

async function TokenView({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ payment?: string }> }) {
  const { token } = await params
  const { payment } = await searchParams

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
          {payment === "success" && <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">Payment received — your parts are ordered and will be delivered to {est.garageName}. FixAm holds the money until they arrive.</p>}
          {payment === "pending" && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">Waiting for your payment to confirm — you&apos;ll get an SMS once it does.</p>}
          {payment === "failed" && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-900">The parts payment didn&apos;t go through. Ask {est.garageName} to resend, or pay from your FixAm account.</p>}
          <ApprovalPanel token={token} estimate={est} />
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Powered by FixAm · Questions? Contact the garage directly.
          </p>
        </div>
      </main>
    )
  }

  const invRes = await getPublicInvoiceByToken({ token })
  const inv = invRes.ok ? invRes.data : null

  if (inv) {
    return (
      <main className="min-h-screen bg-background">
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
      <main className="min-h-screen bg-background">
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

export default function MagicLinkPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ payment?: string }> }) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" /></div>}>
      <TokenView params={params} searchParams={searchParams} />
    </Suspense>
  )
}
