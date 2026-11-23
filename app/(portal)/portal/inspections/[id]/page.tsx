import { Suspense } from "react"
import { connection } from "next/server"
import { notFound, redirect } from "next/navigation"
import { getPortalPhone } from "@/lib/portal/session"
import { myInspectionReportAction } from "@/lib/inspections/actions"
import { InspectionReportView } from "@/components/inspections/report-view"

export const metadata = { title: "Inspection report · FixAm", robots: { index: false } }

async function Content({ params }: { params: Promise<{ id: string }> }) {
  await connection()
  const { id } = await params
  const phone = await getPortalPhone()
  if (!phone) redirect("/login")
  const report = await myInspectionReportAction(id)
  if (!report) notFound()
  return <InspectionReportView report={report} />
}

export default function PortalInspectionReportPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-3xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <Content params={params} />
        </Suspense>
      </div>
    </div>
  )
}
