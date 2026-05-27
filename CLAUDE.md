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

# Platform CLIs (installed via brew)
supabase --version   # Supabase CLI (>= 2.101.0)
vercel --version     # Vercel CLI (>= 54.x)
```

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
