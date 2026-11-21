# PRD — FixAm
**FixAm — a garage operating system for Ghana: repairs, parts, vendors, reminders, renewals and money — in one vibrant SaaS.**

| | |
|---|---|
| Owner | Peter |
| Status | Draft v1.0 — ready for build |
| Date | 20 Nov 2026 |
| Market | Ghana (GHS, Mobile Money, Ghana DVLA) |
| Hosting | Vercel |
| Pilot | One confirmed garage |
| Product map | Whiteboard: "FixAm — Product Map" |

---

## 1. Vision

Garages in Ghana run on paper job cards, WhatsApp chats, memory and cash books. Customers forget oil changes, let insurance lapse and get caught with an expired roadworthy certificate. Garages lose repeat business they never knew they had.

**FixAm** gives a garage one place to run the workshop, sell parts, order supplies, get paid, and keep customers coming back through smart reminders and renewal services. It feels fun and modern to use for everyone: owners, front desk, mechanics, storekeepers, vendors and car owners.

**Core idea:** the **vehicle** is the centre of everything. Every job, part, payment, reminder and renewal hangs off a vehicle, so each car builds up a full history that keeps the customer loyal to the garage.

## 2. Goals and success criteria

### Product goals
1. Digitise the full garage workflow end to end (check-in → estimate → approval → repair → invoice → payment).
2. Turn one-off customers into recurring revenue through reminders and renewal services.
3. Let garages buy parts and supplies from vendors in a few taps, including automatic reorders.
4. Give owners real-time visibility into revenue, expenses, profit and staff output.
5. Be a sustainable SaaS: monthly subscription per garage, tiered by staff and branches.

### Pilot success (definition of done)
The product is **100% functional** for the pilot garage when:
- Every vehicle that enters the garage is checked in through the app (no paper job cards).
- Every invoice, receipt and payment (cash, MoMo, card, deposit, instalment, credit) goes through the app.
- Reminders for oil, insurance and DVLA go out automatically on SMS, WhatsApp, email and push.
- The garage can process at least one insurance and one DVLA renewal end to end as an agent.
- Parts stock is tracked and at least one vendor order is placed through the marketplace.
- The owner can pull daily and monthly sales, expenses and profit reports without help.

### Metrics to track from day one
| Metric | Why |
|---|---|
| Jobs created per week | Adoption |
| % of jobs with customer approval via link | Customer engagement |
| Reminder → booking conversion | Core value proposition |
| Renewals processed per month | Agent revenue |
| Days sales outstanding (credit accounts) | Cash flow health |
| Weekly active staff / total staff | Stickiness |
| Mechanic job turnaround time | Workshop efficiency |

## 3. Ghana market context

- **Currency:** Ghana Cedi (GHS), formatted `GH₵ 1,250.00`.
- **Payments:** Mobile Money dominates (MTN MoMo, Telecel Cash, AirtelTigo Money), plus cards, bank transfer and cash.
- **Identity:** customer phone number is the primary key for customers. Ghana Card number is optional and only collected where a renewal requires it.
- **DVLA:** vehicle roadworthy certificate and licence/registration renewals. There's no public API assumed, so v1 runs renewals as a **manual agent workflow** tracked in the app, with an adapter interface for future integration.
- **Insurance:** regulated by the National Insurance Commission (NIC). To act as an agent, a garage (or the platform) must **partner with a licensed insurer or broker**. v1 supports a partner-insurer model and manual policy issuance tracking.
- **Messaging:** SMS sender IDs must be registered with the SMS provider. WhatsApp Business templates must be pre-approved by Meta.
- **Tax:** VAT and levies are **configurable per garage** (rates and on/off), not hardcoded.
- **Connectivity:** workshop Wi-Fi and mobile data are often unreliable, so mechanic screens must tolerate going offline.
- **Language:** English for v1, with every UI string externalised (i18n-ready) so local languages can be added later.

## 4. Users and roles

| Role | Who | Main jobs | Primary device |
|---|---|---|---|
| **Platform Admin** | Peter / ops team | Garages, subscriptions, tiers, message credits, vendor approval, support | Desktop |
| **Garage Owner** | Owner / manager | Dashboard, approvals, pricing, staff, reports, settings | Desktop + phone |
| **Service Advisor** | Front desk | Check-in, estimates, customer comms, invoicing, payments | Desktop / tablet |
| **Mechanic** | Technician | Assigned jobs, checklists, photos, parts requests, timer | Phone (PWA) |
| **Storekeeper** | Parts / store | Stock, counter sales, receiving, purchase orders | Desktop / tablet |
| **Accountant** | Bookkeeper | Payments, expenses, credit accounts, reports, exports | Desktop |
| **Vendor** | Parts and supplies seller | Catalogue, pricing, orders, delivery status, payouts | Desktop + phone |
| **Customer** | Car owner | Tracker, approvals, payments, history, reminders, renewals, orders | Phone (link or login) |
| **Fleet Manager** | Company with many vehicles | All fleet vehicles, approvals, credit statement | Desktop |

### Permission matrix (summary)
| Capability | Owner | Advisor | Mechanic | Store | Accountant | Customer | Vendor |
|---|---|---|---|---|---|---|---|
| Create/edit jobs | ✅ | ✅ | Update own | — | — | — | — |
| Approve estimates | ✅ | On behalf | — | — | — | Own | — |
| Override prices / discounts | ✅ | Within limit | — | — | — | — | — |
| Manage stock | ✅ | View | Request | ✅ | View | — | — |
| Place vendor orders | ✅ | — | — | ✅ | — | Own vehicle | Fulfil |
| Take payments | ✅ | ✅ | — | Counter sales | ✅ | Pay own | — |
| Credit accounts / instalments | ✅ | Request | — | — | ✅ | View own | — |
| Reports | ✅ | Daily only | Own stats | Stock | ✅ | — | Own sales |
| Staff & settings | ✅ | — | — | — | — | — | — |

Roles are **per garage membership**: one person can hold different roles in different garages or branches.

## 5. Functional requirements

Priority key: **P0** = needed for the pilot, **P1** = soon after the pilot, **P2** = later.

### 5.1 Garage onboarding and tenancy (P0)
- Self-serve sign-up: garage name, logo, address, GPS pin, phone, business registration (optional), tax settings.
- Onboarding wizard: add branches → invite staff (SMS/WhatsApp invite link) → set labour rates → import parts (CSV) → choose plan.
- Multi-branch: each branch has its own stock, staff and bays, with an owner-level combined view.
- Customisable document branding: logo, colours, invoice footer, terms, MoMo merchant number.

### 5.2 Customers and vehicles (P0)
- Customer: name, phone (unique per garage), WhatsApp opt-in, email, Ghana Card (optional), address, type (individual / business / fleet), credit limit.
- Vehicle: plate number, VIN, make, model, year, colour, engine type, fuel type, transmission, photos, owner(s).
- One vehicle can move between owners, and its history stays with the vehicle.
- **Vehicle profile** shows a health card (oil / insurance / DVLA / open issues as traffic lights), timeline of all jobs, parts fitted, documents and payments.
- Quick search by plate, phone or name everywhere (command palette `⌘K`).
- Duplicate detection on plate and phone.

### 5.3 Repairs and job cards (P0)
**Workflow states:**
`Booked → Checked in → Diagnosing → Estimate sent → Approved / Declined → In progress → Waiting for parts → Quality check → Ready for pickup → Delivered → Closed`

- **Check-in:** odometer reading (required), fuel level, photos of the vehicle (damage walk-around), customer complaints, items left in the car, customer signature on tablet.
- **Diagnosis:** mechanic adds findings with photos/videos and voice notes, and marks each as urgent / recommended / can wait.
- **Estimate:** line items for labour (hours × rate or flat), parts (from stock or to order), and sundries. Shows tax, discount and deposit required.
- **Approval:** sent by SMS/WhatsApp link. The customer approves or declines each line item, can pay a deposit, and the signature/timestamp is recorded. The advisor can approve on the customer's behalf after a phone call (logged with a reason).
- **Job board:** Kanban by status and by bay, drag-and-drop, colour-coded by priority and due time.
- **Mechanic view:** my jobs today, start/pause timer per task, checklists per job type, request parts from the store, upload photos, mark complete.
- **Quality check:** a checklist signed off by a senior mechanic or owner before "Ready".
- **Live tracker for customers:** a step-by-step progress page with photos and notes, ETA, and a "ready for pickup" notification.
- **Comebacks/warranty:** link a new job to a previous one as a warranty claim, with its own reporting.
- **Job templates** for common services (oil service, brake pads, full service) with preset labour and parts.

### 5.4 Parts sales and inventory (P0 core, P1 online catalogue)
- Parts catalogue: SKU, name, brand, category, compatible makes/models, cost price, selling price, tax, barcode, photos, bin location.
- Stock per branch: quantity, reorder level, reorder quantity, preferred vendor.
- Stock movements: purchase receipt, job usage, counter sale, transfer between branches, adjustment (with reason), return.
- **Counter sales (POS):** fast search/scan, cart, customer optional, payment, receipt (print/SMS/WhatsApp).
- **Online catalogue (P1):** customers browse the garage's parts, order for pickup or fitting, pay online.
- Low-stock alerts and a reorder suggestions screen.
- Stock valuation report (FIFO or weighted average, configurable).

### 5.5 Vendor marketplace (P0 basic, P1 full)
A marketplace of approved vendors selling parts, lubricants, tyres, batteries, tools and workshop materials.

- **Vendor onboarding:** business details, location, delivery zones, payout MoMo/bank account. Approved by Platform Admin.
- **Vendor catalogue:** products, prices, stock availability, lead times, minimum order quantities, delivery fees.
- **Garage ordering:** search across vendors, compare price/delivery time, add to cart, place a purchase order, pay now or on vendor credit terms.
- **Automatic reordering:** when stock hits the reorder level, the system drafts a purchase order with the preferred vendor. The garage can set it to auto-send (with a spend limit) or require one-tap approval.
- **Job-linked ordering:** when an approved estimate needs a part that's out of stock, the system suggests vendors and can order straight to the garage, linked to the job (job moves to "Waiting for parts").
- **Customer ordering:** a car owner can order parts or supplies from a vendor **delivered to their chosen garage** for fitting. The garage sees the incoming order and books the fitting job.
- **Order lifecycle:** `Placed → Accepted → Packed → Out for delivery → Delivered → Received (goods-received note)`, with partial delivery and returns.
- **Vendor dashboard:** orders, fulfilment, sales, ratings, payouts.
- **Payments:** marketplace orders are paid through Paystack, with split payouts to vendors. The platform can take a configurable commission (a future revenue stream, 0% by default for the pilot).
- Ratings and reviews of vendors by garages, only from verified completed orders.

### 5.6 Oil change service and reminders (P0)
- Oil service record: oil type/grade, brand, quantity, filter(s) changed, odometer, next due date and next due mileage.
- Default intervals per oil type (e.g. mineral / semi-synthetic / fully synthetic), editable per garage and per vehicle.
- **Mileage capture:** at every visit (required at check-in) and by customer self-update via link, WhatsApp reply or the customer portal.
- **Mileage prediction** (see section 6) estimates when the vehicle will reach its next due mileage.
- Reminder fires at whichever comes first: the **due date** or the **predicted due-mileage date**.
- One-tap "Book now" in the reminder opens a booking page with available slots.

### 5.7 Insurance renewal services and reminders (P0 reminders, P0 agent flow for pilot)
- Policy record per vehicle: insurer, policy type (third party / third party fire & theft / comprehensive), policy number, start/end dates, premium, sticker/certificate upload.
- Reminders at 30 / 14 / 7 / 1 days before expiry, on the day, and overdue.
- **Agent renewal flow:**
  1. Customer taps "Renew with my garage" in the reminder or asks at the front desk.
  2. The system collects or confirms the required documents (previous policy, vehicle documents, ID) by upload.
  3. The garage requests a quote from the partner insurer (manual in v1, recorded in the app; API adapter later).
  4. The quote is sent to the customer for approval and payment (premium + service fee).
  5. The garage processes the renewal with the insurer and uploads the new policy/sticker.
  6. The customer receives the new policy documents, and the next expiry reminder is scheduled automatically.
- Renewal status tracker visible to the customer.
- Service fee per renewal set by the garage. Commission received from the insurer is tracked as income.
- **Compliance:** the agent flow is only enabled for garages linked to a licensed partner insurer/broker.

### 5.8 DVLA renewal services and reminders (P0)
- Records per vehicle: roadworthy certificate expiry, registration/licence expiry, and optionally the owner's driver's licence expiry.
- Reminders on the same escalation schedule as insurance.
- **Agent renewal flow:** same pattern as insurance: collect documents → quote (DVLA fees + service fee) → customer pays → garage processes at DVLA (including pre-inspection checks in the workshop where needed) → upload the new certificate → reschedule reminders.
- Pre-renewal inspection job: if the vehicle needs repairs to pass the roadworthy inspection, the system creates a linked repair job.
- DVLA fee table maintained by Platform Admin (editable as fees change).

### 5.9 Unified reminder engine (P0)
All "something is due" items share one engine.

- **Due item:** `{vehicle, type, due_date?, due_mileage?, predicted_due_date?, status, escalation_stage}`.
- Types at launch: oil change, general service, insurance, roadworthy, registration/licence, driver's licence, instalment payment due, credit account statement. New types are configuration, not code.
- **Escalation schedule** configurable per type and per garage (default: 30d, 14d, 7d, 1d, due day, +3d overdue, +7d overdue).
- **Channel routing:** customer preferences decide the channels (SMS, WhatsApp, email, push). Fallback order: WhatsApp → SMS if WhatsApp isn't delivered within X minutes.
- **Quiet hours:** no messages between 21:00 and 07:00 local time.
- **Deduplication:** one combined message when several items fall due for the same customer in the same week ("Your oil change and insurance are both due soon…").
- **Actions in every reminder:** Book now / Renew with my garage / Update my mileage / Already done (with a reason, which closes the item).
- Delivery tracking (sent, delivered, read, clicked, converted) for reporting.
- Message templates editable per garage, with variables (`{{customer_first_name}}`, `{{plate}}`, `{{due_date}}`, `{{garage_name}}`, `{{action_link}}`).

### 5.10 Invoices, receipts and payments (P0)
- **Invoice** generated from a job, counter sale, renewal or vendor-order fitting. Sequential numbering per garage/branch (e.g. `INV-ACC-000123`).
- Line items, discounts (line and invoice level, permission-controlled), configurable taxes, notes, terms.
- PDF invoice/receipt with garage branding, shareable by WhatsApp, SMS link, email or print (A4 and 80mm thermal).
- **Payment methods:** cash, Mobile Money (via Paystack, prompt to the customer's phone), card, bank transfer, and manual records for external payments.
- **Deposits:** required deposit % per job type, collected at estimate approval and applied to the final invoice.
- **Instalments:** payment plan with schedule (amounts and dates). Each instalment becomes a due item with reminders. Overdue handling and optional late fee.
- **Credit accounts:** for trusted customers and fleets. Credit limit, payment terms (e.g. 30 days), running balance, monthly statement, ageing (0–30, 31–60, 61–90, 90+). Owner approval to exceed the limit.
- Refunds and credit notes with reasons and permission control.
- **Receipts** automatically issued on every payment.
- Expenses module: record garage expenses (rent, salaries, utilities, tools, vendor purchases) by category, with receipt photos.
- Full audit trail on every financial record (who, what, when, before/after).

### 5.11 Financial reports (P0 simple, P1 deeper)
- **Daily summary:** sales by category (labour / parts / renewals / service fees), payments by method, expenses, cash-up (expected vs counted cash).
- **Monthly report:** revenue, cost of parts sold, gross profit, expenses, net profit, comparison with last month.
- Outstanding balances: unpaid invoices, instalments due, credit account ageing.
- Staff performance: jobs completed, hours logged, revenue per mechanic, comebacks.
- Export to CSV/Excel and PDF.
- **P1:** P&L by branch, cash flow, accounting export (e.g. QuickBooks/Xero format).

### 5.12 Customer experience (P0 links, P0 login)
- **Magic links** (no login needed): job tracker, estimate approval, invoice and payment, mileage update, renewal flow, booking.
- **Customer portal (login with phone OTP):** my vehicles, health cards, history, documents (policies, certificates, invoices), upcoming reminders, payments and balances, parts orders, notification preferences.
- Installable PWA with push notifications.
- One customer account works across every garage on the platform; each garage only sees its own relationship with that customer.

### 5.13 Bookings (P0)
- Online booking page per garage: service type, vehicle, preferred date/time slot, notes.
- Capacity by bays and mechanics, buffer times, blocked days.
- Booking confirmation and reminder the day before.

### 5.14 Notifications (P0)
- Channels: SMS, WhatsApp, email, web push (PWA).
- Staff notifications: new booking, estimate approved, part arrived, payment received, low stock, vendor order updates.
- In-app notification centre with read/unread.

### 5.15 Platform admin and subscriptions (P0)
- Garage management: create, suspend, impersonate (with audit log) for support.
- Plan management and **subscription billing** via Paystack recurring payments (monthly, GHS).
- **Message allowance per plan** (messages are included in the subscription). Usage meter per garage, alerts at 80% and 100%, add-on bundles.
- Vendor approval and moderation.
- Global settings: DVLA fee table, default service intervals, message templates, tax presets.
- Platform analytics: active garages, MRR, churn, message usage, renewals volume.

#### Proposed plans (prices to be set in GHS)
| | **Starter** | **Growth** | **Pro** |
|---|---|---|---|
| Branches | 1 | Up to 3 | Unlimited |
| Staff seats | Up to 5 | Up to 15 | Unlimited |
| Monthly message allowance | Base | 3× base | 8× base |
| Repairs, invoices, reminders | ✅ | ✅ | ✅ |
| Parts inventory & POS | ✅ | ✅ | ✅ |
| Vendor marketplace ordering | ✅ | ✅ | ✅ |
| Insurance & DVLA agent services | — | ✅ | ✅ |
| Credit accounts & instalments | Basic | ✅ | ✅ |
| Fleet accounts | — | — | ✅ |
| Multi-branch reports | — | ✅ | ✅ |
| Priority support | — | — | ✅ |

The pilot garage gets the Pro plan free during the pilot.

## 6. Mileage prediction

**Goal:** estimate each vehicle's average distance per day so oil and service reminders can be sent before the due mileage is reached, even when the customer hasn't visited.

**Inputs:** every odometer reading `(date, km, source)`, where source is check-in, customer update, or service record.

**Rules:**
1. **Validation:** reject a reading lower than the previous one (unless flagged as odometer replaced), or an implied rate above 1,000 km/day. Flag it for the advisor to review.
2. **Rate calculation:** with at least 2 valid readings at least 7 days apart, compute the rate between each pair of consecutive readings, then take an **exponentially weighted average** that favours recent intervals (half-life ≈ 90 days).
3. **Fallback:** with fewer than 2 readings, use the garage's default for that vehicle type (e.g. 40 km/day private car, 150 km/day commercial), editable.
4. **Prediction:** `predicted_km(today) = last_reading_km + rate × days_since_last_reading`.
   `predicted_due_date = last_reading_date + (due_mileage − last_reading_km) / rate`.
5. **Trigger:** the reminder engine uses `min(due_date, predicted_due_date)`.
6. **Confidence:** high (≥4 readings, low variance), medium, or low (fallback). Low-confidence reminders ask the customer to confirm their mileage ("Reply with your current mileage").
7. **Mileage nudges:** if there's no reading for 45 days, send a light "update your mileage" prompt (counts against the message allowance, so it's configurable).

Show the estimate on the vehicle profile: "Approx. 52 km/day · next oil change around 14 Jan (medium confidence)".

## 7. Data model (core entities)

```
Platform
├── Plan, Subscription, MessageLedger
├── Vendor ── VendorProduct ── VendorOrder ── VendorOrderItem ── Payout
└── Garage (tenant)
    ├── Branch ── Bay
    ├── Membership (user × garage × role × branch)
    ├── Settings (tax, numbering, templates, intervals, quiet hours)
    ├── Customer ── CustomerContact prefs
    ├── Vehicle ── VehicleOwnership ── OdometerReading
    │          ├── Document (policy, roadworthy, registration, photos)
    │          ├── InsurancePolicy
    │          ├── DvlaRecord
    │          └── DueItem ── ReminderMessage
    ├── Booking
    ├── Job ── JobItem (labour | part | sundry) ── JobTask ── TimeLog
    │      ├── Inspection / Checklist ── Media
    │      └── Estimate ── Approval
    ├── RenewalRequest (insurance | dvla) ── RenewalDocument
    ├── Part ── StockLevel (per branch) ── StockMovement
    ├── PurchaseOrder ── GoodsReceipt
    ├── Invoice ── InvoiceLine ── Payment ── Receipt
    ├── PaymentPlan ── Instalment
    ├── CreditAccount ── Statement
    ├── Expense
    └── AuditLog
User (global) ── Customer accounts link to Customer records across garages
```

**Conventions:**
- Every tenant table has `garage_id` (and `branch_id` where relevant), enforced with Postgres **row-level security**.
- Money stored as integer **pesewas** (`bigint`) with a currency column; never floats.
- All timestamps stored in UTC and shown in `Africa/Accra`.
- Soft deletes on business records; financial records are immutable once issued (corrected by credit notes).
- IDs: UUID v7 (time-sortable).

## 8. Architecture (Vercel)

```
                         ┌────────────────────────────────┐
  Browsers / PWA ───────▶│  Next.js on Vercel             │
  (staff, customers,     │  App Router · Server Actions   │
   vendors, admin)       │  Route handlers (webhooks)     │
                         └───────┬───────────┬────────────┘
                                 │           │
              ┌──────────────────┘           └───────────────┐
              ▼                                               ▼
   Supabase (Postgres + RLS,                     Inngest (background jobs)
   Auth, Storage, Realtime)                      ├─ reminder scan (cron, hourly)
              ▲                                  ├─ send message (retry, fallback)
              │                                  ├─ mileage recalculation
              │                                  ├─ auto-reorder drafts
   Webhooks ──┴── Paystack (payments,            ├─ PDF generation
                  subscriptions, split payouts)  └─ daily/monthly report snapshots
                  Hubtel/Arkesel (SMS)
                  WhatsApp Cloud API
                  Resend (email) · Web Push
```

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | Server Components, Server Actions |
| UI | Tailwind CSS + shadcn/ui + Framer Motion + Lottie | Custom design tokens (section 9) |
| Database | Supabase Postgres | RLS for tenancy; Supavisor pooling for serverless |
| ORM | Drizzle | Migrations in repo |
| Auth | Supabase Auth | Staff: email/phone + password or OTP; customers: phone OTP; magic links signed and expiring |
| Background jobs | Inngest (+ Vercel Cron as trigger) | Avoids serverless timeouts; retries; scheduling |
| Realtime | Supabase Realtime | Job board, tracker, notifications |
| Files | Supabase Storage | Photos, documents, PDFs; signed URLs |
| PDFs | `@react-pdf/renderer` | Runs in serverless, no headless browser |
| Payments | Paystack | MoMo + cards, subscriptions, split payments |
| SMS | Hubtel or Arkesel (adapter) | Registered sender ID |
| WhatsApp | WhatsApp Cloud API | Approved templates; two-way replies for mileage updates |
| Email | Resend | React Email templates |
| Push | Web Push (VAPID) via service worker | PWA |
| Offline | Service worker + IndexedDB queue | Mechanic actions queued and synced |
| Monitoring | Sentry + Vercel Analytics + structured logs | |
| Testing | Vitest, Playwright, seeded test tenant | |

**Integration adapters:** SMS, WhatsApp, payments, insurance and DVLA each sit behind an interface (`MessagingProvider`, `PaymentProvider`, `InsuranceProvider`, `DvlaProvider`) so providers can be swapped and real APIs plugged in later.

**Environments:** Preview (per PR on Vercel), Staging (pilot dry runs), Production.

## 9. UX and visual direction — "Pit Stop Pop · Premium"

**Feel:** bold, playful, fast, with pit-stop energy. Professional enough for money, fun enough that mechanics want to open it.

### Palette
| Token | Name | Hex | Use |
|---|---|---|---|
| `primary` | Ignition Orange | `#FF5A1F` | Main actions, brand |
| `ink` | Midnight Navy | `#0B1B3F` | Text, dark mode base, nav |
| `success` | Volt Lime | `#C6F432` | Ready, paid, done |
| `info` | Turbo Teal | `#00C2B8` | Info, links, progress |
| `surface` | Cream | `#FFF6EC` | Light backgrounds |
| `warning` | Amber | `#FFB020` | Due soon |
| `danger` | Brake Red | `#FF3B5C` | Overdue, errors |

All text/background pairs must meet WCAG AA contrast.

### Typography and shape
- Headings: **Bricolage Grotesque** (characterful). UI: **Geist Sans**; codes and plates: **Geist Mono**. Numbers: tabular figures. Full premium spec in `specs/ui-ux.json`.
- 20px rounded cards with soft layered shadows and hairline borders, glass top/bottom bars, pill buttons, generous spacing; the chunky "pop" shadow is kept only for playful elements (badges, celebrations, empty states).
- Large touch targets (min 48px) for mechanics with dirty or gloved hands.

### Signature moments
- **Vehicle health card:** a friendly car avatar (colour matches the real car) with traffic-light rings for oil, insurance, DVLA and open issues.
- **Live repair tracker:** delivery-style progress with photos, mechanic name and ETA.
- **Kanban job board** with satisfying drag-and-drop and bay lanes.
- **Celebrations:** confetti when an invoice is paid, a little engine-rev animation when a job is marked ready (with a setting to turn off).
- **Mechanic gamification:** daily streaks, jobs completed, quality badges (zero comebacks this month), a friendly weekly leaderboard (owner can turn off).
- **Empty states** with illustrated characters and a clear next step.
- **Modes:** light for the front office, dark "workshop mode" for the floor.
- **Command palette** (`⌘K` / search button) to jump to any plate, customer or job.

### Key screens
1. Owner dashboard: today's revenue, jobs by status, due reminders, cash position, low stock.
2. Job board (Kanban) and job detail.
3. Check-in wizard (tablet).
4. Mechanic "My jobs" (phone).
5. Estimate builder and customer approval page.
6. Vehicle profile with health card and timeline.
7. POS / counter sale.
8. Vendor marketplace: browse, cart, order tracking.
9. Reminders centre: upcoming, sent, converted.
10. Renewals board (insurance and DVLA).
11. Invoices, payments, credit accounts.
12. Reports.
13. Customer portal home.
14. Vendor dashboard.
15. Platform admin console.

## 10. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | Main screens interactive in < 2.5s on a mid-range Android over 4G; job board updates in < 1s |
| Availability | 99.5% for the pilot, 99.9% target at scale |
| Offline | Mechanic job updates, timers and photos queue offline and sync automatically |
| Security | RLS on all tenant data; role checks in every server action; signed expiring magic links; rate limiting on OTP and public links; secrets only in Vercel env vars |
| Privacy | Comply with Ghana's Data Protection Act, 2012 (Act 843); consent for marketing messages; customers can request data export/deletion; ID documents in private storage with access logging |
| Audit | Immutable audit log for financial records, discounts, approvals on behalf, impersonation |
| Backups | Daily automated backups with point-in-time recovery; tested restore |
| Accessibility | WCAG 2.1 AA; reduced-motion setting respected |
| Localisation | GHS formatting, `Africa/Accra` timezone, i18n-ready strings |
| Devices | Responsive from 360px phones to desktop; thermal printer support (80mm) via browser print |

## 11. Delivery plan

The pilot garage needs the full product, so build in vertical slices that each go live at the pilot as soon as they're ready.

| Phase | Scope | Pilot outcome |
|---|---|---|
| **0 · Foundations** | Repo, CI, Vercel environments, Supabase, auth, tenancy + RLS, design system, roles, audit log | Staff can log in to their garage |
| **1 · Core workshop** | Customers, vehicles, odometer, check-in, job cards, estimates + approval links, Kanban board, mechanic PWA, tracker, bookings | No more paper job cards |
| **2 · Money** | Invoices, receipts, Paystack MoMo/card, deposits, instalments, credit accounts, expenses, daily & monthly reports, PDFs | All payments in the app |
| **3 · Parts & vendors** | Parts catalogue, stock, POS, purchase orders, vendor onboarding, marketplace ordering, auto-reorder, customer orders to garage | Stock tracked, first vendor order |
| **4 · Reminders & renewals** | Reminder engine, all four channels, mileage prediction, oil/insurance/DVLA records, agent renewal flows | Automatic reminders, first renewals |
| **5 · SaaS & polish** | Subscription billing, plans, message allowance, platform admin, gamification, fleet accounts, online parts catalogue | Ready to onboard garage #2 |

Run phases 3 and 4 in parallel if more than one developer is available.

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Insurance agency needs a licence | Partner with an NIC-licensed insurer/broker; agent flow is gated per garage |
| No DVLA or insurer APIs | Manual workflows in v1 behind provider adapters |
| Message costs grow faster than subscriptions | Per-plan allowances, combined reminders, WhatsApp-first, usage alerts, add-on bundles |
| WhatsApp template approval delays | Submit templates early; SMS fallback |
| Staff resist going digital | Fast, fun mechanic UX; tablet check-in; on-site training at the pilot |
| Poor connectivity | Offline queue for mechanics; lightweight pages |
| Bad mileage data | Validation rules, confidence levels, customer confirmation prompts |
| Vendor fulfilment quality | Approval, ratings from verified orders, dispute flow |
| Serverless timeouts on heavy work | All heavy/bulk tasks in Inngest background jobs |

## 13. Open questions

1. Domain and social handles for FixAm (check .com / .com.gh availability and Ghana trademark).
2. Subscription prices for each tier, and the size of the base message allowance.
3. Which licensed insurer/broker will be the first insurance partner?
4. Does the platform take a commission on vendor marketplace orders after the pilot?
5. Local language support (e.g. Twi) — which languages, and when?
6. Will vendors deliver themselves, or do we need a delivery partner?
7. Does the pilot garage need thermal receipt printing on day one?

## 14. Glossary

| Term | Meaning |
|---|---|
| Job card | The record of one repair/service visit for a vehicle |
| Due item | Anything with a due date/mileage that triggers reminders |
| Agent renewal | The garage processes an insurance or DVLA renewal for the customer |
| Magic link | A secure, expiring link that opens a customer page without logging in |
| Comeback | A vehicle returning for the same fault (warranty work) |
| MoMo | Mobile Money |
| RLS | Postgres row-level security, used to isolate each garage's data |
