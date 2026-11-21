import { Suspense } from "react"
import { connection } from "next/server"
import { getPortalPhone } from "@/lib/portal/session"
import { getPortalOverview } from "@/lib/portal/data"
import { getFleetDashboard } from "@/lib/portal/fleet"
import { PortalLogin } from "./portal-login"
import { PortalDashboard } from "./portal-dashboard"

async function PortalContent() {
  await connection()
  const phone = await getPortalPhone()
  if (!phone) return <PortalLogin />

  const [data, fleets] = await Promise.all([getPortalOverview(phone), getFleetDashboard(phone)])
  return <PortalDashboard phone={phone} data={data} fleets={fleets} />
}

export default function PortalPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" />}>
      <PortalContent />
    </Suspense>
  )
}
