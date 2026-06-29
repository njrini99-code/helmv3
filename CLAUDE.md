# CLAUDE.md - Helm Sports Labs

> **Read this entire file before writing ANY code.**

---

## What This Is

**Helm Sports Labs** - Multi-sport SaaS platform
- **BaseballHelm**: College baseball recruiting (coaches ↔ players) + team management
- **GolfHelm**: College golf team management + CoachHelm AI layer

**Stack**: Next.js 16 (App Router) • TypeScript strict • Supabase • Tailwind
**Design**: California-modern × neo-futurism — warm cream + helm green, matte surfaces, editorial typography, slow cinematic motion

---

## CONTEXT ROUTING — Where to Look

> **Before starting any GolfHelm task, read the file(s) that match your task type.**

### Feature-Aware Routing

For feature work, use `memory/registry.yml` first. It maps code paths to the current-state feature docs, business rules, UI contracts, tests, and suggested checks.

```bash
npm run knowledge:map -- --files <paths...>
npm run knowledge:context -- --files <paths...> --task "<task>"
```

For large changes or PR reviews, read `/tmp/helmv3-context-pack.md` after generating it. If a changed file does not map to a feature, either add the registry entry or call out the missing feature-awareness coverage.

### By Task Type

| If you're working on... | Read this file FIRST |
|------------------------|---------------------|
| **Any golf feature** (understanding behavior, fixing bugs, adding to it) | `memory/context/golfhelm-features.md` — Find the feature by name, get data flow, files, tables, dependencies, gaps |
| **Database queries** (writing SQL, adding columns, debugging data) | `memory/context/golfhelm-database.md` — Every column of every table |
| **Table names or enums** (quick lookup, "what table stores X?") | `memory/glossary.md` — All 75 tables, all enums, all type locations |
| **CoachHelm AI** (insights, patterns, predictions, reviews, philosophy) | `memory/context/coachhelm-ai.md` — V2 engine architecture, pipeline, components |
| **Routes, actions, or file locations** ("where is the code for X?") | `memory/projects/golfhelm.md` — All routes, all 41 action files, component directories |
| **Baseball features** | No deep reference yet — use `src/app/baseball/` directly |

### By Role Context

| If the task involves... | Key features to reference (in `golfhelm-features.md`) |
|------------------------|------------------------------------------------------|
| **Coach dashboard work** | #13 Alerts, #14 Patterns, #15 Insights, #16 Intelligence, #17 Analytics, #18 Coaching Settings, #25 Development Plans |
| **Player dashboard work** | #19 Player Hub, #20 Player CoachHelm, #21 My Development, #22 My Qualifiers, #23 Round Review |
| **Team management** | #4 Calendar, #5 Roster, #6 Tasks, #7 Messaging, #8 Announcements, #9 Documents, #10 Travel, #24 Team Info |
| **Data/stats** | #1 Round Tracking, #2 Stats & Analytics, #3 Qualifiers |
| **AI/CoachHelm** | #12 CoachHelm Engine + `memory/context/coachhelm-ai.md` for engine internals |
| **Settings/config** | #26 Settings, #18 Coaching Intelligence Settings |
| **Admin/platform** | #28 Admin Dashboard |

### Quick Reference (no file read needed)

These are embedded here for speed — the things you'll need on every task:

---

## CRITICAL RULES

### 1. Type Imports
```typescript
import type { Player, Coach, Organization } from '@/lib/types';
// NEVER: @/types/database, @/types/supabase (don't exist)
```

### 2. Supabase Client
```typescript
// Server: await createClient() from '@/lib/supabase/server'
// Client: createClient() from '@/lib/supabase/client' (with 'use client')
```

### 3. Table Names — ALWAYS Use Sport Prefix
```typescript
// WRONG: coaches, players, teams, rounds, events (no prefix = doesn't exist)
// RIGHT: golf_coaches, golf_players, golf_teams, golf_rounds, golf_events
// Full list of 75 golf tables: memory/glossary.md
// Full column definitions: memory/context/golfhelm-database.md
```

### 4. Client Components
```typescript
// Any file using useState/useEffect/onClick MUST start with 'use client';
```

---

## COACH vs PLAYER vs TEAM — Feature Ownership

### Coach-Only Features
| Feature | Route | Primary Table | Action File |
|---------|-------|---------------|-------------|
| Alerts | `/dashboard/alerts` | golf_coach_insights | alerts.ts |
| Patterns | `/dashboard/patterns` | golf_patterns_v2 | pattern-management.ts |
| Insights | `/dashboard/insights` | golf_coach_insights | insight-management.ts |
| Intelligence Hub | `/dashboard/intelligence` | (multiple CoachHelm) | intelligence-dashboard.ts |
| CoachHelm Analytics | `/dashboard/analytics/coachhelm` | golf_insight_effectiveness | coachhelm-analytics.ts |
| Coaching Settings | `/dashboard/settings/coaching-intelligence` | golf_coach_philosophy | (in settings page) |
| Development Plans | `/dashboard/development` | golf_player_focus_areas | development.ts |
| Create Qualifier | `/dashboard/qualifiers/new` | golf_qualifiers | golf.ts |
| Team Stats | `/dashboard/stats/team` | golf_player_stats_cache | stats.ts, stats-v2.ts |

### Player-Only Features
| Feature | Route | Primary Table | Action File |
|---------|-------|---------------|-------------|
| Player Hub (home) | `/dashboard/hub` | (travel, tasks, events) | dashboard-data.ts |
| Player CoachHelm | `/dashboard/coachhelm` | golf_predictions | shot-analytics.ts |
| My Development | `/dashboard/my-development` | golf_player_focus_areas | development.ts |
| My Qualifiers | `/dashboard/my-qualifiers` | golf_qualifier_entries | golf.ts |
| Round Entry | `/dashboard/rounds/new` | golf_rounds | golf.ts |
| Continue Round | `/dashboard/rounds/continue/[id]` | golf_shots | golf.ts |
| Round Review | `/dashboard/rounds/[id]/review` | golf_round_reviews | round-reviews.ts, round-review-system.ts |
| Classes | `/dashboard/classes` | golf_player_classes | (inline) |
| My Insights (redirect) | `/dashboard/my-insights` → `/dashboard/coachhelm` | — | — |

### Team Features (Both Coach + Player)
| Feature | Route | Primary Table | Action File |
|---------|-------|---------------|-------------|
| Calendar & Events | `/dashboard/calendar` | golf_events | event-lifecycle.ts, attendance.ts |
| Roster | `/dashboard/roster` | golf_team_members | roster.ts |
| Messaging | `/dashboard/messages` | golf_messages | messages.ts |
| Announcements | `/dashboard/announcements` | golf_announcements | announcements.ts |
| Tasks | `/dashboard/tasks` | golf_tasks | tasks.ts |
| Documents | `/dashboard/documents` | golf_documents | documents.ts |
| Travel | `/dashboard/travel` | golf_travel_itineraries | travel.ts |
| Qualifiers (view) | `/dashboard/qualifiers` | golf_qualifiers | golf.ts |
| Stats (personal) | `/dashboard/stats` | golf_player_stats_cache | stats.ts |
| Team Info | `/dashboard/team` | golf_teams | teams.ts |
| Settings | `/dashboard/settings` | users, golf_coaches/players | (inline) |

### Platform (Admin)
| Feature | Route | Action File |
|---------|-------|-------------|
| Admin Dashboard | `/golf/admin` | admin-data.ts |
| Join Team | `/golf/join/[code]` | roster.ts |

---

## Design System

### Colors
```
Primary:    #16A34A (Kelly green) - buttons, accents, active states
Background: #FFFEFA (cream)
Glass:      rgba(255,255,255,0.7) backdrop-blur-xl
Text:       #1c1917 (warm-900 primary), #78716c (warm-500 secondary)
Status:     #16A34A success, #DC2626 error, #F59E0B warning
```

### Key Patterns
```typescript
// Glass card
"bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass"
// Hover
"hover:bg-white/80 hover:shadow-card-hover transition-all duration-200"
// Typography: h1=text-3xl, h2=text-2xl, h3=text-xl, body=text-base, small=text-sm
// Spacing: card p-6/p-8, radius rounded-2xl, gap-6 between cards
```

### Quality Bar
Apple-grade premium polish:
- Skeleton loaders (not spinners), helpful empty states, user-friendly errors
- Subtle framer-motion animations, proper accessibility, server components by default

---

## Code Patterns

### Server Action
```typescript
'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function doThing(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  // ... mutation ...
  revalidatePath('/golf/dashboard');
  return { success: true };
}
```

### Server Component Data Fetching
```typescript
import { createClient } from '@/lib/supabase/server';
export default async function Page() {
  const supabase = await createClient();
  const { data } = await supabase.from('golf_players').select('*').order('last_name');
  return <Component data={data ?? []} />;
}
```

### Client Component
```typescript
'use client';
import { createClient } from '@/lib/supabase/client';
import { useState, useEffect } from 'react';
// ... hooks and interactivity ...
```

---

## File Structure (Key Paths)

```
src/app/golf/
├── actions/              # 41 server action files (see memory/projects/golfhelm.md)
├── (dashboard)/dashboard/  # All dashboard routes
├── (auth)/               # Login, signup, forgot/reset password
├── (onboarding)/         # Coach (3-step) + Player (4-step)
├── join/[code]/          # Team join flow
└── admin/                # Admin panel

src/components/golf/      # 256+ components
├── coachhelm/            # 80+ CoachHelm AI components
├── calendar/             # 30+ Calendar components
├── player-hub/           # Player Hub home
└── ...                   # roster/, rounds/, messages/, tasks/, stats/, etc.

src/lib/
├── supabase/             # server.ts, client.ts
├── types/                # ALL types (index.ts re-exports)
│   ├── golf.ts           # Entity types
│   └── golf-course.ts    # Course types
├── coachhelm/            # AI engine (see memory/context/coachhelm-ai.md)
│   └── v2/               # V2: orchestrator, mining, prediction, learning, NLG
└── utils.ts              # cn(), formatters

src/hooks/golf/           # 12 hooks (realtime, data, offline)
src/stores/               # Zustand (golf-auth-store.ts)
```

---

## Baseball Product: User Types & Roles

### Coach Types
| Type | Recruiting? | Team Mgmt? | Notes |
|------|-------------|------------|-------|
| **College** | Full suite | No | Primary recruiter |
| **High School** | No | Yes | Develops players, facilitates recruiting |
| **JUCO** | Toggle mode | Toggle mode | Recruit + prepare for transfer |
| **Showcase** | No | Multi-team | Manages travel ball orgs |

### Player Types
| Type | Recruiting? | Teams | Notes |
|------|-------------|-------|-------|
| **High School** | Opt-in activate | HS + optional Showcase | Primary recruiting target |
| **Showcase** | Opt-in activate | Showcase + optional HS | Travel ball |
| **JUCO** | Opt-in activate | JUCO only | Transfer recruiting |
| **College** | Never | College only | Team features only |

### Recruiting Activation Model
Players must **opt-in** to recruiting. Before activation: anonymous interest ("A D1 coach viewed your profile"). After: identified ("Coach Davis from Texas A&M viewed your profile"). College players cannot activate.

### Pipeline Stages (Baseball - only 5 valid)
```typescript
type PipelineStage = 'watchlist' | 'high_priority' | 'offer_extended' | 'committed' | 'uninterested';
```

---

## Pre-Submit Checklist

- [ ] Types from `@/lib/types` only
- [ ] Correct Supabase client (server vs client)
- [ ] `'use client'` on interactive components
- [ ] Server actions check auth first
- [ ] Mutations call `revalidatePath()`
- [ ] No `any` types, no `console.log`
- [ ] Uses design system colors/spacing
- [ ] Matches existing component patterns

---

## Commands

```bash
npm run dev          # Dev server (localhost:3000)
npm run typecheck    # TypeScript check
npm run lint         # ESLint
npm run lint:ratchet # Fails if warnings increase above .lint-baseline.json
npm run build        # Production build
npm run verify       # typecheck + lint + lint ratchet + unit tests + build
npm run verify:full  # verify + integration + rls + knowledge check
npm run verify:db    # db type drift + migration ledger + Vitest RLS lane

# Inventory docs (auto-regenerated; do not edit AUTOGEN blocks by hand)
npm run docs:regen   # Regenerate memory/glossary.md + memory/projects/golfhelm.md inventory
npm run docs:check   # CI guard — fails if inventory is out of sync

# Tests (Vitest workspace split by file naming)
npm test                  # unit only (fast inner loop)
npm run test:all          # every project (unit + integration + rls)
npm run test:integration  # *.integration.test.{ts,tsx}
npm run test:rls          # *.rls.test.{ts,tsx}
npm run test:e2e          # Playwright (also runs in GHA on every PR)
npm run verify:e2e:smoke  # Playwright smoke hard gate

# Quality (one-shot)
npm run evals             # Promptfoo LLM eval — needs ANTHROPIC_API_KEY or OPENAI_API_KEY
npm run lighthouse        # Lighthouse CI against PREVIEW_URL (or localhost:3000)

# Inngest (durable workflows — replaces scattered cron + retry loops)
npx inngest-cli@latest dev  # Local dev server on :8288 (auto-discovers /api/inngest)

# Platform CLIs (installed via brew)
supabase --version   # Supabase CLI (>= 2.101.0)
vercel --version     # Vercel CLI (>= 54.x)
```

## Auto-regen inventory docs

The "75 tables / 41 action files / 12 hooks" numbers that appeared in
older versions of this doc rotted within weeks. To stop the rot,
inventory sections of `memory/glossary.md` and `memory/projects/golfhelm.md`
are now regenerated by `scripts/regen-docs.mjs` from sources of truth:

- Tables, views, functions, enums → `src/lib/types/database.ts`
- Routes → `src/app/**/page.tsx`
- Server actions → `src/app/**/actions/**/*.ts`
- Hooks → `src/hooks/**/*.ts`

The script only touches content between `<!-- AUTOGEN:<name>:start -->`
and `<!-- AUTOGEN:<name>:end -->` markers. Hand-curated narrative
elsewhere in those files is preserved. **Never hand-edit inside an
AUTOGEN block** — your edit will be overwritten on the next run.

CI behavior: `.github/workflows/docs-regen.yml` runs on every push to
`main` that touches a source of truth, and opens an auto-PR titled
"docs: regen inventory blocks" if the regenerated content drifts.
Approve and squash-merge.

## Product integrations

- **Inngest** (durable workflows) — client at `src/lib/inngest/client.ts`,
  functions at `src/lib/inngest/functions.ts`, handler at
  `src/app/api/inngest/route.ts`. Free tier covers our weekly backfills
  (W12/W20/W27/W33/W35) with room to spare. Local dev runs on
  `npx inngest-cli@latest dev`; production needs `INNGEST_EVENT_KEY` +
  `INNGEST_SIGNING_KEY` env vars. See `.env.example`.
- **Mapbox** (maps) — token helper at `src/lib/mapbox/client.ts`,
  React component at `src/components/maps/CourseMap.tsx`. Free tier:
  50K web loads / 25K mobile MAU per month. Public token only —
  restrict by URL in the Mapbox dashboard. Used for course maps in
  Round Review (#23), Travel itineraries (#10), and recruiting
  heat-maps.
- **Sonner** (toasts), **cmdk** (command palette), **Number Flow**
  (animated stats) — already wired. Toaster lives in `src/app/layout.tsx`;
  command palettes at `src/components/CommandPalette.tsx` and
  `src/components/golf/CommandPalette.tsx`; animated stat numbers via
  `src/components/ui/animated-number.tsx` (with mount-roll stagger).
- **fast-check** (property-based testing) — example suite at
  `src/lib/coachhelm/v2/shot-analysis/__tests__/shot-level-sg.property.test.ts`.
  Pattern: generate 100s of inputs per invariant, shrink failures to
  minimal repro. Best fit for SG calculations, qualifier scoring, state
  machine transitions.
- **@axe-core/playwright** (a11y in E2E) — `e2e/accessibility.spec.ts`
  audits the public routes (landing, login, signup) against WCAG 2.1
  AA + WCAG 2.2 AA. Extend per-route as we add seeded auth fixtures.
- **Promptfoo** (LLM evals) — config at `evals/round-review.yaml`.
  Run via `npm run evals` locally; runs weekly in CircleCI's
  `promptfoo-evals` job. Catches silent prompt drift between deploys.
- **Lighthouse CI** — config at `lighthouserc.cjs`, runs against
  Vercel preview URLs in CircleCI's `lighthouse-preview` job on
  every push. a11y + CLS are hard errors; perf is a warning.
- **Sentry Session Replay** — already wired in
  `src/instrumentation-client.ts`. 100% sample on errors, 10% session
  sample in prod, 0% in dev. `maskAllText` on by default.

---

## Code Review Tooling

PRs into `main`, `develop`, and `release/*` are auto-reviewed by **two AI
reviewers running in parallel**, plus a CI gate that mirrors them locally.

**CodeRabbit** — line-level static-analysis view. Configuration at
`.coderabbit.yaml`: assertive profile, pre-merge gate, every applicable
linter enabled (ESLint, Biome, oxc, ast-grep, ruff, pylint, swiftlint,
shellcheck, yamllint, actionlint, markdownlint, languagetool, hadolint,
checkov, gitleaks, semgrep, sqlfluff). Custom ast-grep rules in
`.coderabbit/ast-grep/`, custom semgrep pack in `.coderabbit/semgrep/`.

**Greptile** — whole-codebase view. Catches what diff-only review
misses: duplicated logic, broken callers, drift from architecture docs.
Configuration at `.greptile/` — `instructions.md` is the natural-language
project context; `config.json` controls ignores and additional-context
docs. Installed as a GitHub App at https://app.greptile.com.

**Review Gate** (`.github/workflows/review-gate.yml`) — runs the same
toolchain locally (ast-grep, semgrep, gitleaks, actionlint, yamllint,
shellcheck, markdownlint, ruff+pylint, sqlfluff, hadolint) so merges
are blocked even if either AI reviewer is offline. Aggregate status
check: `Review Gate / all`.

**CI split — GitHub Actions vs CircleCI**

GitHub Actions owns the per-PR fast path: typecheck, lint, vitest,
next build, database type drift, schema invariants, Supabase RLS tests
(`ci.yml`), Playwright Smoke, and the Review Gate above. The jobs are
split so one failure does not hide later test/build status.

CircleCI (`.circleci/config.yml`) owns what GHA does poorly:

- `weekly` workflow — Knip dead-code, Stryker mutation tests on
  `src/lib/coachhelm/v2/`, full-repo sqlfluff, npm audit, Squawk
  migration safety. Scheduled Mondays 06:00 UTC; triggered via the
  `run-weekly=true` pipeline parameter (configure in CircleCI
  project settings → Triggers).
- `ios` workflow — iOS Capacitor compile verification on M-series
  macOS runners (~2× faster, ~⅓ the cost of GHA `macos-13`). Runs on
  push to `main`, `release/*`, `ios/*`, `capacitor/*` branches.

See `.circleci/README.md` for one-time project setup steps (CircleCI
dashboard) and the planned upgrade path (TestFlight publish via
Fastlane, parallel Playwright, Lighthouse on Vercel previews).

Shared config:

- `.coderabbitignore` — generated/vendored paths CodeRabbit skips
  (mirrored under `ignore` in `.greptile/config.json`).
- `.gitleaks.toml` — project-specific secret patterns (rotated
  2026-05-17 Supabase dev DB password is allowlisted only in audit
  docs).

The CodeRabbit pre-merge gate fails the PR if any of these blocking
custom checks trip: service-role key in a client bundle, RLS missing
on a new table, server action without an auth check, sport-prefixed
table name violation, destructive DELETE-then-INSERT in a save/submit/
sync path. The same hard-rule set is documented in
`.greptile/instructions.md` "Hard rules" so Greptile blocks on them too.

---

## GolfHelm Deep Reference (memory/)

| File | What's inside | When to read it |
|------|--------------|-----------------|
| `memory/glossary.md` | 74 table names, enums, TypeScript type locations | Need a table name, enum value, or type import path |
| `memory/projects/golfhelm.md` | All routes, 41 action files, component tree, hooks | Need to find where code lives |
| `memory/context/golfhelm-features.md` | 28 features: data flows, files, tables, deps, gaps | Working on any feature (the main reference) |
| `memory/context/golfhelm-database.md` | Every column of every table (from production DB) | Writing SQL, adding columns, debugging data |
| `memory/context/coachhelm-ai.md` | V2 engine: orchestrator, mining, predictions, NLG | Working on CoachHelm AI specifically |
| `src/app/golf/README.md` | Golf platform overview | Quick orientation |
