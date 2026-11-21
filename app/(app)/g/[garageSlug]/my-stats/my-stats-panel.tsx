"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { setLeaderboardEnabled, type MyStats } from "@/lib/stats/actions"

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card><CardContent className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </CardContent></Card>
  )
}

export function MyStatsPanel({ garageId, stats, canManage }: { garageId: string; stats: MyStats; canManage: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  const toggleLeaderboard = () => {
    setMsg(null)
    startTransition(async () => {
      const res = await setLeaderboardEnabled({ garageId, enabled: !stats.leaderboardEnabled })
      if (!res.ok) { setMsg(res.error?.message ?? "Could not update"); return }
      router.refresh()
    })
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Streak */}
      <Card className="border-2 border-accent/40 bg-accent/5">
        <CardContent className="flex items-center gap-4 p-5">
          <span className="text-5xl" aria-hidden>{stats.currentStreak > 0 ? "🔥" : "🧊"}</span>
          <div>
            <p className="font-display text-2xl font-bold">{stats.currentStreak}-day streak</p>
            <p className="text-sm text-muted-foreground">Best: {stats.bestStreak} days · Last active: {stats.lastActiveDate ?? "—"}</p>
          </div>
        </CardContent>
      </Card>

      {/* Core stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Jobs done" value={String(stats.jobsCompleted)} sub={`${stats.jobsThisWeek} this week · ${stats.jobsThisMonth} this month`} />
        <Stat label="Hours" value={(stats.minutesWorked / 60).toFixed(1)} sub="logged" />
        <Stat label="Revenue" value={`GH₵${(stats.revenuePesewas / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub="on your jobs" />
        <Stat label="Comebacks" value={String(stats.comebacks)} sub="warranty returns" />
        <Stat label="This week" value={String(stats.jobsThisWeek)} sub="jobs completed" />
        <Stat label="This month" value={String(stats.jobsThisMonth)} sub="jobs completed" />
      </div>

      {/* Badges */}
      <section>
        <h2 className="font-display text-lg font-bold">Badges</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stats.badges.length === 0 && (
            <p className="col-span-full rounded-xl border-2 border-dashed border-border p-4 text-sm text-muted-foreground">
              No badges yet — complete jobs to earn your first one.
            </p>
          )}
          {stats.badges.map((b) => (
            <Card key={b.key} className="border-2 border-accent/50">
              <CardContent className="p-4 text-center">
                <span className="text-4xl" aria-hidden>{b.emoji}</span>
                <p className="mt-2 font-display font-bold">{b.name}</p>
                <p className="text-xs text-muted-foreground">{b.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Leaderboard */}
      {stats.leaderboard && (
        <section>
          <h2 className="font-display text-lg font-bold">Weekly leaderboard</h2>
          <Card className="mt-3"><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">#</th><th className="px-4 py-3">Mechanic</th>
                  <th className="px-4 py-3 text-right">Jobs (7d)</th><th className="px-4 py-3 text-right">Hours (7d)</th>
                </tr>
              </thead>
              <tbody>
                {stats.leaderboard.map((r, i) => (
                  <tr key={r.name} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-bold">{i + 1}</td>
                    <td className="px-4 py-2 font-semibold">{r.name}</td>
                    <td className="px-4 py-2 text-right">{r.jobsThisWeek}</td>
                    <td className="px-4 py-2 text-right">{(r.minutesThisWeek / 60).toFixed(1)}</td>
                  </tr>
                ))}
                {stats.leaderboard.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No stats yet — the nightly job populates this.</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </section>
      )}

      {canManage && (
        <div className="flex items-center justify-between rounded-xl border-2 border-border bg-card p-4">
          <div>
            <p className="font-semibold">Weekly leaderboard</p>
            <p className="text-sm text-muted-foreground">{stats.leaderboardEnabled ? "Mechanics can see rankings" : "Hidden from the team"}</p>
          </div>
          <Button size="sm" variant={stats.leaderboardEnabled ? "secondary" : "primary"} disabled={pending} onClick={toggleLeaderboard}>
            {stats.leaderboardEnabled ? "Disable" : "Enable"}
          </Button>
        </div>
      )}

      {msg && <p className="text-sm font-semibold text-danger">{msg}</p>}
    </div>
  )
}
