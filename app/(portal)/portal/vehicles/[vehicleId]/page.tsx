import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getPortalPhone } from "@/lib/portal/session"
import { getPortalVehicle } from "@/lib/portal/data"
import { VehicleDetailPanel } from "./vehicle-detail-panel"

export const dynamic = "force-dynamic"

export default async function PortalVehiclePage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const phone = await getPortalPhone()
  if (!phone) redirect("/portal")
  const { vehicleId } = await params
  const data = await getPortalVehicle(phone, vehicleId)
  if (!data) notFound()

  return (
    <main className="mx-auto max-w-4xl p-4 md:p-8">
      <Link href="/portal" className="text-sm text-muted-foreground underline">← Back to portal</Link>
      <VehicleDetailPanel data={data} />
    </main>
  )
}
