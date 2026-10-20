# Fairway / Clubhouse Foundation V2 — START HERE

This package is the handoff for organizing the **from-scratch GolfHelm Clubhouse rebuild**.

It was designed against the current `njrini99-code/helmv3` repository, including the active Clubhouse rebuild structure, the existing Helm knowledge authority, the UI intelligence atlas, the migration HOLD ledger, the current Clubhouse progress/checklist system, and the existing Bridge/error/observability patterns.

## The single idea

Do **not** create another independent “Atlas” that duplicates Helm's existing feature maps.

Instead:

```text
Existing Helm authorities
        +
Clubhouse page registry
        +
Page contracts
        +
Bridge numbered contracts
        +
Design handoff packages
        +
Held feature/data plans
        +
Mechanical CI validation
```

become one connected operating system.

## Existing repo systems this design preserves

These remain authoritative:

```text
memory/registry.yml
  = semantic feature ownership / file routing

memory/features/*
  = current feature behavior

src/lib/admin/feature-registry.ts
  = runtime observability vocabulary

ui-intelligence/catalog.json
ui-intelligence/ROUTE-ATLAS.md
ui-intelligence/atlas.html
  = route discovery / visual route intelligence

docs/clubhouse/PROGRESS.md
  = Clubhouse implementation gate tracker

docs/clubhouse/screens/*.md
  = per-screen quality checklists

.claude/rules/clubhouse.md
  = fresh Clubhouse implementation doctrine

scripts/clubhouse/check.mjs
  = mechanical Clubhouse isolation / doctrine enforcement

supabase/migrations/HELD.md
  = deliberate non-application record
```

The new system fills the missing layer:

```text
Which page owns this?
What feature does it belong to?
What action/button is this?
What hook/service does it call?
What data does it consume?
What page-state contract applies?
What Bridge number represents it?
What is designed?
What is implemented?
What is deliberately held?
What test proves it?
```

## Read in this order

1. `01_REPO_AUDIT_AND_RECOMMENDATION.md`
2. `02_AUTHORITY_MODEL.md`
3. `03_DIRECTORY_AND_REGISTRY_ARCHITECTURE.md`
4. `04_PAGE_CONTRACT_AND_BRIDGE_SPEC.md`
5. `05_FRESH_BUILD_RULES.md`
6. `06_DESIGN_TO_IMPLEMENTATION_PIPELINE.md`
7. `07_HELD_FEATURE_AND_MIGRATION_PROTOCOL.md`
8. `08_CI_PROGRESS_AND_VERIFICATION.md`
9. `09_AGENT_MASTER_HANDOFF.md`

Then use the templates under `/templates`.

## Non-negotiable owner direction captured here

### Fresh rebuild
Clubhouse is a fresh UI tree.

**Never nest new Clubhouse UI on top of old Fairway presentation.**

Existing business logic and non-UI infrastructure may be reused deliberately.

Old Fairway presentation is not a shortcut.

### Migrations
Migration requirements may be researched, planned, and written.

**Do not apply them yet.**

Any actual SQL migration written during this phase must be explicitly marked **WRITTEN / HOLD / NOT APPLIED** and registered in `supabase/migrations/HELD.md`.

### New feature work
New feature behavior required by a design may be fully specified and implementation-ready.

It must remain **HELD** until its activation phase.

Existing backend capabilities may be reused to make redesigned UI real.

New capabilities that alter schema, production behavior, permissions, notifications, or feature semantics must not silently activate while the redesign is still in the design/held phase.

## Recommended implementation order

Do not reorganize the entire repository at once.

1. Establish the new registry schema.
2. Register the Clubhouse Foundation.
3. Register the five already-designed screens:
   - Home
   - Calendar
   - Messages
   - Roster
   - Stats team
   - Stats player
4. Connect each page to existing semantic features.
5. Add Bridge contract IDs.
6. Generate the human docs.
7. Add registry checks to `clubhouse:check`.
8. Only then scale to CoachHelm, Rounds, Practice, Lineups, Events, Scouting, and player surfaces.

One gold-standard page is better than 50 partially documented pages.
