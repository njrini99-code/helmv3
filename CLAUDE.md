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
npm run build        # Production build

# Inventory docs (auto-regenerated; do not edit AUTOGEN blocks by hand)
npm run docs:regen   # Regenerate memory/glossary.md + memory/projects/golfhelm.md inventory
npm run docs:check   # CI guard — fails if inventory is out of sync

# Tests (Vitest workspace split by file naming)
npm test                  # unit only (fast inner loop)
npm run test:all          # every project (unit + integration + rls)
npm run test:integration  # *.integration.test.{ts,tsx}
npm run test:rls          # *.rls.test.{ts,tsx}
npm run test:e2e          # Playwright (also runs in GHA on every PR)

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
next build, Supabase RLS tests (`ci.yml`), and the Review Gate above.

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

## Code Review Hard Rules (mirrored from `.greptile/instructions.md`)

> The `.greptile/` directory is not in Greptile's loaded-context list
> (verified 2026-05-27 via the dashboard). These rules are duplicated
> here so AI reviewers that DO load CLAUDE.md (Greptile, Cursor,
> CodeRabbit's review-instructions) actually see them. Keep this section
> in sync with `.greptile/instructions.md` if you edit either file.

**Rules #1–3** (sport-prefixed tables, `@/lib/types` only, server vs
client Supabase) are already covered in the "CRITICAL RULES" section
near the top of this file. The rest:

4. **`SUPABASE_SERVICE_ROLE_KEY` bypasses RLS.** Allowed only in
   `src/lib/supabase/admin*` and `src/app/api/**/admin/**`. Anywhere
   else is a security incident waiting to happen.

5. **Server actions check auth before any DB call.** Every exported
   async function under `src/app/**/actions/**` must
   `await supabase.auth.getUser()` and throw on no-user before any
   `.from()`/`.rpc()`. Mutations must `revalidatePath()` after writing.

6. **Migrations.** Every `CREATE TABLE` ships with
   `ENABLE ROW LEVEL SECURITY` and at least one `CREATE POLICY` in the
   same migration. `SECURITY DEFINER` functions must pin
   `SET search_path = ''`. One purpose per migration (one table OR
   column OR constraint OR enum value — never multiple). Use
   `DO $$ … END $$` around renames (project pattern after migration
   036). Enum additions ship in a separate migration BEFORE the
   migration that uses them (Postgres 55P04 rule).

7. **No destructive writes.** DELETE-then-INSERT in any save/submit/
   sync path is forbidden — use upsert/`ON CONFLICT` or stage-and-swap.
   A transient failure between the two statements permanently loses
   user data (real prior incident).

8. **No `process.env` in Supabase Edge Functions.** Use `Deno.env.get()`.

9. **Pipeline stages (baseball)** are strictly: `watchlist`,
   `high_priority`, `offer_extended`, `committed`, `uninterested`.
   Any other value is a bug.

10. **Coach↔team is via `golf_team_coach_staff`**, never
    `golf_coaches.team_id`. Strokes-gained is cached in
    `golf_player_stats_cache`.

11. **Third-party SDK call shape must match installed major version
    in `package.json`.** When a PR adds or modifies code that calls a
    third-party SDK, cross-check the call shape against the installed
    major. Canonical incident: PR #102 shipped Inngest v3's
    `createFunction(opts, trigger, handler)` against installed Inngest
    v4.4.0, which only accepts `(opts, handler)` with triggers nested
    as `opts.triggers: [...]`. The TS error
    "inferred type … cannot be named without a reference to
    `inngest/api/api`" was a portability symptom of the wrong call
    shape forcing TS to infer through internal modules — it masked
    the underlying API mismatch. Per-SDK majors to cross-check:
    Inngest v4 (triggers nested in opts), Supabase JS v2 (`createClient`
    options shape), `@supabase/ssr` v0.x (cookie API), Next.js 16
    (async `cookies()`, `headers()`, `params`, `searchParams`),
    Sentry Next v10, Mapbox GL v3, AI SDK v6, Zod v4, framer-motion
    v12. When flagging: quote the `package.json` line, quote the call
    site with file:line, name the major it was written against, block
    the PR.

### Soft rules (comment, don't block)

- Design system: Kelly green `#16A34A`, cream `#FFFEFA`, glass
  `bg-white/70 backdrop-blur-xl`. No inline hex, no ad-hoc spacing.
- Loading = skeletons, not spinners. Empty states stay compact.
- No `console.log` in `src/` — use Datadog logger
  (`@datadog/browser-logs`) on the client and the structured logger
  on the server.
- Prefer `getByRole` over `getByTestId` in tests. `data-testid` is a
  last resort with a one-line justification.
- Tag `FIXME`/`XXX`/`HACK` with an issue link or remove.
- Capacitor camera/location/mic plugins need matching
  `NS*UsageDescription` strings in `ios/App/App/Info.plist`.

### CoachHelm-specific

- LLM features (`composeRoundReview`, `composeHeroNarrative`,
  `composeCoachChat`) MUST verify citations and regenerate-once before
  falling back to template. Never call the LLM client-side.
- Budget is per-team via `golf_coachhelm_settings.llm_budget_usd_per_day`.
  Never hardcode $/token math.
- The V2 engine's scoring functions (`v2/insights/`, `v2/composite/`)
  must remain pure — no fetches, no Supabase calls inside scoring.

### What NOT to flag

- Cosmetic CSS — visual regression is out of scope unless we add
  Chromatic/Argos.
- LLM creative output drift — only flag if citations/verification
  logic is broken.
- Auto-generated `src/lib/types/database.ts` — never edit by hand,
  but also don't flag.
- Anything in `archive/`, `.full-review*/`, `.full-stack-feature*/`,
  `.worktrees/`, `supabase/migrations_archive/`.

---

## AI Reviewer Context

> Appended 2026-05-27 for Greptile / CodeRabbit / Cursor. Greptile loads
> CLAUDE.md but NOT `.greptile/instructions.md` (verified via dashboard).
> Everything below is cross-feature intelligence a reviewer needs to catch
> bugs that look correct in isolation. Keep it terse and current; if a
> wave or SDK major changes, update the matching row here in the same PR.

---

### A. Feature Inventory — Review Focus per Feature

> 28 features from `memory/context/golfhelm-features.md`. The pitfalls column
> is the one a reviewer should grep for in the diff — every entry is a real
> failure mode this codebase has hit or is one bad PR away from hitting.

| # | Feature | Primary tables | Auth/RLS shape | Common review pitfalls |
|---|---|---|---|---|
| 1 | Round Tracking | `golf_rounds`, `golf_holes`, `golf_shots` | Player owns own rounds; coach reads via team membership | (a) Submit/save path must NOT delete-then-insert holes/shots — use `submit_round_atomic`/`save_partial_round_atomic` RPCs. (b) After `submitGolfRoundComprehensive` must fire `invalidateOnRoundComplete`, `triggerPlayerInsightsAfterRound`, `generateRoundReview`, `updateQualifierEntryStats` — drop one and stats/AI go stale silently. (c) Draft JSON still stored in `golf_rounds.notes` — don't overwrite user notes. (d) `revalidatePath('/golf/dashboard/rounds')` and `/rounds/[id]` required on any mutation. |
| 2 | Stats & Analytics | `golf_player_stats_cache`, `golf_round_stats_cache`, `golf_putting_tendencies` | Player reads own; coach reads team via `is_team_coach` | (a) Never recompute SG in app code — read from `strokes_gained_*` columns of `golf_player_stats_cache` (already populated by `recalculate_round_strokes_gained` RPC). (b) `invalidateOnRoundComplete` only marks cache stale via Redis; actual refresh happens lazily on next read via `refresh_player_stats_cache` — don't add new code paths that bypass the lazy refresh. (c) `golf_putting_tendencies` has no app-level writer; don't add a reader that assumes it's populated. |
| 3 | Qualifiers | `golf_qualifiers`, `golf_qualifier_entries`, `golf_qualifier_selections` (W29) | Coach writes; player reads own entries + reads selections only when `selection_state='selected'` | (a) Leaderboard rank computed in-proc (`to_par asc, total_score asc`) — don't sort by `position` alone, ties get mis-ordered. (b) Selection state machine `open→scoring→closed→selected` is enforced in `v3/qualifying/`; never UPDATE state column directly. (c) Slot ceiling enforced server-side in `confirmSelection` — don't bypass. |
| 4 | Calendar & Events | 17 tables incl. `golf_events`, `golf_event_attendance`, `golf_recurring_events` | Team coach writes; team members read | (a) Recurring edits have 3 scopes (`this | thisAndFuture | all`) — wrong scope corrupts series. (b) iCal feed token in `golf_calendar_feeds.feed_token` is the auth boundary — never log it. (c) Conflict detection joins `golf_player_classes` + `golf_academic_exclusions` + `golf_coach_blocked_time` — adding a new conflict source means updating `src/lib/calendar/conflicts.ts`. (d) RSVP via UPSERT on `(event_id, player_id)` — INSERT-only causes 23505 in a race. |
| 5 | Roster | `golf_team_members`, `golf_team_join_requests`, `golf_team_coach_staff` | Team coach (via staff join) writes; player reads own membership | Coach↔team is `golf_team_coach_staff`, NOT `golf_coaches.team_id` (column doesn't exist). Any new query that joins `golf_coaches.team_id` is broken. |
| 6 | Tasks | `golf_tasks`, `golf_task_assignments`, `golf_task_templates`, `golf_task_reminders` | Coach writes tasks; player updates own assignment | (a) `completeTask` writes to `golf_task_assignments` (status + completed_at). Player Hub reads `golf_task_completions` — known dual-table drift bug, do not deepen it. (b) `reminder_at` is set but no scheduled job triggers — don't claim reminders work. |
| 7 | Messaging | `golf_conversations`, `golf_conversation_participants`, `golf_messages`, `golf_message_attachments` | Participant-only via `user_conversation_ids()` RPC | (a) Attachments uploaded client-side to Supabase Storage BEFORE inserting message — must rollback storage if insert fails. (b) Realtime subscription must filter on participant ids; broadcasting team-wide leaks. |
| 8 | Announcements | `golf_announcements` + 4 child tables | Team coach writes | `createEnrichedAnnouncement` does a multi-step write (announcement → recipients → documents → inline tasks → task_assignments). If any step fails mid-flight, must roll back announcement — never leave orphan task_assignments. |
| 9 | Documents | `golf_documents`, `golf_document_versions` | Team-scoped | Versioning is append-only; never UPDATE `golf_document_versions` rows in place. |
| 10 | Travel | `golf_travel_itineraries`, `golf_travel_budgets`, `golf_travel_expenses`, `golf_travel_expense_splits` | Coach writes; team players read | Expense splits table exists but has no split-calc logic — any PR claiming "splits work" without implementing the math is a lie. |
| 11 | Academics / Classes | `golf_player_classes`, `golf_academic_exclusions`, `golf_events` | Player writes own | `syncClassToCalendar` creates `golf_events` rows; `removeClassFromCalendar` must delete them — don't leak orphan events. |
| 12 | CoachHelm AI Engine | 18+ tables (see Feature 12) | Coach-scoped insights; player reads own focus areas | (a) Scoring functions in `v2/insights/` and `v2/composite/` MUST stay pure — no `await supabase.*`, no `fetch`. (b) v3 generators MUST extend `BaseGenerator` (auto-injects standing + counterfactual + `v3:` signature prefix + `engine_version='v3'`). (c) Philosophy priority/weights still NOT wired to ranking — don't add code that pretends they are. (d) Coach intent `alert_posture` multiplies Wave 7 confidence threshold; bypass = noisy alerts. |
| 13 | Alerts | `golf_coach_insights` (where `is_alert=true`), `golf_coach_philosophy` | Coach reads own; player invisible | Filter `dismissed=false AND acknowledged_at IS NULL` for the count badge — forgetting either side ships a wrong number to the nav. |
| 14 | Patterns Dashboard | `golf_patterns_v2` | Coach reads own team | Lifecycle `detected→confirmed→addressed→resolved | dismissed` is monotonic — never UPDATE backward. |
| 15 | Insights Management | `golf_coach_insights`, `golf_insight_effectiveness`, `golf_insight_feedback` | Coach owns | Bulk actions hit `revalidatePath('/golf/dashboard/insights')` + `/alerts` — counts drift across pages otherwise. Export modal must not include `evidence` jsonb raw (PII risk). |
| 16 | Intelligence Dashboard | multiple CoachHelm tables | Coach reads own | Aggregates across 5+ tables; N+1 risk if one new chart fetches per-player without batching via `golf_player_standing`. |
| 17 | CoachHelm Analytics | `golf_insight_effectiveness`, `golf_prediction_model_performance` | Coach reads own | Effectiveness table is sparsely populated until W35 attribution cron runs — don't div-by-zero. |
| 18 | Coaching Intel Settings | `golf_coach_philosophy` | Coach owns | Weight distribution form must sum to 100 server-side, not client-only. 11 alert toggles drive engine gate — flipping one off but leaving its insight generator on is wasted compute. |
| 19 | Player Hub (Home) | `golf_travel_itineraries`, `golf_tasks`, `golf_task_completions` (read), `golf_events`, `golf_event_attendance` | Player reads own | KNOWN BUG: reads completion state from `golf_task_completions` while writes go to `golf_task_assignments`. Any PR that "fixes tasks" must unify the read path. |
| 20 | Player CoachHelm Dashboard | `golf_players`, `golf_rounds`, `golf_shots`, `golf_coach_philosophy`, `golf_patterns_v2`, `golf_predictions` | Player reads own | Auto-generates insights on first load — must respect `golf_coachhelm_settings.enabled` AND `golf_team_coachhelm_settings.enabled` (per-user AND per-team kill switches). |
| 21 | My Development | `golf_player_focus_areas` (legacy) → `golf_goals` (W19+) | Player reads own | Post-W20: `_deprecated_golf_player_focus_areas` rename is staged but read paths still pending — don't query `golf_player_focus_areas` in new code. Use `golf_goals` with `creator_role='coach'` AND `(shared_with_coach=true OR creator_role='coach')`. |
| 22 | My Qualifiers | `golf_qualifiers`, `golf_qualifier_entries`, `golf_rounds` | Player reads own entries | "Enter Round" deep-link must carry `qualifier_id` query param into `/rounds/new` or the round won't link back. |
| 23 | Round Review (AI) | `golf_round_reviews`, `golf_review_events`, `golf_review_insights` | Player owns; coach reads if `shared_with_coach=true` | (a) `composeRoundReview` MUST verify citations via tool-call grounding and regenerate-once before falling back to template (Rule #11 / CoachHelm section). (b) Budget gate: `checkBudget(coachId)` BEFORE the LLM call; on exhaustion fallback to template, never partial. (c) Existing reviews are NOT auto-rewritten — only "Refresh with AI" should overwrite. |
| 24 | Team Info | `golf_teams`, `golf_team_coach_staff`, `golf_team_members` | Team-scoped | Coach view vs player view diverges — leaking the coach edit form to a player is a privilege escalation. |
| 25 | Development Plans (Coach) | `golf_player_focus_areas` → `golf_goals` (W20 migrated) | Coach writes; player reads own | Same migration concern as Feature 21. `coach_id_if_assigned` MUST equal `current_coach_id()` server-side; RLS policy `goals_coach_create` enforces this — don't bypass with admin client. |
| 26 | Settings | `users`, `golf_coaches`, `golf_players`, `golf_team_settings`, `golf_coachhelm_settings` | Self-owned | Appearance/Location prefs save to localStorage and aren't consumed — don't ship a PR claiming "applied themes" without wiring readers. |
| 27 | Join Team Flow | `golf_teams`, `golf_team_join_requests`, `golf_team_members`, `organizations` | Unauthed lookup by `join_code` (case-insensitive) | Onboarding-incomplete redirect must carry `joinCode` query param through to `/golf/player` — losing it breaks the flow. |
| 28 | Admin Dashboard | Reads from ~20 tables + 15 admin RPCs | `is_admin()` gate | Uses service-role indirectly through admin RPCs only — never instantiate `createAdminClient()` from a tab component. Auto-refresh every 60s — heavy aggregation must use the admin rollup RPCs (`get_admin_*_rollup`), not raw SELECTs. |

---

### B. Schema Invariants (load-bearing across features)

> These are non-obvious join/data rules. A correct-looking diff that breaks
> one of these will pass type-check and still ship a bug.

1. **Coach↔team is `golf_team_coach_staff(team_id, coach_id, role, is_primary)`.** `golf_coaches` has NO `team_id` column. Any query joining `golf_coaches.team_id` is broken at runtime.
2. **Strokes Gained is already computed and cached.** Columns `strokes_gained_total/_tee/_approach/_around_green/_putting` live on `golf_player_stats_cache`. Recompute only via the `recalculate_round_strokes_gained` RPC — never reimplement Broadie's formula in TS.
3. **Round-review citations live in `evidence.standing` and `evidence.counterfactual` jsonb on `golf_coach_insights`**, plus per-claim tokens verified by `v3/llm/citation-check.ts`. Inline string-matching against the review body is wrong — verify against the EvidenceClaim set.
4. **Pipeline stages (baseball)** are strictly `watchlist`, `high_priority`, `offer_extended`, `committed`, `uninterested`. Any other value is a bug. (Rule #9 mirror.)
5. **Goals window** is `7 ≤ window_days ≤ 365` (CHECK constraint on `golf_goals`). Any code path computing `ends_at` from a UI input must clamp first.
6. **Goals creator/coach binding.** When `creator_role='coach'`, RLS requires `coach_id_if_assigned = current_coach_id()`. Setting it to another coach via admin client is a privilege escalation.
7. **CoachHelm insight `signature` is the dedup key.** v3 generators prefix with `v3:`; composites with `v3:composite:<rule_id>:`. Reusing a signature across generator types corrupts lifecycle.
8. **`engine_version`** on `golf_coach_insights` is `'v2'` by default, `'v3'` for new generators. Use it in WHERE clauses when filtering v3-only surfaces.
9. **Task completion lives in TWO tables today.** `golf_task_assignments` (writes via `completeTask`) and `golf_task_completions` (reads in Player Hub). Don't add a third source — unify the read path.
10. **Club granularity is 3-bucket only**: `driver | non_driver | putter` on `golf_shots.club_type`. Composite rules and generators that reference "wedge", "7-iron", or "hybrid" cannot fire — use approach distance buckets instead. (See plan Part V.1.5, IX.1.5.)
11. **Lie taxonomy is the canonical `LIE_TYPES` enum in `src/lib/coachhelm/v3/engine/lie-taxonomy.ts`** (18 values). `golf_shots.lie_before/lie_after` must be one of these — free-text variants break the lie-specific analyzers.
12. **Player↔team is `golf_team_members(team_id, player_id, status)`**, NOT `golf_players.team_id` (the column exists but is denormalized cache; trust the membership table for active status filtering).
13. **`SECURITY DEFINER` RLS helpers must pin `SET search_path = ''`** (per Rule #6) — `current_player_id`, `current_coach_id`, `is_team_coach`, `is_team_player`, `is_in_team`. New helpers without `search_path=''` are a CVE.
14. **Standing data may be NULL for cold-start teams** (<5 players with 5+ rounds). `StandingBar` handles this by omitting the team marker — server-side callers must not assume `team_avg` is populated.
15. **LLM budget is per-(coach_id, date) in `golf_coachhelm_llm_budget`.** Hardcoding $/token or per-team math bypasses the cap. Use `checkBudget` / `recordSpend` in `v3/llm/budget.ts`.

---

### C. Wave-Plan State (as of 2026-05-27)

> Source of truth: `docs/v3-wave-sequence.md` (live ledger) and
> `docs/v3-master-plan.md` (Part XXIII full spec).

**Shipped + verified in prod (✅):**
- W9-pt1 → W12 (foundation docs, RLS helpers, `golf_metrics`, PGA standards, player standing, backfill).

**In-flight (🟡, on `wave*` branches, not yet merged to main as of 2026-05-27):**
- W13 (StandingBar component) through W42 (notifications prefs). Most are 1 PR each, single-purpose per master-plan rule.
- W25 partial cutover (7 of 9 v2 generators swapped to v3); v2 sunset (W26) is scope-reduced because `v2/reasoning/confidence-calibrator` is still used by the calibration cron.
- W28 composites: 10 of 11 implementable post-3-bucket-fix; the "Tee-club mismatch" rule is deferred (needs hole-level outcome join).
- W30 LLM service: round-review composer + budget tables shipped; surface integration is the follow-up.
- W32 coach chat: schema + agent + ChatDrawer all in flight across 3 sub-waves.
- W39-41 ingest framework: schema + 3 provider STUBS ship; partner API keys + provider HTTP clients + per-provider mapping are required before any rows flow.

**Locked decisions — reviewer should reject PRs that violate (`docs/v3-decisions.md`):**
- Goals: window 7-365 days, default `shared_with_coach=false`, soft-cap 5 active.
- Standing bars universal (PGA + team + you); team rank visible to players.
- LLM at exactly 3 surfaces: round-review, hero narrative, coach chat. NO player chat in v1.
- Counterfactual is secondary line; auto-suppress below 0.3 strokes/round.
- Coach intent invisible to player.
- Notifications ON by default; quiet-mode exempts `round_review_ready` + `coach_assigned_goal` only.
- Models: Haiku 4.5 for round-review + hero-narrative; Sonnet 4.6 ONLY for coach-chat (multi-step tools). Reverting hero to Sonnet is a cost regression.

**Out-of-sequence flags:**
- A PR touching `v2/mining/*` or `v2/nlg/*` outside the explicit W25/W26 cutovers violates Org Rule #1 (namespace isolation).
- A PR adding a goal feature that hardcodes window outside 7-365 violates Goals Lock.
- A PR adding an LLM call at a 4th surface (e.g., player chat, weekly recap opener) violates LLM Lock.

---

### D. Integration Call-Shape Reference (matches `package.json`)

> Cross-check every PR that touches one of these SDKs. The v3→v4 trap from
> PR #102 is the canonical incident — TS error masked an API mismatch.

#### Inngest v4 (`inngest@^4.4.0`)

CORRECT — triggers nested in opts:
```ts
import { inngest } from './client';

export const fn = inngest.createFunction(
  {
    id: 'weekly-health-ping',
    triggers: [{ cron: '0 14 * * 1' }],
  },
  async ({ step, logger }) => { /* ... */ },
);
```

WRONG (v3 shape) — separate trigger arg, will TS-error through `inngest/api/api`:
```ts
inngest.createFunction({ id: '...' }, { cron: '...' }, async () => {})
```
Triggers go INSIDE opts as `triggers: [...]` array. Event triggers use `[{ event: 'name' }]`, cron uses `[{ cron: 'expr' }]`. Reference: `src/lib/inngest/functions.ts`.

#### Supabase JS v2 (`@supabase/supabase-js@^2.88.0`)

```ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
```
Server/client wrappers live at `src/lib/supabase/{server,client,admin}.ts`. NEVER call `createClient` from `@supabase/supabase-js` directly in app code — always go through the wrappers (admin client guard depends on it).

#### `@supabase/ssr` v0.8 (`@supabase/ssr@^0.8.0`)

```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const cookieStore = await cookies();  // Next 16: cookies() is async
return createServerClient(url, key, {
  cookies: {
    getAll: () => cookieStore.getAll(),
    setAll: (toSet) => toSet.forEach(({ name, value, options }) =>
      cookieStore.set(name, value, options)),
  },
});
```
Old `get`/`set`/`remove` cookie API from `@supabase/ssr@<0.5` is gone — `getAll`/`setAll` only.

#### Next.js 16 (`next@^16.0.10`)

In Next 16 `cookies()`, `headers()`, `params`, and `searchParams` are all Promises.
```ts
// Route handler / page / layout
const cookieStore = await cookies();
const headerList = await headers();

// Dynamic route page
export default async function Page({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
}
```
Forgetting `await` returns a Promise where Next 15 returned a value — silent runtime bug (`undefined` indexing into a Promise).

#### Sentry Next v10 (`@sentry/nextjs@^10.51.0`)

```ts
import * as Sentry from '@sentry/nextjs';
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration({ maskAllText: true })],
});
```
v10 split client/server/edge configs into `src/instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`. Putting `replayIntegration` in the server config is a no-op (browser-only).

#### Mapbox GL v3 (`mapbox-gl@^3.24.0`)

```ts
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;
const map = new mapboxgl.Map({
  container,
  style: 'mapbox://styles/mapbox/standard',
  center: [-78.6382, 35.7796],
  zoom: 12,
});
```
v3 default style `mapbox://styles/mapbox/standard` is 3D-enabled — `streets-v12` from v2 still works but loses globe view. Token MUST be the public `pk.*` token, never the secret `sk.*` — and must be URL-restricted in the Mapbox dashboard.

#### AI SDK v6 (`ai@6.0.174`)

```ts
import { generateText, streamText, tool } from 'ai';
import { z } from 'zod';

const result = await generateText({
  model: 'anthropic/claude-haiku-4-5',  // string id, via Vercel AI Gateway
  prompt: '...',
  tools: {
    cite: tool({
      description: 'Cite an evidence claim',
      inputSchema: z.object({ field: z.string(), value: z.string() }),
      execute: async ({ field, value }) => ({ ok: true }),
    }),
  },
});
```
v6 changes vs v5: tool definition uses `inputSchema` (was `parameters`); models are string ids resolved by the Gateway provider (no `@ai-sdk/anthropic` import needed). `ToolLoopAgent` + multi-step is in v6's agent surface — see `src/types/ai-shim.d.ts` (the project ships its own shim because Vercel's bundled types lag).

#### Zod v4 (`zod@^4.2.1`)

Changes from v3:
- Error format is flatter: `error.issues` is the canonical path (`error.errors` removed).
- `.transform()` + `.refine()` chaining: `.refine()` now runs AFTER `.transform()` (was undefined in v3); explicitly chain `.refine()` post-transform if you depend on the output type.
- String/email/url validators tightened — `z.string().email()` is stricter; previously-accepted addresses may now reject.

```ts
const result = schema.safeParse(input);
if (!result.success) {
  return { error: result.error.issues[0]?.message };  // not .errors
}
```

#### framer-motion v12 (`framer-motion@^12.24.0`)

```ts
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
```
v12 named exports only — no default export. **Test mocks must include `useReducedMotion`** (returning `false`) or component tests crash on mount. Drift here is a recurring CI breaker (see `project_golfhelm_ci_state_2026_05_21` in memory).

---

### E. Incident Library

> Real failures + what caught them (or would have). Format: date, one-line
> what happened, what the catch was.

- **2026-05-27 — Inngest v3 API shape against installed v4 (PR #102).** TS portability error masked the call-shape mismatch — 9+ hours of broken prod. *Caught by SDK version-drift rule #11 + commit `73736777` aligning to v4.*
- **2026-05-21 — framer-motion mock missing `useReducedMotion`.** Test suite crashed on mount across CI after v12 upgrade. *Caught by per-PR Vitest run; fix is to update `__mocks__/framer-motion.ts` in the same PR as any motion upgrade.*
- **2026-05-21 — Migration ordering bug.** Enum value used in a `WHERE` clause shipped in the same migration that added the value → Postgres `55P04`. *Caught by Squawk migration-safety job in CircleCI weekly + Rule #6 (enum additions in separate migration first).*
- **2026-05-21 — `DO $$ … END $$` rename guard missing.** Migrations after 036 fail without the guard pattern. *Caught by Review Gate sqlfluff + project pattern doc.*
- **~2026-04 — DELETE-then-INSERT in round-save path lost user data.** Transient failure between the two statements wiped 80% of a round's shots for one player. *Caught post-hoc; codified as Rule #7 + `feedback_golf_no_destructive_writes` memory; CodeRabbit blocks DELETE-then-INSERT in save/submit/sync paths.*
- **~2026-03 — Supabase schema drift (220 cols missing across 54 tables).** `database.ts` types were stale; new columns were unreachable from TS. *Caught by `npm run docs:check` + `db:types:check` CI guards; codified as Auto-regen inventory section.*
- **~2026-03 — Service-role key in client bundle.** A debug import of `createAdminClient` from a client component shipped to prod. *Caught by CodeRabbit custom check + Rule #4 path restriction (`src/lib/supabase/admin*` + `src/app/api/**/admin/**` only).*
- **~2026-02 — Server action without auth check.** Mutation ran for unauthenticated users via direct fetch. *Caught by CodeRabbit + Rule #5 (`supabase.auth.getUser()` before any `.from()`/`.rpc()`).*
- **~2026-02 — Unprefixed table query (`from('coaches')`).** Failed silently with empty results because the table doesn't exist (golf tables are `golf_coaches`). *Caught by CodeRabbit prefix check + Rule #3.*
- **~2026-02 — RLS missing on new table.** Migration shipped `CREATE TABLE` without `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY`. *Caught by CodeRabbit migration check + Rule #6 (RLS in same migration as table).*

---

### F. Cross-Feature Dependency Map (small but lethal)

> Files where a change breaks something non-obvious elsewhere. If a PR
> touches LEFT, the reviewer should check RIGHT.

| If a PR touches… | Also check… |
|---|---|
| Any new column on `golf_*` tables | `npm run db:types` regenerates `src/lib/types/database.ts`; `npm run docs:check` regenerates `memory/glossary.md` + `memory/projects/golfhelm.md` — CI blocks merge if either is out of sync. |
| `src/app/golf/actions/golf.ts` (round submit/save) | Must still call `invalidateOnRoundComplete`, `triggerPlayerInsightsAfterRound`, `generateRoundReview`, `updateQualifierEntryStats` AND `revalidatePath` for `/golf/dashboard`, `/rounds`, `/rounds/[id]`, `/stats`. |
| `src/app/golf/actions/round-reviews.ts` or `round-review-system.ts` (review insert path) | Must go through `v3/llm/compose.ts` which enforces `checkBudget` → `compose` → `verifyCitations` → `recordSpend`. Bypassing budget gate is a runaway-cost incident. |
| `src/lib/coachhelm/v3/engine/generator-base.ts` | EVERY v3 generator inherits from this — a change to `run()` ripples to all 9+ generators. Add new fields via constructor or evidence map, not by mutating `run()`. |
| `src/lib/coachhelm/v3/engine/lie-taxonomy.ts` (`LIE_TYPES`) | Used by lie-specific-analysis, ApproachMissGenerator, ScramblingGenerator, composite rules 1/7/9. Renaming a value silently breaks pattern detection. |
| `src/lib/coachhelm/v3/metrics/registry.ts` (`MetricId`) | FK-referenced by `golf_goals.metric_id`, `golf_pga_standards.metric_id`, `golf_player_standing.metric_id`, `golf_drills.impacts_metric_id`. Removing a metric requires a migration to drop dependent rows first. |
| Any new server action under `src/app/**/actions/**` | Must `await supabase.auth.getUser()` before any `.from()`/`.rpc()`, must `revalidatePath` after writes, and must be added to `src/app/api/inngest/route.ts`'s `functions: [...]` array IF it's an Inngest function. |
| `src/lib/supabase/admin*` (admin client) | Allowed callers: `src/app/api/**/admin/**` only. Importing from a `(dashboard)` route or client component is a service-role leak. |
| `golf_coach_insights` insert path | Must go through `v3/insights/upsert.ts` (signature dedup + Wave 7 philosophy gate via `getActiveGate()`). Direct `supabase.from('golf_coach_insights').insert(...)` bypasses both. |
| `src/lib/types/database.ts` | Auto-generated only by `npm run db:types`. Hand-edits are clobbered on next CI run — and Rule #4 says don't flag, but also don't edit. |
| Inngest function file (`src/lib/inngest/functions.ts`) | Each function must also be registered in `src/app/api/inngest/route.ts` `serve({ functions: [...] })` or it's invisible to the runtime. |
| `golf_team_coachhelm_settings.enabled` OR `golf_coachhelm_settings.enabled` | Both gates must pass before any v3 insight write — single-gate checks ship insights to teams that disabled CoachHelm. |

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
