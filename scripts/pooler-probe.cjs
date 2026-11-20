const postgres = require("postgres")
const regions = [
  "eu-west-1","eu-west-2","eu-west-3","eu-central-1","eu-central-2","eu-north-1",
  "us-east-1","us-east-2","us-west-1","us-west-2","ap-south-1","ap-southeast-1",
  "ap-southeast-2","ap-northeast-1","sa-east-1","ca-central-1","af-south-1","me-south-1",
]
const ref = "fpdjerqyaqhnjdcqlztc"
const pass = process.env.DB_PASS

async function tryRegion(r) {
  const host = `aws-1-${r}.pooler.supabase.com`
  const url = `postgresql://postgres.${ref}:${pass}@${host}:6543/postgres`
  const sql = postgres(url, { ssl: "require", connect_timeout: 8, max: 1 })
  try {
    await sql`select 1`
    console.log("WORKS:", r)
    await sql.end()
    return true
  } catch (e) {
    console.log("fail:", r, e.message.slice(0, 80))
    try { await sql.end() } catch {}
    return false
  }
}

;(async () => {
  for (const r of regions) {
    if (await tryRegion(r)) break
  }
})()
