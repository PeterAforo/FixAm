import { Suspense } from "react"
import { connection } from "next/server"
import { notFound } from "next/navigation"
import { getRiderJob } from "@/lib/riders/actions"
import { RiderJobPanel } from "./job-panel"

async function Loader({ jobId }: { jobId: string }) {
  await connection()
  const job = await getRiderJob({ deliveryId: jobId })
  if (!job) notFound()
  return <RiderJobPanel job={job} />
}

export default function RiderJobPage(props: { params: Promise<{ jobId: string }> }) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" />}>
      <Inner params={props.params} />
    </Suspense>
  )
}

async function Inner({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) notFound()
  return <Loader jobId={jobId} />
}
