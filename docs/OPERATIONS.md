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
  `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`.
  Set `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_AUTH_TOKEN` (source-map uploads) in
  Vercel env. Alerts: error rate > 1% of requests, new issue in production,
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

## Data protection (Act 843)

- Customers can request export/deletion from the portal (`/portal` → Your data).
- Platform admins fulfil requests at `/admin` → Privacy requests.
- Exports are stored as JSON on the `privacy_requests.payload` column;
  deletions anonymise PII and soft-delete the customer record while keeping
  financial records for statutory retention.

## Seed & demo

`pnpm db:seed` is idempotent — safe to re-run. Demo logins use
`Password123!` (see `scripts/seed.ts` / `docs/devin-spec/specs/seed-data.json`).
