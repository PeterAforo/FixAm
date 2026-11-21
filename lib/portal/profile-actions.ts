"use server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { portalProfiles, portalVehicles } from "@/lib/db/schema"
import { getPortalPhone } from "./session"
import { resolveCatalogueIds } from "@/lib/catalogue"
import type { ActionResult } from "@/lib/actions"

const registerSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email().max(200).optional().or(z.literal("")),
  marketingOptIn: z.boolean().default(false),
  acceptTerms: z.literal(true),
})

/** Complete self-registration for the signed-in portal phone. */
export async function completePortalRegistration(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const phone = await getPortalPhone()
  if (!phone) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }

  const parsed = registerSchema.safeParse(rawInput)
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: "Enter your full name and accept the terms" } }
  }
  const d = parsed.data

  await db()
    .insert(portalProfiles)
    .values({
      phone,
      fullName: d.fullName.trim(),
      email: d.email || null,
      marketingOptIn: d.marketingOptIn,
      termsAcceptedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: portalProfiles.phone,
      set: {
        fullName: d.fullName.trim(),
        email: d.email || null,
        marketingOptIn: d.marketingOptIn,
        termsAcceptedAt: new Date(),
        updatedAt: new Date(),
      },
    })
  return { ok: true, data: { ok: true } }
}

const vehicleSchema = z.object({
  make: z.string().min(1).max(60),
  model: z.string().min(1).max(60),
  year: z.number().int().min(1950).max(2100).optional().nullable(),
  plateNumber: z.string().max(20).optional().or(z.literal("")),
  vin: z.string().max(40).optional().or(z.literal("")),
  color: z.string().max(40).optional().or(z.literal("")),
  bodyType: z.string().max(30).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
})

/** Add a vehicle the customer claims (matched to garages by plate/phone later). */
export async function addPortalVehicle(rawInput: unknown): Promise<ActionResult<{ vehicleId: string }>> {
  const phone = await getPortalPhone()
  if (!phone) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }

  const parsed = vehicleSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Check the vehicle details" } }
  const d = parsed.data

  const [profile] = await db().select({ phone: portalProfiles.phone }).from(portalProfiles)
    .where(eq(portalProfiles.phone, phone)).limit(1)
  if (!profile) return { ok: false, error: { code: "FORBIDDEN", message: "Complete your profile first" } }

  const plate = d.plateNumber?.trim().toUpperCase() || null
  const cat = await resolveCatalogueIds(d.make, d.model)

  const [row] = await db()
    .insert(portalVehicles)
    .values({
      phone,
      plateNumber: plate,
      plateSearch: plate ? plate.replace(/[^A-Z0-9]/g, "") : null,
      vin: d.vin || null,
      make: d.make.trim(),
      model: d.model.trim(),
      year: d.year ?? null,
      color: d.color || null,
      bodyType: d.bodyType || null,
      notes: d.notes || null,
      ...cat,
    })
    .returning({ id: portalVehicles.id })
  return { ok: true, data: { vehicleId: row!.id } }
}

export async function deletePortalVehicle(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const phone = await getPortalPhone()
  if (!phone) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({ vehicleId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid vehicle" } }

  await db().delete(portalVehicles).where(
    and(eq(portalVehicles.id, parsed.data.vehicleId), eq(portalVehicles.phone, phone))
  )
  return { ok: true, data: { ok: true } }
}
