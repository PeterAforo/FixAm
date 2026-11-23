# Launch checklist — acceptance criteria status

All 49 spec tasks (P0–P5) are implemented, typecheck/lint clean, 173 unit
tests passing, and `pnpm build` succeeds. This document tracks the acceptance
criteria that still need **staging verification** — things that cannot be
proven by unit tests or a local build.

## Verified in code / tests

- Multi-tenant isolation: RLS policies on all garage-scoped tables
  (`lib/db/rls.sql`, `lib/db/rls-domain.sql`); `audit_logs` is insert/select
  only — UPDATE/DELETE rejected at the database level.
- Permissions engine returns `{ ok:false, error.code:"FORBIDDEN" }`
  (`lib/actions.ts`); financial actions write audit rows with before/after.
- Money formatting/rounding/`GH₵` parsing unit-tested (`lib/money`).
- Mileage prediction: all `reminder-rules.json` test cases pass
  (`lib/domain/mileage` + tests).
- Mileage flags lower readings and excludes them from predictions.
- Plate search normalises `'gr1234 24'` → `'GR 1234-24'`
  (`lib/vehicles` plate key).
- Ghana phone normalisation `024…` → `+233…` (`lib/phone`).
- Invalid job status transitions rejected server-side; every transition
  writes `job_status_events`.
- Estimate partial approval, approve-on-behalf (reason + audit), inclusive
  and compound tax unit tests.
- Delivery gate: unpaid jobs cannot be delivered; oil-service delivery
  creates `oil_change` due items.
- Invoice numbers via `document_sequences` (`nextDocNumber`) — gapless,
  concurrency-safe; issued invoices immutable.
- Paystack webhook: signature-verified, idempotent via `webhook_events`,
  MoMo/card payments settle only via webhook.
- Instalment plans generate scheduled due items; late fees per spec.
- Credit accounts: limit enforcement with audited owner override; ageing
  buckets unit-tested; statement-day generation via Inngest.
- Cash-up counts cash payments minus cash refunds.
- Monthly profit = Σ daily profits; profit hidden without permission;
  CSV export implemented.
- POS: counter sale + return issues credit note and restocks.
- Purchase orders: partial receipt → `partially_delivered`.
- Marketplace flow: placed → accepted → out_for_delivery → delivered →
  received, region-filtered, review only after received.
- Reorder engine: single draft PO per crossing, spend-limit respected,
  mechanic notified on job-linked receipt.
- Reminder engine: combined weekly message, WhatsApp→SMS fallback,
  over-allowance push/email-only + owner notify, quiet-hours reschedule.
- Public `/t/[token]` actions set `converted_booking_id` /
  `converted_renewal_id` and pause reminders; mileage update recalculates
  prediction immediately.
- Insurance/DVLA renewals gated on plan feature + partner; garage without
  partner cannot offer insurance renewal.
- Customer portal: phone-OTP session, own vehicles only, cross-garage
  history, instalment payment from portal.
- Fleet: fleet manager approves estimates for any fleet vehicle; bulk
  approvals, consolidated statements, fleet reports.
- Subscription billing: plan limits enforced (e.g. staff cap), `past_due`
  read-only after grace, message meter vs `message_logs`.
- Platform admin: impersonation writes `audit_logs.impersonated_by`;
  garage suspend/reactivate; insurance partner + DVLA fee management.
- Mechanic stats: nightly recompute, badges, leaderboard gated by
  `garageSettings.leaderboardEnabled`.
- Rate limits on all public server actions (`rate_limits` table).
- Privacy export/delete (Act 843) in portal + admin fulfilment UI.
- `/api/health` endpoint for uptime monitors.
- Sentry wired (`instrumentation*.ts`, `withSentryConfig` in
  `next.config.ts`); DSN-gated so it no-ops without env vars.
- `docs/OPERATIONS.md`: backups, restore drill, monitoring, incident
  playbooks, rate-limit table.
- Idempotent seed: `pnpm db:seed` twice → `inserted=0`; seeded logins work.

## Requires staging verification

These criteria are runtime/environment dependent and must be exercised
against a deployed staging environment:

| Criterion | How to verify |
|---|---|
| P0-01 CI passes / Vercel preview deploy | Push triggers CI; connect repo to Vercel |
| P0-02 `/design` page, AA contrast, reduced-motion | Manual/a11y pass on staging |
| P0-03 "cannot read garage B" integration test | RLS proven by policies; run a two-garage Playwright test on staging |
| P0-04 OTP 5/hour per phone | Enforced by Supabase Auth rate limits — verify in Supabase dashboard |
| P0-06 onboarding < 5 min, invite accept, suspend kills session | Manual staging walkthrough |
| P0-07 nav per role, 360px shell, live notifications | Manual + Playwright viewport tests |
| P0-08 push on installed PWA | Install PWA on device, trigger notification |
| P1-01 search < 300ms @ 10k customers | Seed 10k customers on staging, measure |
| P1-05 check-in < 2 min on tablet | Timed manual test |
| P1-06 two-browser realtime < 1s | Open two sessions, move a card |
| P1-07 airplane-mode offline sync, photo upload retry | Device test on staging |
| P2-02 MoMo test payment via webhook | Paystack test keys on staging |
| P2-08 dashboard < 2.5s Lighthouse throttled | Run Lighthouse on staging |
| P3-01 CSV import of 500 parts | Run import on staging |
| P3-02 counter sale < 30s | Timed manual test |
| P3-07 customer order → booking/job | Portal order flow walkthrough |
| P5-05 all acceptance tests on staging, Lighthouse targets | Full staging regression |
| P5-05 restore drill executed | Follow `docs/OPERATIONS.md` §Restore drill |

## Known gaps / decisions

- **PDF invoices**: rendered as print-optimized HTML (A4 + 80mm thermal)
  at `/print/invoices/[id]` — browser "Save as PDF" produces the PDF.
  Server-side PDF generation is not implemented.
- **OTP limits**: portal OTP is app-enforced (5/hour); staff login OTP is
  Supabase Auth's built-in limit — configure in Supabase dashboard.
- **Rate limiter**: Postgres fixed-window — correct for single-region
  deploys; revisit if running multi-region.
- **Sentry**: inactive until `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are set.

## Unified accounts & brokers — staging checks (Nov 2026)

- [ ] Run migration `0016_unified-accounts-brokers` (`pnpm db:migrate`).
- [ ] Vercel env: `SUPABASE_SERVICE_ROLE_KEY`; `MESSAGING_SMS_PROVIDER=arkesel`
      + `ARKESEL_API_KEY` (or `hubtel` + `HUBTEL_CLIENT_ID`/`HUBTEL_CLIENT_SECRET`);
      approved `SMS_SENDER_ID`; `NEXT_PUBLIC_APP_URL` (used in SMS links).
- [ ] Phone sign-in delivers a real SMS and lands on the right dashboard.
- [ ] `/signup/garage` → code → `/onboarding/garage` → garage dashboard.
- [ ] One person: driver + garage + parts seller via "Add a workspace"; switcher works.
- [ ] Staff invite by phone → invitee signs in with that phone → lands in the garage.
- [ ] Guest opens `/portal/renewals` → `/login` (clean URL) → returns there after sign-in.
- [ ] Broker: sign up → driver requests quote → broker quotes (SMS) → driver accepts → complete.
- [ ] Garage "Send to broker" on a renewal → accept broker quote in renewals panel.
- [ ] Admin verifies a broker → Verified badge shows in pickers.
