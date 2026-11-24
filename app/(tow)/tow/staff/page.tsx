import { Suspense } from "react"
import { connection } from "next/server"
import { WorkspaceStaffSection } from "@/components/staff/workspace-staff-section"

async function Staff() {
  await connection()
  return <WorkspaceStaffSection kind="tow" />
}

export default function TowStaffPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[860px] animate-pulse rounded-2xl bg-muted" />}>
      <Staff />
    </Suspense>
  )
}
