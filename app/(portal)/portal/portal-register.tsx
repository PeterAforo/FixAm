"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/brand/card"
import { completePortalRegistration } from "@/lib/portal/profile-actions"
import { uploadPortalAvatar } from "@/lib/portal/profile-actions"

const inputCls =
  "min-h-11 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function PortalRegister({ phone }: { phone: string }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({
    username: "", password: "", confirmPassword: "", fullName: "", email: "",
    address: "", city: "", region: "",
  })
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    if (form.password && form.password !== form.confirmPassword) {
      setError("Passwords don't match")
      return
    }
    startTransition(async () => {
      const res = await completePortalRegistration({
        username: form.username,
        password: form.password || undefined,
        fullName: form.fullName,
        email: form.email,
        address: form.address,
        city: form.city,
        region: form.region,
        marketingOptIn,
        acceptTerms,
      })
      if (!res.ok) {
        setError(res.error.message)
        if (res.error.fieldErrors) setFieldErrors(res.error.fieldErrors)
        return
      }
      const file = fileRef.current?.files?.[0]
      if (file) {
        const fd = new FormData()
        fd.set("file", file)
        await uploadPortalAvatar(fd)
      }
      router.refresh()
    })
  }

  const ferr = (k: string) => fieldErrors[k]?.[0]

  return (
    <main className="mx-auto max-w-lg p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Create your FixAm account</CardTitle>
          <p className="text-sm text-muted-foreground">
            Verified as <span className="font-mono font-bold">{phone}</span>. Set up your profile to unlock your garage history, bookings and vehicle tools.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-sm font-bold">Full name *</span>
                <input className={inputCls} required value={form.fullName} onChange={set("fullName")} placeholder="Kwame Mensah" />
                {ferr("fullName") && <p className="text-xs text-danger">{ferr("fullName")}</p>}
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold">Username</span>
                <input className={inputCls} value={form.username} onChange={set("username")} placeholder="kwame.m" autoComplete="username" />
                <p className="text-xs text-muted-foreground">For password sign-in. Letters, numbers, _ . -</p>
                {ferr("username") && <p className="text-xs text-danger">{ferr("username")}</p>}
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-sm font-bold">Password</span>
                <input className={inputCls} type="password" minLength={8} value={form.password} onChange={set("password")} placeholder="Min 8 characters" autoComplete="new-password" />
                {ferr("password") && <p className="text-xs text-danger">{ferr("password")}</p>}
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold">Confirm password</span>
                <input className={inputCls} type="password" minLength={8} value={form.confirmPassword} onChange={set("confirmPassword")} autoComplete="new-password" />
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-bold">Email (optional)</span>
              <input className={inputCls} type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-bold">Profile photo (optional)</span>
              <input ref={fileRef} type="file" accept="image/*" className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground" />
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block space-y-1.5">
                <span className="text-sm font-bold">Address</span>
                <input className={inputCls} value={form.address} onChange={set("address")} placeholder="House, street" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold">City</span>
                <input className={inputCls} value={form.city} onChange={set("city")} placeholder="Accra" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-bold">Region</span>
                <input className={inputCls} value={form.region} onChange={set("region")} placeholder="Greater Accra" />
              </label>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)} />
              <span className="text-muted-foreground">Send me service reminders and garage offers by email/SMS.</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" required checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
              <span className="text-muted-foreground">
                I agree to the terms of service and understand my data is handled per the Ghana Data Protection Act.
              </span>
            </label>
            {error && <p className="rounded-lg border-2 border-danger bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
            <Button type="submit" className="w-full" disabled={pending || !acceptTerms}>
              {pending ? "Creating…" : "Create account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
