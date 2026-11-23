import { Suspense } from "react"
import { connection } from "next/server"
import { getMyRider, listRiderJobs } from "@/lib/riders/actions"
import { RiderDashboard } from "./rider-dashboard"

async function Loader() {
  await connection()
  const [rider, jobs] = await Promise.all([getMyRider(), listRiderJobs()])
  if (!rider) return null
  return <RiderDashboard rider={rider} initialJobs={jobs} />
}

export default function RiderPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" />}>
      <Loader />
    </Suspense>
  )
}
