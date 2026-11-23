import { Suspense } from "react"
import { connection } from "next/server"
import { getMyOperator } from "@/lib/towing/actions"
import { TowSettingsForm } from "./settings-form"

async function Loader() {
  await connection()
  const op = await getMyOperator()
  return op ? <TowSettingsForm operator={op} /> : null
}

export default function TowSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em]">Settings</h1>
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-2xl bg-muted" />}>
        <Loader />
      </Suspense>
    </div>
  )
}
