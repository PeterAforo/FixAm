"use client"

import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import {
  Button, Card, CardContent,
  StatusPill, PlateChip, MoneyText, StatTile, Stepper, EmptyState,
  CarAvatar, VehicleHealthCard, ThemeToggle, fireConfetti,
} from "@/components/brand"

const JOB_STATUSES = ["booked", "in_progress", "awaiting_approval", "approved", "completed"]
const DUE_STATUSES = ["upcoming", "due_soon", "overdue", "done"]
const PAYMENT_STATUSES = ["pending", "paid", "partial", "refunded", "failed"]
const VEHICLE_TYPES = ["sedan", "hatchback", "suv", "pickup", "van", "bus", "truck", "motorbike", "other"] as const

const RAMPS: { name: string; colors: [string, string][] }[] = [
  {
    name: "Ignition",
    colors: [
      ["50", "#FFF3ED"], ["100", "#FFE2D3"], ["200", "#FFC2A6"], ["300", "#FF9B70"],
      ["400", "#FF7A3D"], ["500", "#FF5A1F"], ["600", "#ED4410"], ["700", "#C4350C"],
      ["800", "#9C2B0E"], ["900", "#7E2610"], ["950", "#441005"],
    ],
  },
  {
    name: "Volt",
    colors: [
      ["300", "#DCFA7A"], ["400", "#C6F432"], ["500", "#A6D914"], ["600", "#7FA80C"],
      ["700", "#62800C"], ["800", "#465C0A"], ["900", "#2F3E07"],
    ],
  },
  {
    name: "Turbo",
    colors: [
      ["300", "#5FE3DA"], ["400", "#00C2B8"], ["500", "#00A39B"], ["600", "#008079"],
      ["700", "#00655F"], ["800", "#004A46"], ["900", "#00322F"],
    ],
  },
  {
    name: "Sun",
    colors: [["400", "#FFC53D"], ["500", "#FFB020"], ["600", "#E09200"]],
  },
  {
    name: "Brake",
    colors: [["400", "#FF6680"], ["500", "#FF3B5C"], ["600", "#E01E43"]],
  },
  {
    name: "Violet (gamification only)",
    colors: [["400", "#9B8CFF"], ["500", "#7C6CFF"], ["600", "#5E4DF0"]],
  },
]

const SAND = [
  ["0", "#FFFFFF"], ["25", "#FDFBF8"], ["50", "#FAF7F2"], ["100", "#F3EEE6"],
  ["200", "#E7E0D5"], ["300", "#D3CABC"], ["400", "#A79E91"], ["500", "#7D766C"],
  ["600", "#5B554D"], ["700", "#3F3B36"], ["800", "#2A2724"], ["900", "#1A1816"],
] as const

const CARBON = [
  ["50", "#E9ECF5"], ["100", "#C9D0E3"], ["200", "#9AA5C4"], ["300", "#6B78A0"],
  ["400", "#46527A"], ["500", "#2D375B"], ["600", "#1E2645"], ["700", "#151C36"],
  ["800", "#0F1529"], ["900", "#0A0F1E"], ["950", "#060914"],
] as const

const TYPE_SCALE = [
  ["display-xl", "56 / 60 · 700"],
  ["display", "40 / 44 · 700"],
  ["title-lg", "28 / 34 · 600"],
  ["title", "22 / 28 · 600"],
  ["title-sm", "18 / 24 · 600"],
  ["body-lg", "17 / 26 · 400"],
  ["body", "15 / 22 · 400"],
  ["body-sm", "14 / 20 · 400"],
  ["label", "13 / 18 · 500"],
  ["caption", "12 / 16 · 500"],
] as const

const RADII = [
  ["xs · 6", "rounded-md"], ["sm · 10", "rounded-lg"], ["md · 14", "rounded-xl"],
  ["lg · 20", "rounded-2xl"], ["xl · 28", "rounded-3xl"], ["pill", "rounded-full"],
] as const

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl font-bold">{title}</h2>
      {children}
    </section>
  )
}

function Swatch({ hex, label }: { hex: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border-2 border-border">
      <div className="h-14 w-full" style={{ backgroundColor: hex }} />
      {label && <p className="bg-card px-2 py-1 font-mono text-[10px] text-muted-foreground">{label}</p>}
    </div>
  )
}

function Ramp({ name, colors }: { name: string; colors: [string, string][] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{name}</p>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
        {colors.map(([step, hex]) => <Swatch key={step} hex={hex} label={step} />)}
      </div>
    </div>
  )
}

function ThemePanel({ theme, title, note }: { theme: string; title: string; note: string }) {
  return (
    <div className={`${theme} rounded-2xl border-2 border-border bg-background p-4 text-foreground`}>
      <p className="font-display text-lg font-bold">{title}</p>
      <p className="text-xs opacity-70">{note}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-border bg-surface p-2">
          <span className="block font-bold">bg / surface</span>
          <span className="opacity-70">sand→carbon ramp</span>
        </div>
        <div className="rounded-lg border border-border bg-primary p-2 text-primary-foreground">
          <span className="block font-bold">primary</span>
          <span className="opacity-80">ignition</span>
        </div>
        <div className="rounded-lg border border-border bg-success-subtle p-2 text-foreground">
          <span className="block font-bold">success-subtle</span>
        </div>
        <div className="rounded-lg border border-border bg-danger-subtle p-2 text-foreground">
          <span className="block font-bold">danger-subtle</span>
        </div>
      </div>
    </div>
  )
}

export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound()

  return (
    <main className="mx-auto max-w-6xl space-y-12 p-6 pb-24">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">Pit Stop Pop · Premium</h1>
          <p className="text-muted-foreground">FixAm living design catalogue — specs/ui-ux.json</p>
        </div>
        <ThemeToggle />
      </header>

      <Section title="Brand colour">
        <Card><CardContent className="space-y-6 p-6">
          {RAMPS.map((r) => <Ramp key={r.name} name={r.name} colors={r.colors} />)}
        </CardContent></Card>
      </Section>

      <Section title="Neutrals">
        <Card><CardContent className="space-y-6 p-6">
          <Ramp name="Sand — light surfaces & text" colors={SAND as unknown as [string, string][]} />
          <Ramp name="Carbon — dark surfaces & text" colors={CARBON as unknown as [string, string][]} />
        </CardContent></Card>
      </Section>

      <Section title="Themes — light / dark / sunlight">
        <div className="grid gap-4 md:grid-cols-3">
          <ThemePanel theme="light" title="Front office" note="Sand surfaces, ignition primary" />
          <ThemePanel theme="dark" title="Workshop" note="Carbon floor, volt focus ring" />
          <ThemePanel theme="sunlight" title="Sunlight" note="7:1 contrast, 2px borders, no glass" />
        </div>
      </Section>

      <Section title="Typography — Geist Sans/Mono + Bricolage">
        <Card><CardContent className="space-y-3 p-6">
          {TYPE_SCALE.map(([name, spec]) => (
            <div key={name} className="flex items-baseline justify-between gap-4 border-b border-border-subtle pb-2 last:border-0">
              <span className={name === "display-xl" || name === "display" ? "font-display text-2xl font-bold" : name.startsWith("title") ? "font-display text-lg font-semibold" : "text-sm"}>
                {name === "display-xl" ? "GH₵ 12,450.00" : name === "display" ? "Job complete" : name === "title-lg" ? "Vehicle profile" : name === "title" ? "Estimate #1042" : name === "title-sm" ? "Service history" : "The quick brown fox jumps over the lazy dog"}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{spec}</span>
            </div>
          ))}
          <p className="pt-2 text-xs text-muted-foreground">
            Money & quantities use tabular-nums. Plate chips: Geist Mono 600, uppercase, 0.08em tracking.
          </p>
        </CardContent></Card>
      </Section>

      <Section title="Spacing · radius · elevation">
        <Card><CardContent className="space-y-6 p-6">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Radius</p>
            <div className="flex flex-wrap gap-3">
              {RADII.map(([label, cls]) => (
                <div key={label} className={`flex h-16 w-16 items-center justify-center border-2 border-border bg-primary-subtle text-[10px] font-bold ${cls}`}>{label}</div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Elevation</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                ["shadow-1", "Level 1"], ["shadow-2", "Level 2"], ["shadow-3", "Level 3"],
                ["shadow-4", "Level 4"], ["shadow-pop", "Pop accent"],
              ].map(([cls, label]) => (
                <div key={cls} className={`rounded-xl border border-border bg-card p-3 text-center text-xs ${cls}`}>
                  <span className="font-bold">{label}</span>
                  <span className="block font-mono text-[10px] text-muted-foreground">{cls}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent></Card>
      </Section>

      <Section title="Buttons — variants & states">
        <Card><CardContent className="flex flex-wrap items-center gap-4 p-6">
          {(["primary", "secondary", "accent", "ghost", "danger"] as const).map((v) => (
            <Button key={v} variant={v}>{v}</Button>
          ))}
          <Button size="sm">small</Button>
          <Button size="lg">large</Button>
          <Button disabled>disabled</Button>
          <Button onClick={() => fireConfetti()}>Confetti!</Button>
        </CardContent></Card>
      </Section>

      <Section title="Status pills — all domains">
        <Card><CardContent className="space-y-3 p-6">
          <div className="flex flex-wrap gap-2">{JOB_STATUSES.map((s) => <StatusPill key={s} status={s} />)}</div>
          <div className="flex flex-wrap gap-2">{DUE_STATUSES.map((s) => <StatusPill key={s} status={s} />)}</div>
          <div className="flex flex-wrap gap-2">{PAYMENT_STATUSES.map((s) => <StatusPill key={s} status={s} />)}</div>
        </CardContent></Card>
      </Section>

      <Section title="Plates & money">
        <Card><CardContent className="flex flex-wrap items-center gap-6 p-6">
          <PlateChip plate="gr 1234-24" />
          <MoneyText pesewas={125000n} className="text-2xl" />
          <MoneyText pesewas={-5000n} />
        </CardContent></Card>
      </Section>

      <Section title="Stats">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label="Revenue today" value="GH₵ 4,250" delta={12} deltaLabel="vs yesterday" />
          <StatTile label="Jobs in bay" value="7" delta={-3} />
          <StatTile label="Parts low" value="2" />
        </div>
      </Section>

      <Section title="Stepper — all states">
        <Card><CardContent className="p-6">
          <Stepper steps={[
            { label: "Check-in", state: "done" },
            { label: "Diagnosis", state: "current" },
            { label: "Estimate", state: "upcoming" },
            { label: "Repair", state: "upcoming" },
            { label: "Invoice", state: "upcoming" },
          ]} />
        </CardContent></Card>
      </Section>

      <Section title="Vehicles — car avatars">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {VEHICLE_TYPES.map((t) => (
            <Card key={t} className="p-3"><CarAvatar type={t} title={t} /></Card>
          ))}
        </div>
        <VehicleHealthCard
          plate="GR-1234-24" nickname="Kofi's Corolla"
          oil={{ status: "ok", nextDue: "Oil in 1,200 km" }}
          insurance={{ status: "soon", nextDue: "Renews in 9 days" }}
          dvla={{ status: "overdue", nextDue: "Expired 3 days ago" }}
          issues={{ status: "unknown" }}
        />
      </Section>

      <Section title="Empty state">
        <EmptyState title="No jobs yet" description="When a customer pulls in, their job card appears here." />
      </Section>
    </main>
  )
}
