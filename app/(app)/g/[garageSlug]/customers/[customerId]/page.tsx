import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import Link from "next/link"
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  creditAccounts,
  customers,
  documents,
  garages,
  invoices,
  jobItems,
  jobs,
  messageLogs,
  vehicles,
} from "@/lib/db/schema"
import { getSessionUserId, ensureUser } from "@/lib/auth/ensure-user"
import { resolveMembership } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { MoneyText } from "@/components/brand/money-text"
import { StatTile } from "@/components/brand/stat-tile"
import { PlateChip } from "@/components/brand/plate-chip"
import { CustomerEditButton } from "./customer-edit-button"

async function ProfileLoader({
  params,
}: {
  params: Promise<{ garageSlug: string; customerId: string }>
}) {
  await connection()
  const { garageSlug, customerId } = await params

  const userId = await getSessionUserId()
  if (!userId) redirect(`/login?next=/g/${garageSlug}/customers/${customerId}`)
  await ensureUser()

  const [garage] = await db().select().from(garages).where(eq(garages.slug, garageSlug)).limit(1)
  if (!garage) redirect("/onboarding")

  const membership = await resolveMembership(userId, garage.id)
  if (!membership) redirect("/onboarding")

  const principal = {
    kind: "staff" as const,
    role: membership.role as StaffRole,
    garageId: garage.id,
    branchId: membership.branchId,
  }
  if (!can(principal, "customers.view")) notFound()

  const [customer] = await db()
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.garageId, garage.id),
        isNull(customers.deletedAt)
      )
    )
    .limit(1)
  if (!customer) notFound()

  const [vehicleRows, jobRows, invoiceStats, invoiceRows, creditRows, docRows, msgRows] =
    await Promise.all([
      db()
        .select({
          id: vehicles.id,
          plateNumber: vehicles.plateNumber,
          make: vehicles.make,
          model: vehicles.model,
          year: vehicles.year,
          bodyType: vehicles.bodyType,
          lastOdometerKm: vehicles.lastOdometerKm,
        })
        .from(vehicles)
        .where(and(eq(vehicles.currentOwnerId, customer.id), isNull(vehicles.deletedAt)))
        .limit(20),
      db()
        .select({
          id: jobs.id,
          number: jobs.number,
          status: jobs.status,
          complaint: jobs.complaint,
          createdAt: jobs.createdAt,
        })
        .from(jobs)
        .where(and(eq(jobs.customerId, customer.id), isNull(jobs.deletedAt)))
        .orderBy(desc(jobs.createdAt))
        .limit(10),
      db()
        .select({
          balance: sql<string>`coalesce(sum(${invoices.balanceDue}),0)::text`,
          count: sql<number>`count(*)::int`,
        })
        .from(invoices)
        .where(and(eq(invoices.customerId, customer.id), eq(invoices.garageId, garage.id))),
      db()
        .select({
          id: invoices.id,
          number: invoices.number,
          status: invoices.status,
          total: invoices.total,
          balanceDue: invoices.balanceDue,
          issueDate: invoices.issueDate,
        })
        .from(invoices)
        .where(and(eq(invoices.customerId, customer.id), eq(invoices.garageId, garage.id)))
        .orderBy(desc(invoices.createdAt))
        .limit(5),
      db()
        .select()
        .from(creditAccounts)
        .where(and(eq(creditAccounts.customerId, customer.id), eq(creditAccounts.garageId, garage.id)))
        .limit(1),
      db()
        .select({
          id: documents.id,
          type: documents.type,
          fileName: documents.fileName,
          createdAt: documents.createdAt,
        })
        .from(documents)
        .where(and(eq(documents.customerId, customer.id), eq(documents.garageId, garage.id)))
        .orderBy(desc(documents.createdAt))
        .limit(10),
      db()
        .select({
          id: messageLogs.id,
          channel: messageLogs.channel,
          category: messageLogs.category,
          status: messageLogs.status,
          createdAt: messageLogs.createdAt,
        })
        .from(messageLogs)
        .where(and(eq(messageLogs.customerId, customer.id), eq(messageLogs.garageId, garage.id)))
        .orderBy(desc(messageLogs.createdAt))
        .limit(10),
    ])

  // Fleet report: per-vehicle jobs + spend for fleet customers
  const fleetRows = customer.type === "fleet" && vehicleRows.length
    ? await db()
        .select({
          vehicleId: jobs.vehicleId,
          jobsCount: sql<number>`count(distinct ${jobs.id})::int`,
          spend: sql<string>`coalesce(sum(round(${jobItems.unitPrice} * ${jobItems.quantity}) - coalesce(${jobItems.discountAmount},0)),0)::text`,
        })
        .from(jobs)
        .innerJoin(jobItems, eq(jobItems.jobId, jobs.id))
        .where(and(
          eq(jobs.garageId, garage.id),
          inArray(jobs.vehicleId, vehicleRows.map((v) => v.id)),
          inArray(jobs.status, ["delivered", "closed"]),
          isNull(jobs.deletedAt),
        ))
        .groupBy(jobs.vehicleId)
    : []
  const fleetSpend = new Map(fleetRows.map((r) => [r.vehicleId, { jobs: r.jobsCount, spend: Number(r.spend) }]))

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/g/${garageSlug}/customers`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          ← Customers
        </Link>
        <header className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em] text-foreground">
              {customer.fullName}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
              <span className="font-mono">{customer.phone}</span>
              {customer.email && <span>· {customer.email}</span>}
              <StatusPill
                tone={customer.type === "individual" ? "info" : customer.type === "business" ? "warning" : "ok"}
              >
                {customer.type}
              </StatusPill>
              {(customer.tags ?? []).map((t) => (
                <span
                  key={t}
                  className="rounded-pill border border-border bg-surface-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </p>
          </div>
          {can(principal, "customers.update") && (
            <CustomerEditButton garageId={garage.id} garageSlug={garageSlug} customer={customer} />
          )}
        </header>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Vehicles" value={vehicleRows.length} />
        <StatTile label="Jobs" value={jobRows.length} />
        <StatTile
          label="Balance due"
          value={<MoneyText pesewas={invoiceStats[0]?.balance ?? "0"} />}
        />
        <StatTile
          label="Credit limit"
          value={
            creditRows[0] ? (
              <MoneyText pesewas={creditRows[0].creditLimit} />
            ) : (
              "—"
            )
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Vehicles</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {vehicleRows.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No vehicles yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {vehicleRows.map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`/g/${garageSlug}/vehicles/${v.id}`}
                      className="flex items-center gap-3 px-6 py-3 hover:bg-surface-muted/60"
                    >
                      <PlateChip plate={v.plateNumber} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {v.make} {v.model} {v.year ?? ""}
                      </span>
                      {v.lastOdometerKm != null && (
                        <span className="font-mono text-xs text-muted-foreground">
                          {v.lastOdometerKm.toLocaleString()} km
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {customer.type === "fleet" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Fleet report</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {vehicleRows.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">No fleet vehicles yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-6 py-2">Vehicle</th>
                      <th className="px-3 py-2 text-right">Jobs</th>
                      <th className="px-6 py-2 text-right">Total spend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicleRows.map((v) => {
                      const s = fleetSpend.get(v.id)
                      return (
                        <tr key={v.id} className="border-b border-border last:border-0">
                          <td className="px-6 py-2">
                            <Link href={`/g/${garageSlug}/vehicles/${v.id}`} className="font-semibold text-primary hover:underline">
                              {v.plateNumber}
                            </Link>
                            <span className="text-muted-foreground"> · {v.make} {v.model}</span>
                          </td>
                          <td className="px-3 py-2 text-right">{s?.jobs ?? 0}</td>
                          <td className="px-6 py-2 text-right"><MoneyText pesewas={s?.spend ?? 0} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent jobs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {jobRows.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No jobs yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {jobRows.map((j) => (
                  <li key={j.id} className="flex items-center gap-3 px-6 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{j.number}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {j.complaint ?? "—"}
                      </p>
                    </div>
                    <StatusPill>{j.status.replace("_", " ")}</StatusPill>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invoices</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {invoiceRows.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No invoices yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {invoiceRows.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-3 px-6 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{inv.number ?? "Draft"}</p>
                      <p className="text-xs text-muted-foreground">{inv.issueDate ?? ""}</p>
                    </div>
                    <StatusPill>{inv.status.replace("_", " ")}</StatusPill>
                    <MoneyText pesewas={inv.balanceDue} className="text-sm" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Documents</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {docRows.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">No documents uploaded.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {docRows.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 px-6 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{d.fileName ?? d.type.replace("_", " ")}</p>
                        <p className="text-xs text-muted-foreground">{d.type.replace("_", " ")}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Message log</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {msgRows.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">No messages sent.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {msgRows.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-6 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold capitalize">{m.channel} · {m.category}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(m.createdAt).toLocaleDateString("en-GH")}
                        </p>
                      </div>
                      <StatusPill>{m.status.replace("_", " ")}</StatusPill>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {(customer.notes || customer.address || creditRows[0]) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Details & preferences</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
            {customer.address && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Address</p>
                <p>{customer.address}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Channels</p>
              <p>{(customer.preferredChannels ?? []).join(", ") || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Opt-ins</p>
              <p>
                WhatsApp {customer.whatsappOptIn ? "on" : "off"} · Marketing{" "}
                {customer.marketingOptIn ? "on" : "off"}
              </p>
            </div>
            {creditRows[0] && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Credit account</p>
                <p>
                  Limit <MoneyText pesewas={creditRows[0].creditLimit} /> · balance{" "}
                  <MoneyText pesewas={creditRows[0].balance} /> · {creditRows[0].paymentTermsDays}d terms ·{" "}
                  {creditRows[0].status}
                </p>
              </div>
            )}
            {customer.notes && (
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap">{customer.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function CustomerProfilePage({
  params,
}: {
  params: Promise<{ garageSlug: string; customerId: string }>
}) {
  return (
    <div className="px-5 py-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-6xl">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
          <ProfileLoader params={params} />
        </Suspense>
      </div>
    </div>
  )
}
