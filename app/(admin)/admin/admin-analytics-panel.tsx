import { Card, CardContent } from "@/components/brand/card"

type Analytics = {
  activeGarages: number
  mrrPesewas: number
  activeSubs: number
  pastDue: number
  trialing: number
  cancelled: number
  messagesUsed: number
  messagesAllowance: number
  renewalsTotal: number
  renewalsCompleted: number
  activeMembers: number
} | null

function ghp(pesewas: number) {
  return `GH₵${(pesewas / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export function AdminAnalyticsPanel({ analytics }: { analytics: Analytics }) {
  if (!analytics) return <p className="mt-3 text-sm text-muted-foreground">Analytics unavailable.</p>
  const items: [string, string][] = [
    ["Active garages", String(analytics.activeGarages)],
    ["MRR", ghp(analytics.mrrPesewas)],
    ["Active subscriptions", String(analytics.activeSubs)],
    ["Trialing", String(analytics.trialing)],
    ["Past due", String(analytics.pastDue)],
    ["Cancelled", String(analytics.cancelled)],
    ["Message usage", `${analytics.messagesUsed.toLocaleString()} / ${analytics.messagesAllowance.toLocaleString()}`],
    ["Renewal requests", `${analytics.renewalsCompleted} / ${analytics.renewalsTotal} completed`],
    ["Active staff", String(analytics.activeMembers)],
  ]
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map(([label, value]) => (
        <Card key={label}>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-2xl font-bold">{value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
