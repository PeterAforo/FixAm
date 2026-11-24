import { Suspense } from "react"
import { AdminPrivacySection } from "../admin-privacy-section"
import { AdminPageHeader } from "../admin-page-header"

export const metadata = { title: "Privacy requests · Admin" }

export default function AdminPrivacyPage() {
  return (
    <>
      <AdminPageHeader title="Privacy requests" description="Data export and deletion requests under the Data Protection Act, 2012 (Act 843)." />
      <Suspense fallback={null}><AdminPrivacySection /></Suspense>
    </>
  )
}
