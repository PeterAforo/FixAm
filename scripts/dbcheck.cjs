const postgres = require("postgres")
const sql = postgres(process.env.TEST_DB_URL, { ssl: "require", connect_timeout: 15 })
;(async () => {
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name`
  console.log("tables:", tables.map((t) => t.table_name).join(", "))
  const policies = await sql`
    select tablename, policyname from pg_policies where schemaname='public' order by tablename`
  console.log("policies:", policies.length)
  const funcs = await sql`
    select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and proname in ('current_user_id','is_member','member_role','member_branch','can_access_branch')`
  console.log("rls funcs:", funcs.map((f) => f.proname).join(", "))
  const mig = await sql`select count(*)::int c from drizzle.__drizzle_migrations`
  console.log("migrations applied:", mig[0].c)
  await sql.end()
})().catch((e) => { console.error("ERR:", e.message); process.exit(1) })
