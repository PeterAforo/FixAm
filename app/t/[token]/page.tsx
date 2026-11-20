import { Suspense } from "react"

async function Token({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <span className="sr-only">{token}</span>
}

export default function MagicLinkPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8">
      <p className="text-muted-foreground">
        Magic-link pages build in P1-08 / P1-10 / P2-02 / P4-03 / P4-06.
      </p>
      <Suspense fallback={null}>
        <Token params={params} />
      </Suspense>
    </main>
  )
}
