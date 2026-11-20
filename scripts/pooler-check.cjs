const postgres = require("postgres")
const port = process.argv[2] || "5432"
const sql = postgres(
  `postgresql://postgres.fpdjerqyaqhnjdcqlztc:${process.env.DB_PASS}@aws-1-eu-west-1.pooler.supabase.com:${port}/postgres`,
  { ssl: "require", connect_timeout: 10 }
)
sql`select version() as v`.then(async (r) => {
  console.log(`port ${port} OK:`, r[0].v.slice(0, 45))
  await sql.end()
}).catch((e) => {
  console.error(`port ${port} ERR:`, e.message)
  process.exit(1)
})
