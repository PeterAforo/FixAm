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
import { inboxThreads } from "@/lib/whatsapp/actions"

async function Loader({ params }: { params: Promise<{ garageSlug: string }> }) {
  await connection()
  const { garageSlug } = await params
  const userId = await getSessionUserId()
  if (!userId) redirect("/login")
  const [garage] = await db().select({ id: garages.id }).from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) notFound()
  const m = await resolveMembership(userId, garage.id)
  if (!m) notFound()
  const principal = { kind: "staff" as const, role: m.role, garageId: garage.id, branchId: m.branchId }
  if (!can(principal, "whatsapp.inbox")) notFound()
  const threads = await inboxThreads({ garageId: garage.id })
  return (
    <ul className="mt-6 space-y-2">
      {threads.length === 0 && (
        <li className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No WhatsApp conversations yet. When customers message your garage&apos;s WhatsApp number, they show up here.
        </li>
      )}
      {threads.map((t) => (
        <li key={t.id}>
          <Link href={`/g/${garageSlug}/inbox/${t.id}`} className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4 hover:border-foreground/30">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-semibold">
                {t.customerName ?? `+${t.phone}`}
                {t.mode === "human" && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">human</span>}
                {t.mode === "ai" && <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">AI</span>}
              </p>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{t.lastBody ?? "—"}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
              {t.lastMessageAt && <span>{new Date(t.lastMessageAt).toLocaleString("en-GH", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>}
              {Number(t.unread) > 0 && <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{t.unread}</span>}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default function GarageInboxPage(props: { params: Promise<{ garageSlug: string }> }) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em]">WhatsApp inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">Customer chats on WhatsApp. The AI assistant answers first — take over any conversation and hand it back when you&apos;re done.</p>
        <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-2xl bg-muted" />}>
          <Loader params={props.params} />
        </Suspense>
      </div>
    </div>
  )
}
