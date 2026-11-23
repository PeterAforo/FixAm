import "server-only"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

/**
 * Next 12-digit numeric payment reference from the `payment_txn_seq`
 * sequence. theTeller requires this shape; every provider accepts it.
 */
export async function nextPaymentReference(): Promise<string> {
  const rows = await db().execute<{ v: string }>(sql`select nextval('payment_txn_seq')::text as v`)
  const v = rows[0]?.v
  if (!v) throw new Error("payment_txn_seq returned nothing")
  return v.padStart(12, "0")
}
