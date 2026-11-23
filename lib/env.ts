import "server-only"

/**
 * Production environment check. Called once at server startup from
 * instrumentation.ts — fails loudly (throws) when a required variable is
 * missing so a misconfigured deploy never serves traffic.
 */
const REQUIRED_IN_PRODUCTION = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "MAGIC_LINK_SECRET",
  "PAYOUT_ENCRYPTION_KEY",
] as const

const PAYMENT_REQUIRED = [
  "THETELLER_MERCHANT_ID",
  "THETELLER_API_USER",
  "THETELLER_API_KEY",
] as const

export function assertProductionEnv() {
  if (process.env.NODE_ENV !== "production") return

  const missing: string[] = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key])
  if (process.env.PAYMENT_PROVIDER === "theteller") {
    missing.push(...PAYMENT_REQUIRED.filter((key) => !process.env[key]))
  }
  if (process.env.PAYMENT_PROVIDER === "theteller" && !process.env.THETELLER_PASS_CODE) {
    missing.push("THETELLER_PASS_CODE")
  }

  if (missing.length) {
    throw new Error(
      `Missing required environment variables in production: ${missing.join(", ")}. ` +
        "See .env.example and the docs/OPERATIONS.md first-deploy runbook.",
    )
  }
}
