import { Suspense } from "react"
import { connection } from "next/server"
import { getPortalPhone } from "@/lib/portal/session"
import { getPortalOverview } from "@/lib/portal/data"
import { getFleetDashboard } from "@/lib/portal/fleet"
import { getPortalProfile, listPortalVehicles } from "@/lib/portal/profile"
import { listCatalogueGrouped } from "@/lib/catalogue"
import { PortalLogin } from "./portal-login"
import { PortalRegister } from "./portal-register"
import { PortalDashboard } from "./portal-dashboard"

async function PortalContent() {
  await connection()
  const phone = await getPortalPhone()
  if (!phone) return <PortalLogin />

  const profile = await getPortalProfile(phone)
  if (!profile) return <PortalRegister phone={phone} />

  const [data, fleets, claimedVehicles, catalogue] = await Promise.all([
    getPortalOverview(phone),
    getFleetDashboard(phone),
    listPortalVehicles(phone),
    listCatalogueGrouped(),
  ])
  return (
    <PortalDashboard
      phone={phone}
      data={data}
      fleets={fleets}
      claimedVehicles={claimedVehicles.map((v) => ({
        id: v.id, make: v.make, model: v.model, year: v.year,
        plateNumber: v.plateNumber, color: v.color, bodyType: v.bodyType,
      }))}
      catalogue={catalogue.map((m) => ({
        id: m.id, name: m.name,
        models: m.models.map((v) => ({ id: v.id, name: v.name, yearStart: v.yearStart, yearEnd: v.yearEnd })),
      }))}
    />
  )
}

export default function PortalPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" />}>
      <PortalContent />
    </Suspense>
  )
}
