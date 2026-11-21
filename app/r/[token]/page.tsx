import { Suspense } from "react"
import { connection } from "next/server"
import { notFound } from "next/navigation"
import { getPublicReceipt } from "@/lib/money/paystack-webhook"
import { formatGHS } from "@/lib/money"

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash", momo: "Mobile Money", card: "Card",
  bank_transfer: "Bank transfer", cheque: "Cheque", credit_account: "Credit account", other: "Other",
}

async function ReceiptView({ params }: { params: Promise<{ token: string }> }) {
  await connection()
  const { token } = await params
  const r = await getPublicReceipt(token)
  if (!r) notFound()

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border-2 border-border bg-surface p-6 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{r.garageName}</p>
        <h1 className="mt-2 font-display text-2xl font-bold">Payment received</h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground">{r.receiptNumber ?? "Receipt"}</p>

        <p className="mt-4 text-3xl font-bold tabular-nums">{formatGHS(r.amount)}</p>
        <p className="text-sm text-muted-foreground">via {METHOD_LABEL[r.method] ?? r.method}</p>

        <dl className="mt-4 space-y-1 border-t pt-3 text-left text-sm">
          {r.invoiceNumber && (
            <div className="flex justify-between"><dt className="text-muted-foreground">Invoice</dt><dd className="font-medium">{r.invoiceNumber}</dd></div>
          )}
          {r.invoiceBalance != null && r.invoiceBalance > 0 && (
            <div className="flex justify-between"><dt className="text-muted-foreground">Balance due</dt><dd className="font-medium tabular-nums">{formatGHS(r.invoiceBalance)}</dd></div>
          )}
          {r.paidAt && (
            <div className="flex justify-between"><dt className="text-muted-foreground">Paid at</dt><dd>{new Date(r.paidAt).toLocaleString("en-GH")}</dd></div>
          )}
        </dl>

        <p className="mt-4 text-xs text-muted-foreground">Powered by FixAm · Keep this link as your receipt.</p>
      </div>
    </main>
  )
}

export default function ReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" /></div>}>
      <ReceiptView params={params} />
    </Suspense>
  )
}
