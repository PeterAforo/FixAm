import { Suspense } from "react"

async function Slug({ params }: { params: Promise<{ garageSlug: string }> }) {
  const { garageSlug } = await params
  return (
    <h1 className="font-display text-3xl font-bold text-foreground">
      Book at {garageSlug}
    </h1>
  )
}

export default function PublicBookingPage({
  params,
}: {
  params: Promise<{ garageSlug: string }>
}) {
  return (
    <main className="min-h-screen bg-background p-8">
      <Suspense fallback={<div className="h-9 w-56 animate-pulse rounded bg-muted" />}>
        <Slug params={params} />
      </Suspense>
      <p className="mt-2 text-muted-foreground">Builds in P1-11.</p>
    </main>
  )
}
