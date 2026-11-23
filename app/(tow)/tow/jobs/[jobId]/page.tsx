import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { notFound } from "next/navigation"
import { getTowJob } from "@/lib/towing/actions"
import { TowJobPanel } from "./tow-job-panel"

async function Loader({ params }: { params: Promise<{ jobId: string }> }) {
  await connection()
  const { jobId } = await params
  const job = await getTowJob(jobId)
  if (!job) notFound()
  return <TowJobPanel initial={job} />
}

export default function TowJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/tow" className="text-sm text-muted-foreground underline">← All jobs</Link>
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-2xl bg-muted" />}>
        <Loader params={params} />
      </Suspense>
    </div>
  )
}
