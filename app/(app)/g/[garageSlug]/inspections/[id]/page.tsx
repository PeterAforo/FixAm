import { Suspense } from "react"
import { connection } from "next/server"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages } from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can } from "@/lib/auth/permissions"
import { getInspection } from "@/lib/inspections/service"
import { InspectionRunner } from "./runner"

async function Loader({ params }: { params: Promise<{ garageSlug: string; id: string }> }) {
  await connection()
  const { garageSlug, id } = await params
  const userId = await getSessionUserId()
  if (!userId) redirect("/login")
  const [garage] = await db().select({ id: garages.id }).from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) notFound()
  const m = await resolveMembership(userId, garage.id)
  if (!m) notFound()
  const principal = { kind: "staff" as const, role: m.role as never, garageId: garage.id, branchId: m.branchId }
  if (!can(principal, "inspections.perform")) notFound()
  const detail = await getInspection(garage.id, id)
  if (!detail) notFound()
  const insp = detail.inspection
  const v = insp.vehicleDetails as { make?: string; model?: string; year?: string; plate?: string; vin?: string; mileageKm?: number }
  return (
    <InspectionRunner
      garageId={garage.id}
      inspectionId={insp.id}
      number={insp.number}
      status={insp.status}
      paymentStatus={insp.paymentStatus}
      price={Number(insp.price)}
      driverPhone={insp.driverPhone}
      car={[v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle"}
      plate={v.plate ?? null}
      vin={v.vin ?? null}
      mileageKm={v.mileageKm ?? null}
      locationKind={insp.locationKind}
      seller={{ name: insp.sellerName, phone: insp.sellerPhone, address: insp.sellerAddress }}
      scheduledAt={insp.scheduledAt?.toISOString() ?? null}
      inspectorName={detail.inspectorName}
      testDriveNotes={insp.testDriveNotes ?? ""}
      items={detail.items.map((i) => ({ itemKey: i.itemKey, section: i.section, label: i.label, result: i.result, note: i.note, photoPath: i.photoPath }))}
      obd={detail.obd.map((o) => ({
        id: o.id, vin: o.vin, milOn: o.milOn,
        codes: Array.isArray(o.dtcs) ? (o.dtcs as { code: string }[]).map((d) => d.code) : [],
        summary: (o.explanation as { summary?: string } | null)?.summary ?? null,
        createdAt: o.createdAt.toISOString(),
      }))}
    />
  )
}

export default function InspectionDetailPage(props: { params: Promise<{ garageSlug: string; id: string }> }) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-4xl">
        <Link href="../" className="text-sm font-semibold text-muted-foreground hover:text-foreground">← Inspections</Link>
        <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-muted" />}>
          <Loader params={props.params} />
        </Suspense>
      </div>
    </div>
  )
}
