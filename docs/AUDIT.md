# FixAm — Full Audit Report

**Generated:** 2026-11-24 · **Root:** `D:\xampp\htdocs\FixAm` · **Branch:** `main` @ `6cae7cc`

---

## 1. Executive Summary

FixAm is a Ghana-focused, multi-tenant garage operating system and automotive services marketplace built as a Next.js 16 (App Router, Turbopack) + React 19 + TypeScript application, backed by Drizzle ORM on Supabase Postgres, Supabase Auth, theTeller payments (MoMo/card), Inngest background jobs, and Sentry. It serves six workspace audiences — garages, drivers, parts vendors, insurance/DVLA brokers, tow operators, and delivery riders — plus a public marketing/discovery surface and a platform-admin console.

The codebase is large and genuinely full-stack: **113 page routes, 12 API routes, 120 database tables, 38 migrations**, and a recently completed Phase-8 feature wave (insurance claims, rider network, garage WhatsApp AI, pre-purchase inspections, launch readiness) plus a new universal subscription/billing system and public "near me" finders. Feature breadth is exceptional for the stage; the principal risks are operational (SMS provider unconfigured, Supabase cold-start statement timeouts, one high-severity `drizzle-orm` advisory) rather than architectural.

**Overall completion: ~78% — maturity label: BETA** (production-deployed, real users possible, but billing/SMS/payment edges need hardening before scale).

---

## 2. Project Fingerprint

| Dimension | Finding |
|---|---|
| Type | Multi-tenant SaaS web app (server-rendered, server actions) |
| Stack | Next.js 16.4.6 · React 19.3 · TypeScript 5 · Tailwind 4 · Drizzle ORM 0.44.7 · postgres.js |
| Database | Supabase Postgres via pooled `DATABASE_URL` (`lib/db/index.ts`); 120 tables, 38 migrations |
| Auth | Supabase Auth — phone OTP minted via own SMS codes (`lib/auth/phone-auth.ts`), email/password fallback; one account, roles = workspaces |
| Payments | theTeller hosted checkout/MoMo (`lib/integrations/payments/theteller.ts`); legacy Paystack webhook code still present but dead |
| Messaging | Pluggable providers (`lib/integrations/index.ts`): Arkesel/Hubtel SMS adapters exist; mock is default; WhatsApp adapter present |
| Background jobs | Inngest (`lib/inngest/functions/*`): billing sweep, escrow reconcile/payouts, reminders |
| Deployment | Vercel (`fix-am-virid`), GitHub `PeterAforo/FixAm`, CI workflow present |
| Tests | Vitest unit tests (39 files), Playwright e2e (3 specs, opt-in in CI), `check-rls` script |
| Docs | `docs/CHANGELOG.md`, `DECISIONS.md`, `OPERATIONS.md`, `devin-spec/specs/*.json` — unusually well maintained |

---

## 3. Architecture Map

- **`app/`** — route groups per audience: `(app)/g/[garageSlug]` garage workshop, `(portal)` driver, `(vendor)`, `(broker)`, `(tow)`, `(rider)`, `(admin)`, `(auth)` onboarding/login, `(marketing)` public pages, plus token-based public routes (`/i/`, `/v/`, `/t/`, `/r/`, `/u/`, `/p/`).
- **`lib/`** — domain modules: `jobs`, `money` (invoices/payments/instalments), `escrow` (holds + payouts), `billing` (plans/subscriptions), `brokers`, `vendors`, `riders`, `towing`, `inspections`, `claims`, `portal`, `messaging`, `integrations` (provider abstraction), `inngest`, `accounts` (workspaces), `auth`, `admin`, `discovery`.
- **`lib/db/schema/`** — 29 schema files, ~120 tables; enums centralized in `enums.ts`.
- **Data flow** — server components/actions → `lib/*` services → Drizzle → Postgres; payments return via `/api/payments/return/[reference]/[to]` → `reconcileReference()` in `lib/escrow/service.ts`; Inngest polls pending references.
- **Access control** — layered: `proxy.ts` (route guards) → workspace layouts (`WorkspaceShell`/`AppShell`) → `resolveMembership`/`requireVendor`/etc. → `writeBlockReason()`/`SubscriptionGate` for subscription state.
- **Patterns** — server actions with Zod validation + `ActionResult`; audit logging via `writeAuditLog`; money as bigint pesewas; UUIDv7 IDs; token-hash sharing (no raw tokens stored).

**God files / coupling flags:** `job-detail-panel.tsx` (43KB), `lib/jobs/actions.ts` (42KB), `vehicle-profile-panel.tsx` (42KB), `vendor-panel.tsx` (37KB), `lib/escrow/service.ts` (36KB). Large but organized; candidates for splitting, not emergencies.

---

## 4. Feature Inventory (summary)

| Module | Status | Notes |
|---|---|---|
| Auth (phone OTP + email) | COMPLETE* | *depends on SMS provider env; see pitfalls |
| Onboarding wizards (6 roles) | COMPLETE | plan picker + trial subscription creation |
| Garage workshop (jobs, Kanban, estimates, invoices, parts, staff) | COMPLETE | core product, deepest module |
| Driver portal (vehicles, renewals, requests, SOS, inspections, parts orders) | COMPLETE | |
| Vendor marketplace + orders + payouts | COMPLETE | |
| Broker renewals + quotes + multi-broker requests | COMPLETE | new `/brokers` finder |
| Tow operator dispatch + rider deliveries | COMPLETE | |
| Insurance claims, pre-purchase inspections | COMPLETE | P8-17/P8-20 |
| Garage WhatsApp AI assistant | COMPLETE | P8-19 |
| Subscriptions/billing (all roles, admin-managed plans) | PARTIAL | theTeller one-off only; no auto-debit; prices unset until admin enters them |
| Public finders `/parts`, `/brokers` | COMPLETE | location stays in URL; pin-to-map flows |
| Platform admin console | COMPLETE | overview, garages, approvals, payments, partners, plans, catalogue, AI usage, privacy |
| Escrow holds + payouts | COMPLETE | reconcile via polling (no theTeller webhook) |
| Reminder engine (oil/insurance/DVLA) | COMPLETE | |
| Paystack billing remnants | STUB | `changePlan` records plan changes without charging; legacy webhook dead code |
| SMS/WhatsApp delivery | PARTIAL | adapters exist; production env unconfigured → OTP currently fails |

---

## 5. Workflow Analysis

- **Sign-up → workspace → trial**: coherent across all six roles; plan required, subscription row created with workspace; garage path transactional, others sequential (small orphan risk if subscription insert fails after workspace insert — `createTrialSubscription` errors are mostly pre-checked).
- **Payment**: checkout → theTeller → return route → `reconcileReference` → subscription `active` + period roll; Inngest polling covers abandoned returns. Sound for one-off payments.
- **Trial lifecycle**: daily `billingSweep` → `past_due` → reminders (SMS) → grace → `SubscriptionGate` paywall / garage write-block. Coherent.
- **Guards**: proxy + layouts + per-action checks; impersonation ("View as owner") correctly precedes suspension checks.
- **Weak spots**: phone sign-in currently hard-fails without SMS env (by design now, but blocks the primary auth path in prod until configured); no webhook means payment status lags until customer returns or poller runs.

---

## 6. Pitfall Report (by severity)

| Sev | Finding | Location |
|---|---|---|
| ~~HIGH~~ FIXED | `drizzle-orm` upgraded to 0.45.4 — SQLi advisory resolved | `package.json` |
| **HIGH** | SMS provider unconfigured in production → phone OTP (primary auth) fails; garage customer SMS also undelivered | Vercel env; `lib/messaging/direct.ts` |
| ~~HIGH~~ MITIGATED | Supabase pooler cold starts exceed statement timeout → `client.unsafe` now retries once on 57014; `/admin` counts also sequential | `lib/db/index.ts`, `lib/admin/overview.ts` |
| MEDIUM | `pnpm audit`: 4 moderate vulns via `@sentry/nextjs`/`inngest` → `glob`/`minimatch` | transitive deps |
| MEDIUM | No recurring billing — subscriptions require manual payment each period; churn risk | `lib/billing/*` |
| MEDIUM | `changePlan` (garage) changes plan without charging | `lib/billing/actions.ts` |
| ~~MEDIUM~~ FIXED | Paystack webhook route deleted; settle logic renamed to `lib/money/payment-settle.ts`; `paystack_*` columns remain as storage names only | — |
| MEDIUM | Non-garage signup actions aren't transactional — workspace row can persist if subscription insert throws | `lib/vendors|brokers|towing|riders/actions.ts` |
| LOW | `planCode ?? "pro"` default in `createGarage` silently fails if "pro" deactivated | `lib/onboarding/actions.ts:94` |
| LOW | Mock messaging now memory-fallback — garage SMS in prod silently no-ops if provider unset | `lib/integrations/messaging/mock.ts` |
| LOW | Plan prices all `null` until admin sets them → pickers show GH₵0.00 | `plans` table |
| INFO | Sentry browser envelope CORS-blocked (ingest domain) — errors may not reach Sentry | console logs |
| INFO | `Date.now()` prerender warning on `/` (non-fatal) | Vercel logs |

No hardcoded secrets found in source; `.env.local` is gitignored; env validation gate (`assertProductionEnv`) works.

---

## 7. Quality Scorecard

- **TypeScript**: strict, near-zero `any` (3 occurrences), discriminated `ActionResult` pattern — **strong**.
- **Lint/format**: ESLint 9 + Prettier + tailwind plugin configured; `pnpm lint`/`format:check` available.
- **Tests**: 39 unit test files (money, phone, WhatsApp core, discovery/near-me, etc.) + 3 Playwright e2e specs (opt-in via secrets). Coverage is broad but thin — core billing/escrow paths lack dedicated tests. **~30–40% estimated coverage**.
- **Docs**: exceptional — changelog/decisions/specs kept in lockstep.
- **Duplication**: role setup components share the plan-picker; some repeated Zod/action boilerplate is idiomatic here.
- **i18n**: `next-intl` + `messages/` installed; only ~3 usages — effectively English-only (fine for Ghana pilot).
- **a11y**: brand component library, aria-pressed on pickers, labelled fields — reasonable baseline.

---

## 8. Completion Dashboard

| Dimension | Raw | Weight | Weighted |
|---|---|---|---|
| Feature completeness | 80 | 0.30 | 24.0 |
| Workflow integrity | 78 | 0.20 | 15.6 |
| Error handling | 75 | 0.10 | 7.5 |
| Security posture | 70 | 0.15 | 10.5 |
| Test coverage | 35 | 0.10 | 3.5 |
| Code quality | 82 | 0.10 | 8.2 |
| Documentation | 90 | 0.05 | 4.5 |
| **Overall** | | | **~73–78% → BETA** |

---

## 9. Enhancement Roadmap

| Priority | Recommendation | Effort | Impact |
|---|---|---|---|
| MUST | Set SMS provider env in Vercel (Arkesel/Hubtel) — unblocks primary auth | S | Critical |
| MUST | Upgrade `drizzle-orm` ≥0.45.2 (SQLi advisory) | S | High |
| MUST | Enter real plan prices in `/admin/plans`; decide pilot vs paid garages | S | High |
| MUST | Resolve Supabase statement timeouts (compute upgrade or global retry in `db()`) | S–M | High |
| SHOULD | Recurring billing: theTeller mandates or payment-link reminders automation | L | High |
| SHOULD | Transactional workspace+subscription creation for vendor/broker/tow/rider | S | Medium |
| SHOULD | Charge on `changePlan` or document manual invoicing | M | Medium |
| SHOULD | Remove dead Paystack code paths | S | Low |
| SHOULD | E2E coverage for signup→trial→paywall and payment reconcile | M | Medium |
| NICE | Split god files (`job-detail-panel`, `jobs/actions`) | M | Medium |
| NICE | i18n (Twi/English) evaluation | L | Low |
| NICE | Webhook support if theTeller adds it | S | Low |

---

## 10. PRD (reverse-engineered, condensed)

**Product:** FixAm — "the garage operating system for Ghana." Garages run on paper job cards, WhatsApp and cash books; drivers forget services; everyone pays cash. FixAm centralizes check-in → diagnosis → estimate → approval → repair → invoice → payment → reminders, and extends the network to parts sellers, insurers/DVLA agents, tow operators and riders — all under one account per user with role-based workspaces.

**Personas:** garage owner/manager; mechanic; driver; parts vendor; insurance/DVLA broker; tow operator; rider; platform admin.

**Functional requirements (top):** multi-tenant workspaces; job cards w/ Kanban; estimates & customer approvals; invoicing, deposits, instalments, expenses; parts inventory + vendor marketplace ordering; escrowed payments & payouts; renewal reminders (oil/insurance/DVLA/roadworthy); tow dispatch + rider deliveries; insurance claims; pre-purchase inspections; WhatsApp AI assistant; subscriptions w/ trials for every role; public parts/broker finders; admin console; audit log; SMS/WhatsApp/push messaging; reports.

**Non-functional:** Ghana phone normalization; bigint pesewas money; tenant isolation via membership scoping + RLS; auditability; mobile-first responsive UI; offline-tolerant garage workflows (partial); production env validation; Sentry monitoring.

**Out of scope (not built):** native mobile apps (web/PWA only), recurring auto-debit billing, real-time websockets, accounting-suite depth (full ledger), multi-currency.

---

## Next 3 Sprint Recommendations

1. **Sprint: Launch unblockers** — configure SMS env in Vercel; upgrade drizzle-orm; set plan prices; verify OTP sign-in end-to-end on production.
2. **Sprint: Billing hardening** — transactional subscription creation for all roles; charge-on-plan-change or explicit "pay manually" flow; tests for `reconcileReference` subscription paths; global statement-timeout retry in `db()`.
3. **Sprint: Reliability & debt** — delete Paystack remnants; split the three largest files; add e2e for the payment return path; Sentry alert rules for the digest errors seen in production.
