import { getPortalPhone } from "@/lib/portal/session"
import { getPortalOverview } from "@/lib/portal/data"
import { PortalLogin } from "./portal-login"
import { PortalDashboard } from "./portal-dashboard"

export const dynamic = "force-dynamic"

export default async function PortalPage() {
  const phone = await getPortalPhone()
  if (!phone) return <PortalLogin />

  const data = await getPortalOverview(phone)
  return <PortalDashboard phone={phone} data={data} />
}
