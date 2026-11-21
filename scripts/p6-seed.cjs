const { config } = require('dotenv')
config({ path: '.env.local' })
const postgres = require('postgres')
;(async () => {
  const s = postgres(process.env.DATABASE_URL, { ssl: 'require' })

  // Demo garage coverage = distinct makes/models across its vehicles
  const garage = await s`select id from public.garages where slug = 'pitstop-demo' limit 1`
  if (!garage.length) { console.log('demo garage not found'); await s.end(); return }
  const gid = garage[0].id

  const vehs = await s`
    select distinct catalog_make_id, catalog_model_id, make, model
    from public.vehicles
    where garage_id = ${gid} and deleted_at is null and catalog_make_id is not null`
  let cov = 0
  for (const v of vehs) {
    const r = await s`
      insert into public.garage_vehicle_coverage (garage_id, catalog_make_id, catalog_model_id, make, model)
      values (${gid}, ${v.catalog_make_id}, ${v.catalog_model_id}, ${v.make}, ${v.model})
      on conflict do nothing
      returning id`
    cov += r.length
  }
  console.log('coverage inserted:', cov, 'from', vehs.length, 'vehicle variants')

  // Whole-make coverage for common Ghana makes the demo garage plausibly services
  const makes = await s`select id, name from public.vehicle_makes where name in ('Toyota','Honda','Nissan','Hyundai','Kia','Volkswagen','Mercedes-Benz','BMW','Suzuki','Mitsubishi','Ford','Peugeot','Renault','Mazda','Subaru','Lexus','Isuzu','Great Wall','Chery','BYD')`
  let mk = 0
  for (const m of makes) {
    const r = await s`
      insert into public.garage_vehicle_coverage (garage_id, catalog_make_id, make)
      select ${gid}, ${m.id}, ${m.name}
      where not exists (
        select 1 from public.garage_vehicle_coverage c
        where c.garage_id = ${gid} and c.catalog_make_id = ${m.id} and c.catalog_model_id is null and c.is_active)
      returning id`
    mk += r.length
  }
  console.log('whole-make coverage inserted:', mk)

  // A sample published review so profiles show ratings
  const rev = await s`
    insert into public.garage_reviews (garage_id, portal_phone, rating, comment, status)
    values (${gid}, '+233200000001', 5, 'Quick diagnosis and fair pricing. Car was ready same day.', 'published')
    on conflict (garage_id, portal_phone) do update set rating = 5, comment = excluded.comment
    returning id`
  console.log('review:', rev.length ? 'ok' : 'skipped')

  await s.end()
})().catch((e) => { console.error(e); process.exit(1) })
