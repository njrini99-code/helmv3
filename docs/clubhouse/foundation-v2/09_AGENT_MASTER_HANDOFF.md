# 09 — MASTER HANDOFF FOR CLAUDE / IMPLEMENTATION AGENT

Copy this entire instruction into the agent responsible for establishing the foundation.

---

You are implementing the organizational foundation for the GolfHelm Clubhouse redesign in `njrini99-code/helmv3`.

This is an **organization and contract task first**.

Do not turn it into a broad refactor.

## Core owner intent

The owner is rebuilding the Fairway/GolfHelm UI from scratch as Clubhouse.

The original Fairway presentation became messy.

The new system must be extremely organized, traceable and difficult to regress.

Every page should be understandable without reverse-engineering the code.

The owner will continue using Claude Design to create high-quality design packages, then hand those packages to implementation agents.

Your job is to make that workflow deterministic.

## Existing repository authorities

Before editing, read:

```text
AGENTS.md
CLAUDE.md
.claude/rules/clubhouse.md
docs/clubhouse/PROGRESS.md
docs/clubhouse/CHECKLIST_TEMPLATE.md
memory/decisions/ADR-2026-08-30-helm-knowledge-authority.md
memory/registry.yml
scripts/clubhouse/check.mjs
scripts/ui-intelligence/generate-atlas.ts
supabase/migrations/HELD.md
```

## Do not create a second feature authority

`memory/registry.yml` remains semantic feature authority.

The new Clubhouse page registry REFERENCES semantic feature IDs.

It does not redefine them.

## Do not create a second route atlas

`ui-intelligence` already owns route/UI intelligence.

The Clubhouse page registry adds:

- permanent page identity
- action traceability
- implementation paths
- contract IDs
- Bridge mapping
- held requirements
- verification status

## Fresh-build rule

Clubhouse presentation must remain fresh.

Never import:

```text
@/components/fairway/**
@/lib/fairway/**
@/lib/redesign/**
```

Never wrap an old Fairway page inside Clubhouse.

Shared non-UI business/data infrastructure may be reused deliberately.

If useful logic is trapped inside old UI, extract the logic into a headless/shared module rather than reusing the presentation component.

## Migration rule

During this phase migrations may be:

- researched
- designed
- written

They may NOT be applied.

If actual SQL is prepared:

1. mark the file `WRITTEN — HOLD — NOT APPLIED`
2. add it to `supabase/migrations/HELD.md`
3. link its held data plan
4. do not run `npm run db:apply`
5. do not push SQL to production
6. do not claim generated types represent the held schema

## New feature rule

New design-driven product capabilities may be specified in detail.

They remain HELD unless they already exist in production.

Do not silently activate new semantics, permissions, notifications, schema, server actions, or roles while establishing the redesign foundation.

## Foundation to create

Implement the minimum clean system:

```text
config/clubhouse/pages/*.json
config/clubhouse/bridge-contracts.json
config/clubhouse/bridge-tombstones.json

docs/clubhouse/pages/<page-id>-<slug>/
  PAGE.md
  DESIGN.md
  CONTRACT.md
  WIRING.md
  VERIFY.md
  CHANGELOG.md

docs/clubhouse/held/features/
docs/clubhouse/held/data/
docs/clubhouse/generated/
```

Add validation/generation scripts under:

```text
scripts/clubhouse/
```

Prefer extending the existing Clubhouse check pipeline rather than inventing a parallel CI system.

## Page ID rules

Permanent.

Independent of navigation order.

Never renumber a shipped page because route/nav changes.

Use the proposed initial mapping only after verifying it does not conflict with owner intent:

```text
P001 Foundation / shell
P002 Home
P003 Calendar
P004 Messages
P005 Roster
P006 Stats team
P007 Stats player
P008 CoachHelm
P009 Rounds
P010 Lineups / Qualifiers
P011 Scouting
P012 Player Home
P013 Practice
P014 Events
```

If there is uncertainty, register only already-designed pages and leave future IDs unallocated.

Do not guess hidden routes.

## Page Contract categories

Use these exact category codes:

```text
01 default/core UI
02 initial loading/skeleton
03 background loading/refresh
04 empty
05 validation
06 server/system error
07 network/offline
08 permission/authorization
09 success
10 warning
11 destructive
12 state preservation
13 optimistic UI
14 retry/recovery
15 data freshness/sync
16 micro animation
17 haptic
18 accessibility
19 responsive
20 keyboard/input
21 performance
22 analytics
23 observability
24 CI/test
25 Bridge action
```

Every page must explicitly address all categories or mark one N/A with a reason.

## Bridge ID semantics

A numeric ID represents the semantic behavior, not the presentation.

Bad:

```text
4051 = red toast
```

Good:

```text
4051 = message send attempted with no valid message content
```

Pair every number with a readable constant.

Never reuse retired IDs.

Create a tombstone registry.

## Actions

Create readable IDs for meaningful actions:

```text
ACT-P004-SEND-MESSAGE
ACT-P003-CREATE-EVENT
ACT-P005-APPROVE-JOIN-REQUEST
```

Each action maps:

```text
page
component
handler
hook/service
data
Bridge outcomes
tests
```

## Page docs

Every registered page must have:

### PAGE.md
Identity, purpose, user, primary job, hierarchy, semantic feature refs.

### DESIGN.md
Design package and intent. Do not duplicate the entire design system.

### CONTRACT.md
All behavioral categories and numbered contracts.

### WIRING.md
Real implementation graph:
page → component → action → hook/service → data → Bridge → tests.

### VERIFY.md
Observed evidence.

### CHANGELOG.md
Page-level design/implementation history.

## Build order

Do not bulk-generate shallow docs for every historic route.

Start with:

```text
Foundation
Home
Calendar
Messages
Roster
Stats team
Stats player
```

These are the active Clubhouse design/rebuild surfaces.

Make one page the gold-standard reference, then replicate.

## Existing state primitives

Prefer the Clubhouse primitives already present for:

- Toast
- EmptyState
- Skeleton
- InlineNotice
- SectionBoundary
- error tracking
- haptics
- reduced motion
- action normalization

The registry documents and references these.

Do not duplicate them merely to satisfy the new architecture.

## CI

Add mechanical checks for:

- duplicate Page IDs
- duplicate Bridge namespace
- duplicate Bridge ID
- tombstone reuse
- missing page docs
- invalid semantic feature references
- missing implementation path
- contract/category gaps
- held migration missing HOLD record
- status contradictions
- stale generated docs

The source of truth should fail loudly when it drifts.

## Do not apply migrations

Repeat: do not apply migrations in this task.

## Do not activate held features

Repeat: do not activate new feature semantics in this task.

## Completion output

When foundation work is complete, report:

1. files created/changed
2. registered pages
3. Bridge namespaces
4. semantic feature links
5. held items
6. checks added
7. checks run
8. known gaps
9. anything requiring owner decision

Do not call the redesign complete.

This task creates the organizational foundation that future design and implementation work will follow.
