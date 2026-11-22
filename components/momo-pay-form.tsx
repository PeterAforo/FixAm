"use client"

import { useState, type ReactNode } from "react"
import { Button } from "@/components/brand/button"
import { Smartphone } from "lucide-react"

export type PayChannel = "momo" | "card"
export type MomoNetwork = "mtn" | "telecel" | "airteltigo"

export type PayDetails = {
  channel: PayChannel
  momoNetwork?: MomoNetwork
  payerPhone?: string
  payerEmail?: string
}

const NETWORKS: { id: MomoNetwork; label: string }[] = [
  { id: "mtn", label: "MTN" },
  { id: "telecel", label: "Telecel" },
  { id: "airteltigo", label: "AT" },
]

/**
 * MoMoPayment pattern — spec: network picker, phone input, MoMo default,
 * "Approve on your phone" waiting state. Used by invoice + instalment pay pages.
 */
export function MoMoPayForm({
  hero,
  ctaLabel,
  pending,
  waitingText,
  error,
  onPay,
}: {
  /** Amount hero content (rendered inside the gradient card). */
  hero: ReactNode
  ctaLabel: string
  pending: boolean
  /** Non-null shows the approve-on-your-phone waiting state. */
  waitingText: string | null
  error: string | null
  onPay: (details: PayDetails) => void
}) {
  const [channel, setChannel] = useState<PayChannel>("momo")
  const [network, setNetwork] = useState<MomoNetwork>("mtn")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-[image:var(--gradient-ignite)] p-5 text-center text-white">
        {hero}
      </div>

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

      {error && <p className="rounded-lg bg-danger-subtle px-3 py-2 text-sm font-semibold text-danger">{error}</p>}

      {waitingText ? (
        <div className="rounded-2xl border-2 border-border bg-surface-sunken p-5 text-center">
          <div className="mx-auto w-fit animate-pulse">
            <Smartphone className="size-12 text-primary" />
          </div>
          <p className="mt-3 font-display text-lg font-bold">Approve on your phone</p>
          <p className="mt-1 text-sm text-muted-foreground">{waitingText}</p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-warning-subtle px-3 py-1 text-xs font-bold">
            <span className="size-2 animate-ping rounded-full bg-warning" /> Waiting for confirmation…
          </p>
        </div>
      ) : (
        <Button
          className="w-full"
          size="lg"
          loading={pending}
          disabled={pending || (channel === "momo" && !phone)}
          onClick={() =>
            onPay({
              channel,
              momoNetwork: channel === "momo" ? network : undefined,
              payerPhone: phone || undefined,
              payerEmail: email || undefined,
            })
          }
        >
          {ctaLabel}
        </Button>
      )}
    </div>
  )
}
