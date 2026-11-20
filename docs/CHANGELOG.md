# Changelog

## Unreleased — P0 foundation

### Added
- Next.js 16 App Router scaffold (TypeScript strict, Tailwind v4, ESLint,
  pnpm) with route skeletons for marketing, auth, app, portal, vendor,
  admin, magic-link, booking, and API routes.
- Pit Stop Pop design system: full token set in `app/globals.css` (light +
  workshop dark themes), brand fonts, `next-themes` toggle, and brand
  components (`Button`, `Card`, `StatusPill`, `PlateChip`, `MoneyText`,
  `StatTile`, `Stepper`, `EmptyState`, `CarAvatar`, `VehicleHealthCard`,
  `Confetti`, motion helpers).
- `/design` dev-only showcase route.
- Drizzle schema for the 15 foundation tables (`lib/db/schema/*`), generated
  SQL migration, and RLS policies/helpers migration (`drizzle/0001`).
- `lib/money` (pesewa helpers: format/parse/round/sum) and `lib/id` (UUID v7).
- Tooling: Vitest + Testing Library, Playwright, Prettier, Sentry
  instrumentation, Vercel Analytics/Speed Insights, GitHub Actions CI,
  `.env.example`, `messages/en.json`.

### Tests
- WCAG contrast tests for all text/background token pairs (both themes).
- Brand component unit tests; money and UUID v7 unit tests.
- Tenant-isolation integration test (skips without `DATABASE_URL`).
