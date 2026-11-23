require("dotenv").config({ path: ".env.local" })
const postgres = require("postgres")
const fs = require("fs")
const path = require("path")

const file = process.argv[2]
if (!file) {
  console.error("usage: node scripts/apply-sql.cjs <file.sql>")
  process.exit(1)
}
const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL
const sql = postgres(url, { ssl: "require", connect_timeout: 15, max: 1 })

;(async () => {
  const body = fs.readFileSync(path.resolve(file), "utf8")
  await sql.unsafe(body)
  console.log("applied", file)
  await sql.end()
})().catch((e) => {
  console.error("FATAL:", e.message)
  process.exit(1)
})
