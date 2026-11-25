import { Suspense } from "react"
import { AdminPageHeader } from "../admin-page-header"
import { AdminIntegrationsSection } from "../admin-integrations-section"

export const metadata = { title: "Integrations · Admin" }

export default function AdminIntegrationsPage() {
  return (
    <>
      <AdminPageHeader
        title="Integrations"
        description="Payment gateways and SMS providers. Keys are stored encrypted and never shown again after saving."
      />
      <Suspense fallback={null}><AdminIntegrationsSection /></Suspense>
    </>
  )
}
