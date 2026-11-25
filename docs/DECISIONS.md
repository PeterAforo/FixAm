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
  cookie → saved default → last-used workspace → highest-ranked workspace →
  `/onboarding` (no picker since 24 Nov 2026 — see "Landing workspace" below).
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
- **Share token stores only sha256.** Same pattern as invoices/passports — the raw `/i/<token>` is returned once at completion and sent by SMS; only `share_token_hash` persists.
- **Cost estimates grounded in garage invoice history.** `garagePriceHints` feeds the garage's recent invoice-line averages into the `inspection_report` prompt; output is labelled estimates, never quotes.
- **Payment via existing theTeller reconcile.** Inspections store `payment_reference`; `reconcileReference` gained a third lookup before vendor orders — no new webhook needed.


## P8-21 — launch readiness notes

- **theTeller has no webhooks.** Settlement relies on the customer return
  redirect (`/api/payments/return/[reference]/[to]`) plus the Inngest
  `reconcileReference` sweep. The legacy `/api/webhooks/paystack` route and
  `verifyPaystackSignature` were removed (Nov 2026 cleanup); settlement
  lives in `lib/money/payment-settle.ts` (`handlePaymentSettled`). Legacy
  `paystack_*` column names remain as storage identifiers — they hold
  theTeller/mock references now.
- **Production env gate.** `lib/env.ts` runs from `instrumentation.ts` and
  throws at startup when required vars (core + theTeller creds when
  `PAYMENT_PROVIDER=theteller`) are missing — a misconfigured deploy fails
  loudly instead of serving broken payments.
- **E2E in CI is opt-in via secrets.** `tests/e2e` needs a seeded
  environment, so the CI step only runs when `PLAYWRIGHT_BASE_URL` (and
  credentials) secrets exist; `check-rls` likewise enforces only when
  `DATABASE_URL` is present.

## Subscriptions for every workspace (Nov 2026)

- **Two subscription tables, one access rule.** Garages keep the legacy
  `subscriptions` table (existing billing code, admin console and
  `accessState()` untouched); the other five roles use
  `account_subscriptions` keyed by `(owner_kind, owner_id)`. Both share the
  same status/grace semantics and both accept `pending_payment_reference`
  so `reconcileReference()` can settle either kind of checkout.
- **No auto-debit.** theTeller only supports one-off MoMo/card charges, so
  "charged after the trial" is implemented as trial end → SMS/email
  reminders → hosted checkout → `active` on reconcile → 7-day grace →
  read-only paywall (`SubscriptionGate` in each workspace layout). True
  recurring billing needs a provider with tokenized mandates.
- **Prices are admin-owned.** `plans.audience` scopes each plan to a
  workspace role; `/admin/plans` is the only place prices/limits are set
  (platform admin, Zod-validated, audit-logged). Seeded spec prices stay
  `null` placeholders.
- **Trial is real for new garages.** `createGarage` now records the plan
  the owner picked and drops `isComplimentary` — only pilot garages keep
  the never-expiring complimentary sub.

## Garage suspension (24 Nov 2026)

- **Suspend = staff locked out.** The gate lives in `resolveMembership`, so
  every garage page, server action and PDF route refuses a suspended
  garage's staff without per-feature checks. Public links customers already
  hold (trackers, approval and payment links) are token-based and keep
  working, so a suspension never strands a customer mid-repair.
- **Platform admins can still "View as owner"** a suspended garage (the
  impersonation check runs before the status check) so support can
  investigate before reactivating.

## Public "near me" finders (24 Nov 2026)

- **Location stays in the URL, not the database.** `/parts` and `/brokers`
  take `lat`/`lng` from the browser (or a preset area) and only use them to
  sort; nothing is stored. Points outside Ghana's rough bounding box are
  ignored.
- **No map library.** The "around you" plot places results by real
  direction and distance around the searcher. It is honest about not being
  a street map and adds no dependency or API key; "Directions" hands off to
  Google Maps.
- **Brokers pin their own office.** Until they do, they're listed
  separately ("Not on the map yet") rather than guessed from the city.
- **Hand-off to sign-in uses a path for brokers** (`/portal/renewals/ask/
  <kind>/<ids>`) and the proxy now remembers the query string for the rest.

## Shared staff & invites for non-garage workspaces (24 Nov 2026)

- **One invites table for vendor/broker/tow.** `workspace_invites` mirrors the garage `memberships` invite pattern (hashed token, contact match, auto-accept on sign-in) but keyed by `(kind, workspace_id)` since those workspaces have separate member tables. Garages keep their existing flow.
- **Member `status` column = the off switch.** `active|paused` on all three member tables; every membership lookup filters on it so pause/remove bites on the next request — same guarantee as suspended garages.
- **Owner is never invitable.** Ownership transfer will be a dedicated fresh-code flow; until then the last active owner can't be demoted, paused or removed.
- **Vendor keeps `vendor_owner`; new staff roles are `vendor_*`.** Existing `vendor_owner`/`vendor_staff` permission grants keep working — new roles map to staff-level `can()` grants in roles-permissions.json.

## Landing workspace and grouped sidebar (24 Nov 2026)

- **Sign-in never stops at a picker.** Order: saved default (all devices) →
  last used on this device (cookie) → rank (garage, parts shop, broker, tow,
  rider, admin, driver; owners first). A person who runs a business almost
  always signs in to work in it.
- **Other workspaces are menus, not a dropdown.** Each shows the same items
  its own sidebar would (garage items by role), so a garage owner who also
  drives reaches "Renewals" in one click without leaving context first.
- **Links go through `/switch`** (a route handler) so the move is remembered
  without a client round-trip; it only opens pages inside the target
  workspace.

## Pricing, trial end and integrations (25 Nov 2026)

- **Garages pay; everyone else joins free.** Garage plans Starter GH₵149,
  Growth GH₵349, Pro GH₵799 a month. Drivers free. Parts sellers free + 6% per
  paid order (Seller Pro GH₵99: 3% and top placement). Brokers free with 5
  quotes a month (Broker Pro GH₵149: unlimited). Tow 10% of each MoMo-paid
  tow; riders 10% of each delivery fee. Rates live in `platform_settings`
  (admin → Plans & pricing → Fees & free places), not in code.
- **Paid plans only for garages; read-only after the trial.** 14-day trial →
  7 days' grace → read-only (data kept, export allowed). No free garage tier.
  Reminders at 7 days left (with jobs/money so far), 2 days, last day, trial
  end, and 2 days before read-only.
- **Free places are admin-granted and capped.** "Make free" on a garage sets
  `is_complimentary`; capped by `free_garage_places` (default 10). Removing a
  free place gives 7 days to pay.
- **Plans that cost nothing never lock.** `accessState` treats price-0 plans as
  always OK, and the billing sweep moves them to active at trial end.
- **Providers are data, not deploys.** `/admin/integrations` saves payment and
  SMS provider keys AES-256-GCM encrypted (`PAYOUT_ENCRYPTION_KEY`); one active
  per category; none active → env vars as before. theTeller stays the default
  gateway and the only payout rail. Paystack added for collections; SMS:
  Arkesel, Hubtel, mNotify, or any HTTP API via a URL + body template.
- **Payments remember their gateway.** `payment_gateway_refs` records which
  gateway took each reference so verify/refund go back to it after a switch.
