import Link from "next/link"
import { cn } from "@/lib/utils"

/**
 * FixAm mark: ignition-gradient rounded square with two crossed spanners.
 * Master files live in public/brand (SVG + PNG); keep this glyph in step with them.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-[23.5%] bg-[linear-gradient(135deg,#FF7A3D,#D93E0B)] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_6px_16px_-6px_rgba(255,90,31,0.7)]",
        className
      )}
    >
      <svg viewBox="0 0 64 64" fill="none" stroke="#fff" strokeLinecap="round" className="size-full">
        <g transform="rotate(45 32 32)">
          <path d="M28 10.3 A7 7 0 1 0 36 10.3" strokeWidth={4.6} />
          <path d="M32 23 L32 52" strokeWidth={5.6} />
        </g>
        <g transform="rotate(-45 32 32)">
          <path d="M28 10.3 A7 7 0 1 0 36 10.3" strokeWidth={4.6} />
          <path d="M32 23 L32 52" strokeWidth={5.6} />
        </g>
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
