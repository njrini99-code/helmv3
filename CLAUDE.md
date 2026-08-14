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
| **Table names or enums** (quick lookup, "what table stores X?") | `memory/glossary.md` — All tables, all enums, all type locations (AUTOGEN table count block — do not hand-copy the number elsewhere, it rots) |
| **CoachHelm AI** (insights, patterns, predictions, reviews, philosophy) | `memory/context/coachhelm-ai.md` — V2 engine architecture, pipeline, components |
| **Routes, actions, or file locations** ("where is the code for X?") | `memory/projects/golfhelm.md` — All routes, all action files, component directories |
| **CoachHelm AI / Stats nav labels or hrefs** (rail, sub-nav tabs, CommandPalette, page `<title>`, breadcrumb) | `src/lib/golf/surface-registry.ts` — SINGLE SOURCE OF TRUTH for the canonical `{id, canonicalName, href, role, group, legacy?, hidden?}` of every CoachHelm AI + Stats surface. Every consumer (`nav-registry.ts`, `CoachHelmSubNav.tsx`, `CommandPalette.tsx`, breadcrumb, page titles) imports from here — never hand-write a label/href for one of these surfaces |
| **Baseball features** | `memory/context/baseballhelm-features.md` — feature-by-feature data flow, files, tables, gaps; `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md` — canonical spec (source of truth for what baseball should be) |
| **Cross-product structure** (route trees, canonical action-wrapper/toast/data-access/design-token/nav-registry/error-boundary idioms, known traps) | `docs/REPO_MAP.md` — resolved route atlas for BaseballHelm/GolfHelm/Lift Lab/Admin, idioms table with file:line anchors, 7 traps, pre-code checklist |

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
| golf-feature-ownership | src/app/golf, src/lib/golf, src/components/golf — *where* features live |
| golf-review | same paths — *what to verify* on a golf change |
| coachhelm-review | src/lib/coachhelm, round-review actions, api/coachhelm |
| baseball-roles | src/app/baseball, src/lib/baseball |
| baseball-review | same paths + src/lib/recruiting — recruiting/stats invariants |
| design-system | any .tsx or .css |
| code-patterns | src/app, src/lib TypeScript |
| file-structure | anything under src/ |
| integrations | src/app/api, stripe/inngest/email/notifications libs |
| database | supabase/migrations, any .sql, src/lib/supabase, scripts/db |
| code-review-tooling | always (procedure) |

The `-ownership` / `-roles` files map **where** code lives; the `-review` files
say **what to check**. Both load on the same paths — that separation is
deliberate, not duplication.

Edit the rule file, not this one, when changing any of the above.
This table must list every file in `.claude/rules/` — it silently omitted
`database` until 2026-08-09.

---

## Agent config — the one invariant

`.claude/README.md` documents how `.claude/` is wired. The rule that matters
outside that file:

> **One Supabase MCP server, one pre-approved write path.**

Three registrations existed simultaneously until 2026-08-09, two of them with
`execute_sql` and `apply_migration` pre-approved — two unprompted routes into
the production database. `.mcp.json` is now the only one, the
`supabase@claude-plugins-official` plugin is off, and
`enableAllProjectMcpServers` was removed so a future `.mcp.json` addition
cannot self-enable.

`guard-sql.sh` matches on tool-name regex, so it guards any Supabase MCP
server — but a second server is still drift. Collapse it before granting writes.

**Never `vercel env pull` into the working tree and leave it.**
`.vercel/.env.production.local` held 71 live production values —
`SUPABASE_SERVICE_ROLE_KEY`, `VERCEL_API_TOKEN`, `GMAIL_SA_PRIVATE_KEY` — in
plaintext for ~2 weeks. It is git-ignored, so this is not a leak, but agents
read this tree constantly. Pull it, use it, delete it.
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

## GolfHelm Deep Reference (memory/)

| File | What's inside | When to read it |
|------|--------------|-----------------|
| `memory/glossary.md` | Table names, enums, TypeScript type locations (table/view/function counts are an AUTOGEN block — read the file, don't hardcode the number) | Need a table name, enum value, or type import path |
| `memory/projects/golfhelm.md` | All routes, action files, component tree, hooks (AUTOGEN — counts live in the file, not here) | Need to find where code lives |
| `memory/context/golfhelm-features.md` | 28 features: data flows, files, tables, deps, gaps | Working on any feature (the main reference) |
| `memory/context/golfhelm-database.md` | Every column of every table (from production DB) | Writing SQL, adding columns, debugging data |
| `memory/context/coachhelm-ai.md` | V2 engine: orchestrator, mining, predictions, NLG | Working on CoachHelm AI specifically |
| `src/lib/golf/surface-registry.ts` | Canonical name/href/role/group for every CoachHelm AI + Stats surface (rail, sub-nav, palette, titles, breadcrumb all read from it) | Adding/renaming/redirecting a CoachHelm AI or Stats route |
| `src/app/golf/README.md` | Golf platform overview | Quick orientation |
