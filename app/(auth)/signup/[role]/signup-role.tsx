"use client"

import Link from "next/link"
import { UserPlus } from "lucide-react"
import { AuthMethods } from "@/components/auth/auth-methods"
import { OnboardingFrame } from "@/app/(auth)/onboarding/onboarding-frame"
import { roleBySlug, type RoleSlug } from "@/app/(auth)/onboarding/roles"

/** Step 1 of every role's journey: create the account (phone code or e-mail). */
export function SignupRole({ slug }: { slug: RoleSlug }) {
  const role = roleBySlug(slug)!
  const steps = [{ label: "Create account", hint: "Verify your phone" }, ...role.steps]

  return (
    <OnboardingFrame
      photo={role.photo}
      badge={role.badge}
      title={role.pitch}
      intro={role.intro}
      steps={steps}
      step={0}
      stepIcon={UserPlus}
      stepTitle="Create your account"
      stepSub={<>Signing up as <span className="font-semibold text-foreground">{role.noun}</span>. You can add other roles later.</>}
      exitHref="/"
      exitLabel="Back to site"
      preview={
        <>
          <p className="text-xs font-medium text-[#9AA3BA]">What happens next</p>
          <ol className="mt-2.5 space-y-1.5 text-[13px] text-[#C9CFDD]">
            {role.steps.map((s, i) => (
              <li key={s.label} className="flex gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold">{i + 2}</span>
                <span><span className="font-semibold text-white">{s.label}</span> — {s.hint.toLowerCase()}</span>
              </li>
            ))}
          </ol>
        </>
      }
      footer={
        <>
          <span className="text-[13px] text-muted-foreground">Free to start. No card needed.</span>
          <Link href="/signup" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Choose a different role
          </Link>
        </>
      }
    >
      <AuthMethods mode="signup" next={role.href} />
    </OnboardingFrame>
  )
}
