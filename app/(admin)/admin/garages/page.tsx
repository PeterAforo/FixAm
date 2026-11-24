import { Suspense } from "react"
import { AdminGaragesSection } from "../admin-garages-section"
import { AdminPageHeader } from "../admin-page-header"

export const metadata = { title: "Garages · Admin" }

export default function AdminGaragesPage() {
  return (
    <>
      <AdminPageHeader title="Garages" description="Every garage on FixAm. Open one as its owner to help with support; every visit is audited." />
      <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-2xl bg-surface-muted" />}>
        <AdminGaragesSection />
      </Suspense>
    </>
  )
}
