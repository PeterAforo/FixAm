import { Suspense } from "react"
import { connection } from "next/server"
import { MockPayButton } from "./mock-pay-button"

export const metadata = { title: "Test lender · FixAm", robots: { index: false } }

async function Content({ params }: { params: Promise<{ ref: string; seq: string }> }) {
  await connection()
  const { ref, seq } = await params
  return (
    <>
      <h1 className="mt-2 font-display text-2xl font-bold">Repayment {Number(seq)}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Plan {decodeURIComponent(ref)}</p>
      <MockPayButton providerRef={decodeURIComponent(ref)} sequence={Number(seq)} />
    </>
  )
}

/** Stand-in for a partner lender's repayment page while FINANCING_PROVIDER=mock. */
export default function MockPayPage({ params }: { params: Promise<{ ref: string; seq: string }> }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Test lender — no real money</p>
        <Suspense fallback={<div className="mt-4 h-24 animate-pulse rounded-xl bg-muted" />}>
          <Content params={params} />
        </Suspense>
      </div>
    </main>
  )
}
