import { Suspense } from "react"
import { InviteClient } from "./invite-client"

export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  return (
    <Suspense fallback={null}>
      <InviteLoader params={params} />
    </Suspense>
  )
}

async function InviteLoader({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <InviteClient token={token} />
}
