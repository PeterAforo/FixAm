const postgres = require("postgres")
const fs = require("fs")
const path = require("path")

const sql = postgres(process.env.TEST_DB_URL, {
  ssl: "require",
  connect_timeout: 15,
  max: 1,
})

function statements(file) {
  return fs
    .readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean)
}

;(async () => {
  const dir = path.join(__dirname, "..", "drizzle")
  const only = process.argv[2]
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && (!only || f.startsWith(only)))
    .sort()

  for (const file of files) {
    console.log(`== ${file}`)
    const stmts = statements(path.join(dir, file))
    console.log(`   ${stmts.length} statements`)
    for (let i = 0; i < stmts.length; i++) {
      try {
        await sql.unsafe(stmts[i])
      } catch (e) {
        console.error(`   FAIL stmt ${i + 1}: ${e.message}`)
        console.error(stmts[i].slice(0, 300))
        await sql.end()
        process.exit(1)
      }
    }
    console.log("   OK")
  }

  // Mark migrations as applied in drizzle's journal table
  const journal = JSON.parse(
    fs.readFileSync(path.join(dir, "meta", "_journal.json"), "utf8")
  )
  for (const entry of journal.entries) {
    const hash = require("crypto")
      .createHash("sha256")
      .update(fs.readFileSync(path.join(dir, `${entry.tag}.sql`)))
      .digest("hex")
    await sql`
      insert into drizzle.__drizzle_migrations (hash, created_at)
      values (${hash}, ${entry.when})
      on conflict do nothing`
  }
  console.log("journal marked")
  await sql.end()
})().catch((e) => {
  console.error("FATAL:", e.message)
  process.exit(1)
})
