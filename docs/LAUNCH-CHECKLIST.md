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
- theTeller payments: checkout via `lib/integrations/payments/theteller.ts`,
  settlement only via signature-verified webhook + `reconcileReference`,
  idempotent via `webhook_events` (`lib/money/payments.ts`,
  `lib/integrations/payments.ts`).
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
| P2-02 MoMo test payment via theTeller webhook | theTeller test keys on staging |
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

## Phase 8 — acceptance criteria status (P8-01 ? P8-21)

Each criterion is marked **verified in code/tests** (with the test file) or
**needs staging** (hardware, live API, or real database required).

| Task | Criterion | Status |
|---|---|---|
| P8-01 | Garage seasonal campaigns (harmattan/rainy) send via approved templates, SMS fallback, `/u/<token>` opt-out | needs staging — Meta template approval + live sends (`lib/seasonal/*`, `lib/messaging/templates.test.ts`) |
| P8-02 | Part-photo recognition suggests parts from a photo | needs staging — real Anthropic vision + garage photo eval (`scripts/eval-part-photos.ts`, target =80% top-1) |
| P8-03 | Customer parts ordering ? vendor fulfil ? delivery | needs staging — live delivery partner (`lib/part-offers`, vendor order flow) |
| P8-04 | OBD scan via Android Web Bluetooth (ELM327) | needs staging — physical adapter + Android Chrome (`lib/obd/*`, `components/obd/*`) |
| P8-05 | Pay-later / financing instalments | verified in code/tests (`lib/financing/core.test.ts`); live lender is a stand-in — see Not real yet |
| P8-06 | Towing SOS ? operator dispatch ? live tracking ? settlement | needs staging — two real phones + GPS (`lib/towing/*`, `tests/e2e/flows.spec.ts` flow 6) |
| P8-07 | Pickup & drop-off runs with PINs, photos, `/p/<token>` handover | needs staging — real devices + photos (`lib/pickups/*`, flows.spec flow 3) |
| P8-08 | Public vehicle passport `/v/<token>` + printable passport + QR | verified in code/tests (`lib/passport/core.test.ts`); QR scan on a phone — needs staging |
| P8-09 | Driver marketplace / service discovery | verified in code/tests (unit suites); live directory data — needs staging |
| P8-10 | Garage analytics / fixam score | verified in code/tests (`lib/domain` score tests) |
| P8-11 | WhatsApp template messaging to customers | needs staging — Meta template approvals (`message-templates.json`, `lib/messaging/templates.test.ts`) |
| P8-12 | Multi-branch / fleet operations | verified in code/tests (RLS + permission suites) |
| P8-13 | Insurance & DVLA renewal reminders with partner links | verified in code/tests; live partner feeds — needs staging |
| P8-14 | Customer portal depth (history, documents, privacy) | verified in code/tests; phone OTP on a real SIM — needs staging |
| P8-15 | Voice notes for job notes (Khaya ASR, tw/gaa/ee/ha) | needs staging — funded Khaya key + real voice notes (`lib/jobs/voice-*`) |
| P8-16 | Workshop rules / quality gates | verified in code/tests (`lib/jobs` rule tests) |
| P8-17 | Accident & insurance claims wizard ? broker/garage ? statuses ? repair authorisation | verified in code/tests (`lib/claims/core.test.ts`); SMS delivery + live insurer routing — needs staging |
| P8-18 | FixAm rider network: onboarding, admin approval, dispatch, PINs, escrow payout | verified in code/tests (`lib/riders/*`); MoMo payout + GPS — needs staging |
| P8-19 | Garage WhatsApp AI assistant: webhook, tools, inbox takeover, 24h window | verified in code/tests (`lib/whatsapp/*`); live Meta webhook + approved `fixam_assistant_reply` template — needs staging |
| P8-20 | Pre-purchase inspections: booking+payment, ~120-point checklist, OBD attach, AI summary, PDF, `/i/<token>` share, passport link | verified in code/tests (`lib/inspections/core.test.ts`); theTeller charge + PDF fidelity on a phone — needs staging |
| P8-21 | Launch readiness: checklist, env audit, `check-rls`, Playwright flows 1–8, staging plan | this document + `scripts/check-rls.ts` + `tests/e2e/flows.spec.ts` + `docs/STAGING-TEST-PLAN.md` |

## Not real yet — stand-ins and what replaces them

- **Mock lender (`FINANCING_PROVIDER=mock`)** — pay-later plans run on a
  simulated lender at `FINANCING_MOCK_MONTHLY_RATE_BP`. Replacing it: sign a
  lender, implement their API in `lib/integrations/financing.ts`, set
  `FINANCING_PROVIDER=<lender>` + credentials.
- **0% tow commission** — towing settlement currently pays operators without
  a platform commission; it is an owner pricing decision, not a bug. Change
  `lib/towing` settlement split when decided.
- **HTML-print invoice PDFs** — invoices render print-optimized HTML at
  `/print/invoices/[id]`; "Save as PDF" in the browser is the PDF. Server-side
  PDF (like inspection reports via `@react-pdf/renderer`) is future work.
- **Sentry off** — `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` unset ? SDK no-ops.
  Set DSNs + org/project/auth token to enable error tracking and source maps.
- **Mock adapters on by default** — `lib/integrations/index.ts` defaults to
  `mock` for payments (`PAYMENT_PROVIDER`), delivery (`DELIVERY_PROVIDER`),
  AI (`AI_PROVIDER`), speech (`SPEECH_PROVIDER`), financing
  (`FINANCING_PROVIDER`), and SMS (`MESSAGING_SMS_PROVIDER`). Production must
  set real providers; `lib/env.ts` fails startup when theTeller is selected
  without credentials.
- **SMS provider** — `MESSAGING_SMS_PROVIDER=mock` shows codes on screen in
  dev only; production needs `arkesel` or `hubtel` credentials.
- **WhatsApp assistant** — works end-to-end only after Meta approves the
  `fixam_assistant_reply` template and webhook env vars are set.
