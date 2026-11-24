"use server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { portalProfiles, portalVehicles } from "@/lib/db/schema";
import { getPortalPhone } from "./session";
import { resolveCatalogueIds } from "@/lib/catalogue";
import type { ActionResult } from "@/lib/actions";

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,30}$/;

const registerSchema = z.object({
  username: z
    .string()
    .regex(USERNAME_RE, "3-30 chars: letters, numbers, _ . -")
    .optional()
    .or(z.literal("")),
  password: z.string().min(8).max(200).optional().or(z.literal("")),
  fullName: z.string().min(2).max(120),
  email: z.string().email().max(200).optional().or(z.literal("")),
  address: z.string().max(300).optional().or(z.literal("")),
  city: z.string().max(80).optional().or(z.literal("")),
  region: z.string().max(80).optional().or(z.literal("")),
  marketingOptIn: z.boolean().default(false),
  acceptTerms: z.literal(true),
  planCode: z.string().min(1).max(40).optional(),
});

/** Complete self-registration for the signed-in portal phone. */
export async function completePortalRegistration(
  rawInput: unknown,
): Promise<ActionResult<{ ok: true }>> {
  const phone = await getPortalPhone();
  if (!phone) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } };

  const parsed = registerSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors as Record<string, string[]>;
    return {
      ok: false,
      error: { code: "VALIDATION", message: "Check the highlighted fields", fieldErrors: fe },
    };
  }
  const d = parsed.data;

  const username = d.username?.trim().toLowerCase() || null;
  const wantsPassword = Boolean(d.password);
  if (wantsPassword && !username) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Choose a username to enable password sign-in",
        fieldErrors: { username: ["Required with a password"] },
      },
    };
  }

  // username must be unique across portal accounts
  if (username) {
    const { ne } = await import("drizzle-orm");
    const [taken] = await db()
      .select({ phone: portalProfiles.phone })
      .from(portalProfiles)
      .where(and(eq(portalProfiles.username, username), ne(portalProfiles.phone, phone)))
      .limit(1);
    if (taken) {
      return {
        ok: false,
        error: {
          code: "CONFLICT",
          message: "That username is taken",
          fieldErrors: { username: ["Already in use"] },
        },
      };
    }
  }

  const { hashPortalPassword } = await import("./password");
  const { resolvePlanCode, createTrialSubscription } = await import("@/lib/billing/account");
  const planCode = await resolvePlanCode("driver", d.planCode);
  if (!planCode)
    return {
      ok: false,
      error: { code: "INTERNAL", message: "No driver plans configured — contact support" },
    };

  await db().transaction(async (tx) => {
    await tx
      .insert(portalProfiles)
      .values({
        phone,
        username,
        passwordHash: d.password ? hashPortalPassword(d.password) : null,
        fullName: d.fullName.trim(),
        email: d.email || null,
        address: d.address || null,
        city: d.city || null,
        region: d.region || null,
        marketingOptIn: d.marketingOptIn,
        termsAcceptedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: portalProfiles.phone,
        set: {
          ...(username !== undefined ? { username } : {}),
          ...(d.password ? { passwordHash: hashPortalPassword(d.password) } : {}),
          fullName: d.fullName.trim(),
          email: d.email || null,
          address: d.address || null,
          city: d.city || null,
          region: d.region || null,
          marketingOptIn: d.marketingOptIn,
          termsAcceptedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    await createTrialSubscription({ ownerKind: "driver", ownerId: phone, planCode }, tx);
  });
  return { ok: true, data: { ok: true } };
}

const updateSchema = z.object({
  fullName: z.string().min(2).max(120).optional(),
  email: z.string().email().max(200).optional().or(z.literal("")),
  username: z
    .string()
    .regex(USERNAME_RE, "3-30 chars: letters, numbers, _ . -")
    .optional()
    .or(z.literal("")),
  address: z.string().max(300).optional().or(z.literal("")),
  city: z.string().max(80).optional().or(z.literal("")),
  region: z.string().max(80).optional().or(z.literal("")),
  marketingOptIn: z.boolean().optional(),
  currentPassword: z.string().max(200).optional().or(z.literal("")),
  newPassword: z.string().min(8).max(200).optional().or(z.literal("")),
});

/** Edit portal profile fields; password change requires the current password. */
export async function updatePortalProfile(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const phone = await getPortalPhone();
  if (!phone) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } };

  const parsed = updateSchema.safeParse(rawInput);
  if (!parsed.success)
    return { ok: false, error: { code: "VALIDATION", message: "Check the fields" } };
  const d = parsed.data;

  const [profile] = await db()
    .select()
    .from(portalProfiles)
    .where(eq(portalProfiles.phone, phone))
    .limit(1);
  if (!profile)
    return { ok: false, error: { code: "NOT_FOUND", message: "Complete registration first" } };

  if (d.newPassword) {
    const { verifyPortalPassword } = await import("./password");
    if (!verifyPortalPassword(d.currentPassword ?? "", profile.passwordHash)) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Current password is incorrect",
          fieldErrors: { currentPassword: ["Wrong password"] },
        },
      };
    }
  }

  const username = d.username !== undefined ? d.username?.trim().toLowerCase() || null : undefined;
  if (username) {
    const { ne } = await import("drizzle-orm");
    const [taken] = await db()
      .select({ phone: portalProfiles.phone })
      .from(portalProfiles)
      .where(and(eq(portalProfiles.username, username), ne(portalProfiles.phone, phone)))
      .limit(1);
    if (taken)
      return {
        ok: false,
        error: {
          code: "CONFLICT",
          message: "That username is taken",
          fieldErrors: { username: ["Already in use"] },
        },
      };
  }

  const { hashPortalPassword } = await import("./password");
  await db()
    .update(portalProfiles)
    .set({
      ...(d.fullName !== undefined ? { fullName: d.fullName.trim() } : {}),
      ...(d.email !== undefined ? { email: d.email || null } : {}),
      ...(username !== undefined ? { username } : {}),
      ...(d.address !== undefined ? { address: d.address || null } : {}),
      ...(d.city !== undefined ? { city: d.city || null } : {}),
      ...(d.region !== undefined ? { region: d.region || null } : {}),
      ...(d.marketingOptIn !== undefined ? { marketingOptIn: d.marketingOptIn } : {}),
      ...(d.newPassword ? { passwordHash: hashPortalPassword(d.newPassword) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(portalProfiles.phone, phone));
  return { ok: true, data: { ok: true } };
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/** Upload a profile photo to storage and set avatar_url. */
export async function uploadPortalAvatar(formData: FormData): Promise<ActionResult<{ ok: true }>> {
  const phone = await getPortalPhone();
  if (!phone) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: { code: "VALIDATION", message: "Choose an image" } };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { ok: false, error: { code: "VALIDATION", message: "Image must be under 5 MB" } };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: { code: "VALIDATION", message: "File must be an image" } };
  }

  const { storageProvider } = await import("@/lib/integrations/storage");
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const key = `portal/${phone}/avatar.${ext}`;
  await storageProvider().put(key, Buffer.from(await file.arrayBuffer()), file.type);

  await db()
    .update(portalProfiles)
    .set({ avatarUrl: key, updatedAt: new Date() })
    .where(eq(portalProfiles.phone, phone));
  return { ok: true, data: { ok: true } };
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
});

/** Add a vehicle the customer claims (matched to garages by plate/phone later). */
export async function addPortalVehicle(
  rawInput: unknown,
): Promise<ActionResult<{ vehicleId: string }>> {
  const phone = await getPortalPhone();
  if (!phone) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } };

  const parsed = vehicleSchema.safeParse(rawInput);
  if (!parsed.success)
    return { ok: false, error: { code: "VALIDATION", message: "Check the vehicle details" } };
  const d = parsed.data;

  const [profile] = await db()
    .select({ phone: portalProfiles.phone })
    .from(portalProfiles)
    .where(eq(portalProfiles.phone, phone))
    .limit(1);
  if (!profile)
    return { ok: false, error: { code: "FORBIDDEN", message: "Complete your profile first" } };

  const plate = d.plateNumber?.trim().toUpperCase() || null;
  const cat = await resolveCatalogueIds(d.make, d.model);

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
    .returning({ id: portalVehicles.id });
  return { ok: true, data: { vehicleId: row!.id } };
}

export async function deletePortalVehicle(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const phone = await getPortalPhone();
  if (!phone) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } };
  const parsed = z.object({ vehicleId: z.string().uuid() }).safeParse(rawInput);
  if (!parsed.success)
    return { ok: false, error: { code: "VALIDATION", message: "Invalid vehicle" } };

  await db()
    .delete(portalVehicles)
    .where(and(eq(portalVehicles.id, parsed.data.vehicleId), eq(portalVehicles.phone, phone)));
  return { ok: true, data: { ok: true } };
}
