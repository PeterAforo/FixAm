import { Suspense } from "react"
import { connection } from "next/server"
import { redirect } from "next/navigation"
import { getPortalPhone } from "@/lib/portal/session"
import { listInspectionGaragesAction, myInspectionsAction } from "@/lib/inspections/actions"
import { InspectionBookingForm } from "./booking-form"
import { MyInspections } from "./my-inspections"

async function Content() {
  await connection()
  const phone = await getPortalPhone()
  if (!phone) redirect("/login")
  const [garages, mine] = await Promise.all([listInspectionGaragesAction(), myInspectionsAction()])
  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display text-xl font-bold">Book an inspection</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Buying a used car? A certified inspector checks ~120 points — body, engine, brakes, electrics — plus an OBD scan
          and a test drive, then sends you a full report you can share with the seller.
        </p>
        <InspectionBookingForm garages={garages} />
      </section>
      <section>
        <h2 className="font-display text-xl font-bold">My inspections</h2>
        <MyInspections rows={mine} />
      </section>
    </div>
  )
}

export default function PortalInspectionsPage() {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em]">Pre-purchase inspections</h1>
        <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-2xl bg-muted" />}>
          <Content />
        </Suspense>
      </div>
    </div>
  )
}
