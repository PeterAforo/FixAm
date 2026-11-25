"use server"
import { z } from "zod"
import { and, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { portalOtps, users } from "@/lib/db/schema"
import { createClient } from "@/lib/auth/supabase/server"
import { phoneAccountEmail, supabaseAdmin } from "@/lib/auth/admin"
import { ensureUser, getSessionUserId } from "@/lib/auth/ensure-user"
import { postLoginDestination } from "@/lib/auth/destination"
import { sendDirectSms, smsIsLive } from "@/lib/messaging/direct"
import { normalizeGhPhone } from "@/lib/phone"
import { sha256 } from "@/lib/portal/session"
import type { ActionResult } from "@/lib/actions"

/**
 * One account system for everyone (Supabase). FixAm sends and checks its own
 * SMS code (Arkesel/Hubtel), then mints a Supabase session for that phone —
 * so drivers, garage staff, vendors and brokers all sign in the same way.
 */

const OTP_TTL_MS = 10 * 60_000
const MAX_ATTEMPTS = 5

const phoneSchema = z.object({ phone: z.string().min(9).max(20) })
const verifySchema = z.object({
  phone: z.string().min(9).max(20),
  code: z.string().regex(/^\d{6}$/),
  next: z.string().max(300).optional().nullable(),
})

type CodeSent = { sent: true; phone: string; devCode?: string }

async function issueCode(phone: string, purpose: "signin" | "link"): Promise<ActionResult<CodeSent>> {
  const { rateLimit, rateLimited } = await import("@/lib/rate-limit")
  const rl = await rateLimit(`auth-otp:${phone}`, 5, 3600)
  if (!rl.ok) return rateLimited(rl)

  const code = String(Math.floor(100000 + Math.random() * 900000))
  const key = purpose === "link" ? `link:${phone}` : phone
  const codeHash = sha256(`${key}:${code}`)
  const expiresAt = new Date(Date.now() + OTP_TTL_MS)
  await db()
    .insert(portalOtps)
    .values({ phone: key, codeHash, expiresAt, attempts: 0 })
    .onConflictDoUpdate({ target: portalOtps.phone, set: { codeHash, expiresAt, attempts: 0, createdAt: new Date() } })

  const sent = await sendDirectSms(phone, "otp", { otp_code: code, garage_name: "FixAm" })
  const isDev = process.env.NODE_ENV !== "production"
  // In production the mock provider "succeeds" without delivering anything —
  // treat an unconfigured SMS provider as a failure so nobody waits for a
  // code that will never arrive.
  const smsLive = await smsIsLive()
  if ((!sent.ok || !smsLive) && !isDev) {
    return {
      ok: false,
      error: { code: "INTERNAL", message: "We couldn't send the SMS just now. Try again, or sign in with e-mail." },
    }
  }
  // Local development without an SMS provider: show the code on screen.
  return { ok: true, data: { sent: true as const, phone, ...(isDev && !smsLive ? { devCode: code } : {}) } }
}

async function checkCode(key: string, code: string): Promise<string | null> {
  const [otp] = await db().select().from(portalOtps).where(eq(portalOtps.phone, key)).limit(1)
  if (!otp || otp.expiresAt < new Date() || otp.attempts >= MAX_ATTEMPTS) return "That code has expired — send a new one."
  if (otp.codeHash !== sha256(`${key}:${code}`)) {
    await db().update(portalOtps).set({ attempts: otp.attempts + 1 }).where(eq(portalOtps.phone, key))
    return "That code isn't right. Check the SMS and try again."
  }
  await db().delete(portalOtps).where(eq(portalOtps.phone, key))
  return null
}

/** Find the auth user that owns this phone (auth.users first, then public.users). */
async function findUserByPhone(phone: string): Promise<{ id: string; email: string | null } | null> {
  const digits = phone.replace(/\D/g, "")
  const rows = (await db().execute(
    sql`select id::text as id, email from auth.users where phone = ${digits} or phone = ${phone} limit 1`
  )) as unknown as { id: string; email: string | null }[]
  if (rows[0]) return rows[0]
  const [u] = await db().select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1)
  if (!u) return null
  const { data } = await supabaseAdmin().auth.admin.getUserById(u.id)
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null
}

// ---------------------------------------------------------------------------
// Sign in / sign up with phone
// ---------------------------------------------------------------------------

export async function requestSignInCode(rawInput: unknown): Promise<ActionResult<CodeSent>> {
  const parsed = phoneSchema.safeParse(rawInput)
  const phone = parsed.success ? normalizeGhPhone(parsed.data.phone) : null
  if (!phone) return { ok: false, error: { code: "VALIDATION", message: "Enter a Ghana number, e.g. 024 123 4567" } }
  return issueCode(phone, "signin")
}

export async function verifySignInCode(
  rawInput: unknown
): Promise<ActionResult<{ destination: string; isNew: boolean }>> {
  const parsed = verifySchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Enter the 6-digit code" } }
  const phone = normalizeGhPhone(parsed.data.phone)
  if (!phone) return { ok: false, error: { code: "VALIDATION", message: "Invalid phone number" } }

  const { rateLimit, rateLimited } = await import("@/lib/rate-limit")
  const rl = await rateLimit(`auth-otp-verify:${phone}`, 10, 900)
  if (!rl.ok) return rateLimited(rl)

  const bad = await checkCode(phone, parsed.data.code)
  if (bad) return { ok: false, error: { code: "VALIDATION", message: bad } }

  const admin = supabaseAdmin()
  let isNew = false
  let account = await findUserByPhone(phone)
  if (!account) {
    const email = phoneAccountEmail(phone)
    let { data, error } = await admin.auth.admin.createUser({
      phone,
      phone_confirm: true,
      email,
      email_confirm: true,
      user_metadata: { signup_method: "phone" },
      app_metadata: { phone },
    })
    if (error || !data.user) {
      // Projects with the Supabase phone provider switched off reject `phone`;
      // fall back to the internal e-mail and keep the phone on our side.
      ;({ data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { signup_method: "phone" },
        app_metadata: { phone }, // app_metadata is server-only — users can't edit it
      }))
    }
    if (error || !data.user) {
      return { ok: false, error: { code: "INTERNAL", message: "We couldn't create your account. Please try again." } }
    }
    account = { id: data.user.id, email: data.user.email ?? email }
    isNew = true
  }
  if (!account.email) {
    const email = phoneAccountEmail(phone)
    await admin.auth.admin.updateUserById(account.id, { email, email_confirm: true })
    account.email = email
  }

  // Mint a session for this user without sending anything else.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: account.email })
  const tokenHash = link?.properties?.hashed_token
  if (linkError || !tokenHash) {
    return { ok: false, error: { code: "INTERNAL", message: "Sign-in failed. Please try again." } }
  }
  const supabase = await createClient()
  let { error: verifyError } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash })
  if (verifyError) ({ error: verifyError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash }))
  if (verifyError) return { ok: false, error: { code: "INTERNAL", message: "Sign-in failed. Please try again." } }

  await ensureUser()
  await db().update(users).set({ phone }).where(and(eq(users.id, account.id), isNull(users.phone)))
  const destination = await postLoginDestination(parsed.data.next)
  return { ok: true, data: { destination, isNew } }
}

/** After an e-mail/password sign-in or sign-up on the client. */
export async function afterSignIn(next?: string | null): Promise<ActionResult<{ destination: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  return { ok: true, data: { destination: await postLoginDestination(next) } }
}

// ---------------------------------------------------------------------------
// Add / verify a phone on an existing (e-mail) account
// ---------------------------------------------------------------------------

export async function requestPhoneLinkCode(rawInput: unknown): Promise<ActionResult<CodeSent>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = phoneSchema.safeParse(rawInput)
  const phone = parsed.success ? normalizeGhPhone(parsed.data.phone) : null
  if (!phone) return { ok: false, error: { code: "VALIDATION", message: "Enter a Ghana number, e.g. 024 123 4567" } }
  const owner = await findUserByPhone(phone)
  if (owner && owner.id !== userId) {
    return {
      ok: false,
      error: { code: "CONFLICT", message: "That number already has a FixAm account. Sign out and sign in with it instead." },
    }
  }
  return issueCode(phone, "link")
}

export async function verifyPhoneLinkCode(rawInput: unknown): Promise<ActionResult<{ phone: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = verifySchema.safeParse(rawInput)
  const phone = parsed.success ? normalizeGhPhone(parsed.data.phone) : null
  if (!parsed.success || !phone) return { ok: false, error: { code: "VALIDATION", message: "Enter the 6-digit code" } }

  const bad = await checkCode(`link:${phone}`, parsed.data.code)
  if (bad) return { ok: false, error: { code: "VALIDATION", message: bad } }

  const { error } = await supabaseAdmin().auth.admin.updateUserById(userId, { phone, phone_confirm: true })
  if (error) return { ok: false, error: { code: "CONFLICT", message: "That number is already linked to another account." } }
  await db().update(users).set({ phone, updatedAt: new Date() }).where(eq(users.id, userId))
  await ensureUser() // picks up staff invites sent to this number
  return { ok: true, data: { phone } }
}

/** Set the display name (asked once, right after a phone sign-up). */
export async function updateMyName(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({ fullName: z.string().trim().min(2).max(120) }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Enter your name" } }
  await db().update(users).set({ fullName: parsed.data.fullName, updatedAt: new Date() }).where(eq(users.id, userId))
  await supabaseAdmin()
    .auth.admin.updateUserById(userId, { user_metadata: { full_name: parsed.data.fullName } })
    .catch(() => {})
  return { ok: true, data: { ok: true as const } }
}
