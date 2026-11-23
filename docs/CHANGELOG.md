# Changelog

## Unreleased — P8 Smart repair marketplace (in progress)

### Hotfix — `/i/[token]` prerender failure
- **Inspection share page** (`app/i/[token]/page.tsx`): moved `connection()`,
  `params` and `loadPublicInspection()` into a `<Suspense>`-wrapped child,
  matching `/v/[token]` and `/p/[token]`. Fixes the Next.js 16 Cache
  Components error "uncached or runtime data during prerendering" that
  failed the Vercel static-generation step. Route behaviour unchanged
  (token → report → `notFound()` → `InspectionReportView`).

### P8-21 Launch readiness ✅
- **Launch checklist updated** (`docs/LAUNCH-CHECKLIST.md`): all Paystack
  references replaced with theTeller, a full P8-01→P8-21 acceptance table
  (verified-in-tests vs needs-staging), and a "Not real yet" section listing
  every stand-in (mock lender, 0% tow commission, HTML-print invoices, Sentry
  off, mock adapters).
- **Env audit**: `.env.example` completed — Paystack block removed, all
  `process.env` reads documented with required/optional + safe defaults
  (`LINK_SIGNING_SECRET`, `SMS_WEBHOOK_SECRET`, `FINANCING_*`, support
  contacts, theTeller extras).
- **Production startup check**: `lib/env.ts` (called from
  `instrumentation.ts`) throws at boot when required vars are missing —
  core vars always, theTeller credentials when `PAYMENT_PROVIDER=theteller`.
- **`scripts/check-rls.ts` + `pnpm check:rls`**: lists public tables without
  RLS, exits non-zero if any exist; wired into CI (enforces when the
  `DATABASE_URL` secret is set).
- **Playwright flows 1–8** (`tests/e2e/flows.spec.ts`): garage lifecycle,
  job→invoice→receipt, public booking/PIN handover, repair requests,
  parts ordering, towing SOS, all P8 surfaces (claims/riders/inbox/
  inspections/`/i/<token>`), and cross-tenant isolation — env-gated like the
  existing auth spec; e2e CI step runs only when staging secrets exist.
- **Docs**: `docs/STAGING-TEST-PLAN.md` (owner phone checklist) and a
  "First deploy" runbook in `docs/OPERATIONS.md` (migrations + RLS query,
  env vars by feature, theTeller notes, WhatsApp webhook + all 43 Meta
  template names, Inngest, storage buckets, staging-only seed).
- **Bug fixes from this task**: none — no e2e run against a live seeded
  environment was possible in this session; flows are written to skip cleanly
  until `PLAYWRIGHT_*` secrets are configured (see staging test plan).

### P8-20 Pre-purchase inspections ✅
- **Garage settings**: `offers_inspections` + `inspection_price` (pesewas) on
  `garage_settings`, edited in Settings → "Pre-purchase inspections".
- **Driver booking** (`/portal/inspections`): pick a garage, describe the car
  (make/model/year/plate/VIN/mileage), choose **at the garage** or **the
  seller's location** (seller name/phone/address captured), preferred time —
  then pay upfront via theTeller (MoMo charge or hosted card checkout).
  Payment reconciles through `reconcileReference` → status `booked`.
- **`inspector` staff role** (`inspections.perform`): new hireable role in
  staff settings; nav entry "Inspections" for owner/manager/mechanic/inspector.
- **~120-point checklist** in `lib/inspections/core.ts` as data across 10
  sections (body & paint, flood/accident signs, engine, transmission,
  suspension, brakes, electrics, interior, tyres, test drive). Each item:
  pass / attention / fail / n-a, optional note and photo (≤3.5 MB, storage
  provider). Unit-tested.
- **Garage runner** (`/g/<slug>/inspections/<id>`): start inspection → work
  through sections → attach an **OBD scan** via the existing Bluetooth
  scanner (`obd_scans.inspection_id`, new `inspection` ctx) → test-drive
  notes → **complete**.
- **AI report**: `runPrompt` (`inspection_report`) writes a plain-language
  verdict + itemised **estimated repair costs in pesewas**, grounded in the
  garage's own recent invoice-line prices (`garagePriceHints`) and labelled
  as estimates.
- **Share & print**: completion issues a hashed share token → public report
  at `/i/<token>` (stores only the sha256) and an SMS to the driver. Printable
  report at `/print/inspection/<id>`.
- **Passport**: completed inspections matching the car's plate (or linked
  `vehicle_id` after purchase via "Attach to passport" in the portal) appear
  on the public vehicle passport `/v/<token>`.
- Migration `0035_inspections` (`inspections`, `inspection_items`,
  `garage_settings.offers_inspections/inspection_price`).

### P8-19 Garage WhatsApp AI assistant ✅
- **Webhook**: `GET/POST /api/webhooks/whatsapp` — Meta verification
  challenge (`WHATSAPP_VERIFY_TOKEN`) and `X-Hub-Signature-256` verification
  via `verifyWhatsAppSignature` (`WHATSAPP_APP_SECRET`). Inbound messages are
  idempotent on the provider message id (`webhook_events`); media ids are
  stored for later fetch.
- **Routing**: one shared FixAm number by default; a garage can set its own
  `whatsapp_number` / `whatsapp_phone_number_id` in Settings → WhatsApp.
  The sender's phone is matched to a customer (respecting
  `customers.whatsapp_opt_in`); if they belong to several garages the AI
  asks which one (`pending_garage` state).
- **AI assistant**: `runPrompt` with tools that only call existing services —
  job status/tracker lookup, garage hours/directions, bookings, estimate /
  approval / payment links, repair requests — never direct DB writes. Voice
  notes are transcribed through `SpeechProvider` (tw/gaa/ee/ha/en). When the
  model is unsure it sends a **human-handoff** message instead of guessing.
- **Garage inbox** (`/g/[slug]/inbox`): conversation list + thread with mode
  badge, unread count and AI tool-call trace. **Take over** pauses the AI for
  that conversation; **hand back to AI** resumes it. Staff replies go out over
  WhatsApp; outside the 24 h customer-service window they go as the approved
  `fixam_assistant_reply` template (SMS fallback if the template isn't
  approved yet).
- **Settings**: `whatsapp_ai_enabled` toggle + number fields on
  `garage_settings`; `whatsapp.inbox` permission for owner/manager/service
  advisor. Per-garage opt-in defaults off.
- Migration `0034_whatsapp` (`whatsapp_conversations`, `whatsapp_messages`).

### P8-18 FixAm rider network ✅
- **New workspace & role `rider`** — `/onboarding/rider` setup (Ghana Card,
  motorbike + licence photos, MoMo payout) → `/rider` with Deliveries and
  Earnings tabs. Riders must be **admin-approved and Ghana-Card-verified**
  before they can go online; the admin queue lives on `/admin` ("FixAm
  riders" — approve, suspend, verify the card against the physical one).
- **Privacy**: the Ghana Card number is AES-256-GCM encrypted with
  `PAYOUT_ENCRYPTION_KEY` (same helper family as payout accounts); only the
  last 4 digits are stored in the clear and the full number is never logged
  or shown. MoMo payout details reuse the encrypted `PayoutAccount` JSON.
- **Dispatch**: on a vendor order the vendor picks own rider, **FixAm rider**
  or partner courier. A FixAm-rider job (`deliveries`, `courier=fixam_rider`)
  fans out to the nearest online approved riders (5 km → +5 km per sweep up
  to 25 km, 10 riders per round, 30-min TTL) — an Inngest sweep every 2 min
  widens unanswered offers and fails expired ones.
- **Delivery flow**: accept/pass → collect with the **pickup PIN** the vendor
  sees in `/vendor` → live location (~15 s) → drop-off with **photo +
  receiver PIN** (the buyer gets the PIN by SMS when the rider collects).
  Delivered confirms the vendor order, releases the escrow hold like a
  normal delivery, and queues the rider's MoMo payout via escrow
  (`rider_payable` ledger account, `rider_earning` payout purpose) funded by
  FixAm's float.
- **Earnings**: `/rider/earnings` shows lifetime total, deliveries and a
  per-job history; each confirmed delivery increments `completed_jobs`.
- Migration `0033_riders` (`riders`, `deliveries`, `delivery_offers`).

### P8-17 Accident & insurance claims ✅
- **Driver claim wizard** (`/portal/claims/new`, drafts autosave and can be
  resumed at `/portal/claims/[id]/edit`): when/where (GPS pin button), up to 6
  damage photos, police report number + upload, other driver's details,
  injuries yes/no, vehicle, preferred garage and broker. Built for a phone —
  one screen per topic.
- **Routing**: the claim goes to the driver's chosen broker, else their most
  recent broker, else the insurer contact on the vehicle's current policy.
  Brokers get a **Claims** tab in `/broker` (list + detail); garages get a
  **Claims** screen (`/g/<slug>/claims`) for claims naming them.
- **Statuses** `draft → submitted → assessing → approved | partially_approved
  | rejected → repair_authorised → settled`, enforced in `lib/claims/core.ts`
  with tests; every change writes an `insurance_claim_events` timeline row.
- **Garage side**: link a job and record a repair estimate
  (`claims.estimate` — owner/manager/advisor). "Authorise repair" approves the
  linked estimate and job; partially approved = insurer covers the approved
  amount, the rest is customer-pay.
- **Notifications**: every status change SMSes driver, garage and broker
  (`claim_submitted`, `claim_status` templates — 53 total now).
- Migration `0032_insurance-claims`.

### P8-16 Car pickup & drop-off ✅
- **Garage setting** (Settings → Pickup & drop-off): on/off, fee per run
  (each way) and distance. **New staff role `garage_driver`** (Staff →
  invite) with a "Pickups" screen; owners, managers and advisors can drive
  too (`handovers.perform`), and manage runs (`pickups.manage`).
- **Customers book it**: the public booking page (`/b/<garage>`) offers
  "Collect my car" (+ "Bring it back when it's ready") with address and
  location. Runs wait for the booking's SMS code, then the customer gets a
  tracking link. Staff can also create pickup/return runs for a booking or a
  job, assign a driver and reschedule (Pickups screen).
- **Driver run**: directions, call, "on my way" → "arrived" (live location
  shared every ~15 s) → **condition report**: photos of front, back, both
  sides, inside and dashboard, fuel level, mileage, warning lights, notes,
  and the **customer's finger signature** with name. The run can't finish
  without every part. Same report at return.
- **Customer sees** both reports and live status at `/p/<token>` (and on the
  job tracker `/t/<token>`), auto-refreshing while the run is moving, with a
  pickup-vs-return comparison (km driven, fuel, warning lights).
- Run fees become approved "Car pickup" / "Car return" lines on the job
  (added when the booking is checked in, or when a return is created for a
  job).
- Migration `0031_pickup-dropoff` (adds `garage_driver` to
  `membership_role`).

### P8-15 Breakdown & towing (SOS) ✅
- **New workspace: tow operators** — `/signup/tow-operator` →
  `/onboarding/tow-operator` → `/tow` (in the workspace switcher). Setup:
  business, SOS phone, base location, services (flatbed, wheel-lift,
  motorbike, jump start, tyre), call-out + per-km rates, radius, MoMo payout.
- **Driver SOS** (driver app → Breakdown SOS, `/portal/sos`): GPS, problem
  type, landmark, notes, up to 3 photos, car, optional destination garage.
  The nearest **available** operators within both radii get an **SMS sent in
  the same request** (parallel, no queue) and see it in `/tow` within ~5 s.
  After 5 min with no taker the search widens by 15 km once; after 30 min it
  expires and the driver is told. Garages within 10 km get an in-app notice.
- **First to accept is assigned** (conditional update), with a price
  (pre-filled from their rates and the distance) and an ETA. The driver's
  name and phone are shared only with that operator.
- **Live tracking**: the operator's phone shares GPS every ~15 s while
  available or on a job; the driver's page shows operator, distance, live
  ETA, price and a map link, refreshing every 4 s.
- **Payment**: MoMo via theTeller — held by FixAm and paid out to the
  operator (`tow_settlement` payout) when the job is completed — or cash
  (operator confirms). A job can't be finished until payment is settled.
- **Completion** at the destination garage creates a **repair request** in
  that garage's Leads (with triage) and texts the garage.
- Operator steps: on the way → arrived → towing (needs a garage) → done, or
  "fixed on the spot". Each step texts the driver. Drivers can cancel before
  arrival (not after paying).
- Migration `0030_towing-sos`.

### P8-14 Fix now, pay later ✅
- `FinancingProvider` adapter (`lib/integrations/financing.ts`) for a partner
  lender — **mock lender first** (`FINANCING_PROVIDER=mock`): decides at
  once with predictable test rules (under GH₵200 or over GH₵15,000 →
  declined; phone ending in 9 → declined; over GH₵8,000 → max 3 months),
  example price `FINANCING_MOCK_MONTHLY_RATE_BP` (default 4% a month, flat).
- **Customer applies from the estimate approval page** (after approving) or
  **the invoice page**: monthly options for 1–6 months with the total and
  lender charge, full name, Ghana Card number (sent to the lender only —
  never stored) and explicit consent. Decision shown straight away.
- **Garage is paid up-front**: when an approved plan meets an issued invoice
  (immediately at invoice stage, or when the invoice is issued after an
  estimate-stage approval), the lender disburses and the invoice gets a
  **"financing" payment** for the financed amount (never more than the
  balance; anything above the approval is paid as normal). Audited.
- **Repayments** tracked per month; driver app → **Pay later** shows plans,
  progress and the next "Pay" link (lender's page; a test page for the mock).
  **Reminders** 3 days before, on the day, and 3 and 10 days late (one per
  stage, missed stages skipped), sent with the garage's quiet hours applied —
  a reminder that would land in quiet hours waits for the next run.
- Hourly sync for pending decisions, unpaid approved plans and lender-side
  repayments. Garage-run instalment plans are unchanged and still available.
- Migration `0029_pay-later` (adds `financing` to `payment_method`).

### P8-13 OBD-II scanner diagnostics ✅
- **Web Bluetooth + ELM327 (BLE adapters)** in Chrome on Android (and desktop
  Chrome/Edge): reads VIN, check-engine light, **stored / pending / permanent**
  codes, the freeze frame (rpm, coolant, speed, load when the fault was
  stored) and **live data** (RPM, coolant, speed, battery voltage, refreshed
  every ~1.5 s). Supports the common BLE GATT layouts (FFF0, FFE0, Vgate,
  18F0). iPhones get "use Chrome on Android" (Web Bluetooth isn't allowed on
  iOS); classic-Bluetooth-only adapters can't be used from a browser.
- Protocol parsing handles CAN single/multi-frame and K-line/J1850 replies
  from several ECUs (`lib/obd/protocol.ts`, tested).
- **Fault-code library** of 130+ common generic codes with plain meaning,
  severity (stop / fix soon / can wait), likely parts from the standard parts
  list and "check first" tips; other codes are described from their structure
  (maker-specific codes flagged). **AI explanation** (`explain_dtcs` prompt,
  library fallback) per code for this car, with likely parts mapped to part
  types — the library's "stop" can't be downgraded by the AI.
- **Garage** (job card → Findings, and the mechanic's job screen): scan, see
  offers per likely part (own stock + vendors), **Add to findings**.
  **Clear codes**: staff with job-status rights only, a reason is required,
  and an audit row (`obd.clear_codes.requested`) is written *before* the clear
  command is sent; the outcome is audited too (`…done` / `…failed`).
- **Driver** (car page → "Read your car's fault codes"): same scan, links to
  parts that fit, and **Get it fixed** sends the codes with a repair request —
  triage uses them and garages see them on the lead.
- A scanned VIN fills a missing VIN on the car; a different VIN is flagged.
- Repair-request photos are now shrunk on the phone before upload (fits the
  4 MB limit).
- Migration `0028_obd-scans` (`inspection_id` is ready for P8-20).

### P8-12 Part recognition from photos ✅
- **Snap the part**: Claude vision (`identify_part` prompt) looks at a photo
  and picks from the standard parts list (numbered candidates, up to 5 with
  confidence), judges the condition, reads any part number or brand on it,
  and notes fitment clues (front/rear, engine). What the person types and a
  readable part number are matched against the list too and boost agreeing
  choices.
- Sure (≥ 75% and 20 points ahead) → "This looks like X — Yes, that's it";
  otherwise "Which one is it?" with the top 5 plus the full list.
- **Driver app → Parts**: "Don't know what the part is called? Use a photo" —
  picking the part shows fitting offers straight away.
- **Job card → Findings**: "…or identify it from a photo" next to the part
  picker; the car comes from the job, and offers open as soon as it's picked.
- **Repair requests**: the first photo is also checked; a sure match is put
  first in the request's parts (so offers show with the triage).
- Photos are shrunk in the browser (≤ 1600 px JPEG) and checked by their
  bytes; they are not stored. `part_photo_scans` keeps only what was
  suggested and what the person confirmed. Admin → AI usage shows live
  accuracy (target ≥ 80%). Offline evaluation:
  `npx tsx scripts/eval-part-photos.ts` over `tests/fixtures/part-photos`
  (add your own photos; see the README there).
- Server-action body limit raised to 4 MB (`next.config.ts`) so photo
  uploads (including repair-request photos) don't hit Next's 1 MB default.
- Migration `0027_part-photo-scans`.

### P8-11 Seasonal reminders (harmattan & rains) ✅
- Garages' customers get a short car-care message when the season turns,
  timed by the garage's region: **north** (harmattan mid-Nov, one rainy
  season late Apr), **middle belt** (harmattan late Nov, rains mid-Mar and
  Sep) and **coast** (harmattan early Dec, rains Apr and Sep). Each message
  has a checklist (filters, wipers, lights, coolant / tyres, brakes), the
  garage's optional offer, its booking link and a one-tap stop link.
- Campaigns are created a week before the send day; owners and managers get
  a notification and can add an offer (max 80 characters), preview the SMS
  or skip it under **Settings → Seasonal reminders**, which also shows
  sent / skipped / failed counts and bookings that followed. A campaign
  created late waits 48 hours before sending.
- Who gets it: customers serviced at that garage in the last 18 months who
  haven't opted out, at most one seasonal message per 45 days. WhatsApp only
  if the customer allows it, otherwise SMS. Sends hourly in the daytime,
  never in the garage's quiet hours, and pause when the message allowance
  runs out; unsent messages expire 14 days after the send day.
- Opt-out: signed link `/u/<token>` (a button, so link previews don't opt
  people out; undo offered) and a "Harmattan & rainy-season tips" switch in
  the driver app's preferences. Service due-date reminders are unaffected.
- New templates `seasonal_harmattan`, `seasonal_rainy` (WhatsApp templates
  must be approved in Meta under these names). Optional env
  `LINK_SIGNING_SECRET` for the stop links (falls back to
  `PAYOUT_ENCRYPTION_KEY`).
- Migration `0026_seasonal-campaigns`.

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
