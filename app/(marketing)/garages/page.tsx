import { Suspense } from "react"
import { connection } from "next/server"
import { listDirectoryGarages, directoryCoverageOptions } from "@/lib/discovery/directory"
import { SiteFooter } from "@/components/marketing/site-chrome"
import { PageHero } from "@/components/marketing/page-hero"
import { DirectoryBrowser, DirectoryResultsSkeleton } from "./directory-browser"

type SP = { q?: string; make?: string; model?: string; lat?: string; lng?: string }

async function DirectoryContent({ searchParams }: { searchParams: Promise<SP> }) {
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

  return (
    <DirectoryBrowser
      garages={garages}
      makes={coverage.makes}
      models={coverage.models}
      initial={{ q: sp.q ?? "", make: sp.make ?? "", model: sp.model ?? "", lat: sp.lat ?? "", lng: sp.lng ?? "" }}
    />
  )
}

export const metadata = {
  title: "Find a garage near you",
  description: "Search trusted workshops across Ghana by location, service or the car you drive. Book online and pay with MoMo.",
}

export default function GaragesPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <PageHero
        active="Find a garage"
        eyebrow="For drivers"
        title={
          <>
            Find a garage you can <span className="bg-[linear-gradient(100deg,#FFB08A_0%,#FF5A1F_60%)] bg-clip-text text-transparent">trust</span>
          </>
        }
        subtitle="Search workshops across Ghana by location, service or the car you drive — then book online and track the repair live."
        className="pb-28 md:pb-32"
      />
      <Suspense fallback={<DirectoryResultsSkeleton />}>
        <DirectoryContent searchParams={searchParams} />
      </Suspense>
      <SiteFooter />
    </main>
  )
}
