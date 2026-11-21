import { Suspense } from "react"
import { getPublicEstimate } from "@/lib/estimates/actions"
import { ApprovalPanel } from "./approval-panel"

async function EstimateView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const res = await getPublicEstimate({ token })
  const est = res.ok ? res.data : null

  if (!est) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-2xl font-bold">Link expired</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This estimate link is invalid or has already been used. Please contact the garage for a new link.
          </p>
        </div>
      </main>
    )
  }

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
          Powered by FixAm · Questions? Contact {est.garageName} directly.
        </p>
      </div>
    </main>
  )
}

export default function MagicLinkPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" /></div>}>
      <EstimateView params={params} />
    </Suspense>
  )
}
