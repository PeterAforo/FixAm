import { Suspense } from "react"
import { AdminPlansSection } from "../admin-plans-section"
import { AdminPageHeader } from "../admin-page-header"

export const metadata = { title: "Plans & pricing · Admin" }

export default function AdminPlansPage() {
  return (
    <>
      <AdminPageHeader
        title="Plans & pricing"
        description="Subscription tiers and monthly prices for every workspace type. Prices are in Ghana cedis."
      />
      <Suspense fallback={null}><AdminPlansSection /></Suspense>
    </>
  )
}
