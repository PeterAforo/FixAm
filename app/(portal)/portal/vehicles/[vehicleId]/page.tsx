import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { notFound, redirect } from "next/navigation"
import { getPortalPhone } from "@/lib/portal/session"
import { getPortalVehicle } from "@/lib/portal/data"
import { listDirectoryGarages } from "@/lib/discovery/directory"
import { db } from "@/lib/db"
import { garageReviews } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { VehicleDetailPanel } from "./vehicle-detail-panel"
import { getOwnerPassport } from "@/lib/passport/service"
import { PassportCard } from "@/components/passport/passport-card"
import { DriverScanCard } from "./driver-scan-card"

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

  const passport = await getOwnerPassport(phone, data.vehicle.id).catch(() => null)

  const [existingReview] = await db()
    .select({ rating: garageReviews.rating, comment: garageReviews.comment })
    .from(garageReviews)
    .where(and(eq(garageReviews.garageId, data.vehicle.garageId), eq(garageReviews.portalPhone, phone)))
    .limit(1)

  return (
    <main className="mx-auto max-w-4xl p-4 md:p-8">
      <Link href="/portal" className="text-sm text-muted-foreground underline">← Back to portal</Link>
      <VehicleDetailPanel
        data={data}
        matchingGarages={matchingGarages}
        garageId={data.vehicle.garageId}
        garageName={data.vehicle.garageName}
        existingReview={existingReview ?? null}
      />
      <DriverScanCard vehicleId={data.vehicle.id} />
      {passport && <PassportCard vehicleId={data.vehicle.id} initial={passport} plate={data.vehicle.plateNumber} />}
    </main>
  )
}

export default function PortalVehiclePage({ params }: { params: Promise<{ vehicleId: string }> }) {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-background" />}>
      <PortalVehicleContent params={params} />
    </Suspense>
  )
}
