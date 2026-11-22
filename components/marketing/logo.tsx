import Link from "next/link"
import { cn } from "@/lib/utils"

/** FixAm mark: ignite-gradient rounded square with the crossed-tools X. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[linear-gradient(140deg,#FF7A3D,#E8470F)] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_6px_16px_-6px_rgba(255,90,31,0.7)]",
        className
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" className="size-1/2">
        <path d="M5 5l14 14" />
        <path d="M19 5L5 19" />
      </svg>
    </span>
  )
}

export function Logo({
  href = "/",
  className,
  suffix,
}: {
  href?: string
  className?: string
  suffix?: string
}) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-display text-[21px] font-bold tracking-[-0.02em]">FixAm</span>
      {suffix ? (
        <span className="ml-1 border-l border-current/20 pl-2.5 text-sm opacity-70">{suffix}</span>
      ) : null}
    </Link>
  )
}
