# 02 — Authority Model

The most dangerous outcome would be creating beautifully organized documentation that slowly becomes another stale copy of the app.

This architecture avoids that by assigning one owner to each kind of truth.

## Authority table

| Truth | Authority |
|---|---|
| Which semantic feature owns files | `memory/registry.yml` |
| Current feature behavior | `memory/features/*` |
| Runtime observability vocabulary | `src/lib/admin/feature-registry.ts` |
| Route discovery / current UI atlas | `ui-intelligence/*` |
| Clubhouse design doctrine | `.claude/rules/clubhouse.md` + design handoff |
| Clubhouse overall implementation progress | `docs/clubhouse/PROGRESS.md` |
| Per-screen quality evidence | `docs/clubhouse/screens/*.md` |
| Page identity and implementation graph | **new Clubhouse page manifest** |
| Page behavioral state contract | **new page `CONTRACT.md` + contract manifest** |
| Bridge numeric meaning | **new Clubhouse Bridge contract registry** |
| Planned but inactive feature behavior | **new held feature plans** |
| Planned but unapplied DB work | held data plan + migration file if prepared + `supabase/migrations/HELD.md` |
| Actual database application | existing sanctioned DB apply flow, owner-authorized later |
| Historical page changes | page `CHANGELOG.md` + existing feature ledgers where semantic behavior changes |

## Rule: projections are generated

Files such as:

```text
CLUBHOUSE_PAGE_MAP.md
CLUBHOUSE_ACTION_MAP.md
CLUBHOUSE_BRIDGE_MAP.md
CLUBHOUSE_STATUS.md
```

should be generated from the page manifests.

They are views.

They are not new authorities.

## Rule: page registry references features, it does not redefine them

Correct:

```json
{
  "semanticFeatures": ["team_communications"]
}
```

Incorrect:

```json
{
  "feature": {
    "name": "Messaging",
    "code": ["..."],
    "docs": ["..."],
    "tests": ["..."]
  }
}
```

That information already has an authority elsewhere.

## Rule: implementation paths may be recorded at page level

The page registry may safely record page-specific implementation bindings:

```json
{
  "components": [
    "src/clubhouse/screens/messages/Messages.tsx"
  ],
  "hooks": [
    "existing realtime messages hook"
  ]
}
```

This is page traceability, not semantic feature ownership.

## Rule: Bridge numbers have their own authority

Bridge IDs need a single canonical registry because they must be stable.

Never copy their definitions manually across multiple docs.

Page docs should reference:

```text
4051
```

and the Bridge registry should define its canonical meaning.

Generated docs may render the full description.

## Rule: statuses are controlled values

No prose statuses.

Use:

```text
design:
  not_started
  draft
  review
  approved
  superseded

implementation:
  not_started
  ready
  in_progress
  blocked
  verifying
  complete

contract:
  not_started
  partial
  complete

bridge:
  not_required
  reserved
  partial
  complete

data:
  not_required
  existing
  plan_required
  held
  ready

verification:
  not_started
  partial
  passing
  failing

docs:
  missing
  stale
  current
```

## Rule: progress is derived

Do not let an agent type:

```text
92% done
```

Generate progress from completion gates.

A page can instead report:

```text
contracts: 21/25 applicable complete
bridge: 6/8 wired
tests: 12/14 passing
held: 2
blocking: 1
```

Those numbers are inspectable.
