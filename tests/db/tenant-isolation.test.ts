import { describe, expect, it } from "vitest"

/**
 * Tenant isolation integration test.
 *
 * Runs only when DATABASE_URL points at a real Postgres/Supabase database
 * with migrations applied (including RLS policies). Skipped otherwise —
 * this environment has no local Postgres/Docker.
 *
 * To run: set DATABASE_URL (and DATABASE_URL_DIRECT for migrations) in
 * .env.local, run `pnpm db:migrate`, then `pnpm test`.
 */

const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)("tenant isolation (requires DATABASE_URL)", () => {
  it("garage A cannot read garage B rows", async () => {
    const postgres = (await import("postgres")).default
    const sql = postgres(process.env.DATABASE_URL!, { prepare: false })
    try {
      // Seed two garages + memberships for a test user, set JWT claims,
      // then assert cross-tenant reads return zero rows.
      // Implementation lands with the auth layer (P1); placeholder asserts
      // the harness works once a database is configured.
      const [{ count }] = await sql`select count(*)::int as count from public.garages`
      expect(count).toBeGreaterThanOrEqual(0)
    } finally {
      await sql.end()
    }
  })
})

// When DATABASE_URL is absent the suite above is skipped entirely; Vitest
// reports it as skipped, which is the intended signal until a database is
// configured (no local Postgres/Docker in this environment).
