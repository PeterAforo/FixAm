import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { redirect } from "next/navigation"
import { getPortalPhone } from "@/lib/portal/session"
import { getPortalProfile, portalAvatarUrl } from "@/lib/portal/profile"
import { PortalSettingsPanel } from "./portal-settings-panel"

async function SettingsContent() {
  await connection()
  const phone = await getPortalPhone()
  if (!phone) redirect("/portal")
  const profile = await getPortalProfile(phone)
  if (!profile) redirect("/portal")
  const avatarUrl = await portalAvatarUrl(profile.avatarUrl)

  return (
    <main className="mx-auto max-w-2xl p-4 md:p-8">
      <Link href="/portal" className="text-sm text-muted-foreground underline">← Back to portal</Link>
      <PortalSettingsPanel phone={phone} profile={{
        username: profile.username,
        fullName: profile.fullName,
        email: profile.email,
        address: profile.address,
        city: profile.city,
        region: profile.region,
        marketingOptIn: profile.marketingOptIn,
        hasPassword: Boolean(profile.passwordHash),
        avatarUrl,
      }} />
    </main>
  )
}

export default function PortalSettingsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" />}>
      <SettingsContent />
    </Suspense>
  )
}
