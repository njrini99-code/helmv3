# Fix 05: RLS Database Security Fixes

## Bugs Addressed

| Bug | Severity | Summary |
|-----|----------|---------|
| #7  | P0 | RLS policies on stats cache tables reference non-existent `golf_coaches.team_id` / `golf_players.team_id` columns |
| #8  | P0 | RLS on `golf_shots` filters only through nullable `hole_id`, making shots with NULL `hole_id` invisible |
| #30 | P1 | No unique constraint on `(round_id, hole_number, shot_number)` in `golf_shots` |

## Root Cause Analysis

### Bug #7: Broken coach-access JOINs on stats cache tables

**Origin:** Migration `040_golf_shot_system.sql`, lines 331-413.

Six policies on three tables (`golf_player_stats_cache`, `golf_round_stats_cache`, `golf_putting_tendencies`) all contain JOINs like:

```sql
JOIN golf_coaches c ON c.team_id = p.team_id
```

Neither `golf_coaches` nor `golf_players` has a `team_id` column. The `golf_coaches` table has `organization_id` and the `golf_players` table has no team column at all -- team membership is tracked through `golf_team_members`.

A prior fix (`20260213000000_fix_broken_coach_select_rls.sql`) corrected the equivalent broken policies on `golf_rounds`, `golf_holes`, and `golf_shots`, but did NOT touch the stats cache tables from migration 040.

**Correct path:** `golf_coaches.organization_id -> golf_teams.organization_id -> golf_team_members.player_id`, or more efficiently, `golf_team_members.team_id -> is_golf_team_coach(team_id)` (which is a SECURITY DEFINER function that checks `golf_team_coach_staff -> golf_coaches -> auth.uid()`).

### Bug #8: Shots with NULL hole_id are invisible

**Origin:** Migration `034_all_rls_policies.sql`, lines 862-924 (later partially replaced by `20260213000000`).

All `golf_shots` RLS policies filter through `hole_id IN (SELECT gh.id FROM golf_holes gh ...)`. Since `hole_id` is nullable on `golf_shots` (the schema doc confirms `hole_id uuid | YES`), any shot row with `hole_id = NULL` will never pass the `IN` subquery and is therefore invisible to all users.

The `golf_shots` table also has a NOT NULL `round_id` column, which provides a reliable alternative path to ownership.

### Bug #30: Missing uniqueness constraint

**Origin:** Migration `050_golf_performance_indexes.sql`, line 58-59.

The index `idx_golf_shots_round_hole_shot` is a regular (non-unique) B-tree index on `(round_id, hole_number, shot_number)`. Without a uniqueness constraint, the application cannot rely on the database to prevent duplicate shot numbers within a hole, which could cause data corruption in the stats calculator.

## Affected Policies (Before Fix)

### Stats cache policies from `040_golf_shot_system.sql`:

| Table | Policy Name | Bug |
|-------|------------|-----|
| `golf_player_stats_cache` | "Coaches can view team player stats" | #7 - broken JOIN |
| `golf_player_stats_cache` | "Coaches can manage team stats cache" | #7 - broken JOIN |
| `golf_round_stats_cache` | "Coaches can view team round stats" | #7 - broken JOIN |
| `golf_round_stats_cache` | "Coaches can manage round stats cache" | #7 - broken JOIN |
| `golf_putting_tendencies` | "Coaches can view team putting tendencies" | #7 - broken JOIN |
| `golf_putting_tendencies` | "Coaches can manage putting tendencies" | #7 - broken JOIN |

### Shots policies from `034_all_rls_policies.sql` (as replaced by `20260213000000`):

| Table | Policy Name | Bug |
|-------|------------|-----|
| `golf_shots` | "golf_shots_select_own" | #8 - hole_id only |
| `golf_shots` | "golf_shots_select_team" | #8 - hole_id only |
| `golf_shots` | "golf_shots_insert_own" | #8 - hole_id only |
| `golf_shots` | "golf_shots_update_own" | #8 - hole_id only |
| `golf_shots` | "golf_shots_delete_own" | #8 - hole_id only |

## Migration File

**File:** `supabase/migrations/20260304000003_fix_rls_shots_stats_unique.sql`

### Part 1: Fix golf_shots RLS (Bug #8)

Drops and replaces all 5 `golf_shots` policies. Each new policy uses a two-path check:

1. **Path 1 (hole_id):** The original subquery through `hole_id -> golf_holes -> golf_rounds -> golf_players`, which works when `hole_id` is populated.
2. **Path 2 (round_id):** A fallback subquery through `round_id -> golf_rounds -> golf_players`, which handles shots where `hole_id` is NULL.

The team/coach SELECT policy similarly adds a `round_id`-based fallback using `is_golf_team_coach(gr.team_id)`.

### Part 2: Fix stats cache RLS (Bug #7)

Drops and replaces 6 coach-access policies across 3 tables. The new policies use the correct join path:

```sql
player_id IN (
  SELECT gtm.player_id FROM golf_team_members gtm
  WHERE gtm.status = 'active'
    AND is_golf_team_coach(gtm.team_id)
)
```

This uses the existing `is_golf_team_coach(uuid)` SECURITY DEFINER function, which checks `golf_team_coach_staff -> golf_coaches -> auth.uid()`. This matches the pattern used by the prior fix in `20260213000000` for other tables.

### Part 3: Add UNIQUE constraint (Bug #30)

Drops the existing regular index `idx_golf_shots_round_hole_shot` and recreates it as a UNIQUE index:

```sql
CREATE UNIQUE INDEX idx_golf_shots_round_hole_shot
  ON golf_shots (round_id, hole_number, shot_number);
```

## Verification Checklist

- [ ] Coaches can view stats for players on their team (via `golf_team_members`)
- [ ] Players can view their own stats (unchanged player-own policies)
- [ ] Shots with NULL `hole_id` are visible to the owning player
- [ ] Shots with NULL `hole_id` are visible to the team's coach
- [ ] Shots with populated `hole_id` continue to work as before
- [ ] Inserting a shot with NULL `hole_id` is allowed for the owning player
- [ ] Duplicate `(round_id, hole_number, shot_number)` tuples are rejected
- [ ] No RLS infinite recursion (all policies use SECURITY DEFINER helpers)

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/20260304000003_fix_rls_shots_stats_unique.sql` | NEW - Complete fix migration |

## Dependencies

- `is_golf_team_coach(uuid)` function (defined in `20260204200000_fix_golf_rls_infinite_recursion.sql`, set to SECURITY DEFINER in `061_fix_golf_rls_recursion.sql`)
- `golf_team_members` table with `status` column
- `golf_team_coach_staff` table (used by `is_golf_team_coach`)
