"use server"

import { z } from "zod"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { rateLimit } from "@/lib/rate-limit"
import type { ActionResult } from "@/lib/actions"
import { checkLines } from "./service"
import { normaliseCity, type FairQuoteCheck } from "./core"

const schema = z.object({
  what: z.union([z.literal("labour"), z.string().uuid()]),
  carClass: z.enum(["economy", "premium", "suv", "commercial", "motorbike"]),
  city: z.string().trim().max(60).optional().default(""),
  /** GH₵ — per part, or per hour for labour. */
  priceGhs: z.number().positive().max(1_000_000),
})

/**
 * Driver tool: "is this price fair?" for a quote they got anywhere.
 * Returns null when there aren't enough prices to say.
 */
export async function checkPrice(raw: unknown): Promise<ActionResult<{ check: FairQuoteCheck | null }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Pick what it's for and enter a price" } }
  const rl = await rateLimit(`price-check:${userId}`, 30, 3600)
  if (!rl.ok) return { ok: false, error: { code: "CONFLICT", message: "Too many checks — try again later" } }
  const d = parsed.data
  const pesewas = Math.round(d.priceGhs * 100)
  const line = d.what === "labour"
    ? { id: "q", type: "labour", partTypeId: null, unitPrice: pesewas, quantity: 1, labourHours: 1 }
    : { id: "q", type: "part", partTypeId: d.what, unitPrice: pesewas, quantity: 1, labourHours: null }
  const res = await checkLines({ excludeGarageId: null, city: normaliseCity(d.city), cls: d.carClass, lines: [line] })
  return { ok: true, data: { check: res.q ?? null } }
}
