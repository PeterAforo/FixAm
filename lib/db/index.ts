import "server-only"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

/**
 * Runtime client — uses the pooled DATABASE_URL (Supabase pooler / PgBouncer).
 * Migrations use DATABASE_URL_DIRECT via drizzle-kit instead.
 *
 * Cold pooler connections can exceed Postgres' statement_timeout on the first
 * query of a serverless instance ("canceling statement due to statement
 * timeout", SQLSTATE 57014). client.unsafe is wrapped so every query retries
 * once after a short delay — by then the connection is warm.
 */

const STATEMENT_TIMEOUT = /statement timeout|57014/i
const RETRY_DELAY_MS = 600

function isStatementTimeout(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  const cause = (e as { cause?: unknown }).cause
  return STATEMENT_TIMEOUT.test(e.message) || (cause instanceof Error && STATEMENT_TIMEOUT.test(cause.message))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function createClient() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is not set — copy .env.example to .env.local")
  }
  const client = postgres(url, { prepare: false, max: 10 })

  const unsafe = client.unsafe.bind(client) as (...args: unknown[]) => Promise<unknown> & { values?: () => Promise<unknown> }
  const run = async (make: () => ReturnType<typeof unsafe>) => {
    try {
      return await make()
    } catch (e) {
      if (!isStatementTimeout(e)) throw e
      await sleep(RETRY_DELAY_MS)
      return make()
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(client as any).unsafe = (...args: unknown[]) => {
    const make = () => unsafe(...args) as ReturnType<typeof unsafe>
    const promise = run(make) as Promise<unknown> & { values?: () => Promise<unknown> }
    promise.values = () => run(() => make().values!()) as Promise<unknown>
    return promise
  }

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
