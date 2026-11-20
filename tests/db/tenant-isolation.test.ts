import { afterAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import { randomUUID } from "node:crypto"

/**
 * Tenant isolation integration test — runs against the real Supabase DB
 * when DATABASE_URL is set (vitest loads .env.local via dotenv in config).
 *
 * Seeds two garages + owner memberships, then impersonates garage A's user
 * via `SET ROLE authenticated` + JWT claims and asserts garage B is invisible
 * and writes are denied.
 */

const url = process.env.DATABASE_URL ?? process.env.TEST_DB_URL
const hasDb = Boolean(url)

const sql = hasDb ? postgres(url!, { prepare: false, max: 1 }) : null

const tag = randomUUID().slice(0, 8)
const garageA = randomUUID()
const garageB = randomUUID()
const userA = randomUUID()
const userB = randomUUID()

async function seed() {
  await sql!`insert into public.users (id, full_name, email) values
    (${userA}, 'Test A', ${`a-${tag}@test.local`}),
    (${userB}, 'Test B', ${`b-${tag}@test.local`})`
  await sql!`insert into public.garages (id, name, slug, phone) values
    (${garageA}, ${`Garage A ${tag}`}, ${`test-a-${tag}`}, '+233200000001'),
    (${garageB}, ${`Garage B ${tag}`}, ${`test-b-${tag}`}, '+233200000002')`
  await sql!`insert into public.memberships (garage_id, user_id, role, status) values
    (${garageA}, ${userA}, 'owner', 'active'),
    (${garageB}, ${userB}, 'owner', 'active')`
}

async function cleanup() {
  await sql!`delete from public.memberships where garage_id in (${garageA}, ${garageB})`
  await sql!`delete from public.garages where id in (${garageA}, ${garageB})`
  await sql!`delete from public.users where id in (${userA}, ${userB})`
}

describe.skipIf(!hasDb)("tenant isolation (requires DATABASE_URL)", () => {
  afterAll(async () => {
    if (!sql) return
    try {
      await cleanup()
    } finally {
      await sql.end()
    }
  })

  it("garage A user sees only garage A", async () => {
    await seed()
    const rows = await sql!.begin(async (tx) => {
      await tx`set local role authenticated`
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userA })}, true)`
      return tx`select id from public.garages`
    })
    const ids = rows.map((r) => r.id)
    expect(ids).toContain(garageA)
    expect(ids).not.toContain(garageB)
  })

  it("garage A user cannot read garage B memberships", async () => {
    const rows = await sql!.begin(async (tx) => {
      await tx`set local role authenticated`
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userA })}, true)`
      return tx`select garage_id from public.memberships`
    })
    expect(rows.every((r) => r.garage_id === garageA)).toBe(true)
  })

  it("garage A user cannot write audit rows for garage B", async () => {
    await expect(
      sql!.begin(async (tx) => {
        await tx`set local role authenticated`
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userA })}, true)`
        await tx`insert into public.audit_logs (garage_id, action, entity_type)
          values (${garageB}, 'test', 'test')`
      })
    ).rejects.toThrow()
  })

  it("audit_logs cannot be updated or deleted by authenticated role", async () => {
    await sql!`insert into public.audit_logs (garage_id, action, entity_type)
      values (${garageA}, 'rls-test', 'test')`
    const upd = await sql!.begin(async (tx) => {
      await tx`set local role authenticated`
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userA })}, true)`
      return tx`update public.audit_logs set action = 'hacked' where garage_id = ${garageA}`
    })
    expect(upd.count).toBe(0)
    const del = await sql!.begin(async (tx) => {
      await tx`set local role authenticated`
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userA })}, true)`
      return tx`delete from public.audit_logs where garage_id = ${garageA}`
    })
    expect(del.count).toBe(0)
    await sql!`delete from public.audit_logs where garage_id = ${garageA} and action = 'rls-test'`
  })

  it("garage A owner cannot see garage B user row", async () => {
    const rows = await sql!.begin(async (tx) => {
      await tx`set local role authenticated`
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userA })}, true)`
      return tx`select id from public.users`
    })
    const ids = rows.map((r) => r.id)
    expect(ids).toContain(userA)
    expect(ids).not.toContain(userB)
  })
})
