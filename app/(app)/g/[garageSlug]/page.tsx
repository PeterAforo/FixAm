import { Suspense } from "react"

async function Slug({ params }: { params: Promise<{ garageSlug: string }> }) {
  const { garageSlug } = await params
  return (
    <h1 className="font-display text-3xl font-bold text-foreground">
      {garageSlug}
    </h1>
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
        <Slug params={params} />
      </Suspense>
      <p className="mt-2 text-muted-foreground">
        Garage shell lands in P0-07 (app shell) and P2-08 (dashboard).
      </p>
    </main>
  )
}
