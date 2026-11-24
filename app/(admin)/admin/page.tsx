import { Suspense } from "react"
import { connection } from "next/server"
import { adminAnalytics, adminListGarages } from "@/lib/admin/actions"
import { adminAttention } from "@/lib/admin/overview"
import { AdminAnalyticsPanel } from "./admin-analytics-panel"
import { AdminGaragesPanel } from "./admin-garages-panel"
import { AdminPageHeader } from "./admin-page-header"

async function Overview() {
  await connection()
  const [analytics, attention, garages] = await Promise.all([adminAnalytics(), adminAttention(), adminListGarages()])
  const rows = garages.ok ? garages.data : []
  const branches = rows.reduce((n, g) => n + Number(g.branchCount ?? 0), 0)
  const complimentary = rows.filter((g) => g.isComplimentary).length
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Accra" })
  return (
    <>
      <AdminPageHeader eyebrow={today} title="Platform overview" />
      <AdminAnalyticsPanel analytics={analytics.ok ? analytics.data : null} attention={attention} branches={branches} complimentary={complimentary} />
      <AdminGaragesPanel garages={rows} compact />
    </>
  )
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-surface-muted" />}>
      <Overview />
    </Suspense>
  )
}
