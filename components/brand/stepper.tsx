import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

export type StepperStep = {
  label: string
  state: "done" | "current" | "upcoming"
}

/** Horizontal on md+, vertical on mobile. */
export function Stepper({
  steps,
  className,
}: {
  steps: StepperStep[]
  className?: string
}) {
  return (
    <ol
      className={cn(
        "flex flex-col gap-3 md:flex-row md:items-center md:gap-0",
        className
      )}
    >
      {steps.map((step, i) => {
        const last = i === steps.length - 1
        return (
          <li
            key={step.label}
            className="flex items-center gap-3 md:flex-1 md:last:flex-none"
          >
            <span className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full border border-border font-display text-sm font-bold",
                  step.state === "done" && "bg-success text-success-foreground",
                  step.state === "current" && "bg-primary text-primary-foreground",
                  step.state === "upcoming" && "bg-muted text-muted-foreground"
                )}
                aria-current={step.state === "current" ? "step" : undefined}
              >
                {step.state === "done" ? <Check className="size-5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-sm font-semibold",
                  step.state === "upcoming" ? "text-muted-foreground" : "text-foreground"
                )}
              >
                {step.label}
              </span>
            </span>
            {!last && (
              <span
                className={cn(
                  "mx-3 hidden h-0.5 flex-1 border-t border-dashed md:block",
                  step.state === "done" ? "border-success" : "border-border"
                )}
                aria-hidden
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
