"use server"

import { z } from "zod"
import type { ActionResult } from "@/lib/actions"
import { getPortalPhone } from "@/lib/portal/session"
import { updateOwnerPassport, type PassportSettings } from "./service"

const schema = z.object({
  vehicleId: z.string().uuid(),
  enabled: z.boolean().optional(),
  showMileage: z.boolean().optional(),
  showGarageNames: z.boolean().optional(),
  regenerate: z.boolean().optional(),
})

/** Owner turns the passport on/off, chooses what shows, or gets a new link. */
export async function updatePassport(raw: unknown): Promise<ActionResult<PassportSettings>> {
  const phone = await getPortalPhone()
  if (!phone) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const { vehicleId, ...patch } = parsed.data
  const res = await updateOwnerPassport(phone, vehicleId, patch)
  if (!res) return { ok: false, error: { code: "NOT_FOUND", message: "Only the car's owner can change its passport" } }
  return { ok: true, data: res }
}
