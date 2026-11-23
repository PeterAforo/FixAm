# Decisions

Implementation choices and assumptions made while building FixAm. When a spec
is ambiguous, the simplest consistent option is chosen and recorded here.
Earlier spec files win on conflict (see `docs/devin-spec/specs/prompt.json`).

## P0-01 / P0-02 / P0-03 (foundation)

- **Local/mock first.** No Supabase project, Docker, or local Postgres exists
  in this environment, so external providers (Paystack, SMS, WhatsApp, email,
  push) are mocked/stubbed and DB verification is deferred. The tenant-isolation
  integration test skips unless `DATABASE_URL` is set.
- **Money = bigint pesewas.** All money columns are `bigint` minor units;
  `lib/money` formats as `GH₵ 1,250.00` (en-GH). BigInt literal defaults are
  avoided in Drizzle schema (`sql` defaults) because drizzle-kit cannot
  serialize them into snapshots.
- **IDs = UUID v7.** `lib/id.ts` generates time-ordered UUIDs; DB defaults
  stay `gen_random_uuid()` (v4) until a v7 function/default is added — app
  code should prefer `uuidv7()` when inserting.
- **FKs deferred for not-yet-built tables.** `garages.insurance_partner_id`,
  `magic_links.customer_id`, `push_subscriptions.customer_id`, and
  `audit_logs.actor_*` are plain `uuid` columns until `customers`,
  `insurance_partners`, etc. land in later phases; FKs get added then.
- **`document_sequences.next_number`** unique index includes nullable
  `branch_id`; Postgres treats NULLs as distinct, so a follow-up migration
  should switch to `NULLS NOT DISTINCT` (PG15+) or coalesce branch to a
  sentinel when sequences are first used.
- **`users.id` has no FK to `auth.users`** — Supabase owns that table; the id
  is mirrored by convention.
- **Audit logs are insert-only** via RLS (SELECT+INSERT policies only; no
  UPDATE/DELETE policies). `webhook_events` is service-role only.
- **Contrast pairs:** spec token pairs for `primary`/`danger` foregrounds meet
  WCAG AA for large/bold text (≥3:1) but not normal text (≥4.5:1). The
  contrast test encodes this distinction; revisit if the spec adds an
  `on-primary` accessible variant.
- **Dark theme = "workshop mode"** via `next-themes` class strategy; light is
  default, `prefers-color-scheme` respected (`enableSystem`).
- **shadcn on Base UI.** The scaffold's `components/ui` uses `@base-ui/react`;
  brand components in `components/brand` are spec-owned and independent.
- **Fonts via `next/font/google`** (Bricolage Grotesque, Inter, JetBrains Mono)
  — requires network at build time; builds in offline environments should
  expect font fetch failures.
- **`/design` is dev-only** (`notFound()` in production).

## Database (Supabase project fpdjerqyaqhnjdcqlztc)

- Project lives in eu-west-1 behind the aws-1 pooler; the direct db.* host is IPv6-only and unreachable from this machine, so DATABASE_URL uses the transaction pooler (6543) and DATABASE_URL_DIRECT the session pooler (5432), both with ?sslmode=require.
- drizzle-kit migrate initially failed silently without sslmode; with it, migrations apply cleanly. scripts/apply-migrations.cjs remains as a manual fallback.
- Plans seeded from specs/plans.json (starter/growth/pro); message_templates table lands with the reminders phase.

## PDFs (`lib/pdf`, `/api/pdf/*`)

- `@react-pdf/renderer` renders PDFs server-side in Node runtime route handlers.
- Invoices: `/api/pdf/invoices/[id]?format=a4|thermal` — authenticated via session +
  `resolveMembership`; A4 default, 80mm roll for thermal. The print-HTML view at
  `/print/invoices/[id]` remains for browser printing; the PDF route is additive.
- Receipts: `/api/pdf/receipts/[token]` — token-gated (same public token as `/r/[token]`),
  no session required, since the token itself is the capability.
- Credit statements: `/api/pdf/credit-statements/[id]` — authenticated + membership;
  `credit_statements.pdf_path` remains for a future object-storage attachment flow.
- `getPublicReceipt` was extended to return garage address/phone/TIN/brand colour so the
  receipt PDF can render garage letterhead without extra queries.

## i18n (next-intl)

- `next-intl` plugin + `i18n/request.ts` (locale `en`, messages from `messages/en.json`)
  and `NextIntlClientProvider` in the root layout are already wired.
- Nav labels come from `specs/ui-screens.json` (English spec strings), so
  `navLabelKey()` in `lib/nav.ts` maps spec labels → `nav.*` message keys and
  `AppShell` translates them; unknown labels fall back to the spec string.
- Remaining UI strings are still hardcoded English and migrate incrementally —
  converting every panel in one pass was judged higher-risk than the value.

## Dev tooling routes

- `/design` and `/dev/messages` (and `/dev/payments`) call `notFound()` in production —
  they are development-only surfaces, matching the spec's dev-inbox requirement.
- `docs/new/` is kept as the verbatim reference copy of the latest spec bundle;
  `docs/devin-spec/` is the merged working copy (it additionally carries the P6 phase
  in `specs/tasks.json`, which the new bundle lacked).

## P6 decisions (discovery & customer experience)

- Directory listing is plan-gated on the `directory_listing` feature flag; live plan
  rows for `growth`/`pro` were patched to include it (the spec plans file did not list it).
- Garage GPS is captured once during onboarding with a "use my location" button that
  requires explicit confirmation before saving; coordinates power near-me sorting.
- Coverage can be a whole make (`catalog_model_id` null) or a specific model; dedupe
  falls back to normalized make/model text when catalogue ids differ.
- Reviews are unique per (garage, portal phone); portal accounts may exist before a
  `customers` row — garage-less auth SMS uses a lazily-created `fixam-platform` garage
  so the allowance of real garages is never consumed.
- Portal passwords use scrypt with per-user salt + timing-safe compare (`lib/portal/password.ts`).

## Unified accounts & routing (Nov 2026)

- **One account per person, roles = workspaces.** Never add a separate login,
  user table or session cookie for a new role. A workspace is derived from
  existing rows: `memberships` (garage), `vendor_members`, `broker_members`, or
  a `portal_profiles`/`customers` row matching the user's verified phone
  (driver). See `lib/accounts/workspaces.ts`.
- **Own SMS OTP, Supabase session.** Supabase phone auth would need its own SMS
  provider config; instead FixAm verifies its code (via `portal_otps`) and mints
  a session with `admin.generateLink({type:"magiclink"})` + `verifyOtp({token_hash})`.
  Requires `SUPABASE_SERVICE_ROLE_KEY`.
- **Phone-only accounts** get an internal auth e-mail `<digits>@phone.fixam.app`
  (never shown, never mailed; blocked on the e-mail form). `public.users.email`
  is null for them. If Supabase rejects `phone` on createUser (phone provider
  off), the phone is stored in `app_metadata.phone`. **Never read identity from
  `user_metadata`** — users can edit it.
- **No query strings on auth URLs.** Role lives in the path
  (`/signup/garage`, `/onboarding/garage`). The "come back to" path lives in
  the `fixam_next` cookie (30 min, httpOnly), set by `proxy.ts` and cleared when
  the user reaches it. `postLoginDestination(next?)` resolves: explicit next →
  cookie → last-used workspace → only workspace → `/account` → `/onboarding`.
- **Sign-up ≠ sign-in visually.** `/login` is a classic split (form left, photo
  right). `/signup/<role>` uses `OnboardingFrame` so creating the account reads
  as step 1 of that role's setup.
- **Brokers are optional for garages.** Garages keep processing renewals as
  agents; "Send to broker" creates a linked `broker_requests` row. One open
  broker request per renewal.
- **Broker payments are recorded, not processed** (`paid_at` set by broker).
  Paystack split/subaccount checkout for brokers is future work.
- **Platform SMS bypasses quiet hours/allowances** (`sendDirectSms`); garage
  customer messaging still goes through `sendMessage()`.
- **Photos** are hot-linked from the Unsplash CDN (free licence only, no
  Unsplash+), rendered with `<img>` via `PhotoImg`; swap ids in `lib/images.ts`.

## Smart repair marketplace & AI — product decisions (23 Nov 2026, planned P8)

- **Customer-supplied parts allowed**, but each garage can refuse them or set a
  fitting fee (`garage_settings.accepts_customer_parts`,
  `customer_part_fitting_fee`), shown before the customer pays.
- **Delivery**: vendors' own riders first; partner courier as fallback
  (`DeliveryProvider`, manual booking to start).
- **Payments: PaySwitch theTeller** is the gateway. No split payments and no
  webhooks: FixAm collects, records holds in its own ledger, confirms status by
  polling, and pays vendors via float transfers after the garage confirms
  receipt (72 h auto-release). Paystack stays behind the adapter until migrated.
  Check Bank of Ghana rules on holding funds with PaySwitch before launch.
- **Standard parts list** (`part_types` + synonyms in local languages) is the
  backbone of matching; vendors list against it.
- **AI**: Claude API for reasoning (structured JSON, every call logged in
  `ai_calls`); **Khaya AI** for speech in Twi, Ga, Ewe, Hausa (+ Ghanaian
  English). AI output is always labelled as an estimate; nothing is saved to a
  job without a human confirming.
- **No "later" bucket** (23 Nov 2026): OBD diagnostics, photo part recognition,
  financing, breakdown/towing, pickup & drop-off, accident claims, rider
  network, WhatsApp AI assistant and pre-purchase inspections are in P8 now
  (P8-12 → P8-20). New workspaces: **tow operator** and **rider** (same
  one-account model). OBD uses Web Bluetooth (Android/Chrome); iOS support
  needs a native app.

## P8-20 pre-purchase inspections

- **Checklist items are rows, not jsonb.** The spec sketched `checklist: jsonb` on `inspections`; we store one `inspection_items` row per checklist key so inspectors can update incrementally, attach photos per item, and the public report can query flagged items without parsing JSON.
- **Share token stores only sha256.** Same pattern as invoices/passports � the raw `/i/<token>` is returned once at completion and sent by SMS; only `share_token_hash` persists.
- **Cost estimates grounded in garage invoice history.** `garagePriceHints` feeds the garage's recent invoice-line averages into the `inspection_report` prompt; output is labelled estimates, never quotes.
- **Payment via existing theTeller reconcile.** Inspections store `payment_reference`; `reconcileReference` gained a third lookup before vendor orders � no new webhook needed.


## P8-21 — launch readiness notes

- **theTeller has no webhooks.** Settlement relies on the customer return
  redirect (`/payments/return/[reference]/[to]`) plus the Inngest
  `reconcileReference` sweep. The legacy `/api/webhooks/paystack` route and
  `lib/money/paystack-webhook.ts` remain for the mock provider path but are
  dead code once `PAYMENT_PROVIDER=theteller`; remove in a cleanup pass.
- **Production env gate.** `lib/env.ts` runs from `instrumentation.ts` and
  throws at startup when required vars (core + theTeller creds when
  `PAYMENT_PROVIDER=theteller`) are missing — a misconfigured deploy fails
  loudly instead of serving broken payments.
- **E2E in CI is opt-in via secrets.** `tests/e2e` needs a seeded
  environment, so the CI step only runs when `PLAYWRIGHT_BASE_URL` (and
  credentials) secrets exist; `check-rls` likewise enforces only when
  `DATABASE_URL` is present.
