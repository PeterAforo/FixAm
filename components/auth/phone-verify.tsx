"use client"

import { useState } from "react"
import { BadgeCheck } from "lucide-react"
import { Button } from "@/components/brand/button"
import { requestPhoneLinkCode, verifyPhoneLinkCode } from "@/lib/auth/phone-auth"
import { OtpBoxes, PhoneField, toGhInput } from "./phone-code"

/** Inline "add and verify your phone" for accounts created with e-mail. */
export function PhoneVerify({ onVerified }: { onVerified: (phone: string) => void }) {
  const [phone, setPhone] = useState("")
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [devCode, setDevCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function send() {
    setError(null)
    setBusy(true)
    const res = await requestPhoneLinkCode({ phone: toGhInput(phone) })
    setBusy(false)
    if (!res.ok) return setError(res.error.message)
    setSentTo(res.data.phone)
    setDevCode(res.data.devCode ?? null)
  }

  async function verify(value = code) {
    if (!sentTo || value.length !== 6) return
    setError(null)
    setBusy(true)
    const res = await verifyPhoneLinkCode({ phone: sentTo, code: value })
    setBusy(false)
    if (!res.ok) {
      setCode("")
      return setError(res.error.message)
    }
    onVerified(res.data.phone)
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <BadgeCheck className="size-4 text-primary" /> Verify your phone number
      </p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Garages find your cars and send reminders using this number.
      </p>
      {!sentTo ? (
        <div className="mt-3 flex gap-2">
          <div className="min-w-0 flex-1"><PhoneField value={phone} onChange={setPhone} id="link-phone" /></div>
          <Button type="button" onClick={send} loading={busy} disabled={phone.replace(/\D/g, "").length < 9} className="h-12">
            Send code
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <OtpBoxes value={code} onChange={setCode} onComplete={verify} disabled={busy} />
          {devCode && <p className="text-xs text-muted-foreground">Development mode — your code is <span className="font-mono font-semibold text-foreground">{devCode}</span></p>}
          <button type="button" className="text-[13px] font-medium text-muted-foreground hover:text-foreground" onClick={() => { setSentTo(null); setCode("") }}>
            Use a different number
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-[13px] font-medium text-[#B3122F]">{error}</p>}
    </div>
  )
}
