"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { updatePortalProfile, uploadPortalAvatar } from "@/lib/portal/profile-actions"

const inputCls =
  "min-h-11 w-full rounded-lg border-2 border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

type Profile = {
  username: string | null
  fullName: string
  email: string | null
  address: string | null
  city: string | null
  region: string | null
  marketingOptIn: boolean
  hasPassword: boolean
  avatarUrl: string | null
}

export function PortalSettingsPanel({ phone, profile }: { phone: string; profile: Profile }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({
    username: profile.username ?? "",
    fullName: profile.fullName,
    email: profile.email ?? "",
    address: profile.address ?? "",
    city: profile.city ?? "",
    region: profile.region ?? "",
    marketingOptIn: profile.marketingOptIn,
  })
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }))

  function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    startTransition(async () => {
      const res = await updatePortalProfile({
        username: form.username,
        fullName: form.fullName,
        email: form.email,
        address: form.address,
        city: form.city,
        region: form.region,
        marketingOptIn: form.marketingOptIn,
      })
      setMsg(res.ok ? { ok: true, text: "Profile saved" } : { ok: false, text: res.error.message })
      if (res.ok) router.refresh()
    })
  }

  function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (pw.next !== pw.confirm) { setMsg({ ok: false, text: "New passwords don't match" }); return }
    startTransition(async () => {
      const res = await updatePortalProfile({
        currentPassword: pw.current,
        newPassword: pw.next,
      })
      if (!res.ok) { setMsg({ ok: false, text: res.error.message }); return }
      setMsg({ ok: true, text: "Password updated" })
      setPw({ current: "", next: "", confirm: "" })
    })
  }

  function uploadPhoto(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) { setMsg({ ok: false, text: "Choose an image first" }); return }
    setMsg(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("file", file)
      const res = await uploadPortalAvatar(fd)
      setMsg(res.ok ? { ok: true, text: "Photo updated" } : { ok: false, text: res.error.message })
      if (res.ok) router.refresh()
    })
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-center gap-4">
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
          <img src={profile.avatarUrl} alt="" className="size-16 rounded-2xl border-2 border-border object-cover" />
        ) : (
          <span className="flex size-16 items-center justify-center rounded-2xl border-2 border-border bg-primary/10 font-display text-2xl font-bold">
            {profile.fullName.charAt(0)}
          </span>
        )}
        <div>
          <h1 className="font-display text-2xl font-bold">{profile.fullName}</h1>
          <p className="text-sm text-muted-foreground">
            @{profile.username ?? "no-username"} · {phone}
          </p>
        </div>
      </div>

      {msg && <p className={`rounded-lg px-3 py-2 text-sm font-semibold ${msg.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{msg.text}</p>}

      <Card><CardContent className="p-5">
        <h2 className="font-display text-base font-bold">Profile</h2>
        <form onSubmit={saveProfile} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-bold">Full name</span>
            <input className={inputCls} required value={form.fullName} onChange={set("fullName")} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-bold">Username</span>
            <input className={inputCls} value={form.username} onChange={set("username")} placeholder="letters, numbers, _ . -" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-bold">Email</span>
            <input className={inputCls} type="email" value={form.email} onChange={set("email")} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-bold">Phone</span>
            <input className={`${inputCls} bg-surface-muted`} value={phone} disabled />
          </label>
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-sm font-bold">Address</span>
            <input className={inputCls} value={form.address} onChange={set("address")} placeholder="House, street" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-bold">City</span>
            <input className={inputCls} value={form.city} onChange={set("city")} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-bold">Region</span>
            <input className={inputCls} value={form.region} onChange={set("region")} />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={form.marketingOptIn} onChange={set("marketingOptIn")} />
            <span className="text-muted-foreground">Send me service reminders and offers</span>
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>Save profile</Button>
          </div>
        </form>
      </CardContent></Card>

      <Card><CardContent className="p-5">
        <h2 className="font-display text-base font-bold">Profile photo</h2>
        <form onSubmit={uploadPhoto} className="mt-3 flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept="image/*" className="text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground" />
          <Button type="submit" variant="secondary" disabled={pending}>Upload</Button>
        </form>
      </CardContent></Card>

      <Card><CardContent className="p-5">
        <h2 className="font-display text-base font-bold">{profile.hasPassword ? "Change password" : "Set a password"}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {profile.hasPassword ? "Enter your current password to set a new one." : "Set a password so you can also sign in without SMS."}
        </p>
        <form onSubmit={changePassword} className="mt-3 grid gap-3 sm:grid-cols-3">
          {profile.hasPassword && (
            <label className="block space-y-1.5">
              <span className="text-sm font-bold">Current</span>
              <input className={inputCls} type="password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
            </label>
          )}
          <label className="block space-y-1.5">
            <span className="text-sm font-bold">New password</span>
            <input className={inputCls} type="password" minLength={8} required value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-bold">Confirm</span>
            <input className={inputCls} type="password" minLength={8} required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" />
          </label>
          <div className="sm:col-span-3">
            <Button type="submit" variant="secondary" disabled={pending}>Update password</Button>
          </div>
        </form>
      </CardContent></Card>
    </div>
  )
}
