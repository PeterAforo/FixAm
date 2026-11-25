require("dotenv").config({ path: ".env.local" })
const postgres = require("postgres")
const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL, {
  ssl: "require",
  connect_timeout: 15,
  max: 1,
})
;(async () => {
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema='public' and table_name in ('account_subscriptions','workspace_invites')`
  const cols = await sql`
    select table_name, column_name from information_schema.columns
    where table_schema='public' and (
      (table_name='users' and column_name='default_workspace')
      or (table_name='brokers' and column_name in ('gps_lat','gps_lng'))
      or (table_name='vendor_members' and column_name='invite_token_hash')
      or (table_name='tow_operator_members' and column_name='status')
    ) order by 1,2`
  console.log(JSON.stringify({ tables: tables.map(t => t.table_name), cols }, null, 1))
  await sql.end()
})().catch((e) => {
  console.error("ERR", e.message)
  process.exit(1)
})
