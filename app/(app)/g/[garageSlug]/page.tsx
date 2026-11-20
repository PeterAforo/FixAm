import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"

async function GarageName({ params }: { params: Promise<{ garageSlug: string }> }) {
  await connection()
  const { garageSlug } = await params
  return (
    <>
      <h1 className="font-display text-3xl font-bold text-foreground">{garageSlug}</h1>
      <p className="mt-4 text-sm">
        <Link href={`/g/${garageSlug}/settings/staff`} className="font-bold text-primary underline">
          Team settings →
        </Link>
      </p>
    </>
  )
}

export default function GarageDashboardPage({
  params,
}: {
  params: Promise<{ garageSlug: string }>
}) {
  return (
    <main className="min-h-screen bg-background p-8">
      <Suspense fallback={<div className="h-9 w-48 animate-pulse rounded bg-muted" />}>
        <GarageName params={params} />
      </Suspense>
      <p className="mt-2 text-muted-foreground">
        Garage shell lands in P0-07 (app shell) and P2-08 (dashboard).
      </p>
    </main>
  )
}
