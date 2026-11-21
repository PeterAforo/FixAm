"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
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
  const [channel, setChannel] = useState<"momo" | "card">("momo")
  const [network, setNetwork] = useState<"mtn" | "telecel" | "airteltigo">("mtn")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const payable = instalment.status !== "paid" && instalment.amount > 0

  function pay() {
    setMsg(null); setDone(null)
    startTransition(async () => {
      const res = await initiatePublicInstalmentPayment({
        token,
        channel,
        momoNetwork: channel === "momo" ? network : undefined,
        payerPhone: phone || undefined,
        payerEmail: email || undefined,
      })
      if (!res.ok) { setMsg(res.error.message); return }
      if (res.data.authorizationUrl) {
        window.location.href = res.data.authorizationUrl
        return
      }
      setDone(res.data.displayText ?? "Check your phone to approve the payment.")
    })
  }

  if (!payable) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="font-semibold">This instalment is already paid. Thank you!</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex justify-between border-b pb-3 text-base font-bold">
          <span>Amount due</span>
          <span className="tabular-nums">{instalment.formatted}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(["momo", "card"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setChannel(c)}
              className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold ${channel === c ? "border-primary bg-primary/10" : "border-border"}`}
            >
              {c === "momo" ? "Mobile Money" : "Card"}
            </button>
          ))}
        </div>

        {channel === "momo" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {(["mtn", "telecel", "airteltigo"] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setNetwork(n)}
                  className={`rounded-lg border-2 px-2 py-2 text-xs font-bold uppercase ${network === n ? "border-primary bg-primary/10" : "border-border"}`}
                >
                  {n === "airteltigo" ? "AT" : n}
                </button>
              ))}
            </div>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="MoMo number e.g. 0241234567"
              inputMode="tel"
              className="min-h-11 w-full rounded-lg border-2 border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        ) : (
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email for receipt (optional)"
            type="email"
            className="min-h-11 w-full rounded-lg border-2 border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}

        {msg && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p>}
        {done && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-semibold text-success">{done}</p>}

        <Button className="w-full" disabled={pending || (channel === "momo" && !phone)} onClick={pay}>
          {pending ? "Processing…" : `Pay ${instalment.formatted}`}
        </Button>
      </CardContent>
    </Card>
  )
}
