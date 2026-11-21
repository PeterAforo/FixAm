import { connection } from "next/server"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

export async function GET() {
  await connection()
  try {
    await db().execute(sql`select 1`)
    return Response.json({ ok: true, db: "up", ts: new Date().toISOString() })
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503 })
  }
}
