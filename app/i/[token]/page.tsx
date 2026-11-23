import { connection } from "next/server"
import { notFound } from "next/navigation"
import { loadPublicInspection } from "@/lib/inspections/service"
import { InspectionReportView } from "@/components/inspections/report-view"

export const metadata = { title: "Inspection report · FixAm", robots: { index: false } }

export default async function PublicInspectionPage({ params }: { params: Promise<{ token: string }> }) {
  await connection()
  const { token } = await params
  const report = await loadPublicInspection(token)
  if (!report) notFound()
  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <InspectionReportView report={report} />
    </main>
  )
}
