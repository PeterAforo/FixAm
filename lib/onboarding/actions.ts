"use server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  bays,
  branches,
  garages,
  garageSettings,
  memberships,
  plans,
  subscriptions,
} from "@/lib/db/schema"
import { createHash, randomBytes } from "crypto"
import { ensureUser, getSessionUserId } from "@/lib/auth/ensure-user"
import { normalizeGhPhone } from "@/lib/phone"
import { uuidv7 } from "@/lib/id"
import { writeAuditLog, type ActionResult } from "@/lib/actions"

const onboardingSchema = z.object({
  garageName: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "lowercase letters, numbers and hyphens only"),
  phone: z.string().refine((v) => normalizeGhPhone(v) !== null, "Valid Ghana phone required"),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(300).optional().or(z.literal("")),
  city: z.string().max(80).optional().or(z.literal("")),
  gpsLat: z.number().min(-90).max(90).optional().nullable(),
  gpsLng: z.number().min(-180).max(180).optional().nullable(),
  branchName: z.string().min(2).max(80).default("Main branch"),
  branchCode: z.string().min(2).max(5).default("MAIN"),
  defaultLabourRate: z.number().int().min(0).default(0), // pesewas
  pricesIncludeTax: z.boolean().default(false),
  vatPercent: z.number().min(0).max(100).default(15), // Ghana VAT standard rate
  bays: z.array(z.string().min(1).max(60)).max(30).default([]),
  invites: z
    .array(
      z.object({
        phone: z.string().optional().or(z.literal("")),
        email: z.string().email().optional().or(z.literal("")),
        role: z.enum(["manager", "service_advisor", "mechanic", "storekeeper", "accountant"]),
        branchName: z.string().max(80).optional().or(z.literal("")),
      })
    )
    .max(20)
    .default([]),
})

export type OnboardingInput = z.infer<typeof onboardingSchema>

/**
 * Creates garage + settings + default branch + owner membership +
 * trialing Pro subscription (complimentary during pilot) in one flow.
 */
export async function createGarage(
  rawInput: unknown
): Promise<ActionResult<{ garageId: string; slug: string }>> {
  const userId = await getSessionUserId()
  if (!userId) {
    return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  }
  await ensureUser()

  const parsed = onboardingSchema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Check the highlighted fields",
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      },
    }
  }
  const input = parsed.data

  // Slug must be available
  const slugTaken = await db()
    .select({ id: garages.id })
    .from(garages)
    .where(eq(garages.slug, input.slug))
    .limit(1)
  if (slugTaken[0]) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: "That garage URL is already taken" },
    }
  }

  const proPlan = await db()
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.code, "pro"))
    .limit(1)
  if (!proPlan[0]) {
    return {
      ok: false,
      error: { code: "INTERNAL", message: "Plans not seeded — run pnpm db:seed" },
    }
  }

  const garageId = uuidv7()
  const phone = normalizeGhPhone(input.phone)!
  const pendingInvites: Array<{
    phone: string | null
    email: string
    role: string
    token: string
    branchName?: string
  }> = []

  try {
    await db().transaction(async (tx) => {
      await tx.insert(garages).values({
        id: garageId,
        name: input.garageName,
        slug: input.slug,
        phone,
        email: input.email || null,
        address: input.address || null,
        city: input.city || null,
        gpsLat: input.gpsLat != null ? String(input.gpsLat) : null,
        gpsLng: input.gpsLng != null ? String(input.gpsLng) : null,
        status: "active",
        onboardingCompletedAt: new Date(),
      })

      await tx.insert(garageSettings).values({
        garageId,
        defaultLabourRate: BigInt(input.defaultLabourRate),
        pricesIncludeTax: input.pricesIncludeTax,
        taxRules: [
          {
            name: "VAT",
            rate: input.vatPercent,
            inclusive: input.pricesIncludeTax,
          },
        ],
      })

      const [branch] = await tx
        .insert(branches)
        .values({
          garageId,
          name: input.branchName,
          code: input.branchCode.toUpperCase(),
          isDefault: true,
        })
        .returning({ id: branches.id })

      // Bays for the default branch
      if (input.bays.length > 0) {
        await tx.insert(bays).values(
          input.bays.map((name, i) => ({
            garageId,
            branchId: branch!.id,
            name,
            sortOrder: i,
          }))
        )
      }

      await tx.insert(memberships).values({
        garageId,
        userId,
        branchId: branch!.id,
        role: "owner",
        status: "active",
      })

      // Staff invites (token sent afterwards via messaging pipeline)
      for (const inv of input.invites) {
        const token = randomBytes(24).toString("base64url")
        await tx.insert(memberships).values({
          garageId,
          userId: null,
          branchId: branch!.id,
          role: inv.role,
          status: "invited",
          invitedPhone: inv.phone ? normalizeGhPhone(inv.phone) : null,
          invitedEmail: inv.email || null,
          inviteTokenHash: createHash("sha256").update(token).digest("hex"),
          invitedBy: userId,
        })
        pendingInvites.push({
          ...inv,
          email: inv.email ?? "",
          token,
          phone: inv.phone ? normalizeGhPhone(inv.phone) : null,
        })
      }

      // Pilot: Pro plan, complimentary, 14-day trial per plans.json billing
      const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      await tx.insert(subscriptions).values({
        garageId,
        planId: proPlan[0].id,
        status: "trialing",
        trialEndsAt: trialEnd,
        currentPeriodStart: new Date(),
        currentPeriodEnd: trialEnd,
        isComplimentary: true,
      })
    })
  } catch (e) {
    console.error("[onboarding] createGarage failed", e)
    return { ok: false, error: { code: "INTERNAL", message: "Could not create garage" } }
  }

  // Fire invite messages (mock inbox locally; real providers later)
  const { sendMessage } = await import("@/lib/messaging/send")
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  for (const inv of pendingInvites) {
    const to = inv.phone ?? inv.email
    if (!to) continue
    try {
      await sendMessage({
        garageId,
        channel: inv.phone ? "sms" : "email",
        to,
        templateKey: "staff_invite",
        variables: {
          staff_name: inv.phone ?? inv.email,
          garage_name: input.garageName,
          action_link: `${baseUrl}/invite/${inv.token}`,
        },
        idempotencyKey: `invite:${garageId}:${to}:${inv.role}`,
      })
    } catch (e) {
      console.error("[onboarding] invite send failed", e)
    }
  }

  await writeAuditLog({
    garageId,
    actorUserId: userId,
    action: "garage.create",
    entityType: "garage",
    entityId: garageId,
    after: { name: input.garageName, slug: input.slug },
  })

  return { ok: true, data: { garageId, slug: input.slug } }
}
