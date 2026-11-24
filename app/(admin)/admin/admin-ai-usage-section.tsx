import { connection } from "next/server"
import { eq } from "drizzle-orm"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { aiUsageByGarage, formatUsd } from "@/lib/ai/usage"
import { photoScanAccuracy } from "@/lib/part-photo/service"

export async function AdminAiUsageSection() {
  await connection()
  const userId = await getSessionUserId()
  if (!userId) return null
  const [me] = await db().select({ a: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)).limit(1)
  if (!me?.a) return null
  const [{ rows, totals }, photo] = await Promise.all([
    aiUsageByGarage(30),
    photoScanAccuracy(30).catch(() => null),
  ])
  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`)
  return (
    <section className="mt-6">
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Calls" value={totals.calls.toLocaleString()} />
        <Stat label="Errors" value={totals.errors.toLocaleString()} />
        <Stat label="Voice minutes" value={(totals.audioSeconds / 60).toFixed(1)} />
        <Stat label="Cost" value={formatUsd(totals.costMicroUsd)} />
      </div>
      {photo && photo.scans > 0 && (
        <div className="mt-3 rounded-xl border border-border bg-card p-3 text-sm">
          <span className="font-semibold">Part photos:</span> {photo.scans} scans · {photo.confirmed} confirmed by the person ·
          top suggestion right <strong>{pct(photo.accuracy)}</strong> of the time · sure enough to skip the list {pct(photo.sureRate)}
          <span className="block text-xs text-muted-foreground">Target: top suggestion right at least 80% of the time.</span>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No AI calls yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Garage</th>
                <th className="px-3 py-2 text-right">Calls</th>
                <th className="px-3 py-2 text-right">Errors</th>
                <th className="px-3 py-2 text-right">Tokens in / out</th>
                <th className="px-3 py-2 text-right">Voice min</th>
                <th className="px-3 py-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.garageId ?? "none"} className="border-t border-border">
                  <td className="px-3 py-2">{r.garageName ?? "Drivers & platform"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.calls}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.errors}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.inputTokens.toLocaleString()} / {r.outputTokens.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{(r.audioSeconds / 60).toFixed(1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUsd(r.costMicroUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-lg font-bold tabular-nums">{value}</div>
    </div>
  )
}
