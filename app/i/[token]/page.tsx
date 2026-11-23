import { Suspense } from "react"
import { connection } from "next/server"
import { notFound } from "next/navigation"
import { loadPublicInspection } from "@/lib/inspections/service"
import { InspectionReportView } from "@/components/inspections/report-view"

export const metadata = { title: "Inspection report · FixAm", robots: { index: false } }

async function Content({ params }: { params: Promise<{ token: string }> }) {
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

export default function PublicInspectionPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <>
      <Suspense fallback={<div className="mx-auto mt-10 h-96 max-w-3xl animate-pulse rounded-2xl bg-muted" />}>
        <Content params={params} />
      </Suspense>
    </>
  )
}
