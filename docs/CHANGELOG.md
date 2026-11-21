# Changelog

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
