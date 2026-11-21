import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { listDirectoryGarages, directoryCoverageOptions } from "@/lib/discovery/directory"
import { DirectoryBrowser } from "./directory-browser"

async function DirectoryContent({ searchParams }: { searchParams: Promise<{ q?: string; make?: string; model?: string; lat?: string; lng?: string }> }) {
  await connection()
  const sp = await searchParams
  const lat = sp.lat ? Number(sp.lat) : null
  const lng = sp.lng ? Number(sp.lng) : null

  const [garages, coverage] = await Promise.all([
    listDirectoryGarages({
      q: sp.q,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      makeId: sp.make || null,
      modelId: sp.model || null,
    }),
    directoryCoverageOptions(),
  ])

  return <DirectoryBrowser garages={garages} makes={coverage.makes} models={coverage.models} initial={{ q: sp.q ?? "", make: sp.make ?? "", model: sp.model ?? "", lat: sp.lat ?? "", lng: sp.lng ?? "" }} />
}

export const metadata = { title: "Find a garage near you — FixAm" }

export default function GaragesPage({ searchParams }: { searchParams: Promise<{ q?: string; make?: string; model?: string; lat?: string; lng?: string }> }) {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b-2 border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-display text-xl font-bold">FixAm</Link>
          <div className="flex gap-4 text-sm font-semibold">
            <Link href="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</Link>
            <Link href="/login" className="text-primary hover:underline">Garage sign in</Link>
          </div>
        </div>
      </header>
      <Suspense fallback={<div className="mx-auto max-w-6xl p-6"><div className="h-96 animate-pulse rounded-2xl bg-muted" /></div>}>
        <DirectoryContent searchParams={searchParams} />
      </Suspense>
    </main>
  )
}
