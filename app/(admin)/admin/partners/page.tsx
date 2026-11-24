import { Suspense } from "react"
import { AdminPartnersSection } from "../admin-partners-section"
import { AdminPageHeader } from "../admin-page-header"

export const metadata = { title: "Insurance partners · Admin" }

export default function AdminPartnersPage() {
  return (
    <>
      <AdminPageHeader title="Insurance partners" description="Agencies garages can use for agent renewals." />
      <Suspense fallback={null}><AdminPartnersSection /></Suspense>
    </>
  )
}
