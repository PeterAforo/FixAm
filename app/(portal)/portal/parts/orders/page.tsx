import { Suspense } from "react"
import Link from "next/link"
import { connection } from "next/server"
import { listMyPartOrders } from "@/lib/parts-shop/actions"
import { MyPartOrders } from "./my-part-orders"

async function Loader({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  await connection()
  const [orders, sp] = await Promise.all([listMyPartOrders(), searchParams])
  const notice = sp.payment === "success" || sp.payment === "pending" || sp.payment === "failed" ? sp.payment : null
  return <MyPartOrders orders={orders} notice={notice} />
}

export default function MyPartOrdersPage(props: { searchParams: Promise<{ payment?: string }> }) {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em]">My parts orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track deliveries, confirm what you received, or report a problem.</p>
        </div>
        <Link href="/portal/parts" className="text-sm font-semibold underline">Buy more parts</Link>
      </div>
      <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-2xl bg-muted" />}>
        <Loader searchParams={props.searchParams} />
      </Suspense>
    </div>
  )
}
