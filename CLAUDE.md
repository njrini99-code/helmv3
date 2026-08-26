# CLAUDE.md - Helm Sports Labs

> **Read this entire file before writing ANY code.**

@AGENTS.md
@memory/system/golfhelm-engineering-os.md

> The lines above are real imports, not pointers. Claude Code reads `CLAUDE.md`
> and does **not** read `AGENTS.md` on its own, so without it this repo had two
> independent instruction documents that already disagreed — AGENTS routed
> feature work through `memory/registry.yml` → `memory/features/*`, while the
> table below routed it to `memory/context/*`. Two navigation models, two
> generations of the same knowledge, and which one a session followed depended
> on nothing legible.
>
> **AGENTS.md is the repo constitution and outranks this file.** It is
> vendor-neutral and applies to every agent. This file is the Claude-specific
> adapter: it should hold what Claude Code needs and nothing AGENTS already
> says. When the two disagree, AGENTS wins and this file is the one to fix.
>
> Design authority in particular: the aesthetic prose below describes the
> *product's* look. `.claude/rules/design-system.md` is the binding rule for
> dashboard code, and it declares the older glass / cream / warm vocabulary
> **retired** under `src/app/golf/(dashboard)/`. Canonical tokens live in
> `src/styles/design-tokens.css`. Prose loses to tokens.

---

## What This Is

**Helm Sports Labs** - Multi-sport SaaS platform
- **BaseballHelm**: College baseball recruiting (coaches ↔ players) + team management
- **GolfHelm**: College golf team management + CoachHelm AI layer

**Stack**: Next.js 16 (App Router) • TypeScript strict • Supabase • Tailwind
**Design**: California-modern × neo-futurism — warm cream + helm green, matte surfaces, editorial typography, slow cinematic motion

---

## GolfHelm Engineering OS

GolfHelm and GolfHelm-facing CoachHelm work is governed by
`memory/system/golfhelm-engineering-os.md`.

Full architecture: `docs/ai-system/GOLFHELM_SELF_HEALING_ENGINEERING_SYSTEM.md`.
Advanced reliability layer:
`docs/ai-system/GOLFHELM_ADVANCED_RELIABILITY_EXTENSION.md`.

For feature work:

1. resolve `memory/registry.yml`;
2. load mapped `memory/features/*` context;
3. operate against verified code/generated truth;
4. update feature memory, tests, and history when behavior changes.

Daily reliability work never deploys production. Production releases are
owner-approved and limited by `config/release-policy.yml`.

---

## CONTEXT ROUTING — Where to Look

> **Before starting any GolfHelm task, read the file(s) that match your task type.**

### ⚠️ Read this before you trust anything a knowledge doc tells you

These docs are navigational aids of **varying reliability**, not a verified
index. As of 2026-08-20, machine-checked against the live database and the real
file tree:

| Tier | What it is | Trust |
|---|---|---|
| **Generated** — `AUTOGEN:*` blocks in `memory/glossary.md`, `memory/projects/golfhelm.md`, `memory/context/golfhelm-database.md`; `src/lib/types/database.ts`; `src/lib/golf/surface-registry.ts` | regenerated from the live DB / the real tree | **Authoritative.** Use these for any name, column, route, or count. |
| **Hand-written narrative** — everything else in `memory/**`, `docs/REPO_MAP.md` | written by a human at some past moment | **Hint only.** Verify before acting. |

What the machine checks found, and what it means for you:

- **59 database identifiers** named across `memory/**` and `.claude/rules/**`
  **do not exist in production** — confirmed absent from `pg_class`, `pg_proc`
  and `pg_type`. They are rendered with full columns, FKs and RLS policy names,
  formatted identically to the real ones. Baseline: `.doc-schema-baseline.json`.
  Gate: `npm run docs:schema-drift`.
- **File paths** named in these same docs **do not resolve** — count lives
  in `.doc-path-baseline.json` (don't hand-copy it; it rots). Gate:
  `npm run docs:path-drift`.
- Both gates run in CI and **fail on anything new**. The existing counts may only
  go DOWN. A doc that names a table or a file is not evidence that either exists;
  the gates are what make that claim checkable.
- **A missing table does not reliably mean a missing feature.** Recurring events
  are fully implemented on `golf_events.recurring` / `recurrence_rule` /
  `parent_event_id` while `golf_recurring_events` — the table the docs named —
  never existed. Check the code before concluding a feature is absent.

**Rule of thumb: the code is the source of truth, the AUTOGEN blocks track it
automatically, and the prose is someone's memory of it.**

### Feature-Aware Routing

For feature work, use `memory/registry.yml` first. It maps code paths to the current-state feature docs, business rules, UI contracts, tests, and suggested checks.

```bash
npm run knowledge:map -- --files <paths...>
npm run knowledge:context -- --files <paths...> --task "<task>"
```

For large changes or PR reviews, read `/tmp/helmv3-context-pack.md` after generating it. If a changed file does not map to a feature, either add the registry entry or call out the missing feature-awareness coverage.

> **Two generations of feature docs exist. Prefer `memory/features/`.**
>
> `memory/features/*.md` (16 files, ~66k chars, reached via `memory/registry.yml`)
> and `memory/context/golfhelm-features.md` (~58k chars, the By Task Type table
> below) describe the SAME features. `AGENTS.md` — the repo constitution, which
> outranks this file — routes feature work through the registry, so
> **`memory/features/` wins when they disagree**, and the By Task Type row for
> golf features is the fallback for anything the registry doesn't map.
>
> Both are hand-written narrative (see the trust table above) and neither is
> authoritative for names: the calendar feature doc reproduced all 10 of the
> older doc's non-existent tables rather than re-verifying, so the fiction
> propagated across the split instead of being caught by it. **Two generations
> double the drift surface; collapsing them to one is real work still owed.**

### By Task Type

| If you're working on... | Read this file FIRST |
|------------------------|---------------------|
| **Any golf feature** (understanding behavior, fixing bugs, adding to it) | `memory/context/golfhelm-features.md` — Find the feature by name, get data flow, files, tables, dependencies, gaps |
| **Database queries** (writing SQL, adding columns, debugging data) | `npm run schema -- <table>` (columns+FKs from generated production types, ~300 tokens), `npm run schema -- --grep <substr>` to discover, `--enums [name]` for enums. `memory/context/golfhelm-database.md` is the legacy prose rendering — prefer the command |
| **Table names or enums** (quick lookup, "what table stores X?") | `memory/glossary.md` — **use its AUTOGEN blocks, not its narrative index.** `AUTOGEN:tables` and `AUTOGEN:enums` are generated from `src/lib/types/database.ts` and are complete. The hand-written by-feature index above them was last verified 2026-02-13 and named 20 tables that do not exist in production. Do not hand-copy the counts elsewhere, they rot |
| **CoachHelm AI** (insights, patterns, predictions, reviews, philosophy) | `memory/context/coachhelm-ai.md` — V2 engine architecture, pipeline, components |
| **Routes, actions, or file locations** ("where is the code for X?") | `memory/projects/golfhelm.md` — All routes, all action files, component directories |
| **CoachHelm AI / Stats nav labels or hrefs** (rail, sub-nav tabs, CommandPalette, page `<title>`, breadcrumb) | `src/lib/golf/surface-registry.ts` — SINGLE SOURCE OF TRUTH for the canonical `{id, canonicalName, href, role, group, legacy?, hidden?}` of every CoachHelm AI + Stats surface. Every consumer (`nav-registry.ts`, `CoachHelmSubNav.tsx`, `CommandPalette.tsx`, breadcrumb, page titles) imports from here — never hand-write a label/href for one of these surfaces |
| **Baseball features** | `memory/context/baseballhelm-features.md` — feature-by-feature data flow, files, tables, gaps; `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md` — canonical spec (source of truth for what baseball should be) |
| **Cross-product structure** (route trees, canonical action-wrapper/toast/data-access/design-token/nav-registry/error-boundary idioms, known traps) | `docs/REPO_MAP.md` — resolved route atlas for BaseballHelm/GolfHelm/Lift Lab/Admin, idioms table with file:line anchors, 8 traps, pre-code checklist |
| **Golf platform overview** (quick orientation) | `src/app/golf/README.md` |

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

## CRITICAL RULES

### 0. Branch & deploy — preserve the current task branch
Do not assume `main` is currently checked out. Run `git branch --show-current` and preserve the current task branch/worktree unless the user explicitly asks to switch branches.



**A push to `main` ships nothing.** `vercel.json` has carried
`"git": {"deploymentEnabled": {"*": false}}` since 2026-07-08 (#789 /
`d29deea4`), so no branch auto-deploys and production is an on-demand CLI
promote. Any doc, hook, or comment claiming "production serves main" is
stale — that premise died five weeks before it was noticed, and it is what
made the old branch-first workflow feel mandatory.

Branch protection on `main`: 0 required reviews, `enforce_admins` off,
linear history, and **6 required checks** — `Smoke checks`, `CI aggregate`,
`Review Gate aggregate`, `Analyze (actions)`, `Analyze (javascript-typescript)`,
`Analyze (python)`. Direct push is permitted for the owner.

Fixed 2026-08-19: the old list (`CodeQL`, `all`, `Smoke checks`) was TWO
PHANTOMS and one real check. Nothing posts a check named `all` — the aggregate
jobs were renamed to `CI aggregate` / `Review Gate aggregate` and the required
list was never updated — and nothing posts `CodeQL` either, since that matrix
emits three `Analyze (...)` runs. PRs were unsatisfiable, masked by
`enforce_admins` being off. See `.github/branch-protection.md`.

Still blocked by `.claude/hooks/guard-bash.sh`, deliberately:
- **force push** — `allow_force_pushes` was disabled on GitHub 2026-08-19, so
  this hook is no longer the only thing preventing a rewrite of shared
  history. Kept as belt-and-braces; it also covers the local repo, which a
  GitHub setting cannot.
- `git stash`, `git clean -f`, recursive `rm` outside the project — all
  destroy work that exists nowhere else.

### 1. Type Imports
```typescript
import type { BaseballCoach, BaseballPlayer, Organization } from '@/lib/types';
import type { GolfCoach, GolfPlayer } from '@/lib/types/golf';
// NEVER: @/types/database, @/types/supabase (don't exist)
//
// The sport is in the name now, on purpose. `BaseballCoach` / `BaseballPlayer`
// are `baseball_coaches['Row']` / `baseball_players['Row']`; they used to be
// exported as bare `Coach` / `Player`, which said nothing about which sport
// they belonged to — and this rule, the FIRST code rule in the file, used
// those two as its canonical example. A golf agent following it got baseball
// table shapes. Renamed 1505e1ddd; the bare names no longer exist.
//
// Verified 2026-08-19 by compiling this exact import, not by grepping for it:
// the previous version of this block failed with
//   TS2305: Module '"@/lib/types"' has no exported member 'Player'
// It had survived a commit that added a warning ABOUT the trap without
// updating the line that taught it. If you change these names, compile this
// snippet — a doc example is the one piece of code no gate ever type-checks.
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
// Full table list (auto-regenerated, always current): memory/glossary.md
// Full column definitions: memory/context/golfhelm-database.md
```

### 4. Client Components
```typescript
// Any file using useState/useEffect/onClick MUST start with 'use client';
```

---

## Scoped rules (.claude/rules/)

Detail that used to live here now loads only when relevant, via `paths` frontmatter:

| Rule | Loads when you touch |
|---|---|
| autonomy | always (how to work here — finish the job, don't stop to ask) |
| code-review-tooling | always (procedure) |
| **shipping** | **always** — documentation hygiene, git & commits, bash, Supabase, Vercel. The traps that don't care which file you opened, and what each `PreToolUse` guard actually blocks |
| **quality-gates** | `.github/workflows`, `.circleci`, `vitest.config.ts`, `eslint.config.mjs`, `scripts/`, any `*.test.*`, any `*-baseline.json` — the 9 ratchets, which gates currently DON'T enforce, the three test systems, lint blind spots |
| golf-feature-ownership | src/app/golf, src/lib/golf, src/components/golf, src/app/api/golf |
| golf-review | same paths as golf-feature-ownership (review checklist) |
| coachhelm-review | src/lib/coachhelm, golf round-review actions, api/coachhelm |
| golfhelm-engineering-os | golf/coachhelm code + migrations + registry.yml |
| baseball-roles | src/app/baseball, src/lib/baseball, src/components/baseball |
| baseball-review | those plus src/lib/recruiting, api/baseball (review checklist) |
| database | supabase/migrations, any .sql, src/lib/supabase, scripts/db |
| design-system | any .tsx or .css |
| code-patterns | src/app, src/lib TypeScript |
| file-structure | anything under src/ |
| integrations | src/app/api, stripe/inngest/email/notifications libs |

A rule with no `paths:` frontmatter loads on every session. This table was
missing four rules that exist on disk (golf-review, coachhelm-review,
baseball-review, database) — if you add a rule file, add its row here.

Edit the rule file, not this one, when changing any of the above.
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
npm run docs:check   # regen + diff + schema-drift. The regen/diff half is a
                     # LOCAL guard (no workflow runs it; docs-regen.yml opens
                     # an auto-PR on drift instead) and it can only ever
                     # compare the generator to itself.
npm run docs:schema-drift  # Fails when memory/**, CLAUDE.md, AGENTS.md or
                     # .claude/rules/* name a golf_*/baseball_* object that
                     # isn't in src/lib/types/database.ts. CI: "Check knowledge
                     # base against the schema". Baseline
                     # .doc-schema-baseline.json (59) — may only go DOWN.
npm run docs:path-drift    # Fails when those same docs name a FILE PATH that
                     # doesn't resolve. CI: "Check navigation docs for dead
                     # file paths". Baseline: .doc-path-baseline.json itself
                     # (not this comment) — may only go DOWN.
                     #
                     # These two are what make the knowledge base checkable
                     # rather than merely confident. docs:check runs both.
                     # Do NOT bulk-repoint dead paths by basename search: the
                     # audit tried, and nearest-name matches were build
                     # artifacts under src/.helmdev/ — that replaces a visibly
                     # broken path with a confidently wrong one. Fix by hand.

# Tests (Vitest workspace split by file naming)
npm test                  # unit only (fast inner loop)
npm run test:all          # every project (unit + integration + rls)
npm run test:integration  # *.integration.test.{ts,tsx}
npm run test:rls          # *.rls.test.{ts,tsx}
npm run test:e2e          # Playwright, full local suite. CI does NOT run
                          # this script: playwright.yml runs `smoke` on PRs
                          # and the full `e2e` job on push to main only

# Quality (one-shot)
npm run evals             # Promptfoo LLM eval — needs ANTHROPIC_API_KEY or OPENAI_API_KEY
npm run lighthouse        # Lighthouse CI against PREVIEW_URL (or localhost:3000)

# Inngest (durable workflows — replaces scattered cron + retry loops)
npx inngest-cli@latest dev  # Local dev server on :8288 (auto-discovers /api/inngest)

# Platform CLIs (repo-local; do not assume global binaries)
./node_modules/.bin/supabase --version  # project-pinned Supabase CLI
./node_modules/.bin/vercel --version    # project-pinned Vercel CLI
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

<!-- HELM_AGENT_CANONICALITY_START -->
## Helm agent canonicality

The binding canonicality rules live in ONE place: `AGENTS.md` → "Helm agent
canonicality" (imported above). This block exists only so tooling that greps
for the marker finds it; it deliberately restates nothing — a second copy of
the rules is a second place for them to rot.
<!-- HELM_AGENT_CANONICALITY_END -->
