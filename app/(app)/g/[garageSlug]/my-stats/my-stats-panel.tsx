"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Medal } from "lucide-react"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { Badge } from "@/components/brand/badge"
import { StatTile } from "@/components/brand/stat-tile"
import { StreakFlame } from "@/components/brand/streak-flame"
import { Torq } from "@/components/brand/torq"
import { setLeaderboardEnabled, type MyStats } from "@/lib/stats/actions"

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

  const maxWeekJobs = Math.max(1, ...(stats.leaderboard ?? []).map((r) => r.jobsThisWeek))

  return (
    <div className="mt-6 space-y-6">
      {/* Streak hero — spec: StreakFlame hero, Torq cool_shades at 7+ */}
      <Card className="border-2 border-accent/40 bg-accent/5">
        <CardContent className="flex flex-wrap items-center gap-5 p-6">
          {stats.currentStreak >= 7 ? <Torq pose="cool_shades" size={88} /> : null}
          <div className="min-w-0 flex-1">
            <StreakFlame count={stats.currentStreak} atRisk={stats.currentStreak > 0 && stats.jobsThisWeek === 0} size={28} />
            <p className="mt-1 text-sm text-muted-foreground">
              Best: {stats.bestStreak} days · Last active: {stats.lastActiveDate ?? "—"}
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-3xl font-bold tabular-nums">{stats.jobsCompleted}</p>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">lifetime jobs</p>
          </div>
        </CardContent>
      </Card>

      {/* Core stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Jobs done" value={String(stats.jobsCompleted)} />
        <StatTile label="Hours" value={(stats.minutesWorked / 60).toFixed(1)} />
        <StatTile label="Revenue" value={`GH₵${(stats.revenuePesewas / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <StatTile label="Comebacks" value={String(stats.comebacks)} />
        <StatTile label="This week" value={String(stats.jobsThisWeek)} />
        <StatTile label="This month" value={String(stats.jobsThisMonth)} />
      </div>

      {/* Badges shelf — spec: locked badges show progress hint */}
      <section>
        <h2 className="font-display text-lg font-bold">Badges</h2>
        {stats.badges.length === 0 ? (
          <p className="mt-3 rounded-xl border-2 border-dashed border-border p-4 text-sm text-muted-foreground">
            No badges yet — complete jobs to earn your first one.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-4">
            {stats.badges.map((b) => (
              <Badge key={b.key} label={b.name} unlocked icon={<span aria-hidden>{b.emoji}</span>} />
            ))}
          </div>
        )}
      </section>

      {/* Leaderboard — top 5, friendly framing */}
      {stats.leaderboard && stats.leaderboard.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-bold">This week on the floor</h2>
          <Card className="mt-3"><CardContent className="p-4">
            <div className="space-y-2">
              {stats.leaderboard.slice(0, 5).map((r, i) => (
                <div key={r.name} className="flex items-center gap-3">
                  <span className="flex w-6 items-center justify-center font-display font-bold text-muted-foreground">
                    {i < 3 ? <Medal className={i === 0 ? "size-5 text-sun-500" : "size-5 text-sand-400"} /> : i + 1}
                  </span>
                  <span className="w-32 truncate text-sm font-semibold">{r.name}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[image:var(--gradient-ignite)]"
                      style={{ width: `${Math.round((r.jobsThisWeek / maxWeekJobs) * 100)}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-sm font-bold tabular-nums">{r.jobsThisWeek} jobs</span>
                </div>
              ))}
            </div>
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
