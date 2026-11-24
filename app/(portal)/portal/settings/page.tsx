import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { redirect } from "next/navigation"
import { getPortalPhone } from "@/lib/portal/session"
import { getPortalProfile, portalAvatarUrl } from "@/lib/portal/profile"
import { getPortalOverview } from "@/lib/portal/data"
import { PortalSettingsPanel } from "./portal-settings-panel"
import { PortalNotificationsCard, PortalPrivacyCard } from "./portal-preferences"

async function SettingsContent() {
  await connection()
  const phone = await getPortalPhone()
  if (!phone) redirect("/portal")
  const profile = await getPortalProfile(phone)
  if (!profile) redirect("/portal")
  const [avatarUrl, overview] = await Promise.all([portalAvatarUrl(profile.avatarUrl), getPortalOverview(phone)])
  const first = overview.customers[0]

  return (
    <main className="mx-auto max-w-2xl p-4 md:p-8">
      <Link href="/portal" className="text-sm text-muted-foreground underline">← Home</Link>
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
      <div id="notifications" className="mt-6 scroll-mt-20 space-y-6">
        <PortalNotificationsCard prefs={{
          preferredChannels: first?.preferredChannels ?? ["whatsapp", "sms"],
          marketingOptIn: first?.marketingOptIn ?? false,
          seasonalTips: !(first?.seasonalOptOut ?? false),
          linkedGarages: overview.customers.length,
        }} />
        <PortalPrivacyCard />
      </div>
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
