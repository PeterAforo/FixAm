const postgres = require("postgres")
const plansSpec = require("../docs/devin-spec/specs/plans.json")

const sql = postgres(process.env.TEST_DB_URL, { ssl: "require", connect_timeout: 15 })

function toPesewas(ghs) {
  if (ghs == null) return null
  return Math.round(ghs * 100)
}

;(async () => {
  for (const p of plansSpec.plans) {
    await sql`
      insert into public.plans (code, name, price_monthly, max_branches, max_staff,
        message_allowance, features, paystack_plan_code, is_active)
      values (${p.code}, ${p.name}, ${toPesewas(p.price_monthly_ghs) ?? 0},
        ${p.max_branches ?? null}, ${p.max_staff ?? null},
        ${p.message_allowance}, ${p.features}, ${p.paystack_plan_code ?? null}, true)
      on conflict (code) do update set
        name = excluded.name,
        max_branches = excluded.max_branches,
        max_staff = excluded.max_staff,
        message_allowance = excluded.message_allowance,
        features = excluded.features,
        is_active = true`
    console.log("plan:", p.code)
  }
  const rows = await sql`select code, name from public.plans order by code`
  console.log("plans in db:", rows.map((r) => r.code).join(", "))
  await sql.end()
})().catch((e) => {
  console.error("ERR:", e.message)
  process.exit(1)
})
