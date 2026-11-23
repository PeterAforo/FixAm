# Changelog

## Unreleased — P8 Smart repair marketplace (in progress)

### P8-10 Vehicle passport ✅
- One public history page per car (`/v/<token>`), built from every FixAm
  garage that has serviced that plate: completed visits (date, garage and
  city, mileage, the work done, parts replaced with proof), a mileage check
  ("only went up" or a warning if it went down) with a small chart, and
  whether insurance, roadworthy and registration are current (month only).
- Never shows the owner's name or phone, prices, notes, complaint text,
  policy numbers or the driver's licence. Phone numbers and e-mails typed
  into work lines are stripped. The page is not indexed by search engines.
- The owner controls it from the car's page in the driver app: on/off
  (off by default), show/hide mileage, show/hide garage names, copy the
  link, share on WhatsApp, view count, and **Get a new link** (old links
  and stickers stop working). A new owner of the car takes over
  automatically; the passport switches off and gets a fresh link.
- Printable QR sticker sheet (`/print/passport/<vehicleId>`, 4 stickers on
  A4). New dependency: `qrcode` (run `npm install`).
- Migration `0025_vehicle-passport`.

### P8-09 Fair-quote check ✅
- Every issued invoice now feeds anonymised **price observations**
  (`price_observations`): part unit prices by standard part type, and labour
  per hour, grouped by car class (saloon, SUV/pickup, premium, commercial,
  motorbike) and the garage's city. Customer-supplied parts are skipped;
  voiding an invoice removes its prices; a nightly job backfills misses.
- A price is compared with the middle half of recent prices (last 18 months).
  A range is shown **only with at least 5 prices from 3 or more garages**, and
  a garage's own prices never count in its own check. Falls back from city to
  all of Ghana when a city has too few.
- "Fair price / Above typical / Below typical" badges on the customer's
  estimate approval page and on the garage job card, with the range and the
  number of prices behind it. No garage is ever named.
- Driver app → **Price check** (`/portal/price-check`): check any quote
  ("is GH₵450 for brake pads on a Corolla in Kumasi fair?").
- Migration `0024_fair-quote`.

### P8-08 Voice job notes → structured job card ✅
- "Talk through the job" on the mechanic's job screen and the job card
  Findings tab: speak in Twi/Ga/Ewe/Hausa/English (or type) → AI (`job_notes`
  prompt; rules fallback) drafts findings (severity + replace/repair/monitor),
  tasks, parts (matched to the standard parts list) and labour hours.
- The mechanic edits and ticks entries; **nothing is saved until "Save
  selected"**. Parts land at GH₵0 for the advisor to price; labour uses the
  garage's default labour rate.

### P8-07 Old-part proof and before/after media ✅
- Each part line on the job card needs **old-part proof**: a photo (stored as
  job media, stage `old_part`), "customer took it", or "not a replacement".
  Issuing an invoice for a job is blocked until every billable part line has
  proof. Settings → Workshop rules turns this off (default on).
- Customer tracker (`/t/…`) now groups media into **Before**, **After** and
  **Old parts we replaced**, and plays short videos.
- Migration `0023_old-part-proof`.

### P8-06 Complaint-first repair requests + AI triage ✅
- Driver app → **Get it fixed** (also `/request`, a shareable link): type the
  problem or say it in Twi/Ga/Ewe/Hausa (voice note → English), pick the car,
  tap warning lights, add photos or a short video, then send to **my garage**
  or **garages near me** (GPS or area, 5–50 km).
- AI triage in seconds (`triage` prompt, photos included; keyword rules when AI
  is off): likely causes, urgency (stop driving / fix soon / can wait) with a
  safety note, Ghana cost range, specialty, likely parts (linked to Buy parts),
  follow-up questions.
- Broadcast matching (`matchGarages`): radius (or same city/region without
  GPS), garage specialties (Settings → Repair leads; none = general) and make
  coverage. Matching garages get an SMS.
- Garage **Leads** inbox (new nav item): complaint, original words, media,
  triage, distance; "Send offer" (price range, inspection fee, earliest time,
  message) or "Not for us". Driver compares offers (price, distance, rating)
  and taps **Book this** → a confirmed booking at that garage.
- Check-in from that booking links the request to the job; the job card shows
  the driver's request, media and triage.
- Migration `0022_repair-requests`.

### P8-04 Diagnosis → instant part offers ✅
- Findings get a recommendation (replace / repair / monitor). A "replace"
  finding or a part line is mapped to a standard part: instant rules match
  first, Claude (`map_part_type` prompt, picks only from candidates) when the
  rules are unsure; a "Which part?" picker is the fallback.
- Offers panel on the job card: own stock first ("Use this"), then up to six
  vendor offers for this exact car, ranked by fit, price incl. delivery to the
  garage, ETA and seller rating (`lib/part-offers`). "Order to garage" places
  a job-linked vendor order in one tap; "Add to estimate" adds the part line.
- Estimate approval link: for each approved part line the customer can pick
  **Garage supplies it** or **I'll buy it on FixAm** (best deliverable offer,
  delivered to the garage, fitting fee shown). Buying creates the vendor order
  linked to the job, zeroes that line so the garage's markup applies only to
  parts it supplies, and sends the customer to pay. Their orders also show in
  the driver app's My orders (matched by phone).
- Migration `0021_diagnosis-part-offers` (job_items.part_type_id /
  part_type_confidence / supply_mode / vendor_order_id, job_findings
  recommendation + part_type_id, parts.part_type_id).

### P8-03 Drivers buy parts, delivered to their garage ✅
- Driver app → **Buy parts**: pick the car, search, see only parts that fit
  (P8-01 fitment), basket, and choose **my garage / another garage / deliver to
  me / pick up**. Delivery fee per vendor zone and the garage's fitting fee are
  shown before paying; garages that don't fit customer parts can't be chosen.
- Pays through theTeller into escrow; one reference covers the whole basket.
  **My orders**: progress bar, rider details, "I've got it" (home/pickup),
  "Report a problem", "Pay now" for unpaid baskets.
- Vendors: destination + buyer phone on each order; "Out for delivery" asks
  for the rider's name/phone or books a partner courier (`DeliveryProvider`,
  manual first). Driver orders can't ship before payment confirms. Buyers get
  SMS at each step.
- Garages: **Incoming parts** page — "It's here — take photo" stores the photo
  and releases the vendor's money plus the fitting fee. Settings → **Customer
  parts & payouts**: accept toggle, fitting fee, encrypted payout account.
- Garage payouts: fitting fees and **online invoice payments** (theTeller
  collects into FixAm's account) are queued as payouts to the garage
  (`queueGarageSettlement`, idempotent per payment).
- Migration `0020_driver-parts-orders` (vendor_orders.garage_id now nullable,
  new order/delivery columns, garage settings, payouts.idempotency_key,
  `customer_direct` order origin).

### P8-02 theTeller payments, escrow & payouts ✅
- `PAYMENT_PROVIDER=theteller`: hosted checkout, MoMo direct debit (000200),
  status check, card reversal, and float payouts to MoMo (404000) and bank
  (404020 → name check → authorize). Mock keeps working without keys.
- Every payment uses a 12-digit reference from the `payment_txn_seq` sequence.
- theTeller has no webhooks: `/api/payments/return/{ref}/{path}` confirms on
  return, and the Inngest `payments-pending-poller` (every 5 min) settles the
  rest — invoices, instalments and vendor orders alike.
- Escrow (`escrow_holds`): marketplace and shop orders paid online are held
  until the garage receives them (or 72 h after the vendor marks delivered),
  then released net of commission. Vendor cancellation refunds the buyer.
  Garages can "Report a problem", which freezes the money.
- Payouts (`payouts`): queued on release, sent immediately via Inngest, retried
  with backoff (new transaction id only after confirming the old one failed),
  admin alerted after 5 attempts or when a vendor has no payout account.
- Append-only `ledger_entries` with unique idempotency keys (DB trigger blocks
  edits); every movement is audit-logged.
- Vendor → Payouts: held / on the way / paid out, payout history, and an
  encrypted MoMo or bank payout account (`PAYOUT_ENCRYPTION_KEY`).
- Admin → Payments held & payouts: release or refund disputes with a note,
  retry blocked payouts.
- Migration `0019_escrow-payouts`.

### P8-05 AI + speech providers ✅
- `AiProvider` (Claude Messages API, structured output via a forced tool call,
  image input) and `SpeechProvider` (Khaya ASR + translation for Twi, Ga, Ewe,
  Hausa), each with a mock. `AI_PROVIDER` / `SPEECH_PROVIDER` select; a missing
  key falls back to the mock (`lib/integrations/ai.ts`).
- Prompt registry (`lib/ai/prompts.ts`) with versions, zod-validated answers
  and mock answers; `runPrompt` PII-minimises text (phones, e-mails, Ghana
  Card, plates) before it leaves FixAm and never throws.
- Voice notes: `transcribeVoiceNote` → transcript + English (Khaya, then Claude
  fallback); `transcribeVoiceNoteAction` (rate-limited, 5 MB cap) and a
  reusable `<VoiceNoteButton>` with language picker.
- New `ai_calls` table (migration `0018_ai-calls`): provider, model, prompt
  key/version, tokens, voice seconds, micro-USD cost, status, latency per
  garage/user. Content is never stored. Admin → AI usage (30 days).

### P8-01 Standard parts list & fitment ✅
- New `part_types` table seeded with 153 common parts across 13 categories
  (`lib/parts-catalog/seed.ts`, migration `0017_parts-catalog`).
- `vendor_products` gain `part_type_id`, `condition` (genuine | aftermarket |
  home_used), fitment (`fit_make`, `fit_model`, `fit_year_from/to`),
  `oem_number`, `warranty_days`.
- `lib/parts-catalog/actions.ts`: `listPartTypes`, `searchPartTypes`
  (names + synonyms), `matchPartTypeText` (free text → part type, no AI),
  `findFittingProducts` (approved vendors, fit-level ranking), admin upsert.
- Vendor catalogue: part-type picker, condition, "fits" make/model/years, OEM
  number, warranty; table flags products not linked to a part type. CSV import
  accepts `part type`, `condition`, `fits make`, `fits model`, `year from`,
  `year to`, `oem number`, `warranty days`.
- Admin → Parts list: search, add parts, and add local-language names.

## Unreleased — Unified accounts, brokers & premium redesign (Nov 2026)

### Accounts & auth
- **One account for every role.** Drivers, garage staff, parts sellers and
  insurance/DVLA brokers all use the same Supabase account. The old separate
  driver-portal login (own OTP cookie + password) is retired; portal data is
  keyed by the account's verified phone (`getPortalPhone()` → session phone).
- **Phone sign-in** (`lib/auth/phone-auth.ts`): FixAm sends/verifies its own
  6-digit SMS code and mints a Supabase session; e-mail + password remains as a
  fallback. Adding/verifying a phone on an e-mail account is supported.
- **Clean auth URLs** (no query strings): `/login` (sign in only), `/signup`
  (role picker), `/signup/<role>` (create account), `/onboarding` (signed-in
  role picker), `/onboarding/<role>` (setup wizard), `/account` (workspace hub).
  Roles: `garage`, `driver`, `parts-seller`, `insurance-broker`, `dvla-agent`.
- `proxy.ts` gates protected areas, stores the post-login destination in the
  `fixam_next` cookie, and rewrites legacy `?next=` / `?role=` links.
- **Workspace switcher** in every sidebar (garage, parts shop, broker, My cars)
  + "Add a workspace"; last-used workspace remembered (`fixam_ws` cookie).

### Brokers (new)
- Tables `brokers`, `broker_members`, `broker_requests`,
  `broker_request_events` (migration `0016_unified-accounts-brokers`; also makes
  `users.email` nullable).
- Broker workspace `/broker`: dashboard, requests inbox, request detail
  (quote → accept → processing → complete, mark paid, notes, timeline),
  business settings.
- Drivers request quotes at `/portal/renewals`; garages can **Send to broker**
  from a renewal and accept/decline the broker's quote. Garages can still
  process renewals themselves.
- Admin: verify / suspend brokers.

### Messaging
- Real SMS adapters: Arkesel and Hubtel (`lib/integrations/messaging/ghana-sms.ts`).
- `lib/messaging/direct.ts` for platform transactional SMS (codes, broker
  alerts) — bypasses garage quiet hours/allowances.

### UI
- Premium redesign across marketing, auth, staff app, directory, portal;
  new About/Contact/Support/Privacy/Terms pages.
- Curated free Unsplash photography (`lib/images.ts`, `components/marketing/photo.tsx`).
- Onboarding fits the viewport (no page scroll) with a ~46% photo rail
  (`OnboardingFrame`), shared by every role's setup.
- Parts-seller dashboard restyled and moved into the shared `WorkspaceShell`.

## Unreleased — hardening & launch gap closure

### Added
- PDF generation via `@react-pdf/renderer`: invoices (A4 + 80mm thermal),
  payment receipts, and credit statements under `/api/pdf/*`, with download
  links on the print view, public receipt page, and credit account statements.
- i18n scaffolding exercised end-to-end: `nav.*` message keys in
  `messages/en.json` translated through `next-intl` in the app shell (desktop
  sidebar + mobile bottom bar).
- Spec bundle merge: `specs/ui-ux.json` (Premium UI/UX spec), updated
  `ui-screens.json`, `seed-data.json`, `prompt.json`, `plans.json`, `PRD.md`.

## P6 — Discovery & customer experience

- Ghana vehicle make/model catalogue with database-backed pickers.
- Customer self-registration: OTP + username/password, claimed vehicles,
  profile settings, avatar upload.
- Garage GPS capture during onboarding (with confirm-location step) and a
  public directory with search, near-me distance sorting, and public profiles
  gated on the `directory_listing` plan feature.
- Garage vehicle coverage management and make/model service matching.
- Customer reviews/ratings with garage-side moderation.
- Vendor verification badge (admin-controlled).

## P5 — Platform & launch

- Subscription billing, plan limits, and plan-feature gating.
- Platform admin console: garages, impersonation (audited), analytics.
- Mechanic gamification: stats, badges, leaderboard.
- Fleet accounts: portal fleet view, bulk approvals, reports.
- Hardening: rate limits, privacy requests, Sentry, ops docs, launch checklist.

## P4 — Renewals & reminders

- Oil change records with grade-based intervals and mileage nudges.
- Insurance policies and DVLA records with fee table and reminders.
- Reminder action pages at `/t/[token]`; agent renewal workflow.
- Customer portal.

## P3 — Parts & vendors

- Inventory, purchase orders, stock movements, vendors, marketplace orders.

## P2 — Money

- Invoices, payments (Paystack + manual), receipts, credit accounts,
  credit statements, expenses, financial immutability rules.

## P1 — Core workshop

- Jobs/kanban, bookings, estimates, check-in, templates, staff/roles/branches.

## P0 — Foundations

- Next.js 16 App Router scaffold (TypeScript strict, Tailwind v4, ESLint,
  pnpm); Pit Stop Pop design tokens + brand components; Drizzle schema with
  RLS; `lib/money` (pesewa bigint) and `lib/id` (UUID v7); Vitest + Playwright
  + CI; Supabase project wiring; seed data and demo garage.
