require("dotenv").config({ path: ".env.local" })
const p = require("postgres")
const s = p(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL, { ssl: "require", max: 1 })
;(async () => {
  const u = await s`select id, email, email_confirmed_at, encrypted_password is not null as has_pw, aud, role from auth.users where email like '%fixam.test' or email like '%pitstop%' order by email`
  u.forEach((r) => console.log(r.email, "| confirmed:", r.email_confirmed_at, "| pw:", r.has_pw, "| aud:", r.aud))
  const i = await s`select provider_id, provider, user_id from auth.identities order by created_at desc limit 15`
  console.log("--- identities ---")
  i.forEach((r) => console.log(r.provider, r.provider_id))
  await s.end()
})().catch((e) => {
  console.log("ERR", e.message)
  process.exit(1)
})
