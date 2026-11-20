import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 font-display font-bold uppercase tracking-wide",
    "rounded-pill border-2 transition-[transform,box-shadow,background-color] duration-fast ease-spring",
    "min-h-12 px-6 text-sm shadow-chunky-sm",
    "hover:-translate-y-0.5 hover:shadow-chunky active:translate-y-0.5 active:translate-x-0.5 active:shadow-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&>svg]:size-5 [&>svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: "border-border bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary: "border-border bg-secondary text-secondary-foreground hover:bg-midnight-600",
        accent: "border-border bg-accent text-accent-foreground hover:bg-volt-300",
        ghost: "border-transparent bg-transparent text-foreground shadow-none hover:bg-surface-muted hover:shadow-none active:shadow-none",
        danger: "border-border bg-danger text-danger-foreground hover:bg-ignition-600",
      },
      size: {
        sm: "min-h-10 px-4 text-xs",
        md: "min-h-12 px-6 text-sm",
        lg: "min-h-14 px-8 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button"
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export { Button, buttonVariants }
