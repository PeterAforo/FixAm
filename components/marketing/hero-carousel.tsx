"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { heroSlides, photoSrcSet, photoUrl } from "@/lib/images"

/** One headline per background photo, shown together. */
export const HERO_LINES: [string, string][] = [
  ["Run your garage.", "Keep every customer."],
  ["Find the right part,", "close to the bay."],
  ["Show the work.", "Approve on WhatsApp."],
  ["From roadside fitter", "to busy workshop."],
  ["Get paid on MoMo,", "before they leave."],
]

const SLIDE_MS = 6000
const Ctx = createContext<{ index: number; go: (i: number) => void }>({ index: 0, go: () => {} })

/**
 * Home hero background: Ghanaian workshop photos cross-fading behind the
 * content, darkened so the text stays readable. The headline and dots read the
 * same index. Stops rotating for people who prefer reduced motion.
 */
export function HeroCarousel({ children, className }: { children: ReactNode; className?: string }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const t = setTimeout(() => setIndex((i) => (i + 1) % heroSlides.length), SLIDE_MS)
    return () => clearTimeout(t)
  }, [paused, index])

  return (
    <Ctx.Provider value={{ index, go: setIndex }}>
      <section
        className={cn("relative overflow-hidden bg-[#0B0F1A] text-[#F4F2EE]", className)}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div aria-hidden className="absolute inset-0">
          {heroSlides.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.slug}
              src={photoUrl(p, 1920)}
              srcSet={photoSrcSet(p)}
              sizes="100vw"
              alt=""
              loading={i === 0 ? "eager" : "lazy"}
              fetchPriority={i === 0 ? "high" : undefined}
              decoding="async"
              style={p.position ? { objectPosition: p.position } : undefined}
              className={cn(
                "absolute inset-0 size-full scale-105 object-cover transition-[opacity,transform] duration-[1600ms] ease-out",
                i === index ? "scale-100 opacity-100" : "opacity-0"
              )}
            />
          ))}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,15,26,0.82)_0%,rgba(11,15,26,0.62)_38%,rgba(11,15,26,0.9)_78%,#0B0F1A_100%)]" />
        </div>
        {children}
        {/* Thin red-gold-green band — a quiet nod to the flag. */}
        <div aria-hidden className="relative flex h-1">
          <span className="flex-1 bg-[#CE1126]" />
          <span className="flex-1 bg-[#FCD116]" />
          <span className="flex-1 bg-[#006B3F]" />
        </div>
      </section>
    </Ctx.Provider>
  )
}

/** The rotating two-line headline. The first pair is what search engines see. */
export function HeroHeadline({ className }: { className?: string }) {
  const { index } = useContext(Ctx)
  const [a, b] = HERO_LINES[index % HERO_LINES.length]!
  return (
    <h1 className={className} aria-label={HERO_LINES[0]!.join(" ")}>
      <span key={`a${index}`} className="block animate-[hero-in_700ms_ease-out_both]" aria-hidden>
        {a}
      </span>
      <span
        key={`b${index}`}
        aria-hidden
        className="block animate-[hero-in_700ms_120ms_ease-out_both] bg-[linear-gradient(100deg,#FFB08A_0%,#FF5A1F_55%,#FF7A3D_100%)] bg-clip-text text-transparent"
      >
        {b}
      </span>
    </h1>
  )
}

/** Slide dots; also lets people pick a photo. */
export function HeroDots({ className }: { className?: string }) {
  const { index, go } = useContext(Ctx)
  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      {heroSlides.map((p, i) => (
        <button
          key={p.slug}
          type="button"
          aria-label={`Show slide ${i + 1}`}
          aria-current={i === index ? "true" : undefined}
          onClick={() => go(i)}
          className={cn("h-1.5 rounded-full transition-all", i === index ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70")}
        />
      ))}
    </div>
  )
}
