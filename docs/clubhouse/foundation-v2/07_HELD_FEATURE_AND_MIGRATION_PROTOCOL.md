# 07 — HELD Feature + Migration Protocol

This is a central requirement of the redesign.

During the current redesign phase:

> New feature requirements and database changes may be researched, specified, and written. They must not be applied or activated unless the owner explicitly moves them out of HOLD.

## A. Feature HOLD lifecycle

Use:

```text
IDEA
↓
SPECIFIED
↓
HELD
↓
READY_FOR_ACTIVATION
↓
IMPLEMENTING
↓
VERIFIED
↓
ACTIVE
```

During the current design phase, stop at:

```text
HELD
```

unless the capability already exists in the app and is only being reused.

## Held feature plan location

```text
docs/clubhouse/held/features/<feature>.md
```

Template:

```text
Feature ID:
Requested by design:
Pages:
Why needed:
Current capability:
Gap:
Desired behavior:
Actions:
Permissions:
Data:
Notifications:
Offline:
Bridge:
Tests:
Activation prerequisites:
Status: HELD
```

## Existing capability exception

If the design uses existing backend behavior:

Example:

```text
Messages keeps existing realtime hooks and message actions
```

then the redesigned UI can wire to it.

This is not activating a new feature.

## New capability rule

If the design introduces behavior that changes product semantics:

Examples:

- new notification behavior
- new acknowledgement workflow
- new role
- new database field
- new server action
- new data visibility
- new permission
- new task/automation type

then document it as HELD first.

## B. Data / migration HOLD lifecycle

### Stage 1 — design-level data plan

Preferred during design:

```text
docs/clubhouse/held/data/<capability>.md
```

This describes:

- required fields/tables
- relationships
- RLS
- indexes
- backfill
- compatibility
- rollback concept
- data ownership
- privacy implications
- migration risk

No SQL is required yet unless useful.

### Stage 2 — prepared migration

If implementation planning benefits from exact SQL, an agent may write the migration file.

But:

**DO NOT APPLY IT.**

Requirements:

1. Migration header says:
   `STATUS: WRITTEN — HOLD — NOT APPLIED`
2. Add a HOLD row to:
   `supabase/migrations/HELD.md`
3. Link the page and held plan.
4. Do not run:
   - `npm run db:apply`
   - production Supabase migration commands
   - direct production SQL
   - migration repair
5. Do not claim generated DB types include it.
6. UI must degrade honestly while the migration is held.

## Required migration header

```sql
-- STATUS: WRITTEN — HOLD — NOT APPLIED
--
-- Clubhouse redesign requirement:
-- <feature/page>
--
-- This migration was prepared during the redesign phase.
-- It MUST NOT be applied until the owner explicitly authorizes activation.
--
-- Held plan:
-- docs/clubhouse/held/data/<plan>.md
--
-- Apply path when authorized:
-- docs/operations/APPLY_PATH.md
```

## Required HELD.md row

Use the existing repo ledger.

Example:

```text
| `2026..._clubhouse_x.sql` | **HOLD** | Prepared for Clubhouse redesign. Written only; owner has not authorized application. See `docs/clubhouse/held/data/x.md`. | 2026-... |
```

## C. UI behavior while feature is held

Never render a control that pretends the held backend exists.

Choose one:

### Hide
When the action has no honest behavior yet.

### Read-only
When the UI can display the desired concept but not mutate it.

### Disabled with explanation
Use sparingly when exposing future intent is useful.

### Design-preview only
Allowed inside preview fixtures, never confused with live behavior.

## D. Feature flags

A release flag such as the current Clubhouse flag may isolate the new UI.

Do not use a feature flag as permission to silently activate a held data feature.

Feature flag:

```text
controls exposure
```

HOLD:

```text
controls whether capability may exist yet
```

They are different.

## E. Promotion out of HOLD

When the owner authorizes a capability:

1. re-read current schema
2. re-read current feature state
3. review migration against current main
4. resolve conflicts
5. run required migration review
6. apply through sanctioned path
7. regenerate DB types if needed
8. wire capability
9. test RLS/permissions
10. update HELD row
11. update page manifest
12. update feature authority if this became a durable semantic feature
13. verify
14. activate

Never treat a months-old held migration as automatically safe to apply.
