"use client"

import { notFound } from "next/navigation"
import {
  Button, Card, CardContent,
  StatusPill, PlateChip, MoneyText, StatTile, Stepper, EmptyState,
  CarAvatar, VehicleHealthCard, ThemeToggle, fireConfetti,
} from "@/components/brand"

const JOB_STATUSES = ["booked", "in_progress", "awaiting_approval", "approved", "completed"]
const DUE_STATUSES = ["upcoming", "due_soon", "overdue", "done"]
const PAYMENT_STATUSES = ["pending", "paid", "partial", "refunded", "failed"]

const VEHICLE_TYPES = ["sedan", "hatchback", "suv", "pickup", "van", "bus", "truck", "motorbike", "other"] as const

export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound()

  return (
    <main className="mx-auto max-w-6xl space-y-12 p-6 pb-24">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">Pit Stop Pop</h1>
          <p className="text-muted-foreground">FixAm design system — dev showcase</p>
        </div>
        <ThemeToggle />
      </header>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold">Colour</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Ignition", "bg-ignition-500"], ["Midnight", "bg-midnight-700"],
            ["Volt", "bg-volt-400"], ["Turbo", "bg-turbo-400"],
            ["Cream", "bg-cream"], ["Plate", "bg-plate"],
            ["Surface", "bg-card border-2 border-border"], ["Muted", "bg-muted"],
          ].map(([name, cls]) => (
            <div key={name} className={`h-20 rounded-lg border-2 border-border ${cls}`}>
              <span className="p-2 text-xs font-bold">{name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold">Buttons</h2>
        <Card><CardContent className="flex flex-wrap items-center gap-4 p-6">
          {(["primary", "secondary", "accent", "ghost", "danger"] as const).map((v) => (
            <Button key={v} variant={v}>{v}</Button>
          ))}
          <Button size="sm">small</Button>
          <Button size="lg">large</Button>
          <Button onClick={() => fireConfetti()}>Confetti!</Button>
        </CardContent></Card>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold">Status pills</h2>
        <Card><CardContent className="space-y-3 p-6">
          <div className="flex flex-wrap gap-2">{JOB_STATUSES.map((s) => <StatusPill key={s} status={s} />)}</div>
          <div className="flex flex-wrap gap-2">{DUE_STATUSES.map((s) => <StatusPill key={s} status={s} />)}</div>
          <div className="flex flex-wrap gap-2">{PAYMENT_STATUSES.map((s) => <StatusPill key={s} status={s} />)}</div>
        </CardContent></Card>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold">Plates & money</h2>
        <Card><CardContent className="flex flex-wrap items-center gap-6 p-6">
          <PlateChip plate="gr 1234-24" />
          <MoneyText pesewas={125000n} className="text-2xl" />
          <MoneyText pesewas={-5000n} />
        </CardContent></Card>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold">Stats</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label="Revenue today" value="GH₵ 4,250" delta={12} deltaLabel="vs yesterday" />
          <StatTile label="Jobs in bay" value="7" delta={-3} />
          <StatTile label="Parts low" value="2" />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold">Stepper</h2>
        <Card><CardContent className="p-6">
          <Stepper steps={[
            { label: "Check-in", state: "done" },
            { label: "Diagnosis", state: "current" },
            { label: "Estimate", state: "upcoming" },
            { label: "Repair", state: "upcoming" },
            { label: "Invoice", state: "upcoming" },
          ]} />
        </CardContent></Card>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold">Vehicles</h2>
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
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold">Empty state</h2>
        <EmptyState title="No jobs yet" description="When a customer pulls in, their job card appears here." />
      </section>
    </main>
  )
}
