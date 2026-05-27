# Scope — "3 baseball tables column reshape" (from SESSION_REPORT Part 2 § what's-still-on-the-to-do-list item 6)

## Finding 1 — there is no column-name drift

Pulled prod columns for `baseball_coaches`, `baseball_players`, and
`baseball_team_members` via Supabase MCP and compared against the
`Row` shapes in `src/lib/types/database.ts`.

| Table | Prod cols | TS Row cols | Drift |
|---|---:|---:|---|
| `baseball_coaches` | 13 | 13 | none — exact match (id, user_id, organization_id, coach_type, full_name, email, phone, avatar_url, title, bio, onboarding_completed, created_at, updated_at) |
| `baseball_players` | 39 | 39 | none — exact match |
| `baseball_team_members` | 11 | 11 | none — exact match |

Migration `036_rename_baseball_tables.sql` is **pure `ALTER TABLE …
RENAME TO …`** with zero column-level changes — nothing renamed columns
there. The TypeScript types were regenerated against prod (per the
session report) and match prod 1:1.

**Conclusion: the report's "carry stale column names" claim is
outdated. No column reshape needed.** Strike that half of to-do #6
from the punch list.

## Finding 2 — the body-level guard half is real and shippable

Both baseball-recalc RPCs are wired this way after PR #115:

```
recalculate_baseball_season_stats(p_player_id uuid, p_team_id uuid, p_season_year int)
recalculate_team_baseball_season_stats(p_team_id uuid, p_season_year int)
```

- `SECURITY DEFINER` ✓
- `SET search_path = public, pg_temp` ✓ (PR #115)
- `GRANT EXECUTE TO authenticated, service_role` ✓ (PR #115 kept
  `authenticated` because server actions in
  `src/app/baseball/actions/games.ts:558,1031` need it)
- App-layer `verifyTeamAccess` gates the server-action callers ✓
- **No body-level coach check** — any authenticated user could
  invoke either RPC directly via PostgREST RPC and trigger writes
  to `baseball_player_season_stats`.

`public.is_baseball_team_coach_v2(p_team_id uuid)` already exists in
prod (verified via `pg_proc`). It's the right primitive — uses
`auth.uid()` against `baseball_team_coach_staff`.

## Recommended migration (forward-only, post PR #117)

Name: `supabase/migrations/20260528000000_baseball_recalc_body_guards.sql`

```sql
-- Body-level guard for the two baseball recalc RPCs.
-- PR #115 locked GRANTs + search_path; this PR adds a coach-only check
-- inside the function bodies so PostgREST RPC callers cannot bypass
-- the app-layer verifyTeamAccess gate by hitting the RPC directly.

CREATE OR REPLACE FUNCTION public.recalculate_baseball_season_stats(
  p_player_id uuid,
  p_team_id uuid,
  p_season_year integer DEFAULT (EXTRACT(year FROM now()))::integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  -- ... existing declarations ...
BEGIN
  IF NOT public.is_baseball_team_coach_v2(p_team_id) THEN
    RAISE EXCEPTION 'forbidden: caller is not a coach of team %', p_team_id
      USING ERRCODE = '42501';
  END IF;
  -- ... existing body ...
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_team_baseball_season_stats(
  p_team_id uuid,
  p_season_year integer DEFAULT (EXTRACT(year FROM now()))::integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_player_id uuid;
BEGIN
  IF NOT public.is_baseball_team_coach_v2(p_team_id) THEN
    RAISE EXCEPTION 'forbidden: caller is not a coach of team %', p_team_id
      USING ERRCODE = '42501';
  END IF;

  FOR v_player_id IN
    SELECT DISTINCT player_id FROM baseball_team_members WHERE team_id = p_team_id
  LOOP
    PERFORM recalculate_baseball_season_stats(v_player_id, p_team_id, p_season_year);
  END LOOP;
END;
$function$;
```

(Bodies otherwise identical to current prod definitions.)

### pgTAP coverage

Add to `supabase/tests/rls/rpc_grant_hardening.sql` (or a sibling file):

- non-coach `authenticated` JWT invoking either RPC → `42501` raised, no rows mutated in `baseball_player_season_stats`
- coach JWT for the team → succeeds, rows mutated as expected
- `service_role` → succeeds regardless (preserves admin/cron paths)
- `anon` → still rejected at GRANT layer (already covered)

### App-side impact

Both `src/app/baseball/actions/games.ts:558,1031` already enforce
`verifyTeamAccess` before calling, so the new guard is belt-and-suspenders
for the happy path. No app changes required, but worth adding an
explicit error path in those actions to translate the `42501` into a
user-facing message if it ever fires (defense in depth — would catch
a future server-action that forgets the gate).

### Order of operations

1. Wait for PR #117 (baseline) to merge.
2. Open this as a small focused PR. It's a single migration + a few
   pgTAP rows, easy to review.
3. Apply migration via `supabase db push` (now safe because baseline
   replays clean) or via the dashboard SQL editor as a hotfix.
4. Verify with `has_function_privilege` + a real-JWT call in staging.

## Net result

The "3-baseball-table reshape" entry on the to-do list collapses to a
single ~20-line migration plus pgTAP coverage. The "stale column"
half is a false alarm — TS types and prod schema match exactly.
