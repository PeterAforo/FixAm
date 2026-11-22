"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { Smartphone, CheckCircle2 } from "lucide-react"
import { initiatePublicInvoicePayment } from "@/lib/money/payments"

type Invoice = {
  id: string
  number: string | null
  status: string
  balanceDue: number
  formatted: { total: string; paid: string; balance: string }
}

const NETWORKS = [
  { id: "mtn", label: "MTN" },
  { id: "telecel", label: "Telecel" },
  { id: "airteltigo", label: "AT" },
] as const

export function InvoicePayPanel({ token, invoice }: { token: string; invoice: Invoice }) {
  const [pending, startTransition] = useTransition()
  const [channel, setChannel] = useState<"momo" | "card">("momo")
  const [network, setNetwork] = useState<(typeof NETWORKS)[number]["id"]>("mtn")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [waiting, setWaiting] = useState<string | null>(null)

  const payable = ["issued", "partially_paid"].includes(invoice.status) && invoice.balanceDue > 0

  function pay() {
    setMsg(null); setWaiting(null)
    startTransition(async () => {
      const res = await initiatePublicInvoicePayment({
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
      <CardContent className="space-y-5 p-6">
        {/* Revolut-style amount hero */}
        <div className="rounded-2xl bg-[image:var(--gradient-ignite)] p-5 text-center text-white">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/70">Amount due</p>
          <p className="mt-1 font-display text-4xl font-bold tabular-nums tracking-tight">{invoice.formatted.balance}</p>
          {invoice.formatted.paid !== invoice.formatted.total && (
            <p className="mt-1 text-xs text-white/70">
              {invoice.formatted.paid} already paid · total {invoice.formatted.total}
            </p>
          )}
        </div>

        {/* Method tiles — MoMo default per Ghana */}
        <div className="grid grid-cols-2 gap-2">
          {(["momo", "card"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              aria-pressed={channel === c}
              className={`rounded-xl border-2 px-3 py-3 text-sm font-semibold transition-colors ${
                channel === c ? "border-primary bg-primary-subtle text-primary" : "border-border bg-surface"
              }`}
            >
              {c === "momo" ? "Mobile Money" : "Card"}
            </button>
          ))}
        </div>

        {channel === "momo" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {NETWORKS.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setNetwork(n.id)}
                  aria-pressed={network === n.id}
                  className={`rounded-lg border-2 px-2 py-2.5 text-xs font-bold uppercase ${
                    network === n.id ? "border-primary bg-primary-subtle text-primary" : "border-border"
                  }`}
                >
                  {n.label}
                </button>
              ))}
            </div>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="MoMo number e.g. 0241234567"
              inputMode="tel"
              aria-label="Mobile money number"
              className="min-h-12 w-full rounded-xl border-2 border-border bg-background px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        ) : (
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email for receipt (optional)"
            type="email"
            aria-label="Email for receipt"
            className="min-h-12 w-full rounded-xl border-2 border-border bg-background px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}

        {msg && <p className="rounded-lg bg-danger-subtle px-3 py-2 text-sm font-semibold text-danger">{msg}</p>}

        {/* Approve-on-your-phone waiting state — spec MoMoPayment */}
        {waiting ? (
          <div className="rounded-2xl border-2 border-border bg-surface-sunken p-5 text-center">
            <div className="mx-auto w-fit animate-pulse">
              <Smartphone className="size-12 text-primary" />
            </div>
            <p className="mt-3 font-display text-lg font-bold">Approve on your phone</p>
            <p className="mt-1 text-sm text-muted-foreground">{waiting}</p>
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-warning-subtle px-3 py-1 text-xs font-bold">
              <span className="size-2 animate-ping rounded-full bg-warning" /> Waiting for confirmation…
            </p>
          </div>
        ) : (
          <Button className="w-full" size="lg" loading={pending} disabled={pending || (channel === "momo" && !phone)} onClick={pay}>
            Pay {invoice.formatted.balance}
          </Button>
        )}

        <p className="text-center text-xs text-muted-foreground">
          You&apos;ll get a receipt by SMS once the payment is confirmed.
        </p>
      </CardContent>
    </Card>
  )
}
