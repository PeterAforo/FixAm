import type { ReactNode } from "react"

/** Title row shared by every admin screen. */
export function AdminPageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[13px] text-muted-foreground">{eyebrow}</p>}
        <h1 className="font-display text-[30px] font-bold leading-tight tracking-[-0.02em] md:text-[36px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  )
}
