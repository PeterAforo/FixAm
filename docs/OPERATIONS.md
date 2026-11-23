# FixAm Operations Runbook

## Backups

Supabase Postgres is the system of record. Enable daily automated backups in
the Supabase dashboard (Database → Backups) and retain at least 30 days. Point-in-time
recovery (PITR) should be enabled on the production project.

Additional scheduled export (belt & braces):

```bash
# Weekly logical dump via Supabase CLI or pg_dump
pg_dump "$DATABASE_URL" --format=custom --file="fixam-$(date +%F).dump"
```

Store dumps off-site (encrypted object storage, e.g. S3/GCS).

## Environment variables (production)

Core integrations must be set in Vercel (and `.env.local` for dev). Values live in `.env.example`.

- **Payments**: `PAYMENT_PROVIDER=theteller`, `THETELLER_ENV`, `THETELLER_MERCHANT_ID`, `THETELLER_API_USER`, `THETELLER_API_KEY`, `THETELLER_PASS_CODE`, `THETELLER_API_BASE`, `THETELLER_CHECKOUT_URL`.
- **Payouts / secrets**: `PAYOUT_ENCRYPTION_KEY` (encrypts payout accounts and Ghana Card numbers), `LINK_SIGNING_SECRET` (public link signing), `ADMIN_ALERT_PHONE`.
- **AI / speech**: `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_*_USD_PER_MTOK`, `SPEECH_PROVIDER`, `KHAYA_API_KEY`, `KHAYA_BASE_URL`, `KHAYA_ASR_PATH`, `KHAYA_TRANSLATE_PATH`.
- **WhatsApp (P8-19)**: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET` (webhook signature), `WHATSAPP_VERIFY_TOKEN` (GET challenge). Webhook: `https://<domain>/api/webhooks/whatsapp`. Approve the `fixam_assistant_reply` template in Meta for replies outside the 24 h window; without it the service falls back to SMS.
- **Messaging**: `MESSAGING_SMS_PROVIDER`, `DELIVERY_PROVIDER`, `DELIVERY_OPS_PHONE`.

## Restore drill

Run quarterly and after any major migration.

1. Create a scratch project/branch in Supabase (or a local Postgres).
2. Restore the latest dump:

   ```bash
   pg_restore --clean --if-exists --no-owner --dbname="$RESTORE_DATABASE_URL" fixam-YYYY-MM-DD.dump
   ```

3. Apply pending Drizzle migrations so schema matches code:

   ```bash
   DATABASE_URL="$RESTORE_DATABASE_URL" pnpm db:migrate
   ```

4. Verify:
   - `select count(*) from garages;` matches production count.
   - Spot-check a garage: customers, vehicles, jobs, invoices row counts.
   - Sign in as a seeded/staging user and open the dashboard.
   - Confirm RLS is still enabled: `select tablename, rowsecurity from pg_tables where schemaname='public' and not rowsecurity;` should return no tenant tables.
5. Record the drill date, dump used, duration, and any issues in the team log.
   Acceptance criterion: this document exists and the drill has been executed at least once before launch.

## Monitoring & alerting

- **Sentry**: `@sentry/nextjs` is wired via `instrumentation.ts`,
  `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`,
  and `withSentryConfig` in `next.config.ts`.
  Set `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN` and — for source-map uploads —
  `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` in Vercel env. Alerts: error rate > 1% of requests, new issue in production,
  webhook failures (`/api/webhooks/*` 5xx).
- **Inngest**: scheduled functions (reminders, billing sweep, mechanic stats,
  instalments, credit statements, reports, auto-reorder) run via `/api/inngest`.
  Monitor the Inngest dashboard for failed runs; all functions have `retries: 1`.
- **Uptime**: ping `/api/health` (add a lightweight route returning 200) from an
  external monitor (Better Stack / UptimeRobot) every 5 minutes.

## Incident playbooks

- **Paystack webhook failures**: check `webhook_events` table for unprocessed
  rows (`processed_at is null`, `error is not null`); replay by re-POSTing the
  payload to `/api/webhooks/paystack`.
- **Messaging outage**: messages fall back WhatsApp → SMS inside
  `lib/messaging/send.ts`; check `message_logs` for `failed` rows and the
  provider dashboards (Arkesel/WhatsApp Business).
- **Read-only garage complaints**: verify `subscriptions.status` and
  `current_period_end` + 7-day grace in `lib/billing/core.ts`.

## Rate limits (public endpoints)

Fixed-window limits in `rate_limits` (Postgres), enforced in server actions:

| Endpoint/action | Limit |
|---|---|
| Portal OTP request | 5/hour per phone |
| Portal OTP verify | 10/15min per phone |
| Public booking request | 5/hour per garage+phone |
| Public booking confirm | 10/15min per booking |
| Estimate respond (`/t/[token]`) | 30/hour per token |
| Public invoice payment init | 10/hour per token |
| Reminder page view | 60/hour per token |
| Reminder booking request | 5/hour per token |
| Reminder booking OTP confirm | 10/15min per booking |
| Reminder mileage update | 30/hour per token |
| Reminder mark-done | 20/hour per token |
| Reminder start renewal | 10/hour per token |
| Renewal view/details/accept | 60/20/20 per hour per token |

## Data protection (Act 843)

- Customers can request export/deletion from the portal (`/portal` → Your data).
- Platform admins fulfil requests at `/admin` → Privacy requests.
- Exports are stored as JSON on the `privacy_requests.payload` column;
  deletions anonymise PII and soft-delete the customer record while keeping
  financial records for statutory retention.

## Seed & demo

`pnpm db:seed` is idempotent — safe to re-run. Demo logins use
`Password123!` (see `scripts/seed.ts` / `docs/devin-spec/specs/seed-data.json`).

## First deploy runbook

Do these in order when taking the app to a new environment.

### 1. Database

```bash
pnpm install
pnpm db:migrate        # applies every migration in drizzle/ (0016 ? latest)
pnpm check:rls         # lists any public table missing RLS; must print "all public tables have RLS enabled"
```

Confirm RLS is on for every table:

```sql
select tablename from pg_tables
where schemaname = 'public' and not rowsecurity;
-- expected: 0 rows
```

### 2. Vercel environment variables

Set in **Vercel ? Settings ? Environment Variables** (Production + Preview),
grouped by feature. See `.env.example` for the full annotated list.

- **Core (required):** `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `DATABASE_URL`, `DATABASE_URL_DIRECT`, `MAGIC_LINK_SECRET`,
  `LINK_SIGNING_SECRET`, `PAYOUT_ENCRYPTION_KEY`, `ADMIN_ALERT_PHONE`.
- **Payments:** `PAYMENT_PROVIDER=theteller`, `THETELLER_ENV`,
  `THETELLER_MERCHANT_ID`, `THETELLER_API_USER`, `THETELLER_API_KEY`,
  `THETELLER_PASS_CODE` (+ optional `THETELLER_API_BASE`,
  `THETELLER_CHECKOUT_URL`, `THETELLER_DEFAULT_EMAIL`).
- **SMS:** `MESSAGING_SMS_PROVIDER=arkesel|hubtel`, `ARKESEL_API_KEY` or
  `HUBTEL_CLIENT_ID`/`HUBTEL_CLIENT_SECRET`, `SMS_SENDER_ID`,
  `SMS_WEBHOOK_SECRET`.
- **WhatsApp:** `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`,
  `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`.
- **AI/speech:** `AI_PROVIDER=claude`, `ANTHROPIC_API_KEY`,
  `ANTHROPIC_MODEL`, `AI_PRICE_INPUT_PER_MTOK`, `AI_PRICE_OUTPUT_PER_MTOK`;
  `SPEECH_PROVIDER=khaya`, `KHAYA_API_KEY`, `KHAYA_BASE_URL`,
  `KHAYA_ASR_PATH`, `KHAYA_TRANSLATE_PATH`.
- **Delivery:** `DELIVERY_PROVIDER`, `DELIVERY_OPS_PHONE`.
- **Financing:** `FINANCING_PROVIDER=mock` until a lender is signed.
- **Email/push/observability:** `RESEND_API_KEY`, `EMAIL_FROM`,
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SENTRY_DSN`,
  `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`,
  `SENTRY_AUTH_TOKEN`.
- **Inngest:** `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`.

### 3. theTeller — no webhook to configure

theTeller has **no webhooks**. Settlement works two ways, both already built:

- the customer returns to `https://<your-domain>/payments/return/<reference>/<to>`
  (passed as `redirect_url` at checkout; theTeller appends `?code=…`), which
  calls `reconcileReference`;
- the Inngest escrow sweep polls pending references via
  `PaymentProvider.verify(reference)` — missed returns self-heal.

What you must set in the PaySwitch merchant dashboard: the **float account
pass code** (`THETELLER_PASS_CODE`) for payouts, and make sure test/live mode
(`THETELLER_ENV`) matches the keys. There is no callback URL to register.

### 4. WhatsApp webhook + templates

- Webhook URL: `https://<your-domain>/api/webhooks/whatsapp`
- Verify token: the value of `WHATSAPP_VERIFY_TOKEN`.
- Subscribe the app to the `messages` field.

Submit every template below to Meta (WhatsApp Manager ? Message templates)
before relying on WhatsApp sends — SMS fallback covers gaps meanwhile:

`otp_code` (AUTHENTICATION), `check_in_tracker`, `estimate_ready`,
`job_ready`, `payment_receipt`, `booking_confirmed`, `booking_tomorrow`,
`oil_due_soon`, `oil_due`, `oil_overdue`, `service_due_soon`, `service_due`,
`service_overdue`, `insurance_due_soon`, `insurance_due`,
`insurance_overdue`, `roadworthy_due_soon`, `roadworthy_due`,
`roadworthy_overdue`, `registration_due_soon`, `registration_due`,
`registration_overdue`, `drivers_licence_due_soon`, `drivers_licence_due`,
`drivers_licence_overdue`, `custom_due_soon`, `custom_due`,
`custom_overdue`, `combined_due`, `mileage_confirm`, `mileage_nudge`,
`instalment_due_soon`, `instalment_due`, `instalment_overdue`,
`credit_statement_ready`, `credit_statement_overdue`, `renewal_update`,
`staff_invite`, `fixam_assistant_reply`, `inspection_report_ready`,
`seasonal_harmattan`, `seasonal_rainy` (all UTILITY unless noted; seasonal
pair are MARKETING).

### 5. Inngest

- Deploy, then in the Inngest dashboard add the app: serve URL
  `https://<your-domain>/api/inngest`.
- Put the generated `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` back into
  Vercel and redeploy.
- For local dev: `pnpm inngest:dev`.

### 6. Supabase storage

Create buckets (all private; access via signed URLs from the app):

- `job-photos` — check-in/repair photos
- `inspection-photos` — pre-purchase inspection evidence
- `claim-documents` — accident/insurance claim uploads
- `rider-documents` — rider licence/Ghana Card/motorbike photos
- `avatars` — optional profile images

Attach RLS/storage policies scoped to the owning garage/customer (mirror the
table RLS: garage members read/write their garage prefix; customers read
their own objects only).

### 7. Seed (staging only)

```bash
DATABASE_URL=... pnpm db:seed
```

Idempotent — safe to re-run; seeds the demo garage, staff, customers,
vendors, brokers and riders used by `tests/e2e` and the staging test plan.
**Never run the seed against production.**
