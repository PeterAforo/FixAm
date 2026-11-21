import { Suspense } from "react"
import { connection } from "next/server"
import { notFound } from "next/navigation"
import { getPublicInstalment } from "@/lib/money/instalments"
import { InstalmentPayPanel } from "./instalment-pay-panel"

async function View({ params }: { params: Promise<{ token: string }> }) {
  await connection()
  const { token } = await params
  const res = await getPublicInstalment({ token })
  if (!res.ok) notFound()
  const d = res.data

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-lg px-4 py-8">
        <header className="mb-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{d.garageName}</p>
          <h1 className="mt-1 font-display text-3xl font-bold">Instalment {d.sequence}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {d.invoiceNumber ? `Invoice ${d.invoiceNumber} · ` : ""}Due {d.dueDate}
          </p>
        </header>
        <InstalmentPayPanel token={token} instalment={d} />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Powered by FixAm · Questions? Contact the garage directly.
        </p>
      </div>
    </main>
  )
}

export default function InstalmentPayPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" /></div>}>
      <View params={params} />
    </Suspense>
  )
}
