# FixAm

The garage operating system for Ghana. Repairs, parts, vendors, reminders,
renewals and money — one vibrant SaaS for Ghanaian garages.

> Status: **P0 foundation** — scaffold, design system and database base are
> in place. Product features land in later phases (see `docs/devin-spec/specs/tasks.json`).

## Stack

Next.js (App Router) · TypeScript strict · Tailwind CSS v4 · shadcn/ui (Base UI) ·
Drizzle ORM · Supabase Postgres/Auth · Inngest · Paystack · Vitest · Playwright · pnpm

## Setup

```bash
pnpm install
cp .env.example .env.local   # fill in values (all optional for local UI work)
pnpm dev                     # http://localhost:3000
```

Design system showcase (dev only): `http://localhost:3000/design`

### Database

Requires Postgres (Supabase recommended). No local Postgres is bundled —
point `DATABASE_URL` / `DATABASE_URL_DIRECT` at a Supabase project or any
Postgres 15+ instance, then:

```bash
pnpm db:generate   # regenerate SQL migrations from lib/db/schema
pnpm db:migrate    # apply migrations (needs DATABASE_URL_DIRECT)
pnpm db:seed       # seed pilot data (lands with P1)
```

RLS policies and helper functions are in `lib/db/rls.sql` and ship inside
`drizzle/0001_rls-policies.sql`.

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest unit tests |
| `pnpm test:e2e` | Playwright smoke tests |
| `pnpm db:generate` / `db:migrate` / `db:seed` | Drizzle workflows |
| `pnpm inngest:dev` | Inngest dev server |
| `pnpm format` | Prettier |

## Docs

- `docs/PRD.md` — product requirements
- `docs/devin-spec/` — canonical spec pack (data model, roles, reminders,
  integrations, UI screens, design tokens, tasks, acceptance tests)
- `docs/DECISIONS.md` — implementation decisions & assumptions
- `docs/CHANGELOG.md` — change log
