const { config } = require('dotenv')
config({ path: '.env.local' })
const postgres = require('postgres')
;(async () => {
  const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' })
  const r = await sql`update public.plans set features = array_append(features, 'directory_listing'), updated_at = now() where code in ('growth','pro') and not 'directory_listing' = any(features) returning code`
  console.log('updated:', r.map((x) => x.code))
  // give the demo garage coordinates so the directory has content
  const g = await sql`update public.garages set gps_lat = coalesce(gps_lat, '5.6037'), gps_lng = coalesce(gps_lng, '-0.1870') where slug = 'pitstop-demo' returning name`
  console.log('garage geo:', g.map((x) => x.name))
  await sql.end()
})().catch((e) => { console.error(e); process.exit(1) })
