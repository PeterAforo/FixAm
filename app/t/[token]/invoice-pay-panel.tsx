"use client"

import { useState, useTransition } from "react"
import { Card, CardContent } from "@/components/brand/card"
import { CheckCircle2 } from "lucide-react"
import { MoMoPayForm, type PayDetails } from "@/components/momo-pay-form"
import { initiatePublicInvoicePayment } from "@/lib/money/payments"

type Invoice = {
  id: string
  number: string | null
  status: string
  balanceDue: number
  formatted: { total: string; paid: string; balance: string }
}

export function InvoicePayPanel({ token, invoice }: { token: string; invoice: Invoice }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [waiting, setWaiting] = useState<string | null>(null)

  const payable = ["issued", "partially_paid"].includes(invoice.status) && invoice.balanceDue > 0

  function pay(d: PayDetails) {
    setError(null); setWaiting(null)
    startTransition(async () => {
      const res = await initiatePublicInvoicePayment({ token, ...d })
      if (!res.ok) { setError(res.error.message); return }
      if (res.data.authorizationUrl) {
        window.location.href = res.data.authorizationUrl
        return
      }
      setWaiting(res.data.displayText ?? "Check your phone to approve the payment.")
    })
  }

  if (!payable) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          {invoice.status === "paid" ? (
            <>
              <CheckCircle2 className="mx-auto size-10 text-success" />
              <p className="mt-2 font-semibold">This invoice is fully paid. Thank you!</p>
            </>
          ) : (
            <p className="font-semibold">This invoice is not payable online.</p>
          )}
          {invoice.status === "paid" && <p className="mt-1 text-sm text-muted-foreground">Balance: {invoice.formatted.balance}</p>}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-6">
        <MoMoPayForm
          hero={
            <>
              <p className="text-xs font-semibold uppercase tracking-widest text-white/70">Amount due</p>
              <p className="mt-1 font-display text-4xl font-bold tabular-nums tracking-tight">{invoice.formatted.balance}</p>
              {invoice.formatted.paid !== invoice.formatted.total && (
                <p className="mt-1 text-xs text-white/70">
                  {invoice.formatted.paid} already paid · total {invoice.formatted.total}
                </p>
              )}
            </>
          }
          ctaLabel={`Pay ${invoice.formatted.balance}`}
          pending={pending}
          waitingText={waiting}
          error={error}
          onPay={pay}
        />
        <p className="mt-4 text-center text-xs text-muted-foreground">
          You&apos;ll get a receipt by SMS once the payment is confirmed.
        </p>
      </CardContent>
    </Card>
  )
}
