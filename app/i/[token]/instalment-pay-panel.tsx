"use client"

import { useState, useTransition } from "react"
import { Card, CardContent } from "@/components/brand/card"
import { CheckCircle2 } from "lucide-react"
import { MoMoPayForm, type PayDetails } from "@/components/momo-pay-form"
import { initiatePublicInstalmentPayment } from "@/lib/money/instalments"

type Instalment = {
  instalmentId: string
  invoiceNumber: string | null
  sequence: number
  dueDate: string
  amount: number
  formatted: string
  status: string
}

export function InstalmentPayPanel({ token, instalment }: { token: string; instalment: Instalment }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [waiting, setWaiting] = useState<string | null>(null)

  const payable = instalment.status !== "paid" && instalment.amount > 0

  function pay(d: PayDetails) {
    setError(null); setWaiting(null)
    startTransition(async () => {
      const res = await initiatePublicInstalmentPayment({ token, ...d })
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
          <CheckCircle2 className="mx-auto size-10 text-success" />
          <p className="mt-2 font-semibold">This instalment is already paid. Thank you!</p>
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
              <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
                Instalment {instalment.sequence} · due {instalment.dueDate}
              </p>
              <p className="mt-1 font-display text-4xl font-bold tabular-nums tracking-tight">{instalment.formatted}</p>
            </>
          }
          ctaLabel={`Pay ${instalment.formatted}`}
          pending={pending}
          waitingText={waiting}
          error={error}
          onPay={pay}
        />
      </CardContent>
    </Card>
  )
}
