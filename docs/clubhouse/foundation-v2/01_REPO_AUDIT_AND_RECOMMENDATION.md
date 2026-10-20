# 01 — Repo Audit and Recommended Direction

## Current state observed

The repository already has a mature engineering knowledge system. The redesign foundation should leverage it rather than bypass it.

Important existing pieces:

### 1. Fresh Clubhouse tree already exists

The current Clubhouse work is isolated under:

```text
src/clubhouse/
```

The scoped rule explicitly says it is a from-scratch UI and prohibits reuse of:

```text
@/components/fairway/**
@/lib/fairway/**
@/lib/redesign/**
fairwayScope
.fairway-ds
--fw-*
```

This is exactly the right principle.

The new foundation should **strengthen this**, not introduce a new UI layer above the legacy tree.

### 2. Existing Clubhouse primitives are already forming

The current rebuild includes reusable Clubhouse primitives for:

- toasts
- empty states
- skeletons
- inline notices
- section error boundaries
- modal/menu/forms
- segmented controls
- haptics
- reduced motion
- action normalization
- server/client error tracking

Do not duplicate those in a registry.

The registry should point to them.

### 3. Existing state/error doctrine is strong

The current screen checklist already distinguishes:

- initial loading
- first-run empty
- filtered empty
- partial section failure
- route failure
- no-access/not-found
- offline/slow network
- mutation failure
- inline validation
- destructive confirmation
- optimistic rollback

The new numbered Page Contract should make these **addressable and traceable** instead of replacing them.

### 4. The repository already has a semantic feature authority

`memory/registry.yml` owns the mapping between semantic features, files, docs, tests, integrations and observability keys.

Do not create another authoritative `features.registry.ts` for the same truth.

That would directly violate the repo's accepted knowledge-authority ADR.

Instead, a Clubhouse page manifest should reference existing feature IDs:

```json
{
  "semanticFeatures": [
    "calendar_events",
    "team_communications",
    "roster_team",
    "stats_analytics",
    "golf_round_lifecycle"
  ]
}
```

If a truly new feature does not exist yet, keep it as a **held feature plan** until implementation/activation is authorized.

### 5. Runtime observability already has its own feature vocabulary

`src/lib/admin/feature-registry.ts` is runtime observability vocabulary.

Do not repurpose it as page documentation.

Page/Bridge IDs should reference it where relevant, but not replace it.

### 6. The repo already has a route/UI Atlas

`ui-intelligence` already has:

- a route catalog
- route analysis
- screenshots
- data contracts
- page states
- UI critique
- remediation plans
- generated `ROUTE-ATLAS.md`
- generated visual `atlas.html`

Therefore, the new “Atlas” should not rescan the app or claim route authority.

### Recommended change

Rename the new concept mentally from:

> another Helm Atlas

to:

> **Clubhouse Registry + Contract Layer**

It should add **implementation traceability**, not duplicate route intelligence.

## What is actually missing

The repo has strong feature-level and route-level intelligence, but the redesign needs a deterministic page-level implementation graph:

```text
PAGE
  ├── DESIGN PACKAGE
  ├── SEMANTIC FEATURES
  ├── ACTIONS
  ├── COMPONENTS
  ├── HOOKS
  ├── SERVICES
  ├── DATA RESOURCES
  ├── PAGE CONTRACT IDS
  ├── BRIDGE ACTION IDS
  ├── TESTS
  ├── HELD REQUIREMENTS
  └── IMPLEMENTATION STATUS
```

That is the missing layer.

## Current Clubhouse design scope

The active rebuild currently covers:

- Home
- Calendar
- Messages
- Roster
- Stats team
- Stats player

And explicitly leaves later screens unbuilt until designed.

That sequencing should stay.

Do not “complete navigation” by embedding old Fairway pages inside Clubhouse.

A route that has not been freshly rebuilt should remain:

```text
NOT_REBUILT
```

or hidden when appropriate.

## Specific architecture improvements

### A. Introduce permanent Page IDs

Route paths can change.

Page IDs must not.

Example proposal:

```text
P001  Clubhouse Foundation / shell
P002  Coach Home
P003  Calendar
P004  Messages
P005  Roster
P006  Stats — Team
P007  Stats — Player
P008  CoachHelm
P009  Rounds
P010  Lineups / Qualifiers
P011  Scouting
P012  Player Home
P013  Practice
P014  Events
```

This is a **proposed allocation**.

Freeze it once adopted and never renumber shipped pages.

### B. Introduce Page Manifests

One machine-readable file per page.

This becomes the page's index into everything else.

### C. Introduce Action IDs

Buttons and meaningful interactions become discoverable.

Example:

```text
ACT-P003-CREATE-EVENT
ACT-P004-SEND-MESSAGE
ACT-P005-APPROVE-JOIN-REQUEST
```

### D. Add numeric Bridge contracts

The user's numeric key idea is good.

The number becomes a stable semantic event/action identifier.

It should not describe the rendering mechanism.

### E. Keep docs colocated by page

Every page gets:

```text
PAGE.md
DESIGN.md
CONTRACT.md
WIRING.md
VERIFY.md
CHANGELOG.md
```

### F. Connect progress mechanically

`PROGRESS.md` should remain the overview.

Page manifests/checklists provide the evidence underneath it.

### G. Create a HOLD lane

There must be a formal place for:

- new feature ideas from design
- data requirements
- schema changes
- migrations
- new backend actions
- notification behavior
- permissions changes

These can be designed and written without activating them.

This is crucial during the redesign.

## Final recommendation

Do not replace the current repo operating system.

Extend it.

The architecture becomes:

```text
memory/registry.yml
        │
        │ semantic feature IDs
        ▼
Clubhouse Page Registry
        │
        ├── Page docs
        ├── Page contracts
        ├── Actions
        ├── Components
        ├── Hooks
        ├── Data resources
        ├── Held requirements
        └── Bridge IDs
        │
        ▼
src/clubhouse/
        │
        ├── fresh UI
        ├── existing non-UI plumbing
        └── implementation
        │
        ▼
scripts/clubhouse/check.mjs
        +
knowledge:check
        +
tests
        +
Bridge / observability
```
