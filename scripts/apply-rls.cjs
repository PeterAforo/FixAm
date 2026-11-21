const { config } = require('dotenv')
config({ path: '.env.local' })
const postgres = require('postgres')
const fs = require('fs')

async function main() {
  const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false, max: 1 })
  const file = process.argv[2] || 'lib/db/rls-domain.sql'
  const body = fs.readFileSync(file, 'utf8')
  // split on statement-breakpoint comments used by drizzle sql files
  const stmts = body.split(/-->\s*statement-breakpoint/).map((s) => s.trim()).filter(Boolean)
  let n = 0
  for (const s of stmts) {
    try {
      await sql.unsafe(s)
      n++
    } catch (e) {
      console.log('SKIP/ERR:', String(e.message).slice(0, 120))
    }
  }
  console.log(`executed ${n}/${stmts.length} statements from ${file}`)
  await sql.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
