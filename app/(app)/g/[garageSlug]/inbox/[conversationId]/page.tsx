import { Suspense } from "react"
import { connection } from "next/server"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages } from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can } from "@/lib/auth/permissions"
import { inboxThread } from "@/lib/whatsapp/actions"
import { withinServiceWindow } from "@/lib/whatsapp/core"
import { InboxThread } from "./thread-panel"

async function Loader({ params }: { params: Promise<{ garageSlug: string; conversationId: string }> }) {
  await connection()
  const { garageSlug, conversationId } = await params
  const userId = await getSessionUserId()
  if (!userId) redirect("/login")
  const [garage] = await db().select({ id: garages.id }).from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) notFound()
  const m = await resolveMembership(userId, garage.id)
  if (!m) notFound()
  const principal = { kind: "staff" as const, role: m.role, garageId: garage.id, branchId: m.branchId }
  if (!can(principal, "whatsapp.inbox")) notFound()
  const thread = await inboxThread({ garageId: garage.id, conversationId })
  if (!thread) notFound()
  return (
    <InboxThread
      garageId={garage.id}
      conversationId={conversationId}
      mode={thread.conversation.mode}
      phone={thread.conversation.customerPhone}
      customerName={thread.customer?.fullName ?? null}
      inWindow={withinServiceWindow(thread.conversation.windowStartedAt ? new Date(thread.conversation.windowStartedAt) : null)}
      messages={thread.messages.map((msg) => ({
        id: msg.id,
        direction: msg.direction,
        type: msg.type,
        body: msg.body,
        transcript: msg.transcript,
        aiToolCalls: msg.aiToolCalls,
        createdAt: msg.createdAt,
      }))}
    />
  )
}

export default function InboxThreadPage(props: { params: Promise<{ garageSlug: string; conversationId: string }> }) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-3xl">
        <Link href="../" className="text-sm font-semibold text-muted-foreground hover:text-foreground">← Inbox</Link>
        <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-muted" />}>
          <Loader params={props.params} />
        </Suspense>
      </div>
    </div>
  )
}
