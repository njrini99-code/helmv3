# 05 — Fresh Build Rules

This section is intentionally strict.

The Clubhouse redesign exists because the prior approach layered new presentation on top of old Fairway UI.

Do not repeat that architecture.

## Rule 1 — Clubhouse presentation is fresh

Clubhouse UI lives under:

```text
src/clubhouse/**
```

Do not import old Fairway presentation:

```text
@/components/fairway/**
@/lib/fairway/**
@/lib/redesign/**
```

Do not consume:

```text
fairwayScope
FAIRWAY_SCOPE
.fairway-ds
--fw-*
```

Use existing `.claude/rules/clubhouse.md` as the controlling repo rule.

## Rule 2 — Shared non-UI plumbing is allowed

Fresh UI does **not** mean rewriting correct business logic.

Allowed reuse includes deliberately shared:

- auth/session
- Supabase clients
- server actions
- data loaders
- validation schemas
- domain calculations
- error pipeline
- recovery logic
- realtime infrastructure
- Capacitor utility bridges
- existing API routes
- existing headless hooks where their contract is suitable

## Rule 3 — Presentation logic must not leak in through “shared” modules

If a legacy component contains useful data/business behavior mixed with JSX:

Do not render the component.

Instead:

```text
legacy mixed component
        ↓
extract headless/domain logic
        ↓
shared non-UI module
        ↓
fresh Clubhouse component
```

This is a migration of logic, not a nesting of UI.

## Rule 4 — Do not use Clubhouse as a frame around legacy pages

Wrong:

```text
ClubhouseShell
  └── LegacyFairwayPage
```

Correct:

```text
ClubhouseShell
  └── ClubhouseScreen
```

If the screen has not been rebuilt:

```text
NotRebuilt
```

or hide the navigation action.

## Rule 5 — No cosmetic reskin shortcuts

Do not:

- add `.ch-*` wrapper around old component
- override old component CSS
- alias old Fairway tokens into Clubhouse
- duplicate DOM then repaint it
- copy old JSX and rename classes without reconsidering hierarchy

## Rule 6 — The design package defines intent, not production code

Design prototype JSX/CSS is reference material.

Do not blindly paste it into production.

Recreate it using:

- Clubhouse primitives
- real app data
- real permissions
- real routes
- real server actions
- real state contracts

## Rule 7 — Data reality beats prototype sample data

If the design shows something with no data source:

```text
DO NOT INVENT IT
```

Record it as:

```text
HELD DATA GAP
```

Then either:
- omit it honestly
- substitute a real field with design review
- write a held data/feature plan

## Rule 8 — Old UI remains only as migration reference

Old Fairway can be inspected to understand:

- user workflows
- existing action semantics
- permissions
- edge cases
- missing behavior

It should not become the new component source.

## Rule 9 — New shared Clubhouse primitives are preferred

If three Clubhouse pages need the same primitive:

Create or reuse a Clubhouse primitive.

Examples:

- Toast
- EmptyState
- Skeleton
- InlineNotice
- SectionBoundary
- Button
- Modal
- Segmented
- SearchField

## Rule 10 — CI enforces isolation

Continue and extend `scripts/clubhouse/check.mjs`.

It should remain able to mechanically reject legacy UI imports and token leakage.
