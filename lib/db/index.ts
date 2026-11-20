import "server-only"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

/**
 * Runtime client — uses the pooled DATABASE_URL (Supabase pooler / PgBouncer).
 * Migrations use DATABASE_URL_DIRECT via drizzle-kit instead.
 */
function createClient() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is not set — copy .env.example to .env.local")
  }
  const client = postgres(url, { prepare: false, max: 10 })
  return drizzle(client, { schema })
}

let _db: ReturnType<typeof createClient> | undefined

/** Lazily-initialised so importing this module never connects at build time. */
export function db() {
  _db ??= createClient()
  return _db
}

export { schema }
export * from "./schema"
