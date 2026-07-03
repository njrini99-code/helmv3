# Helm Tools & Services Registry

> **Part of:** Helm Sports Labs — Mission Control context pack
> **Audience:** partners (non-technical) + AI agents / n8n automations
> **Sibling docs:** `docs/operations/HELM_MISSION_CONTROL_OS.md` · `docs/operations/N8N_WORKFLOW_SPECS.md` · `docs/operations/HULY_WORKSPACE_SETUP.md`

This is the single roll-up of every tool and service Helm depends on, grouped by category. It was cross-checked against `package.json` (dependency versions), `CLAUDE.md` ("Product integrations" + "Code Review Tooling"), `vercel.json`, `.circleci/config.yml`, `.env.example`, and the referenced source files. Anything that could **not** be verified from files in this repo is labelled **unverified (memory)** — meaning it comes from the Mission Control operating memory or an external dashboard, not from a file you can open here.

**Rules for this doc:** pointers only — no tokens, keys, passwords, or connection strings. Version numbers are from `package.json` and drift over time; treat them as "roughly this" not gospel.

---

## 1. Framework / Infrastructure

The foundation everything runs on.

| Tool | Purpose | Tier/plan | Where configured | Partner-visible? | Notes |
|------|---------|-----------|------------------|------------------|-------|
| **Next.js 16 (App Router)** | Web app framework (server + client rendering) | Open-source | `next ^16.0.10` in package.json; `next.config.mjs` | No (they see the app it produces) | Build runs `next build --webpack` |
| **TypeScript (strict)** | Typed language for all app code | Open-source | `typescript ^5.9.3`; `tsconfig.json` | No | `npm run typecheck` gate |
| **Supabase** | Postgres DB + Auth (JWT) + Storage + Realtime + Row-Level Security | Paid project (single shared prod) | `@supabase/ssr ^0.10`, `@supabase/supabase-js ^2.107`; `supabase` CLI; `src/lib/supabase/` | No | **One shared prod project across golf + baseball + lifting.** RLS is a hard merge gate |
| **Vercel** | Hosting + deploys + serverless/cron runtime | Paid | `vercel.json` (region `iad1`); Vercel CLI | Indirectly (they use the deployed site) | **Auto-deploys `main` only** (`git.deploymentEnabled: {"*": false, "main": true}` in vercel.json). Project **`helmv3`** — confirmed via `package.json` `name`. Vercel team name **unverified (memory)** |
| **Tailwind CSS** | Utility CSS / design tokens | Open-source | `tailwindcss ^3.4.19`; `tailwind.config.ts` | No | v3.x (not v4) |
| **Capacitor** | Native iOS wrapper for the web app | Open-source | `@capacitor/* ^8.x`; `capacitor.config.ts`; `ios/` | No (ships as the iOS app) | Also provides haptics, keyboard, share, splash, status-bar, network plugins |
| **Upstash Redis + Ratelimit** | Serverless Redis for rate limiting | Free / pay-as-you-go | `@upstash/redis ^1.38`, `@upstash/ratelimit ^2.0.8` | No | — |
| **GrowthBook** | Feature flags / gating | Open-source SDK | `@growthbook/growthbook ^1.6.5`; `src/lib/coachhelm/v3/foundation/flags.ts` | No | Present in CoachHelm v3 foundation flag layer |

---

## 2. AI

| Tool | Purpose | Tier/plan | Where configured | Partner-visible? | Notes |
|------|---------|-----------|------------------|------------------|-------|
| **Vercel AI Gateway** | Primary LLM routing for CoachHelm (narrative, hero insight, coach chat) | Vercel platform feature (used via the `ai` SDK) | `src/lib/coachhelm/v3/llm/compose.ts` (routing via `generateText`), `src/lib/coachhelm/v3/llm/types.ts` (model strings), `src/lib/coachhelm/v3/chat/agent.ts` | No (outputs surface as insights) | **Verified in source.** Gateway path uses OIDC + Vercel credits (per `agent.ts` comment); routes to Claude models. Not a package.json dependency |
| **Anthropic (Claude) via `@ai-sdk/anthropic` + `ai` SDK** | Direct-to-Anthropic fallback when a key is set | Paid API | `@ai-sdk/anthropic ^3.0.81`, `ai 6.0.197`; `src/lib/coachhelm/v3/chat/agent.ts` reads `ANTHROPIC_API_KEY` | No | Fallback path: `agent.ts` uses the direct Anthropic provider when `ANTHROPIC_API_KEY` is present, otherwise the Gateway model string |
| **CoachHelm insight / NLG engine** | Helm's own AI layer: mining, prediction, learning, natural-language generation | In-house | `src/lib/coachhelm/v2/` (and `v3/`); ref `memory/context/coachhelm-ai.md` | Yes (insights, alerts, round reviews are the product) | Not a vendor — Helm-built on top of Claude |
| **Promptfoo** | LLM eval harness (catches silent prompt drift) | Open-source | `promptfoo ^0.121.12`; `evals/round-review.yaml`; `npm run evals` | No | Runs weekly in CircleCI `promptfoo-evals`. Per CLAUDE.md, needs `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` |

---

## 3. Telemetry / Observability

These feed the Mission Control **Telemetry / App Health** space in Huly.

| Tool | Purpose | Tier/plan | Where configured | Partner-visible? | Notes |
|------|---------|-----------|------------------|------------------|-------|
| **Sentry** | Error tracking + Session Replay + profiling | Paid | `@sentry/nextjs ^10.56`, `@sentry/profiling-node`; `src/instrumentation-client.ts`; org via `SENTRY_ORG` env in `next.config.mjs` | Summaries only (via Huly) | Org name **unverified (memory)** (read from `SENTRY_ORG`, not hardcoded). Replay: 100% on errors, 10% session in prod, 0% dev, `maskAllText` on |
| **PostHog** | Product analytics / event capture | Free / paid | `posthog-js ^1.257`, `posthog-node ^4.18` | Summaries only | — |
| **Datadog** | Browser logs + Real User Monitoring (RUM) | Paid | `@datadog/browser-logs`, `@datadog/browser-rum ^6.25`; `datadog/` (README only) | No | — |
| **Vercel Analytics + Speed Insights** | Traffic + Core Web Vitals | Included w/ Vercel | `@vercel/analytics ^2.0`, `@vercel/speed-insights ^2.0` | No | — |
| **Lighthouse CI** | Performance / a11y / CLS budgets on preview URLs | Open-source | `@lhci/cli ^0.15`; `lighthouserc.cjs`; `npm run lighthouse` | No | a11y + CLS are hard errors, perf is a warning; runs in CircleCI `lighthouse-preview` |

---

## 4. CI & Code Review

Two AI reviewers run in parallel on every PR, plus a local gate that mirrors them. Full rules in `CLAUDE.md` "Code Review Tooling".

| Tool | Purpose | Tier/plan | Where configured | Partner-visible? | Notes |
|------|---------|-----------|------------------|------------------|-------|
| **GitHub Actions** | Per-PR fast path: typecheck, lint, vitest, build, RLS tests, Review Gate | Included w/ GitHub | `.github/workflows/ci.yml` | No | — |
| **CircleCI** | Heavier jobs: weekly checks + iOS Capacitor compile | Paid | `.circleci/config.yml`; `.circleci/README.md` | No | `weekly` (Mon 06:00 UTC, via `run-weekly` pipeline param) + `ios` on native branches |
| **CodeRabbit** | Blocking AI line-level review | Paid (GitHub App) | `.coderabbit.yaml`; `.coderabbit/ast-grep/`, `.coderabbit/semgrep/` | No | Assertive profile, pre-merge gate; blocks on service-role-in-client, missing RLS, unauth server action, sport-prefix violation, destructive DELETE-then-INSERT |
| **Greptile** | Whole-codebase AI review (business-context aware) | Paid (GitHub App) | `.greptile/config.json` (holds the `instructions` field + ignores), `.greptile/rules.md` (hard rules), `.greptile/files.json` (business-context docs) | No | Catches duplicated logic, broken callers, architecture drift. (Note: `CLAUDE.md` mentions a `.greptile/instructions.md`, but this checkout keeps that context inside `config.json`) |
| **Review Gate** | Local mirror of the linter toolchain so merges block even if AI reviewers are down | In-house workflow | `.github/workflows/review-gate.yml` | No | Aggregate check `Review Gate / all` |
| **Vitest** | Unit / integration / RLS / business test runner | Open-source | `vitest ^4.0.18`; `vitest.config.ts` | No | Split by project: unit, integration, rls, business |
| **Playwright** | E2E browser tests (+ axe a11y) | Open-source | `@playwright/test ^1.57`, `@axe-core/playwright`; `playwright.config.ts`; `e2e/` | No | Runs in GHA on every PR (per CLAUDE.md) |
| **Knip** | Dead-code / unused-export detection | Open-source | `knip ^5.86`; `knip.json` | No | Runs in the CircleCI `weekly` workflow |
| **Stryker** | Mutation testing on `src/lib/coachhelm/v2/` | Open-source | `.circleci/config.yml` (`stryker-coachhelm` job) only | No | **Not a package.json dependency** — installed on demand in CircleCI (`npm install --no-save @stryker-mutator/*` + `npx stryker run`) |
| **fast-check** | Property-based testing | Open-source | `fast-check ^4.8`; e.g. `src/lib/coachhelm/v2/shot-analysis/__tests__/shot-level-sg.property.test.ts` | No | Best fit: SG calc, qualifier scoring, state machines |
| **External linters** (gitleaks, semgrep, ast-grep, actionlint, yamllint, markdownlint, shellcheck, ruff/pylint, sqlfluff, hadolint, checkov) | Secret scan, static analysis, config/lint safety | Open-source CLIs | Review Gate + CodeRabbit config; `.gitleaks.toml`, `.coderabbitignore` | No | Not npm deps; run by the review toolchain |

---

## 5. Jobs / Durable Workflows

| Tool | Purpose | Tier/plan | Where configured | Partner-visible? | Notes |
|------|---------|-----------|------------------|------------------|-------|
| **Inngest** | Durable/retryable background workflows (replaces scattered cron + retry loops) | Free tier | `inngest ^4.5`; `src/lib/inngest/client.ts`, `functions.ts`; `src/app/api/inngest/route.ts` | No | Prod needs `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`. Local: `npx inngest-cli@latest dev` (:8288). Covers weekly backfills W12/W20/W27/W33/W35 (per CLAUDE.md) |
| **Vercel Cron** | Scheduled route hits (digests, sweeps, calibration, reminders) | Included w/ Vercel | `vercel.json` → `crons[]` (14 entries); routes under `src/app/api/cron/` | No | **Verified in vercel.json:** `coachhelm-roster-sweep` (45 3 * * *), `coach-morning-digest` (30 6 * * *), `coachhelm-calibration` (30 3 * * *), `coachhelm-validation`, `coachhelm-safety-net`, `coachhelm-insight-lifecycle`, `event-reminders`, `task-reminders`, `v3/standing-refresh`, `v3/genome-nightly`, `v3/causality-attribute`, `v3/weekly-coach-email`, `v3/goal-suggestions-write`, `v3/goal-suggestions-evaluate` |

---

## 6. Comms / GTM (Go-To-Market)

| Tool | Purpose | Tier/plan | Where configured | Partner-visible? | Notes |
|------|---------|-----------|------------------|------------------|-------|
| **Resend** | Transactional + branded email; inbound webhooks | Paid | `resend ^6.7`; `docs/setup/RESEND_SETUP.md`; `src/app/api/webhooks/resend/route.ts` | Recipients see emails | Inbound/webhook signatures verified via **Svix** (`svix ^1.86`) |
| **Gmail API (Workspace domain-wide delegation)** | Cold CRM sending from a Workspace mailbox | Paid (Workspace) | `src/lib/crm/gmail-send.ts`; `docs/setup/GMAIL_SEND_SETUP.md`; `.env.example` | No | **Gated on `GMAIL_SA_*` env — inert until configured** (needs all three of `GMAIL_SA_CLIENT_EMAIL` + `GMAIL_SA_PRIVATE_KEY` + `GMAIL_SEND_AS`) |
| **Apollo.io** | Lead gen + contact/company enrichment | Paid | Used via the Apollo MCP connector | No | Plan **unverified (memory)**; not a package.json dep |
| **NCAA coach CRM** | In-house prospect DB of college coaches | In-house | `crm_coaches` table (Supabase); CRM components + `docs/setup/RESEND_SETUP.md` | No | Table verified; the row count ("~1,889 D1–JUCO") is **unverified (memory)** — treat as approximate |
| **calendar.app.google booking link** | Public demo/meeting booking | Google Calendar | External link (see CRM outreach memory) | Yes (prospects book) | Link slug omitted on purpose — pointer only |

---

## 7. UI / Maps

All verified in `package.json`.

| Tool | Purpose | Tier/plan | Where configured | Partner-visible? | Notes |
|------|---------|-----------|------------------|------------------|-------|
| **Mapbox** | Maps for course maps, travel itineraries, recruiting heat-maps | Free tier (50K web loads / 25K mobile MAU / mo) | `mapbox-gl ^3.24`; `src/lib/mapbox/client.ts`; `src/components/maps/CourseMap.tsx` | Yes (in-app maps) | **Public token only — restrict by URL** in the Mapbox dashboard |
| **Sonner** | Toast notifications | Open-source | `sonner ^2.0`; Toaster in `src/app/layout.tsx` | Yes | — |
| **cmdk** | Command palette | Open-source | `cmdk ^1.1`; `src/components/CommandPalette.tsx`, `src/components/golf/CommandPalette.tsx` | Yes | — |
| **Number Flow** | Animated stat numbers | Open-source | `@number-flow/react ^0.6`; `src/components/ui/animated-number.tsx` | Yes | — |
| **framer-motion** | Animations / motion | Open-source | `framer-motion ^12.40` | Yes | — |
| **Recharts + visx** | Charts / data-viz | Open-source | `recharts ^3.8`, `@visx/visx ^3.12` | Yes | — |
| **react-day-picker** | Date/calendar picker | Open-source | `react-day-picker ^10.0` | Yes | — |
| **dnd-kit** | Drag-and-drop | Open-source | `@dnd-kit/core`, `/sortable`, `/utilities` | Yes | — |
| **Radix UI** | Accessible headless primitives (dialog, dropdown, popover, tabs, tooltip, toggle-group, etc.) | Open-source | `@radix-ui/react-*` | Yes | — |
| **Base UI** | Additional headless UI primitives | Open-source | `@base-ui-components/react ^1.0.0-rc` | Yes | — |
| **Also present** (verified): `lucide-react` (icons), `geist` (font), `vaul` (drawer), `lenis` (smooth scroll), `@tanstack/react-table`, `html2canvas`, `jspdf`, `zustand` (state), `zod` (validation) | Supporting UI/util libs | Open-source | package.json | Yes/No (mixed) | Listed for completeness |

---

## 8. Push Notifications

| Tool | Purpose | Tier/plan | Where configured | Partner-visible? | Notes |
|------|---------|-----------|------------------|------------------|-------|
| **web-push** | Web push (browser) | Open-source | `web-push ^3.6`, `@types/web-push` | Yes (users receive) | Needs VAPID keys |
| **APNs via Capacitor** | Native iOS push + local notifications | Apple Developer | `@capacitor/push-notifications ^8.1`, `@capacitor/local-notifications ^8.2` | Yes | Requires Apple Push cert/key |

---

## 9. Command Center (Mission Control)

The partner-facing operating layer. Details in the sibling docs.

| Tool | Purpose | Tier/plan | Where configured | Partner-visible? | Notes |
|------|---------|-----------|------------------|------------------|-------|
| **Huly** | Partner-facing HQ: plain-English command center (spaces for Mission Control, Active Fixes, Git Activity Timeline, Roadmap, Competitive Intel, Customer/Coach Intelligence, Docs Registry, Partner Decisions, Launch/Sales, Telemetry/App Health) | TBD | `docs/operations/HULY_WORKSPACE_SETUP.md` | **Yes — this is the partner surface** | GitHub stays engineering truth; Huly mirrors + explains it |
| **n8n** | Self-hosted automation glue between GitHub, Huly, Vercel, Sentry, PostHog, Drive, Gmail, partner forms | Self-hosted (free) | Nick's Mac mini; `docs/operations/N8N_MAC_MINI_SETUP.md`; `~/helm-ops/n8n/` (Docker Compose) | **No — partners must not access n8n** | Editor kept private (Tailscale); webhooks via Cloudflare Tunnel. **Never auto-merges code or mutates prod** |
| **Notion** | Live command-center databases (per Mission Control memory: Incidents/Deploys/PRs/Roadmap/CRM/Competitors) | Paid | Via Notion MCP + Sentry/Vercel/GitHub sync | Partial | Exact DB set is **unverified (memory)** — not defined by a file in this repo |

---

## 10. MCP Connectors

Model Context Protocol connectors an AI agent can call. "In use" = surfaced in this environment's tool list; "available" = loadable but not necessarily active.

| Connector | Purpose | Status | Partner-visible? | Notes |
|-----------|---------|--------|------------------|-------|
| **GitHub** | Issues, PRs, code search, commits | In use | No | Engineering source of truth |
| **Supabase** | DB queries, migrations, logs, advisors | In use | No | Points at the shared prod project — read-only preferred for monitoring |
| **Sentry** | Error/issue lookup, Seer analysis | In use | No | — |
| **Vercel** | Deployments, logs, runtime errors | In use | No | — |
| **Notion** | Command-center DB read/write | In use | Partial | Powers Mission Control DBs |
| **Apollo.io** | Lead/company enrichment + search | In use | No | GTM |
| **Playwright / Chrome DevTools** | Browser automation, perf/a11y audits | Available | No | — |
| **Figma** | Design read/write, Code Connect | Available | No | Design workflows |
| **Gmail** | Draft/label/search email | Available | No | Separate from the Workspace DWD send path (§6) |
| **Google Drive / Calendar** | Docs + scheduling | Available | No | Feeds n8n intake + briefs |
| **PostHog** | Analytics queries, replays, signals | Available | No | — |

> Note: many other MCP servers are technically loadable in this environment (e.g. Sprouts, ZoomInfo, IBISWorld, Tavily). Only the ones above are part of Helm's intended Mission Control workflow; the rest are ambient and out of scope.

---

## 11. Design System

| Tool | Purpose | Tier/plan | Where configured | Partner-visible? | Notes |
|------|---------|-----------|------------------|------------------|-------|
| **Fairway** | Warm-premium Helm design system — token-backed utilities, type roles, radii, elevation | In-house | `tailwind.config.ts` ("FAIRWAY DESIGN SYSTEM" token blocks); flag-gated via `.env.example` ("Fairway redesign feature flag"); `bg-fairway` used in `landing/components/Hero.tsx` | Yes (it *is* the look where enabled) | **Name verified in repo** (tailwind.config.ts + .env.example). Additive/opt-in: only components inside the `.fairway-ds` scope consume the new tokens; the current app appearance is unchanged until the flag is on. The direction "golf is the reference, baseball must conform" is **unverified (memory)**. Per `CLAUDE.md`, the visual language is "California-modern × neo-futurism — warm cream (`#FFFEFA`) + green (`#16A34A`), matte surfaces, editorial typography, slow cinematic motion" (Key Patterns also use glass cards, `bg-white/70 backdrop-blur-xl`) |

---

## For Mission Control

How the three Mission Control systems should use this registry.

| System | How to use this doc |
|--------|---------------------|
| **n8n** | Treat this as the **service inventory** behind the workflow specs. When a signal arrives (Sentry/Vercel/PostHog/GitHub/partner form per `N8N_WORKFLOW_SPECS.md`), use the "Where configured" column to attach the right evidence link, and the "Partner-visible?" column to decide what may appear in a partner-facing summary. **Never** put anything from a tool's config path (keys, env, connection strings) into an issue, Huly card, PR, or AI prompt — pointers only. Honor the non-negotiables: no auto-merge, no silent prod changes, redact logs. |
| **Huly** | Map tools to spaces: telemetry tools (§3) → **Telemetry / App Health**; CI & review tools (§4) → status in the **Git Activity Timeline**; GTM tools (§6) → **Launch / Sales**. Only tools marked **Partner-visible? = Yes** should be named directly in partner cards; everything else appears as plain-English outcome summaries. Huly itself is the partner surface — n8n keeps it in sync; GitHub stays the engineering truth. |
| **Greptile** | Use this as **architecture ground truth** for whole-codebase review. Flag drift when code introduces a tool/service not listed here (or removes one that is), when a service is used outside its "Where configured" path, or when a partner-visible claim contradicts the "Partner-visible?" column. Cross-reference `.greptile/config.json`, `.greptile/rules.md`, and `.greptile/files.json`; enforce the same hard rules CodeRabbit blocks on. |

> **Maintenance:** version numbers come from `package.json` and rot fast — re-verify before quoting them. Rows still marked **unverified (memory)** (Vercel team, Sentry org, Apollo plan, NCAA CRM row count, Notion DB set, and the "golf-reference/baseball-conforms" Fairway direction) must be confirmed against a real file or dashboard before a partner relies on them.
