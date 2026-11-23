/**
 * Lists public tables without Row Level Security enabled and exits non-zero
 * if any exist. Run against staging/production after migrations:
 *
 *   DATABASE_URL=... pnpm check:rls
 *
 * Without DATABASE_URL it warns and exits 0 so CI smoke runs stay green;
 * CI jobs that have the secret should set it to enforce.
 */
import postgres from "postgres"

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.warn("check-rls: DATABASE_URL not set — skipping (set it to enforce).")
    return
  }

  const sql = postgres(url, { ssl: "require", max: 1 })
  try {
    const rows = await sql<{ tablename: string }[]>`
      select tablename from pg_tables
      where schemaname = 'public' and not rowsecurity
      order by tablename`

    if (rows.length === 0) {
      console.log("check-rls: all public tables have RLS enabled.")
    } else {
      console.error("check-rls: tables WITHOUT row level security:")
      for (const r of rows) console.error(`  - ${r.tablename}`)
      process.exitCode = 1
    }
  } finally {
    await sql.end()
  }
}

main().catch((e) => {
  console.error("check-rls failed:", e)
  process.exit(1)
})
