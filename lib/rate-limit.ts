import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { rateLimits } from "@/lib/db/schema"

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number }

/**
 * Fixed-window rate limiter backed by Postgres. Safe under serverless
 * concurrency via an atomic upsert.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const now = new Date()
  const windowMs = windowSeconds * 1000
  const resetAt = new Date(now.getTime() + windowMs)

  const rows = await db()
    .insert(rateLimits)
    .values({ key, count: 1, resetAt, updatedAt: now })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.resetAt} <= ${now} then 1 else ${rateLimits.count} + 1 end`,
        resetAt: sql`case when ${rateLimits.resetAt} <= ${now} then ${resetAt} else ${rateLimits.resetAt} end`,
        updatedAt: now,
      },
    })
    .returning({ count: rateLimits.count, resetAt: rateLimits.resetAt })

  const row = rows[0]
  if (!row) return { ok: true } // fail-open on unexpected DB shape
  if (row.count > limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000)) }
  }
  return { ok: true }
}

export function rateLimited(error: { retryAfterSec: number }) {
  return {
    ok: false as const,
    error: {
      code: "FORBIDDEN" as const,
      message: `Too many attempts — try again in ${error.retryAfterSec}s`,
    },
  }
}
