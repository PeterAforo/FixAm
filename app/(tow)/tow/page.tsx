import { Suspense } from "react"
import { connection } from "next/server"
import { getMyOperator, listTowJobs } from "@/lib/towing/actions"
import { TowDashboard } from "./tow-dashboard"

async function Loader() {
  await connection()
  const [op, jobs] = await Promise.all([getMyOperator(), listTowJobs()])
  if (!op) return null
  return <TowDashboard operator={op} initialJobs={jobs} />
}

export default function TowPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" />}>
      <Loader />
    </Suspense>
  )
}
