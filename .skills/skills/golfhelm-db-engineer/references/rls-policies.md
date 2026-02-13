# RLS Policies Reference — GolfHelm

This file documents every RLS policy in GolfHelm, what it should allow, and the
exact SQL to verify each one is working correctly.

**Tool Rule**: Use ONLY the `execute_sql` MCP tool for all queries. No other
tools, APIs, or HTTP requests. Only SELECT queries — never modify data.

## Table of Contents
1. [Auth Chain Overview](#auth-chain-overview)
2. [Policy Verification Queries](#policy-verification-queries)
3. [Known Tricky Patterns](#known-tricky-patterns)
4. [Common Failure Modes](#common-failure-modes)

---

## Auth Chain Overview

Every data access in GolfHelm follows one of these chains:

### Coach Access Chain
```
auth.uid()
  → users.id (role = 'coach')
  → golf_coaches.user_id (gets coach.id, team_id, organization_id)
  → golf_teams.organization_id = coach.organization_id (gets team_id)
  → [team-scoped data via team_id]
  → golf_team_members.team_id → golf_players (sees all team players)
  → golf_rounds.player_id IN (team player IDs)
  → golf_holes.round_id IN (team rounds)
  → golf_shots.hole_id IN (team holes)
```

### Player Access Chain
```
auth.uid()
  → users.id (role = 'player')
  → golf_players.user_id (gets player.id)
  → golf_team_members.player_id = player.id AND status = 'active'
  → [own data only: rounds, holes, shots, stats]
```

### Critical Insight
The coach finds their team through `organization_id`, NOT through `team_id` on
golf_coaches directly. The layout.tsx does:
```
coach.organization_id → golf_teams WHERE organization_id = X → team_id
```
If `golf_coaches.organization_id` is NULL, the coach has NO team and sees nothing.

---

## Policy Verification Queries

Run these to find RLS issues. Each query is designed to surface problems.

### 1. Check RLS is enabled on all golf tables

```sql
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'golf_%'
ORDER BY tablename;
```
**Expected**: Every row has `rowsecurity = true`. Any `false` = critical security gap.

### 2. List all RLS policies on golf tables

```sql
SELECT tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE 'golf_%'
ORDER BY tablename, cmd;
```
**Expected**: Every table has at minimum a SELECT policy for `authenticated` role.
Tables that need INSERT/UPDATE/DELETE: golf_rounds, golf_holes, golf_shots,
golf_events, golf_event_rsvps, golf_messages, golf_tasks, golf_announcements.

### 3. Find coaches with broken team chain

```sql
-- Coaches whose organization_id doesn't link to any team
SELECT gc.id AS coach_id, gc.full_name, gc.organization_id, gc.team_id,
       u.email, u.id AS user_id
FROM golf_coaches gc
JOIN users u ON u.id = gc.user_id
LEFT JOIN golf_teams gt ON gt.organization_id = gc.organization_id
WHERE gt.id IS NULL;
```
**Expected**: 0 rows. Any coach here cannot see ANY team data.

### 4. Find players with broken team membership

```sql
-- Players who have no active team_members row (can't see team data)
SELECT gp.id AS player_id, gp.first_name, gp.last_name,
       u.email, u.id AS user_id,
       gtm_any.team_id AS inactive_team_id, gtm_any.status AS membership_status
FROM golf_players gp
JOIN users u ON u.id = gp.user_id
LEFT JOIN golf_team_members gtm_active ON gtm_active.player_id = gp.id AND gtm_active.status = 'active'
LEFT JOIN golf_team_members gtm_any ON gtm_any.player_id = gp.id
WHERE gtm_active.id IS NULL AND gtm_any.id IS NOT NULL
LIMIT 50;
```
**Expected**: 0 rows. Players here are on a team but RLS won't let them see team data
because the team_members check fails.

### 5. Verify SECURITY DEFINER helper functions exist

```sql
SELECT routine_name, security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_user_golf_team_ids',
    'get_user_golf_organization_id',
    'update_event_rsvp_counts',
    'generate_feed_token',
    'calculate_round_stats',
    'handle_new_user'
  );
```
**Expected**: All 6 functions exist with `security_type = DEFINER`.

### 6. Check for nested RLS chain breaks (shots → holes → rounds → players)

```sql
-- Shots that can't trace back to a player
SELECT gs.id AS shot_id, gh.id AS hole_id, gr.id AS round_id, gr.player_id
FROM golf_shots gs
JOIN golf_holes gh ON gh.id = gs.hole_id
JOIN golf_rounds gr ON gr.id = gh.round_id
LEFT JOIN golf_players gp ON gp.id = gr.player_id
WHERE gp.id IS NULL
LIMIT 50;
```
**Expected**: 0 rows. Orphaned shots that no RLS policy can authorize.

### 7. Check for users without public.users row (auth trigger failure)

```sql
SELECT au.id, au.email, au.created_at,
       u.id AS public_user_id
FROM auth.users au
LEFT JOIN public.users u ON u.id = au.id
WHERE u.id IS NULL
LIMIT 50;
```
**Expected**: 0 rows. Users here can authenticate but have no role → broken experience.

### 8. Verify coach can see player rounds via RLS policy chain

```sql
-- Simulate what the RLS policy checks for a coach
-- Pick a coach and verify the chain
WITH coach_info AS (
  SELECT gc.id AS coach_id, gc.user_id, gc.organization_id, gc.team_id,
         gt.id AS resolved_team_id
  FROM golf_coaches gc
  LEFT JOIN golf_teams gt ON gt.organization_id = gc.organization_id
  LIMIT 1
),
team_players AS (
  SELECT gp.id AS player_id
  FROM golf_players gp
  JOIN golf_team_members gtm ON gtm.player_id = gp.id AND gtm.status = 'active'
  WHERE gtm.team_id = (SELECT resolved_team_id FROM coach_info)
)
SELECT
  (SELECT count(*) FROM team_players) AS players_coach_should_see,
  (SELECT count(*) FROM golf_rounds WHERE player_id IN (SELECT player_id FROM team_players)) AS rounds_coach_should_see,
  (SELECT count(*) FROM golf_holes WHERE round_id IN (
    SELECT id FROM golf_rounds WHERE player_id IN (SELECT player_id FROM team_players)
  )) AS holes_coach_should_see;
```
**Expected**: Non-zero counts if the team has data. Zero = the chain is broken.

---

## Known Tricky Patterns

### RLS Recursion on golf_team_members
The `golf_team_members` table can cause infinite recursion if its own SELECT policy
references itself. Solution: SECURITY DEFINER function `get_user_golf_team_ids()` that
queries golf_team_members without triggering RLS.

**Verify it works:**
```sql
SELECT prosrc FROM pg_proc WHERE proname = 'get_user_golf_team_ids';
```
Should contain a direct query on `golf_team_members` joining `golf_players` on user_id.

### Coach team_id vs organization_id
`golf_coaches` has BOTH `team_id` and `organization_id`. The app uses `organization_id`
to find teams. If `team_id` is set but `organization_id` is NULL (or vice versa),
behavior is unpredictable. Check:

```sql
SELECT id, full_name, team_id, organization_id,
  CASE
    WHEN organization_id IS NULL THEN 'BROKEN: no org'
    WHEN team_id IS NULL AND organization_id IS NOT NULL THEN 'OK: uses org path'
    WHEN team_id IS NOT NULL AND organization_id IS NOT NULL THEN 'OK: both set'
    ELSE 'UNKNOWN'
  END AS status
FROM golf_coaches
LIMIT 50;
```

### Courses: created_by vs is_public
Golf courses use `created_by = auth.uid() OR is_public = true`. A course created by
a coach but not marked public won't be visible to players on the same team.

```sql
SELECT id, name, created_by, is_public,
  (SELECT email FROM users WHERE id = gc.created_by) AS creator_email
FROM golf_courses gc
WHERE is_public = false
LIMIT 50;
```

---

## Common Failure Modes

1. **Coach sees empty dashboard**: `organization_id` is NULL on golf_coaches → no team resolved
2. **Player sees no team data**: Missing `golf_team_members` row with status='active'
3. **Stats page empty for coach**: Coach org → team → players chain broken at any link
4. **Shots not loading**: 3-level nested RLS (shots→holes→rounds→players) fails if any link breaks
5. **Calendar empty**: golf_events scoped to team_id, but coach team resolution failed
6. **Messages invisible**: golf_conversation_participants missing the user's row
7. **Qualifier leaderboard empty**: golf_qualifier_entries exist but player_id can't be resolved
