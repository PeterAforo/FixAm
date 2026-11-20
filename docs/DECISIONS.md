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

