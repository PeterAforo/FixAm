import { Suspense } from "react"
import { AdminAiUsageSection } from "../admin-ai-usage-section"
import { AdminPageHeader } from "../admin-page-header"

export const metadata = { title: "AI usage · Admin" }

export default function AdminAiPage() {
  return (
    <>
      <AdminPageHeader title="AI usage" description="Claude and Khaya calls per garage over the last 30 days. Prompts and transcripts are never stored, only counts and cost." />
      <Suspense fallback={null}><AdminAiUsageSection /></Suspense>
    </>
  )
}
