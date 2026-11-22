import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"
import { cn } from "@/lib/utils"

const cardVariants = cva("rounded-[18px] text-card-foreground", {
  variants: {
    variant: {
      /** Elevation 1 — default work surface. */
      default: "border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
      /** Hover lift + press — tappable cards. */
      interactive:
        "border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[transform,box-shadow,border-color] duration-fast hover:border-border-strong hover:shadow-2 active:scale-[0.99]",
      /** Elevation 2 — raised emphasis. */
      raised: "border border-border bg-card shadow-2",
      /** Gradient money card — white text. */
      money: "border border-transparent bg-[image:var(--gradient-ignite)] text-white shadow-3",
      /** Playful pop — chunky offset shadow for badges/empty states. */
      pop: "border border-foreground bg-card shadow-pop",
      /** Glass — for bars over imagery. */
      glass: "border border-white/20 bg-white/70 shadow-2 backdrop-blur-md",
    },
    padding: {
      none: "",
      sm: "p-4",
      md: "p-5",
      lg: "p-6",
    },
  },
  defaultVariants: { variant: "default", padding: "none" },
})

function Card({
  className,
  variant,
  padding,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return <div className={cn(cardVariants({ variant, padding }), className)} {...props} />
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      className={cn("font-display text-lg font-semibold leading-tight tracking-tight", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-6 pt-0", className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-3 p-6 pt-0", className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, cardVariants }
