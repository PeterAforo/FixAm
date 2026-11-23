import "server-only"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let _admin: SupabaseClient | undefined

/**
 * Service-role Supabase client — server only. Used to create phone accounts and
 * mint sessions after FixAm verifies its own SMS code.
 */
export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — required for phone sign-in")
  }
  _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return _admin
}

/** Internal e-mail used for phone-only accounts (never shown, never e-mailed). */
export const PHONE_EMAIL_DOMAIN = "phone.fixam.app"

export function phoneAccountEmail(e164: string) {
  return `${e164.replace(/\D/g, "")}@${PHONE_EMAIL_DOMAIN}`
}

export function isPhoneAccountEmail(email: string | null | undefined) {
  return Boolean(email && email.toLowerCase().endsWith(`@${PHONE_EMAIL_DOMAIN}`))
}
