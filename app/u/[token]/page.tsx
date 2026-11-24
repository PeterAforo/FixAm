import { Suspense } from "react"
import { connection } from "next/server"
import { readOptOutToken } from "@/lib/seasonal/links"
import { optOutStatus } from "@/lib/seasonal/service"
import { OptOutPanel } from "./opt-out-panel"

export const metadata = { title: "Seasonal car-care tips · FixAm", robots: { index: false, follow: false } }

async function Content({ params }: { params: Promise<{ token: string }> }) {
  await connection()
  const { token } = await params
  const customerId = readOptOutToken(token)
  const status = customerId ? await optOutStatus(customerId).catch(() => null) : null
  if (!status) {
    return (
      <div className="text-center">
        <h1 className="font-display text-2xl font-bold">This link isn&apos;t valid</h1>
        <p className="mt-2 text-sm text-muted-foreground">Reply STOP to the message, or ask the garage to stop seasonal tips for you.</p>
      </div>
    )
  }
  return <OptOutPanel token={token} garageName={status.garageName} initiallyOptedOut={status.optedOut} />
}

export default function SeasonalOptOutPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
        <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
          <Content params={params} />
        </Suspense>
      </div>
    </main>
  )
}
