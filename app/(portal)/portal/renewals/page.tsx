import { Suspense } from "react"
import { connection } from "next/server"
import { getPortalPhone } from "@/lib/portal/session"
import { getPortalProfile, listPortalVehicles } from "@/lib/portal/profile"
import { listMyBrokerRequests } from "@/lib/brokers/actions"
import { DriverRenewalsPanel } from "./renewals-panel"

type Search = Promise<{ new?: string }>

async function Loader({ searchParams }: { searchParams: Search }) {
  await connection()
  const { new: openNew } = await searchParams
  const phone = await getPortalPhone()
  if (!phone) return null
  const [profile, vehicles, requests] = await Promise.all([getPortalProfile(phone), listPortalVehicles(phone), listMyBrokerRequests()])
  return (
    <DriverRenewalsPanel
      startOpen={openNew === "1" || requests.length === 0}
      city={profile?.city ?? ""}
      vehicles={vehicles.map((v) => ({ id: v.id, plate: v.plateNumber ?? "", make: v.make, model: v.model, year: v.year }))}
      requests={requests}
    />
  )
}

export default function DriverRenewalsPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[960px] animate-pulse rounded-2xl bg-muted" />}>
      <Loader searchParams={searchParams} />
    </Suspense>
  )
}
