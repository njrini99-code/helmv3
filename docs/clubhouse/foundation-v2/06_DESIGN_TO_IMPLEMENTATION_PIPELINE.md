# 06 — Design → Registry → Implementation Pipeline

## Goal

Claude Design should stay creative.

Implementation agents should stay disciplined.

The registry is the handoff membrane between them.

## Pipeline

```text
1. DESIGN RESEARCH
        ↓
2. DESIGN PACKAGE
        ↓
3. PAGE REGISTRY INGEST
        ↓
4. CONTRACT UPDATE
        ↓
5. FEATURE/DATA GAP CLASSIFICATION
        ↓
6. HELD PLANS WRITTEN
        ↓
7. IMPLEMENTATION PACKAGE
        ↓
8. FRESH UI IMPLEMENTATION
        ↓
9. BRIDGE WIRING
        ↓
10. VERIFY
        ↓
11. REGISTRY + DOCS UPDATE
```

## Phase 1 — Design research

Claude Design reads:

- page docs
- current design handoff
- current Clubhouse primitives
- current route behavior
- semantic feature context
- existing app data reality

It may inspect old Fairway only for workflow understanding.

It must not default to old Fairway component reuse.

## Phase 2 — Design package

Every design output includes:

```text
DESIGN.md
design.manifest.json
references/
screenshots/
```

The manifest explicitly lists:

```text
page
changed components
new actions
changed actions
contract categories affected
semantic features affected
data assumptions
held requirements
```

## Phase 3 — Registry ingest

Before implementation, the implementation agent updates the page manifest.

It does **not** mark the feature complete.

It records:

- design version
- actions
- components
- data resources
- expected Bridge contracts
- held items

## Phase 4 — Contract update

The page `CONTRACT.md` is updated before or alongside implementation.

The agent must answer all 25 categories.

This prevents “visual first, behavior later.”

## Phase 5 — Feature/data gap classification

Every requested capability is classified:

### EXISTING
Backend exists and is safe to reuse.

Example:
existing message realtime/actions.

### PRESENTATION-ONLY
No backend behavior change.

### HELD-FEATURE
New behavior is needed but should not activate yet.

### HELD-DATA
New schema/RLS/storage/RPC is needed but should not apply yet.

### OWNER-DECISION
Product semantics are unresolved.

### BLOCKED
A dependency is missing.

## Phase 6 — Held plans

Held requirements get docs.

Examples:

```text
docs/clubhouse/held/features/message-thread-replies.md
docs/clubhouse/held/data/roster-captain-role.md
```

If SQL is prepared, it follows the HOLD protocol.

## Phase 7 — Implementation package

The implementation agent creates its impact map before code changes:

```text
Pages
Semantic features
Actions
Components
Hooks
Services
Data
Bridge IDs
Tests
Held items
```

## Phase 8 — Fresh UI implementation

Build under `src/clubhouse`.

Reuse only allowed non-UI plumbing.

## Phase 9 — Bridge wiring

Bridge integration is based on the numbered contract registry.

The page should be inspectable without Bridge knowing component internals.

## Phase 10 — Verification

Run applicable:

```text
typecheck
lint
clubhouse:check
unit tests
integration tests
visual comparison
phone checks
accessibility
contract registry check
Bridge registry check
knowledge:check
```

## Phase 11 — Update truth

In the same implementation change:

- page manifest
- page docs
- screen checklist
- PROGRESS gate
- Bridge registry
- tests
- held plan status

must match reality.

## Design agent must never do these automatically

- apply migrations
- turn on production feature flags
- mark verification complete
- modify production data
- reuse old Fairway UI because it is faster
- invent data that prototypes show but the app does not have

## Implementation agent must never do these automatically

- apply held migrations
- activate held features
- bypass owner decisions
- mark a held capability live
- convert a data gap into fake UI data
