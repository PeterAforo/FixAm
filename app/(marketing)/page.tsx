import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { postLoginDestination } from "@/lib/auth/destination"

async function AuthGate() {
  const userId = await getSessionUserId()
  if (userId) redirect(await postLoginDestination())
  return null
}

export default function MarketingHome() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8 text-center">
      <Suspense fallback={null}>
        <AuthGate />
      </Suspense>
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">
        FixAm
      </p>
      <h1 className="font-display text-5xl font-extrabold text-foreground">
        Fix am. Run your garage.
      </h1>
      <p className="max-w-md text-muted-foreground">
        The garage operating system for Ghana — repairs, parts, reminders, renewals
        and money in one place.
      </p>
      <div className="flex gap-3">
        <Link
          href="/design"
          className="rounded-full border-2 border-border bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-chunky-sm transition-transform active:translate-x-0.5 active:translate-y-0.5"
        >
          Design system
        </Link>
        <Link
          href="/login"
          className="rounded-full border-2 border-border bg-secondary px-6 py-3 font-semibold text-secondary-foreground shadow-chunky-sm"
        >
          Garage sign in
        </Link>
      </div>
    </main>
  )
}
