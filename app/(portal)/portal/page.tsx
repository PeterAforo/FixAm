import { getPortalPhone } from "@/lib/portal/session"
import { getPortalOverview } from "@/lib/portal/data"
import { getFleetDashboard } from "@/lib/portal/fleet"
import { PortalLogin } from "./portal-login"
import { PortalDashboard } from "./portal-dashboard"

export const dynamic = "force-dynamic"

export default async function PortalPage() {
  const phone = await getPortalPhone()
  if (!phone) return <PortalLogin />

  const [data, fleets] = await Promise.all([getPortalOverview(phone), getFleetDashboard(phone)])
  return <PortalDashboard phone={phone} data={data} fleets={fleets} />
}
