"use client"

import type { ReactNode, Ref } from "react"
import Link from "next/link"
import { Check, type LucideIcon } from "lucide-react"
import { Logo } from "@/components/marketing/logo"
import { PhotoCredit, PhotoImg } from "@/components/marketing/photo"
import type { Photo } from "@/lib/images"
import { cn } from "@/lib/utils"

export type FrameStep = { label: string; hint: string }

export const onbInputCls =
  "h-11 w-full rounded-xl border border-input bg-card px-3.5 text-base text-foreground outline-none transition-shadow placeholder:text-[#8C857B] focus:border-foreground focus:ring-4 focus:ring-[#FF5A1F]/15"

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

/**
 * Shared split layout for every onboarding flow: a photo rail on the left
 * (pitch, step list, live preview) and a viewport-height form column.
 */
export function OnboardingFrame({
  photo,
  badge,
  title,
  intro,
  steps = [],
  step = 0,
  onStep,
  preview,
  stepIcon: StepIcon,
  stepTitle,
  stepSub,
  footer,
  bodyRef,
  exitHref = "/account",
  exitLabel = "Save and exit",
  children,
}: {
  photo: Photo
  badge: string
  title: string
  intro: string
  steps?: FrameStep[]
  step?: number
  onStep?: (i: number) => void
  preview?: ReactNode
  stepIcon?: LucideIcon
  stepTitle: string
  stepSub?: ReactNode
  footer: ReactNode
  bodyRef?: Ref<HTMLDivElement>
  exitHref?: string
  exitLabel?: string
  children: ReactNode
}) {
  return (
    <main className="flex h-dvh overflow-hidden bg-background text-foreground">
      {/* Left panel — photo, progress + live preview */}
      <aside className="relative hidden w-[46%] max-w-[860px] shrink-0 flex-col overflow-hidden bg-[#0B0F1A] text-[#F4F2EE] lg:flex">
        <PhotoImg photo={photo} fill priority sizes="46vw" className="scale-105" />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,15,26,0.72)_0%,rgba(11,15,26,0.5)_35%,rgba(11,15,26,0.9)_78%,#0B0F1A_100%)]" />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgba(11,15,26,0.65)_0%,rgba(11,15,26,0)_70%)]" />
        <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 size-[560px] bg-[radial-gradient(50%_50%_at_50%_50%,rgba(255,90,31,0.28)_0%,rgba(255,90,31,0)_100%)]" />

        <div className="relative flex h-full flex-col px-10 py-8 xl:px-14 xl:py-10">
          <Logo />

          <div className="mt-[clamp(1.5rem,5vh,3.5rem)] max-w-[480px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[12px] font-semibold text-[#FFB08A] backdrop-blur">
              <span className="size-1.5 rounded-full bg-[#C6F432]" /> {badge}
            </span>
            <h1 className="mt-4 font-display text-[clamp(30px,3.2vw,46px)] font-bold leading-[1.04] tracking-[-0.035em]">{title}</h1>
            <p className="mt-3 text-[15px] text-[#C9CFDD]">{intro}</p>
          </div>

          {steps.length > 0 && (
            <ol className="mt-[clamp(1.25rem,4vh,2.5rem)] grid max-w-[520px] grid-cols-2 gap-2">
              {steps.map((s, i) => {
                const done = i < step
                const active = i === step
                return (
                  <li key={s.label}>
                    <button
                      type="button"
                      disabled={i > step || !onStep}
                      onClick={() => onStep?.(i)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left backdrop-blur-md transition-colors",
                        active
                          ? "border-white/20 bg-white/[0.14]"
                          : "border-white/[0.08] bg-[#0B0F1A]/40 hover:bg-white/[0.08] disabled:hover:bg-[#0B0F1A]/40"
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
                          done && "bg-[#C6F432] text-[#0B0F1A]",
                          active && "bg-[#D4430F] text-white shadow-[0_0_0_4px_rgba(212,67,15,0.3)]",
                          !done && !active && "border border-white/20 text-[#AEB5C8]"
                        )}
                      >
                        {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className={cn("block truncate text-sm font-semibold", !done && !active && "text-[#C9CFDD]")}>{s.label}</span>
                        <span className="block truncate text-xs text-[#9AA3BA]">{s.hint}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          )}

          {/* Live preview — dropped on short windows so the rail always fits */}
          <div className="mt-auto hidden items-end justify-between gap-6 pt-6 [@media(min-height:621px)]:flex">
            {preview ? (
              <div className="w-full max-w-[380px] rounded-[20px] border border-white/15 bg-[#0B0F1A]/60 p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                {preview}
              </div>
            ) : (
              <span />
            )}
            <PhotoCredit photo={photo} className="hidden shrink-0 xl:block" />
          </div>
        </div>
      </aside>

      {/* Form column */}
      <section className="flex h-full min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between px-6 py-4 md:px-10">
          <Logo className="lg:invisible" />
          <Link href={exitHref} className="text-sm text-muted-foreground hover:text-foreground">{exitLabel}</Link>
        </div>

        {steps.length > 0 && (
          <div className="shrink-0 px-6 md:px-10 lg:hidden">
            <div className="flex gap-1.5">
              {steps.map((s, i) => (
                <span key={s.label} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-[#D4430F]" : "bg-border")} />
              ))}
            </div>
          </div>
        )}

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="mx-auto flex min-h-full w-full max-w-[560px] flex-col justify-center px-6 py-6 md:px-0">
            {(StepIcon || steps.length > 0) && (
              <div className="flex items-center gap-3">
                {StepIcon && (
                  <span className="flex size-9 items-center justify-center rounded-xl bg-primary-subtle text-primary"><StepIcon className="size-[18px]" /></span>
                )}
                {steps.length > 0 && <p className="text-sm font-medium text-muted-foreground">Step {step + 1} of {steps.length}</p>}
              </div>
            )}
            <h2 className="mt-4 font-display text-[28px] font-bold leading-[1.08] tracking-[-0.03em] xl:text-[30px]">{stepTitle}</h2>
            {stepSub && <p className="mt-1.5 text-[15px] text-muted-foreground">{stepSub}</p>}
            <div className="mt-6">{children}</div>
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-background/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[560px] items-center justify-between gap-3 px-6 py-3.5 md:px-0">{footer}</div>
        </div>
      </section>
    </main>
  )
}

/** Error banner used across onboarding steps. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-4 rounded-xl border border-[#FFC2CC] bg-[#FFF1F3] px-4 py-3 text-sm font-medium text-[#B3122F]">
      {message}
    </p>
  )
}

/** Small "your public page" preview card shared by garage/vendor/broker flows. */
export function PreviewCard({ label, name, place, slug, initial }: { label: string; name: string; place: string; slug: string; initial?: string }) {
  return (
    <>
      <p className="text-xs font-medium text-[#9AA3BA]">{label}</p>
      <div className="mt-2.5 flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-[linear-gradient(140deg,#FF7A3D,#D4430F)] font-display text-lg font-bold text-white">
          {(initial ?? name.trim()[0] ?? "F").toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{name}</p>
          <p className="truncate text-[13px] text-[#9AA3BA]">{place}</p>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-[#C6F432]/15 px-2 py-0.5 text-[11px] font-semibold text-[#C6F432]">Open</span>
      </div>
      <p className="mt-3 truncate rounded-lg bg-white/[0.06] px-2.5 py-1.5 font-mono text-xs text-[#C9CFDD]">{slug}</p>
    </>
  )
}
