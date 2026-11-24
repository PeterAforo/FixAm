import { Suspense } from "react"
import { AdminPartsSection } from "../admin-parts-section"
import { AdminDvlaFeesSection } from "../admin-dvla-fees-section"
import { AdminPageHeader } from "../admin-page-header"

export const metadata = { title: "Parts & DVLA fees · Admin" }

export default function AdminCataloguePage() {
  return (
    <>
      <AdminPageHeader title="Parts & DVLA fees" description="Reference data every garage, seller and driver shares." />
      <Suspense fallback={null}><AdminPartsSection /></Suspense>
      <Suspense fallback={null}><AdminDvlaFeesSection /></Suspense>
    </>
  )
}
