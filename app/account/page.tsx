import { Suspense } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { eq } from "drizzle-orm"
import { ArrowRight, Plus } from "lucide-react"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { ensureUser, getSessionPhone, getSessionUserId } from "@/lib/auth/ensure-user"
import { listMyWorkspaces, WORKSPACE_LABEL } from "@/lib/accounts/workspaces"
import { Logo } from "@/components/marketing/logo"
import { AccountActions, OpenWorkspaceButton } from "./account-actions"
import { ROLE_OPTIONS } from "@/app/(auth)/onboarding/roles"

export const metadata = { title: "Your account" }

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
  const types = new Set(workspaces.map((w) => w.type))
  const addable = ROLE_OPTIONS.filter((r) => r.repeatable || !types.has(r.type))

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-[960px] items-center justify-between px-6">
          <Logo href="/" />
          <AccountActions />
        </div>
      </header>

      <div className="mx-auto max-w-[960px] px-6 py-10 md:py-14">
        <p className="text-sm font-medium text-muted-foreground">Signed in as {phone ? phone.replace("+233", "0") : me?.email}</p>
        <h1 className="mt-2 font-display text-[34px] font-bold leading-[1.08] tracking-[-0.03em] md:text-[40px]">
          Hi {me?.fullName?.split(" ")[0] ?? "there"} — where to?
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">One FixAm account, every role you hold. Pick a workspace or add a new one.</p>

        {workspaces.length > 0 ? (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {workspaces.map((w) => (
              <li key={w.key}>
                <OpenWorkspaceButton workspace={w} label={WORKSPACE_LABEL[w.type]} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-8 rounded-[22px] border border-dashed border-border-strong bg-card p-8 text-center">
            <p className="font-semibold">You haven&apos;t set up a workspace yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Tell us what brings you to FixAm and we&apos;ll get you going.</p>
            <Link href="/onboarding" className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">
              Get started <ArrowRight className="size-4" />
            </Link>
          </div>
        )}

        {addable.length > 0 && workspaces.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-xl font-semibold">Add another workspace</h2>
            <p className="mt-1 text-sm text-muted-foreground">Use the same sign-in for everything you do on FixAm.</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {addable.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={r.href}
                    className="group flex h-full items-start gap-3 rounded-[18px] border border-border bg-card p-4 transition-colors hover:border-border-strong"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-dashed border-border-strong text-muted-foreground group-hover:text-foreground">
                      <Plus className="size-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{r.title}</span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{r.text}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}

export default function AccountPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" />}>
      <AccountContent />
    </Suspense>
  )
}
