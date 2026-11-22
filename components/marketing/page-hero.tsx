import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { SiteHeader } from "./site-chrome"
import { PhotoCredit, PhotoImg } from "./photo"
import type { Photo } from "@/lib/images"

/** Dark hero band used by content pages (about, support, contact, directory…). */
export function PageHero({
  eyebrow,
  title,
  subtitle,
  active,
  align = "center",
  children,
  className,
  image,
}: {
  eyebrow?: string
  title: ReactNode
  subtitle?: ReactNode
  active?: string
  align?: "center" | "left"
  children?: ReactNode
  className?: string
  /** Optional full-bleed background photo (darkened). */
  image?: Photo
}) {
  return (
    <section className={cn("relative overflow-hidden bg-[#0B0F1A] text-[#F4F2EE]", className)}>
      {image && (
        <>
          <PhotoImg photo={image} fill priority className="opacity-55" />
          <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,15,26,0.88)_0%,rgba(11,15,26,0.62)_45%,rgba(11,15,26,0.94)_100%)]" />
          <PhotoCredit photo={image} className="absolute bottom-3 right-4 z-10 hidden md:block" />
        </>
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-220px] h-[620px] w-[1000px] -translate-x-1/2 bg-[radial-gradient(50%_50%_at_50%_50%,rgba(255,90,31,0.24)_0%,rgba(255,90,31,0)_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />
      <SiteHeader tone="dark" active={active} />
      <div
        className={cn(
          "relative mx-auto max-w-[1200px] px-6 pb-16 pt-12 md:px-8 md:pb-20 md:pt-16",
          align === "center" && "text-center"
        )}
      >
        {eyebrow && <div className="text-[13px] font-semibold text-[#FF8A57]">{eyebrow}</div>}
        <h1
          className={cn(
            "mt-3 font-display text-4xl font-bold leading-[1.04] tracking-[-0.035em] md:text-[60px]",
            align === "center" ? "mx-auto max-w-[860px]" : "max-w-[760px]"
          )}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className={cn(
              "mt-5 text-lg leading-relaxed text-[#AEB5C8]",
              align === "center" ? "mx-auto max-w-[620px]" : "max-w-[620px]"
            )}
          >
            {subtitle}
          </p>
        )}
        {children}
      </div>
    </section>
  )
}

/** Light section wrapper with consistent spacing. */
export function Section({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("mx-auto max-w-[1200px] scroll-mt-24 px-6 py-20 md:px-8 md:py-24", className)}>
      {children}
    </section>
  )
}

export function SectionIntro({ eyebrow, title, subtitle, center }: { eyebrow?: string; title: ReactNode; subtitle?: ReactNode; center?: boolean }) {
  return (
    <div className={cn("max-w-[680px]", center && "mx-auto text-center")}>
      {eyebrow && <div className="text-[13px] font-semibold text-[#B8390A]">{eyebrow}</div>}
      <h2 className="mt-3 font-display text-3xl font-bold leading-[1.08] tracking-[-0.03em] md:text-[44px]">{title}</h2>
      {subtitle && <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">{subtitle}</p>}
    </div>
  )
}

/** Shared closing call-to-action band. */
export function CtaBand({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <section className="px-6 pb-24 md:px-8">
      <div className="relative mx-auto max-w-[1200px] overflow-hidden rounded-[32px] bg-[#0B0F1A] px-6 py-16 text-center text-[#F4F2EE] md:py-20">
        <div
          aria-hidden
          className="absolute -bottom-[260px] left-1/2 h-[520px] w-[900px] -translate-x-1/2 bg-[radial-gradient(50%_50%_at_50%_50%,rgba(255,90,31,0.35)_0%,rgba(255,90,31,0)_100%)]"
        />
        <h2 className="relative font-display text-3xl font-bold leading-[1.05] tracking-[-0.03em] md:text-5xl">{title}</h2>
        {subtitle && <p className="relative mx-auto mt-4 max-w-[520px] text-lg text-[#AEB5C8]">{subtitle}</p>}
        {children && <div className="relative mt-8 flex flex-wrap justify-center gap-3">{children}</div>}
      </div>
    </section>
  )
}

export const ctaPrimary =
  "inline-flex items-center gap-2 rounded-full bg-[#D4430F] px-6 py-3.5 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_30px_-10px_rgba(255,90,31,0.8)] transition-colors hover:bg-[#B8390A]"
export const ctaGlass =
  "inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-6 py-3.5 text-[15px] font-medium text-[#F4F2EE] transition-colors hover:bg-white/10"
