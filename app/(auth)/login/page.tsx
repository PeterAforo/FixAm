import { Suspense } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { BellRing, CheckCircle2, Wallet } from "lucide-react"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { postLoginDestination } from "@/lib/auth/destination"
import { AuthMethods } from "@/components/auth/auth-methods"
import { Logo } from "@/components/marketing/logo"
import { PhotoCredit, PhotoImg } from "@/components/marketing/photo"
import { photos } from "@/lib/images"

export const metadata = { title: "Sign in" }

const ACTIVITY = [
  { icon: CheckCircle2, tint: "bg-[#C6F432] text-[#0B0F1A]", title: "Toyota Corolla · GR 4417-21", text: "Ready for pickup — customer notified" },
  { icon: Wallet, tint: "bg-[#FF7A3D] text-white", title: "GH₵ 1,280.00 received", text: "MoMo payment for invoice INV-0192" },
  { icon: BellRing, tint: "bg-white/15 text-white", title: "Insurance renewal quoted", text: "Shield Brokers · GH₵ 2,150.00" },
]

/** Already signed in? Skip the form. */
async function SignedInRedirect() {
  await connection()
  if (await getSessionUserId()) redirect(await postLoginDestination())
  return null
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh bg-card">
      <Suspense fallback={null}>
        <SignedInRedirect />
      </Suspense>

      {/* Form */}
      <section className="flex min-w-0 flex-1 flex-col px-6 py-6 md:px-12 lg:max-w-[50%]">
        <div className="flex items-center justify-between">
          <Logo />
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">Back to site</Link>
        </div>

        <div className="mx-auto my-auto flex w-full max-w-[420px] flex-col gap-7 py-10">
          <div>
            <p className="text-sm font-semibold text-[#B8390A]">Sign in</p>
            <h1 className="mt-2 font-display text-[40px] font-bold leading-[1.02] tracking-[-0.035em]">Welcome back.</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
              Sign in to your garage, shop, broker inbox or your cars — one account for all of them.
            </p>
          </div>
          <AuthMethods mode="signin" />
          <p className="border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
            Protected by SMS verification. <Link href="/privacy" className="underline underline-offset-2">Privacy</Link> ·{" "}
            <Link href="/terms" className="underline underline-offset-2">Terms</Link>
          </p>
        </div>
      </section>

      {/* Showcase */}
      <aside className="relative hidden flex-1 overflow-hidden bg-[#0B0F1A] text-[#F4F2EE] lg:flex">
        <PhotoImg photo={photos.mechanicEngine} fill priority sizes="50vw" />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,15,26,0.35)_0%,rgba(11,15,26,0.65)_45%,rgba(11,15,26,0.96)_100%)]" />
        <div aria-hidden className="absolute -right-[200px] -top-[160px] h-[620px] w-[720px] bg-[radial-gradient(50%_50%_at_50%_50%,rgba(255,90,31,0.22)_0%,rgba(255,90,31,0)_100%)]" />
        <div className="relative mt-auto w-full p-12 xl:p-14">
          <p className="text-[13px] font-semibold text-[#FF8A57]">While you were away</p>
          <h2 className="mt-3 max-w-[480px] font-display text-[38px] font-bold leading-[1.05] tracking-[-0.03em]">
            Pick up right where you left off.
          </h2>
          <ul className="mt-8 max-w-[440px] space-y-2.5">
            {ACTIVITY.map((a, i) => (
              <li
                key={a.title}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0B0F1A]/60 p-3.5 backdrop-blur-md"
                style={{ marginLeft: `${i * 24}px` }}
              >
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${a.tint}`}><a.icon className="size-[18px]" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{a.title}</span>
                  <span className="block truncate text-[13px] text-[#AEB5C8]">{a.text}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex items-center justify-between gap-4">
            <p className="text-[13px] text-[#8A93AB]">Sample activity shown.</p>
            <PhotoCredit photo={photos.mechanicEngine} />
          </div>
        </div>
      </aside>
    </main>
  )
}
