"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, Check, Sparkles } from "lucide-react"
import { Button } from "@/components/brand/button"
import { updateMyName } from "@/lib/auth/phone-auth"
import { photos } from "@/lib/images"
import type { WorkspaceType } from "@/lib/accounts/workspaces"
import { WORKSPACE_TINT } from "@/components/shell/workspace-switcher"
import { Field, FormError, OnboardingFrame, onbInputCls } from "./onboarding-frame"
import { ROLE_OPTIONS, type RoleOption } from "./roles"
import { cn } from "@/lib/utils"

export function RolePicker({
  mode = "onboarding",
  needsName,
  existing,
  hasWorkspaces,
}: {
  mode?: "signup" | "onboarding"
  needsName: boolean
  existing: { type: WorkspaceType; href: string; name: string }[]
  hasWorkspaces: boolean
}) {
  const router = useRouter()
  const [choice, setChoice] = useState<RoleOption["slug"] | null>(null)
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const signup = mode === "signup"
  const target = (r: RoleOption) => (signup ? r.signupHref : r.href)
  const selected = ROLE_OPTIONS.find((r) => r.slug === choice)
  const canGo = Boolean(selected) && (!needsName || name.trim().length >= 2)

  async function go() {
    if (!selected) return
    setError(null)
    setBusy(true)
    if (needsName) {
      const res = await updateMyName({ fullName: name })
      if (!res.ok) {
        setBusy(false)
        return setError(res.error.message)
      }
    }
    router.push(target(selected))
  }

  return (
    <OnboardingFrame
      photo={photos.accraStreet}
      badge={signup ? "Create your account" : hasWorkspaces ? "Add a workspace" : "Welcome to FixAm"}
      title="One account for everything you do on the road."
      intro="Pick what you want to do first. You can add more roles any time — same sign-in, separate dashboards."
      stepIcon={Sparkles}
      stepTitle="What brings you to FixAm?"
      stepSub={signup ? "Choose one to create your account — you can add other roles later." : "Choose one to get started."}
      exitHref={signup ? "/login" : hasWorkspaces ? "/account" : "/"}
      exitLabel={signup ? "Already have an account? Sign in" : hasWorkspaces ? "Back to my account" : "Exit"}
      preview={
        <>
          <p className="text-xs font-medium text-[#9AA3BA]">{signup ? "Then" : "After this step"}</p>
          <p className="mt-2 text-[15px] font-semibold">Your own dashboard</p>
          <p className="mt-1 text-[13px] leading-snug text-[#C9CFDD]">
            Drivers see their cars, garages their job board, sellers their orders and brokers their renewal inbox.
          </p>
        </>
      }
      footer={
        <>
          <span className="hidden text-[13px] text-muted-foreground sm:inline">You can add more roles later.</span>
          <Button type="button" size="lg" onClick={go} disabled={!canGo} loading={busy} className="ml-auto">
            Continue <ArrowRight className="size-4" />
          </Button>
        </>
      }
    >
      {needsName && (
        <Field label="What should we call you?" className="mb-5">
          <input className={onbInputCls} autoFocus autoComplete="name" placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      )}

      <div role="radiogroup" aria-label="Choose a role" className="space-y-2">
        {ROLE_OPTIONS.map((r) => {
          const already = !r.repeatable && existing.find((e) => e.type === r.type)
          const on = choice === r.slug
          if (already) {
            return (
              <Link
                key={r.slug}
                href={already.href}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3 opacity-80 transition-opacity hover:opacity-100"
              >
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", WORKSPACE_TINT[r.type])}>
                  <r.icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{r.title}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">Already set up — {already.name}</span>
                </span>
                <span className="text-sm font-semibold text-[#B8390A]">Open</span>
              </Link>
            )
          }
          return (
            <button
              key={r.slug}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setChoice(r.slug)}
              onDoubleClick={() => { setChoice(r.slug); if (!needsName || name.trim().length >= 2) router.push(target(r)) }}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left transition-all",
                on ? "border-foreground shadow-[0_0_0_4px_rgba(255,90,31,0.12)]" : "border-border hover:border-border-strong"
              )}
            >
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", WORKSPACE_TINT[r.type])}>
                <r.icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{r.title}</span>
                <span className="block text-[13px] leading-snug text-muted-foreground">{r.text}</span>
              </span>
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border",
                  on ? "border-foreground bg-foreground text-background" : "border-border-strong"
                )}
              >
                {on && <Check className="size-3.5" strokeWidth={3} />}
              </span>
            </button>
          )
        })}
      </div>
      <FormError message={error} />
    </OnboardingFrame>
  )
}
