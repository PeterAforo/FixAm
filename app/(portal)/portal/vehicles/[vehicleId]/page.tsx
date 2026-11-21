import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { notFound, redirect } from "next/navigation"
import { getPortalPhone } from "@/lib/portal/session"
import { getPortalVehicle } from "@/lib/portal/data"
import { listDirectoryGarages } from "@/lib/discovery/directory"
import { VehicleDetailPanel } from "./vehicle-detail-panel"

async function PortalVehicleContent({ params }: { params: Promise<{ vehicleId: string }> }) {
  await connection()
  const { vehicleId } = await params
  const phone = await getPortalPhone()
  if (!phone) redirect("/portal")
  const data = await getPortalVehicle(phone, vehicleId)
  if (!data) notFound()

  const matchingGarages =
    data.vehicle.catalogMakeId || data.vehicle.catalogModelId
      ? await listDirectoryGarages({
          makeId: data.vehicle.catalogMakeId,
          modelId: data.vehicle.catalogModelId,
          limit: 6,
        })
      : []

  return (
    <main className="mx-auto max-w-4xl p-4 md:p-8">
      <Link href="/portal" className="text-sm text-muted-foreground underline">← Back to portal</Link>
      <VehicleDetailPanel data={data} matchingGarages={matchingGarages} />
    </main>
  )
}

export default function PortalVehiclePage({ params }: { params: Promise<{ vehicleId: string }> }) {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" />}>
      <PortalVehicleContent params={params} />
    </Suspense>
  )
}
