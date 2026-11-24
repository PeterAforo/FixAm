import { Suspense } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { eq } from "drizzle-orm"
import { ArrowRight } from "lucide-react"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { ensureUser, getSessionPhone, getSessionUserId } from "@/lib/auth/ensure-user"
import { listMyWorkspaces, preferredWorkspace, WORKSPACE_LABEL } from "@/lib/accounts/workspaces"
import { workspaceStats } from "@/lib/accounts/workspace-stats"
import { formatGhPhone } from "@/lib/phone"
import { Logo } from "@/components/marketing/logo"
import { WORKSPACE_TINT } from "@/components/shell/workspace-switcher"
import { cn } from "@/lib/utils"
import { AccountActions, OpenWorkspaceButton } from "./account-actions"
import { ROLE_OPTIONS } from "@/app/(auth)/onboarding/roles"

export const metadata = { title: "Your account" }

function greeting(now: Date) {
  // Ghana is UTC+0 all year, so the server clock's UTC hour is local time.
  const h = now.getUTCHours()
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
}

async function AccountContent() {
  await connection()
  const userId = await getSessionUserId()
  if (!userId) redirect("/login")
  await ensureUser()

  const [[me], phone, workspaces] = await Promise.all([
    db().select({ fullName: users.fullName, email: users.email }).from(users).where(eq(users.id, userId)).limit(1),
    getSessionPhone(),
    listMyWorkspaces(userId),
  ])
  const [last, stats] = await Promise.all([preferredWorkspace(workspaces), workspaceStats(userId, workspaces)])
  // Last-used first, then the stable order.
  const ordered = last ? [last, ...workspaces.filter((w) => w.key !== last.key)] : workspaces
  const types = new Set(workspaces.map((w) => w.type))
  const addable = ROLE_OPTIONS.filter((r) => r.repeatable || !types.has(r.type))
  const firstName = me?.fullName?.trim().split(/\s+/)[0]
  const initials = (me?.fullName ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("")
  const who = phone ? formatGhPhone(phone) : (me?.email ?? "")

  return (
    <main className="min-h-dvh bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-3 px-6">
          <Logo href="/" />
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2.5 rounded-full border border-border py-1 pl-1 pr-3 sm:flex">
              <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                {initials || "?"}
              </span>
              <span className="text-[13px] leading-tight">
                <span className="block font-semibold">{me?.fullName ?? "Your account"}</span>
                <span className="block text-muted-foreground">{who}</span>
              </span>
            </div>
            <AccountActions />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1120px] flex-col gap-12 px-6 py-10 md:py-14">
        <section>
          <p className="text-sm text-muted-foreground">{greeting(new Date())}</p>
          <h1 className="mt-1 font-display text-[34px] font-bold leading-[1.05] tracking-[-0.03em] md:text-[48px]">
            Where are we working today{firstName ? `, ${firstName}` : ""}?
          </h1>
          <p className="mt-2 text-[15px] text-muted-foreground md:text-base">One FixAm account for every role you hold.</p>
        </section>

        {ordered.length > 0 ? (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Your workspaces</h2>
            <ul className="mt-4 grid gap-5 md:grid-cols-2">
              {ordered.map((w, i) => (
                <li key={w.key}>
                  <OpenWorkspaceButton
                    workspace={w}
                    label={WORKSPACE_LABEL[w.type]}
                    stats={stats[w.key] ?? []}
                    featured={i === 0}
                    lastUsed={last?.key === w.key}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <div className="rounded-[22px] border border-dashed border-border-strong bg-card p-8 text-center">
            <p className="font-semibold">You haven&apos;t set up a workspace yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Tell us what brings you to FixAm and we&apos;ll get you going.</p>
            <Link href="/onboarding" className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">
              Get started <ArrowRight className="size-4" />
            </Link>
          </div>
        )}

        {addable.length > 0 && ordered.length > 0 && (
          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Add a workspace</h2>
              <p className="text-[13px] text-muted-foreground">Same sign-in, nothing new to remember.</p>
            </div>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {addable.map((r) => {
                const Icon = r.icon
                return (
                  <li key={r.slug}>
                    <Link
                      href={r.href}
                      className="group flex h-full items-start gap-3 rounded-2xl border border-border bg-surface-muted/40 p-4 transition-colors hover:border-border-strong hover:bg-card"
                    >
                      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", WORKSPACE_TINT[r.type])}>
                        <Icon className="size-5" strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold">{r.title}</span>
                        <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{r.text}</span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}

export default function AccountPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-background" />}>
      <AccountContent />
    </Suspense>
  )
}
