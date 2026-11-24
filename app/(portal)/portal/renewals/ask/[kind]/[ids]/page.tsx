import { Suspense } from "react"
import { connection } from "next/server"
import { getPortalPhone } from "@/lib/portal/session"
import { getPortalProfile, listPortalVehicles } from "@/lib/portal/profile"
import { listMyBrokerRequests } from "@/lib/brokers/actions"
import { DriverRenewalsPanel } from "../../../renewals-panel"

type Params = Promise<{ kind: string; ids: string }>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * /portal/renewals/ask/<insurance|dvla>/<id~id~id> — the hand-off from the
 * public /brokers finder. A path (not a query string) so it survives sign-in.
 */
async function Loader({ params }: { params: Params }) {
  await connection()
  const { kind: rawKind, ids } = await params
  const kind = rawKind === "dvla" ? "dvla" : "insurance"
  const brokerIds = decodeURIComponent(ids).split("~").filter((x) => UUID.test(x)).slice(0, 3)
  const phone = await getPortalPhone()
  if (!phone) return null
  const [profile, vehicles, requests] = await Promise.all([getPortalProfile(phone), listPortalVehicles(phone), listMyBrokerRequests()])
  return (
    <DriverRenewalsPanel
      startOpen
      city={profile?.city ?? ""}
      vehicles={vehicles.map((v) => ({ id: v.id, plate: v.plateNumber ?? "", make: v.make, model: v.model, year: v.year }))}
      requests={requests}
      initialKind={kind}
      initialBrokerIds={brokerIds}
    />
  )
}

export default function AskBrokersPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[960px] animate-pulse rounded-2xl bg-muted" />}>
      <Loader params={params} />
    </Suspense>
  )
}
