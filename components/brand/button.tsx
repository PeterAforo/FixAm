import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"
import type * as React from "react"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 font-sans font-semibold",
    "rounded-pill border transition-[transform,box-shadow,background-color] duration-fast ease-spring active:scale-[0.98]",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&>svg]:size-4 [&>svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary:
          "border-transparent bg-primary text-primary-foreground shadow-glow-primary hover:bg-primary-hover active:bg-primary-pressed",
        secondary:
          "border-border-strong bg-surface text-foreground hover:bg-surface-sunken",
        tonal:
          "border-transparent bg-primary-subtle text-primary hover:bg-ignition-100",
        accent:
          "border-transparent bg-accent text-accent-foreground hover:brightness-95",
        ghost:
          "border-transparent bg-transparent text-foreground shadow-none hover:bg-surface-muted",
        danger:
          "border-transparent bg-danger text-danger-foreground hover:brightness-95",
        success:
          "border-transparent bg-success text-success-foreground hover:brightness-95",
        link:
          "border-transparent bg-transparent text-primary underline-offset-4 shadow-none hover:underline",
      },
      size: {
        sm: "min-h-9 px-4 text-sm",
        md: "min-h-11 px-5 text-sm",
        lg: "min-h-[52px] px-7 text-base",
        xl: "min-h-[60px] px-9 text-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
)

function Button({
  className,
  variant,
  size,
  loading = false,
  asChild = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean }) {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </Comp>
  )
}

export { Button, buttonVariants }
