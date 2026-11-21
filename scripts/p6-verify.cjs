const { config } = require('dotenv')
config({ path: '.env.local' })
const postgres = require('postgres')
;(async () => {
  const s = postgres(process.env.DATABASE_URL, { ssl: 'require' })
  const tables = await s`select table_name from information_schema.tables where table_schema='public' and table_name in ('garage_vehicle_coverage','garage_reviews','vehicle_makes','vehicle_models') order by 1`
  console.log('tables:', tables.map((t) => t.table_name))
  const rls = await s`select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('garage_vehicle_coverage','garage_reviews','vehicle_makes','vehicle_models') order by 1`
  console.log('rls:', rls.map((t) => `${t.tablename}:${t.rowsecurity}`))
  const pol = await s`select tablename, policyname from pg_policies where schemaname='public' and tablename in ('garage_vehicle_coverage','garage_reviews','vehicle_makes','vehicle_models') order by 1,2`
  console.log('policies:', pol.map((p) => `${p.tablename}.${p.policyname}`))
  const cov = await s`select count(*)::int as n from public.garage_vehicle_coverage`
  console.log('coverage rows:', cov[0].n)
  await s.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
