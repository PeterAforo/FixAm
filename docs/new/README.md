# FixAm — Devin spec pack

Drop this folder into the root of your repo (an empty repo is fine), then start Devin with the kickoff prompt below.

```
specs/
  prompt.json              Master build prompt: role, rules, workflow, definition of done
  tasks.json               47 ordered tasks in 6 phases (P0–P5), each with acceptance criteria
  data-model.json          Every table, column, enum, RLS note and domain rule
  roles-permissions.json   Roles, permission matrix, field-level rules
  reminder-rules.json      Reminder engine + mileage prediction (with test cases)
  message-templates.json   SMS / WhatsApp / email / push templates + inbound reply rules
  integrations.json        Adapters (Paystack, Hubtel/Arkesel, WhatsApp, Resend, Web Push, Supabase Storage), webhooks, Inngest jobs
  ui-screens.json          Navigation per role and every screen's content
  ui-ux.json               Premium UI/UX spec: tokens, themes, motion, mascot, components, patterns, every surface
  plans.json               Subscription tiers, features, message allowances
  project.config.json      Stack, folder structure, scripts, env vars, conventions
  seed-data.json           Demo garage, staff, customers, vehicles, parts, vendors
  acceptance-tests.json    36 end-to-end scenarios (Playwright)
docs/
  PRD.md                   Product requirements
```

## Kickoff prompt for Devin

> Read every file in `specs/` and `docs/PRD.md`. `specs/prompt.json` is your master instruction and defines precedence between files. Build FixAm by working through `specs/tasks.json` in order, one pull request per task, ticking each task's acceptance criteria in the PR description. Start with Phase 0: post a short plan, then begin with task P0-01.

For later sessions:

> Continue FixAm from `specs/tasks.json`. The next task is **<TASK-ID>**. Follow `specs/prompt.json` rules and finish with the check suite passing.

## Before Devin reaches each phase

| Phase | You need to provide |
|---|---|
| P0 | GitHub repo, Vercel project, Supabase project (staging), Sentry DSN, Inngest account |
| P1 | Nothing new (mock providers) |
| P2 | Paystack test keys (GHS, MoMo enabled) |
| P4 | SMS provider account + registered sender ID; WhatsApp Business (Meta) number + approved templates from `message-templates.json`; Resend domain; insurance partner details |
| P5 | Plan prices in GHS (`plans.json` has `null` placeholders); real DVLA fee table |

Values marked SAMPLE or `null` (prices, DVLA fees, tax rates, insurance partner) are placeholders to replace before production.
