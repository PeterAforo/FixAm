import type { ReactNode } from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

/* Product mockups for marketing pages. Built from markup (not screenshots)
   so they stay crisp, themeable and cheap to load. All data is sample data. */

function Plate({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "self-start rounded-[5px] bg-[#F4F2EE] px-[7px] py-0.5 font-mono text-[11px] font-semibold text-[#16130F]",
        className
      )}
    >
      {children}
    </span>
  )
}

type MockJob = { plate: string; car: string; note: string; tone?: "warn" | "ready"; progress?: number }
const COLUMNS: { title: string; jobs: MockJob[] }[] = [
  {
    title: "Diagnosing",
    jobs: [
      { plate: "GW 2468-23", car: "Kia Sportage", note: "Check engine light" },
      { plate: "GE 7781-22", car: "Honda Fit", note: "AC not cooling" },
    ],
  },
  { title: "Awaiting approval", jobs: [{ plate: "AS 5678-22", car: "Hyundai Elantra", note: "Estimate sent · GH₵ 1,240", tone: "warn" }] },
  {
    title: "In progress",
    jobs: [
      { plate: "GR 1234-24", car: "Toyota Corolla", note: "Yaw · due 2:30 pm", progress: 64 },
      { plate: "GT 1001-21", car: "Toyota Hiace", note: "Kojo · due 5:00 pm", progress: 30 },
    ],
  },
  { title: "Ready", jobs: [{ plate: "GN 4410-20", car: "Nissan Almera", note: "Paid · ready for pickup", tone: "ready" }] },
]

export function JobBoardWindow() {
  return (
    <div className="relative overflow-hidden rounded-t-[18px] border border-b-0 border-white/10 bg-[#121A2E] shadow-[0_-20px_80px_-20px_rgba(255,90,31,0.25),0_40px_120px_-20px_rgba(0,0,0,0.6)]">
      <div className="flex items-center gap-2 border-b border-white/[0.07] bg-white/[0.02] px-4 py-3">
        <span className="size-[11px] rounded-full bg-[#3A4360]" />
        <span className="size-[11px] rounded-full bg-[#3A4360]" />
        <span className="size-[11px] rounded-full bg-[#3A4360]" />
        <span className="mx-auto hidden rounded-md bg-white/5 px-3.5 py-1 font-mono text-xs text-[#7E88A3] sm:block">
          app.fixam.com/g/pitstop/jobs
        </span>
      </div>
      <div className="flex min-h-[420px]">
        <aside className="hidden w-[200px] shrink-0 flex-col gap-1 border-r border-white/[0.07] p-3 text-[13px] text-[#9AA3BC] lg:flex">
          <div className="flex items-center gap-2 px-2.5 pb-3.5 pt-1.5 font-semibold text-[#F4F2EE]">
            <span className="flex size-[22px] items-center justify-center rounded-md bg-[#2A3352] text-[11px]">PM</span>
            Pitstop Motors
          </div>
          {["Dashboard", "Job board", "Vehicles", "Money", "Reminders", "Parts"].map((l) => (
            <div key={l} className={cn("rounded-lg px-2.5 py-2", l === "Job board" && "bg-white/[0.07] text-[#F4F2EE]")}>
              {l}
            </div>
          ))}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 text-left md:p-5">
          <div className="flex items-center justify-between">
            <div className="font-display text-xl font-semibold text-[#F4F2EE]">Job board</div>
            <div className="flex gap-2 text-xs">
              <span className="hidden rounded-lg border border-white/10 px-2.5 py-1.5 text-[#9AA3BC] sm:inline">Spintex · Today</span>
              <span className="rounded-lg bg-[#D4430F] px-3 py-1.5 font-semibold text-white">+ Check in</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {COLUMNS.map((col) => (
              <div key={col.title} className="flex flex-col gap-2.5">
                <div className="flex justify-between text-xs text-[#9AA3BC]">
                  <span>{col.title}</span>
                  <span>{col.jobs.length}</span>
                </div>
                {col.jobs.map((j) => (
                  <div
                    key={j.plate}
                    className={cn(
                      "flex flex-col gap-2 rounded-xl border p-3",
                      j.tone === "ready"
                        ? "border-[#C6F432]/35 bg-[linear-gradient(180deg,rgba(198,244,50,0.10),rgba(198,244,50,0.02))]"
                        : j.tone === "warn"
                          ? "border-[#FFB020]/35 bg-[#1A2340]"
                          : "border-white/[0.07] bg-[#1A2340]"
                    )}
                  >
                    <Plate>{j.plate}</Plate>
                    <span className="text-[13px] font-medium text-[#E6E9F2]">{j.car}</span>
                    {j.progress != null && (
                      <div className="h-1 rounded bg-white/[0.08]">
                        <div className="h-1 rounded bg-[#FF5A1F]" style={{ width: `${j.progress}%` }} />
                      </div>
                    )}
                    <span
                      className={cn(
                        "text-xs",
                        j.tone === "ready" ? "text-[#D9F76F]" : j.tone === "warn" ? "text-[#FFC24D]" : "text-[#8A93AB]"
                      )}
                    >
                      {j.note}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function StepDot({ state }: { state: "done" | "current" | "todo" }) {
  if (state === "done")
    return (
      <span className="flex size-[18px] items-center justify-center rounded-full bg-[#16130F] text-[#C6F432]">
        <Check className="size-2.5" strokeWidth={3} />
      </span>
    )
  if (state === "current") return <span className="size-[18px] rounded-full bg-[#E8470F] shadow-[0_0_0_4px_rgba(232,71,15,0.18)]" />
  return <span className="size-[18px] rounded-full border-[1.5px] border-[#D9D2C7]" />
}

export function TrackerPhone({ className }: { className?: string }) {
  return (
    <div className={cn("w-[248px] rounded-[34px] border border-white/15 bg-[#05070D] p-[9px] shadow-[0_30px_80px_-10px_rgba(0,0,0,0.7)]", className)}>
      <div className="overflow-hidden rounded-[26px] bg-[#FAF8F5] text-left text-[#16130F]">
        <div className="bg-[linear-gradient(180deg,#FFE9DE,#FAF8F5)] px-4 pb-3.5 pt-[18px]">
          <div className="text-[11px] font-medium text-[#6B645B]">Pitstop Motors</div>
          <div className="mt-1 font-display text-lg font-semibold leading-tight">Your Corolla is being repaired</div>
          <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-[#ECE6DD] bg-white px-2.5 py-1 text-[11px] font-semibold">
            <span className="size-1.5 rounded-full bg-[#E8470F]" />
            Ready by 2:30 pm
          </div>
        </div>
        <div className="flex flex-col gap-3 px-4 pb-4 pt-1.5 text-xs">
          <div className="flex items-center gap-2.5 text-[#6B645B]"><StepDot state="done" />Checked in · 9:12 am</div>
          <div className="flex items-center gap-2.5 text-[#6B645B]"><StepDot state="done" />Estimate approved</div>
          <div className="flex items-center gap-2.5 font-semibold"><StepDot state="current" />Brake pads being fitted</div>
          <div className="flex items-center gap-2.5 text-[#8C857B]"><StepDot state="todo" />Quality check</div>
          <div className="mt-0.5 grid grid-cols-2 gap-1.5">
            <div className="h-16 rounded-[10px] bg-[linear-gradient(135deg,#3A4360,#1A2340)]" />
            <div className="h-16 rounded-[10px] bg-[linear-gradient(135deg,#6B5A4A,#2E2620)]" />
          </div>
          <div className="flex gap-1.5">
            <span className="flex-1 rounded-full bg-[#16130F] py-2 text-center font-semibold text-white">Call</span>
            <span className="flex-1 rounded-full border border-[#ECE6DD] bg-white py-2 text-center font-semibold">WhatsApp</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PaymentToast({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-white/60 bg-[#FAF8F5]/95 py-3 pl-3 pr-[18px] text-left text-[#16130F] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.55)]",
        className
      )}
    >
      <span className="flex size-[38px] items-center justify-center rounded-xl bg-[#C6F432]">
        <Check className="size-[18px]" strokeWidth={2.6} />
      </span>
      <div>
        <div className="text-xs text-[#6B645B]">Payment received · MTN MoMo</div>
        <div className="font-display text-xl font-bold tabular-nums">
          <span className="mr-0.5 align-[4px] text-[13px]">GH₵</span>1,240.00
        </div>
      </div>
    </div>
  )
}

export function MiniStepper({ steps }: { steps: { label: string; state: "done" | "current" | "todo" }[] }) {
  return (
    <div className="flex flex-col gap-2.5 text-[13px]">
      {steps.map((s) => (
        <div key={s.label} className={cn("flex items-center gap-2.5", s.state === "current" && "font-semibold", s.state === "todo" && "text-[#8C857B]")}>
          <StepDot state={s.state} />
          {s.label}
        </div>
      ))}
    </div>
  )
}

export function MiniHealthRing({ label, value, pct, tone }: { label: string; value: string; pct: number; tone: "ok" | "warn" }) {
  const color = tone === "ok" ? "#7FA80C" : "#C27C00"
  return (
    <div className="text-center">
      <div
        className="flex size-[54px] items-center justify-center rounded-full"
        style={{ background: `conic-gradient(${color} 0 ${pct}%, #ECE6DD ${pct}% 100%)` }}
      >
        <div className="flex size-[42px] items-center justify-center rounded-full bg-[#FAF8F5] text-[11px] font-semibold">{value}</div>
      </div>
      <div className="mt-1.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}
