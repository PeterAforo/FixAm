<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Workflow rules

- **Always commit AND push to `origin/main` after every completed change.** Do not leave work uncommitted; the remote is https://github.com/PeterAforo/FixAm.git.
- **Keep the docs in step with the code.** Every change that alters behaviour,
  routes, schema or env vars must also update `docs/CHANGELOG.md`, and — where
  relevant — `docs/DECISIONS.md` and `docs/devin-spec/specs/*.json`
  (`data-model`, `roles-permissions`, `ui-screens`, `integrations`). Commit the
  docs with the code.

## Accounts, auth & routing — do not regress

- One account for everyone. Do **not** create per-role logins, user tables or
  session cookies. New roles become workspaces in `lib/accounts/workspaces.ts`.
- Auth/onboarding URLs carry **no query strings**: `/login`, `/signup`,
  `/signup/<role>`, `/onboarding`, `/onboarding/<role>`, `/account`. Role slugs:
  `garage`, `driver`, `parts-seller`, `insurance-broker`, `dvla-agent`
  (`app/(auth)/onboarding/roles.ts`). Post-login destination = `fixam_next`
  cookie (`proxy.ts`, `lib/auth/next-cookie.ts`).
- Redirect guests with a plain `redirect("/login")`; `proxy.ts` handles the
  return path. Link marketing CTAs to `/signup/<role>`.
- Phone sign-in: `lib/auth/phone-auth.ts`. Driver identity:
  `getSessionPhone()` / `getPortalPhone()`. Never trust `user_metadata` for
  identity; use `auth.phone`, `app_metadata`, or `public.users.phone`.
- Platform SMS (codes, broker alerts) → `lib/messaging/direct.ts`. Garage →
  customer messages → `lib/messaging/send.ts`.
- Workspace layouts (`/portal`, `/vendor`, `/broker`) use
  `components/shell/workspace-shell.tsx` + `getShellContext()`; the garage app
  uses `AppShell` with the `WorkspaceSwitcher`.
- Onboarding screens use `OnboardingFrame` (viewport-height, no page scroll).
