# Smart Diagnostics — GolfHelm Database Engineer

Advanced bug-catching capabilities that go beyond data integrity checks.
These diagnose *logic bugs* — where policies, state machines, and triggers are
internally broken even when the data looks fine.

**This file is used by Wave 2 agents.** Each Wave 2 agent reads ONE section
of this file. If you're dispatched as a Wave 2 agent, you will receive a
**Findings Brief** from the coordinator. Use it to prioritize your work.

**Tool Rule**: Use ONLY the `execute_sql` MCP tool for all database queries.
No other tools, APIs, HTTP requests, or Supabase client libraries. Only SELECT
queries — never INSERT, UPDATE, DELETE, ALTER, or any data-modifying statement.

## Using the Findings Brief

Wave 2 agents receive a structured brief extracted from Wave 1 results:

```
FINDINGS BRIEF:
BROKEN_USERS: [user_ids/emails with broken auth chains]
BROKEN_TEAMS: [team_ids where coach→org→team chain is broken]
ORPHANED_PLAYERS: [player_ids with team_id but no active membership]
STALE_STATS: [player_ids with stale/missing stats caches]
SCORE_MISMATCHES: [round_ids where total ≠ SUM(holes)]
ORPHANED_RECORDS: [specific broken FKs]
UI_BLOCKERS: [pages that would render empty/wrong]
```

**How each agent uses the brief:**

| Agent | Brief fields to use | What to do |
|-------|---------------------|------------|
| Agent 5 (RLS Policy Logic) | BROKEN_USERS, BROKEN_TEAMS, UI_BLOCKERS | Check policies on tables those users/teams access. If roster page is a UI blocker, prioritize golf_team_members policies. |
| Agent 6 (State Machine) | SCORE_MISMATCHES, ORPHANED_PLAYERS, STALE_STATS | Check flagged round_ids for impossible states first. Check if orphaned players have stuck join requests. |
| Agent 7 (Trigger & Simulation) | BROKEN_USERS, STALE_STATS, SCORE_MISMATCHES | Simulate visibility for broken users. Verify trigger chains for rounds/players with stale stats. |

**Rules:**
- Brief fields that are empty `[]` = Wave 1 found no issues there. Still run your
  broad checks, but don't deep-dive — spend your turns on fields with data.
- Brief fields with data = your highest priority. Run targeted queries FIRST,
  then broad checks if turns remain.
- Always note in your findings whether an issue was "flagged by Wave 1" or
  "newly discovered" — this helps deduplication in Step 3.

## Table of Contents
1. [RLS Policy Logic Analyzer](#rls-policy-logic-analyzer)
2. [User Simulation Engine](#user-simulation-engine)
3. [State Machine Violation Detector](#state-machine-violation-detector)
4. [Trigger Chain Verifier](#trigger-chain-verifier)
5. [Cross-Reference Checker](#cross-reference-checker)

---

## RLS Policy Logic Analyzer

The goal: read the actual deployed policy definitions from `pg_policies` and
detect logic errors in the USING/WITH CHECK clauses themselves.

**With Findings Brief**: If BROKEN_USERS or BROKEN_TEAMS are non-empty, identify
which tables those users would query (coach → golf_teams, golf_team_members,
golf_rounds, golf_events; player → golf_rounds, golf_holes, golf_team_members)
and check those policies FIRST. If UI_BLOCKERS names specific pages (e.g.,
"roster page empty"), map page → table (roster → golf_team_members) and
prioritize that table's policies.

### Step 1: Extract all policies with their SQL

```sql
SELECT tablename, policyname, cmd,
  permissive, roles::text,
  COALESCE(qual, '(none)') AS using_clause,
  COALESCE(with_check, '(none)') AS check_clause
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'golf_%'
ORDER BY tablename, cmd;
```

### Step 2: Check for common policy bugs

**Bug Pattern 1: Missing USING clause on SELECT**
A SELECT policy without a USING clause allows unrestricted reads.
```sql
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'golf_%'
  AND cmd = 'SELECT' AND qual IS NULL;
```

**Bug Pattern 2: INSERT without WITH CHECK**
INSERT policies without WITH CHECK allow inserting rows the user can't later read.
```sql
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'golf_%'
  AND cmd = 'INSERT' AND with_check IS NULL;
```

**Bug Pattern 3: UPDATE with USING but no WITH CHECK**
User can update rows but the update could put the row outside their read scope.
```sql
SELECT tablename, policyname, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'golf_%'
  AND cmd = 'UPDATE' AND qual IS NOT NULL AND with_check IS NULL;
```

**Bug Pattern 4: Tables with RLS enabled but NO policies**
RLS enabled + no policies = nobody can access the table.
```sql
SELECT t.tablename
FROM pg_tables t
WHERE t.schemaname = 'public' AND t.tablename LIKE 'golf_%'
  AND t.rowsecurity = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = t.schemaname AND p.tablename = t.tablename
  );
```

**Bug Pattern 5: Policies that reference non-existent functions**
If a SECURITY DEFINER function was dropped, the policy silently fails.
```sql
-- Get all function names referenced in policies
SELECT DISTINCT tablename, policyname,
  regexp_matches(COALESCE(qual, '') || ' ' || COALESCE(with_check, ''),
    '([a-z_]+)\s*\(', 'g') AS referenced_function
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'golf_%';
```
Then verify each function exists:
```sql
SELECT proname, prosecdef AS is_security_definer
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'is_golf_team_player', 'is_golf_team_coach',
    'get_current_golf_player_id', 'user_is_golf_team_member',
    'user_is_coach_of_golf_player', 'user_has_pending_join_request_to_coach_team',
    'is_admin'
  );
```
**Expected**: All 7 functions exist with `is_security_definer = true`.

**Bug Pattern 6: Conflicting PERMISSIVE and RESTRICTIVE policies**
RESTRICTIVE policies combined with PERMISSIVE ones can unexpectedly block access.
```sql
SELECT tablename, policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'golf_%'
  AND permissive = 'RESTRICTIVE';
```
If any exist, check that they don't conflict with PERMISSIVE policies on same table+cmd.

### Step 3: Verify SECURITY DEFINER function correctness

The helper functions are the most critical part — they bypass RLS. If they have bugs,
the entire access control is broken. Read their source and verify logic.

**Note**: These are RLS policy helper functions (called inside USING/WITH CHECK clauses).
The business logic functions (like `update_event_rsvp_counts`, `calculate_round_stats`)
are verified separately in `audit-playbooks.md` Section 2.5.

```sql
SELECT proname, prosrc
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND prosecdef = true
  AND proname IN (
    'is_golf_team_player', 'is_golf_team_coach',
    'get_current_golf_player_id', 'user_is_golf_team_member',
    'user_is_coach_of_golf_player', 'user_has_pending_join_request_to_coach_team'
  );
```

**What to verify for each function:**
- `is_golf_team_coach(team_uuid)`: Should check `golf_coaches.user_id = auth.uid()` AND
  coach's `organization_id` matches `golf_teams.organization_id` for the given team.
  Bug: If it only checks team_id on golf_coaches (which may be NULL), coaches are locked out.

- `is_golf_team_player(team_uuid)`: Should check `golf_team_members.player_id` where
  player's `user_id = auth.uid()` AND `team_id = argument` AND `status = 'active'`.
  Bug: If it doesn't check status='active', inactive/alumni players see team data.

- `get_current_golf_player_id()`: Should return `golf_players.id` where `user_id = auth.uid()`.
  Bug: If user has no golf_players row, returns NULL and DELETE policies silently fail.

- `user_is_coach_of_golf_player(player_uuid)`: Should check if the current user is a coach
  whose team includes this player (via team_members). Must use organization path, not team_id.
  Bug: If it uses coach.team_id instead of org→team path, coaches with NULL team_id can't see players.

---

## User Simulation Engine

Test what a specific user would actually see by tracing through the RLS chain manually.
This doesn't execute AS the user (execute_sql is service role), but it simulates the
policy logic by running the same checks the policies would.

**With Findings Brief**: If BROKEN_USERS contains specific emails/user_ids,
replace the placeholder emails in the queries below with those exact users.
This gives you direct evidence of what those broken users can and cannot see,
rather than testing a random user who might be fine.

### Simulate Coach View

```sql
-- Replace 'coach@email.com' with target email
WITH target AS (
  SELECT u.id AS user_id, gc.id AS coach_id, gc.organization_id, gc.team_id
  FROM users u
  JOIN golf_coaches gc ON gc.user_id = u.id
  WHERE u.email = 'coach@email.com'
),
coach_team AS (
  SELECT gt.id AS team_id
  FROM golf_teams gt
  WHERE gt.organization_id = (SELECT organization_id FROM target)
),
team_players AS (
  SELECT gp.id AS player_id
  FROM golf_players gp
  JOIN golf_team_members gtm ON gtm.player_id = gp.id
  WHERE gtm.team_id = (SELECT team_id FROM coach_team) AND gtm.status = 'active'
)
SELECT
  'Team' AS check_item,
  (SELECT count(*) FROM coach_team) AS visible_count,
  CASE WHEN (SELECT count(*) FROM coach_team) > 0 THEN 'OK' ELSE 'BLOCKED' END AS status
UNION ALL
SELECT 'Players',
  (SELECT count(*) FROM team_players),
  CASE WHEN (SELECT count(*) FROM team_players) > 0 THEN 'OK' ELSE 'EMPTY' END
UNION ALL
SELECT 'Completed Rounds',
  (SELECT count(*) FROM golf_rounds WHERE player_id IN (SELECT player_id FROM team_players) AND status = 'completed'),
  CASE WHEN (SELECT count(*) FROM golf_rounds WHERE player_id IN (SELECT player_id FROM team_players) AND status = 'completed') > 0 THEN 'OK' ELSE 'NO DATA' END
UNION ALL
SELECT 'Events',
  (SELECT count(*) FROM golf_events WHERE team_id = (SELECT team_id FROM coach_team)),
  CASE WHEN (SELECT count(*) FROM golf_events WHERE team_id = (SELECT team_id FROM coach_team)) > 0 THEN 'OK' ELSE 'NO DATA' END
UNION ALL
SELECT 'Qualifiers',
  (SELECT count(*) FROM golf_qualifiers WHERE team_id = (SELECT team_id FROM coach_team)),
  'INFO'
UNION ALL
SELECT 'Conversations',
  (SELECT count(*) FROM golf_conversations WHERE team_id = (SELECT team_id FROM coach_team)),
  'INFO';
```

### Simulate Player View

```sql
-- Replace 'player@email.com' with target email
WITH target AS (
  SELECT u.id AS user_id, gp.id AS player_id
  FROM users u
  JOIN golf_players gp ON gp.user_id = u.id
  WHERE u.email = 'player@email.com'
),
membership AS (
  SELECT gtm.team_id
  FROM golf_team_members gtm
  WHERE gtm.player_id = (SELECT player_id FROM target) AND gtm.status = 'active'
)
SELECT
  'Player Profile' AS check_item,
  (SELECT count(*) FROM target) AS visible_count,
  CASE WHEN (SELECT count(*) FROM target) > 0 THEN 'OK' ELSE 'NO PROFILE' END AS status
UNION ALL
SELECT 'Active Team Membership',
  (SELECT count(*) FROM membership),
  CASE WHEN (SELECT count(*) FROM membership) > 0 THEN 'OK' ELSE 'BLOCKED: no active membership' END
UNION ALL
SELECT 'Own Rounds',
  (SELECT count(*) FROM golf_rounds WHERE player_id = (SELECT player_id FROM target) AND status = 'completed'),
  CASE WHEN (SELECT count(*) FROM golf_rounds WHERE player_id = (SELECT player_id FROM target)) > 0 THEN 'OK' ELSE 'NO DATA' END
UNION ALL
SELECT 'Team Events',
  (SELECT count(*) FROM golf_events WHERE team_id IN (SELECT team_id FROM membership)),
  CASE WHEN (SELECT count(*) FROM golf_events WHERE team_id IN (SELECT team_id FROM membership)) > 0 THEN 'OK' ELSE 'NO DATA' END
UNION ALL
SELECT 'Task Completions',
  (SELECT count(*) FROM golf_task_completions WHERE player_id = (SELECT player_id FROM target)),
  'INFO'
UNION ALL
SELECT 'Conversation Participation',
  (SELECT count(*) FROM golf_conversation_participants WHERE user_id = (SELECT user_id FROM target)),
  'INFO';
```

### Coach-to-Player Visibility Cross-Check

Verifies that for EVERY player on a coach's team, the RLS chain would work at each level:

```sql
WITH coach AS (
  SELECT gc.id AS coach_id, gc.user_id, gc.organization_id
  FROM golf_coaches gc LIMIT 1
),
team AS (
  SELECT gt.id AS team_id FROM golf_teams gt WHERE gt.organization_id = (SELECT organization_id FROM coach)
),
players AS (
  SELECT gp.id, gp.first_name, gp.last_name, gp.user_id
  FROM golf_players gp
  JOIN golf_team_members gtm ON gtm.player_id = gp.id
  WHERE gtm.team_id = (SELECT team_id FROM team) AND gtm.status = 'active'
)
SELECT p.id AS player_id, p.first_name || ' ' || p.last_name AS name,
  -- Would is_golf_team_coach see this player's data?
  (SELECT is_golf_team_coach((SELECT team_id FROM team))) AS coach_can_see_team,
  -- Does player have rounds?
  (SELECT count(*) FROM golf_rounds WHERE player_id = p.id AND status = 'completed') AS rounds,
  -- Does player have holes for those rounds?
  (SELECT count(*) FROM golf_holes gh
   JOIN golf_rounds gr ON gr.id = gh.round_id
   WHERE gr.player_id = p.id AND gr.status = 'completed') AS holes,
  -- Does the user_is_coach_of_golf_player function return true?
  (SELECT user_is_coach_of_golf_player(p.id)) AS coach_func_returns_true
FROM players p
LIMIT 50;
```
If `coach_func_returns_true` is false for any player, that player is invisible to the coach.

---

## State Machine Violation Detector

Finds records in impossible states — either values outside valid enums or states
that should never exist given the business rules.

**With Findings Brief**: If SCORE_MISMATCHES contains round_ids, query those
specific rounds first — they likely have impossible state violations too (e.g.,
completed with wrong hole count). If ORPHANED_PLAYERS is non-empty, check their
join requests for stuck states. If STALE_STATS lists player_ids, check if those
players have rounds in impossible states that broke the stats pipeline.

### Round Status Violations

```sql
-- Completed rounds that should NOT be completeable (missing data)
SELECT id, player_id, round_date, status, total_score,
  (SELECT count(*) FROM golf_holes WHERE round_id = gr.id) AS hole_count,
  CASE
    WHEN status = 'completed' AND total_score IS NULL THEN 'BUG: completed with NULL score'
    WHEN status = 'completed' AND (SELECT count(*) FROM golf_holes WHERE round_id = gr.id) = 0 THEN 'BUG: completed with 0 holes'
    WHEN status = 'in_progress' AND total_score IS NOT NULL AND (SELECT count(*) FROM golf_holes WHERE round_id = gr.id) >= 9 THEN 'SUSPICIOUS: has score but not completed'
    WHEN status = 'abandoned' AND (SELECT count(*) FROM golf_holes WHERE round_id = gr.id) >= 18 THEN 'SUSPICIOUS: abandoned with 18 holes'
    ELSE 'OK'
  END AS diagnosis
FROM golf_rounds gr
WHERE status IN ('completed', 'in_progress', 'abandoned')
  AND (
    (status = 'completed' AND (total_score IS NULL OR (SELECT count(*) FROM golf_holes WHERE round_id = gr.id) = 0))
    OR (status = 'in_progress' AND total_score IS NOT NULL AND (SELECT count(*) FROM golf_holes WHERE round_id = gr.id) >= 9)
    OR (status = 'abandoned' AND (SELECT count(*) FROM golf_holes WHERE round_id = gr.id) >= 18)
  )
LIMIT 50;
```

### Event Status Violations

```sql
-- Events in impossible states
SELECT id, title, status, start_date, end_date, is_cancelled,
  CASE
    WHEN status = 'cancelled' AND (is_cancelled IS NULL OR is_cancelled = false) THEN 'BUG: cancelled but is_cancelled not set'
    WHEN status != 'cancelled' AND is_cancelled = true THEN 'BUG: is_cancelled=true but status not cancelled'
    WHEN status = 'confirmed' AND start_date IS NULL THEN 'BUG: confirmed event with no date'
    WHEN status = 'completed' AND end_date > NOW() THEN 'SUSPICIOUS: completed but end_date in future'
    WHEN status = 'draft' AND start_date < NOW() - INTERVAL '7 days' THEN 'WARNING: stale draft (>7 days past)'
    ELSE 'OK'
  END AS diagnosis
FROM golf_events
WHERE status IN ('draft', 'confirmed', 'cancelled', 'completed', 'pending')
  AND (
    (status = 'cancelled' AND (is_cancelled IS NULL OR is_cancelled = false))
    OR (status != 'cancelled' AND is_cancelled = true)
    OR (status = 'confirmed' AND start_date IS NULL)
    OR (status = 'completed' AND end_date > NOW())
    OR (status = 'draft' AND start_date < NOW() - INTERVAL '7 days')
  )
LIMIT 50;
```

### Qualifier Status vs Entry Consistency

```sql
-- Qualifiers where status doesn't match entries
SELECT q.id, q.name, q.status,
  (SELECT count(*) FROM golf_qualifier_entries WHERE qualifier_id = q.id) AS entries,
  (SELECT count(*) FROM golf_qualifier_entries WHERE qualifier_id = q.id AND rounds_completed > 0) AS with_rounds,
  CASE
    WHEN q.status = 'completed' AND (SELECT count(*) FROM golf_qualifier_entries WHERE qualifier_id = q.id AND rounds_completed > 0) = 0 THEN 'BUG: completed with 0 rounds played'
    WHEN q.status = 'upcoming' AND (SELECT count(*) FROM golf_qualifier_entries WHERE qualifier_id = q.id AND rounds_completed > 0) > 0 THEN 'BUG: upcoming but rounds already played'
    WHEN q.status = 'in_progress' AND q.start_date > NOW() + INTERVAL '1 day' THEN 'SUSPICIOUS: in_progress but start_date is future'
    ELSE 'OK'
  END AS diagnosis
FROM golf_qualifiers q
WHERE (
  (q.status = 'completed' AND (SELECT count(*) FROM golf_qualifier_entries WHERE qualifier_id = q.id AND rounds_completed > 0) = 0)
  OR (q.status = 'upcoming' AND (SELECT count(*) FROM golf_qualifier_entries WHERE qualifier_id = q.id AND rounds_completed > 0) > 0)
  OR (q.status = 'in_progress' AND q.start_date > NOW() + INTERVAL '1 day')
)
LIMIT 50;
```

### Join Request Consistency

```sql
-- Join requests in conflicting states
SELECT tjr.id, tjr.request_status, tjr.requested_at,
  gp.first_name || ' ' || gp.last_name AS player,
  gt.name AS team,
  (SELECT count(*) FROM golf_team_members WHERE player_id = tjr.player_id AND team_id = tjr.team_id AND status = 'active') AS has_membership,
  CASE
    WHEN tjr.request_status = 'approved' AND (SELECT count(*) FROM golf_team_members WHERE player_id = tjr.player_id AND team_id = tjr.team_id AND status = 'active') = 0
      THEN 'BUG: approved but no membership created'
    WHEN tjr.request_status = 'pending' AND (SELECT count(*) FROM golf_team_members WHERE player_id = tjr.player_id AND team_id = tjr.team_id AND status = 'active') > 0
      THEN 'BUG: pending but already a member'
    ELSE 'OK'
  END AS diagnosis
FROM golf_team_join_requests tjr
JOIN golf_players gp ON gp.id = tjr.player_id
JOIN golf_teams gt ON gt.id = tjr.team_id
WHERE (
  (tjr.request_status = 'approved' AND (SELECT count(*) FROM golf_team_members WHERE player_id = tjr.player_id AND team_id = tjr.team_id AND status = 'active') = 0)
  OR (tjr.request_status = 'pending' AND (SELECT count(*) FROM golf_team_members WHERE player_id = tjr.player_id AND team_id = tjr.team_id AND status = 'active') > 0)
)
LIMIT 50;
```

### Attendance vs RSVP Dual-System Consistency

GolfHelm has TWO attendance systems (golf_event_attendance AND golf_event_rsvps).
If they disagree, the UI shows conflicting information.

```sql
-- Events where both systems have data but disagree
SELECT ge.id, ge.title,
  a.status AS attendance_status,
  r.response AS rsvp_status,
  CASE
    WHEN a.status = 'attending' AND r.response = 'declined' THEN 'CONFLICT: attending but RSVP declined'
    WHEN a.status = 'not_attending' AND r.response = 'confirmed' THEN 'CONFLICT: not_attending but RSVP confirmed'
    ELSE 'OK'
  END AS diagnosis
FROM golf_events ge
JOIN golf_event_attendance a ON a.event_id = ge.id
JOIN golf_event_rsvps r ON r.event_id = ge.id AND r.player_id = a.player_id
WHERE (
  (a.status = 'attending' AND r.response = 'declined')
  OR (a.status = 'not_attending' AND r.response = 'confirmed')
)
LIMIT 50;
```

---

## Trigger Chain Verifier

Ensures database triggers exist, are enabled, and produce expected results.

**With Findings Brief**: If STALE_STATS contains player_ids, verify the stats
cache trigger is enabled and working by checking those specific players' most
recent rounds against their cache entries. If SCORE_MISMATCHES has round_ids,
verify whether a trigger should have kept `total_score` in sync with
`SUM(golf_holes.score)`. If BROKEN_USERS is non-empty, use the User Simulation
Engine queries below to trace visibility for those exact users — don't just run
the generic simulation.

### Step 1: List all triggers on golf tables

```sql
SELECT tgname AS trigger_name,
  tgrelid::regclass AS table_name,
  CASE tgenabled
    WHEN 'O' THEN 'ENABLED (origin)'
    WHEN 'D' THEN 'DISABLED'
    WHEN 'R' THEN 'ENABLED (replica)'
    WHEN 'A' THEN 'ENABLED (always)'
    ELSE tgenabled::text
  END AS status,
  pg_get_functiondef(tgfoid) AS function_def
FROM pg_trigger
WHERE tgrelid::regclass::text LIKE 'golf_%'
  AND NOT tgisinternal
ORDER BY tgrelid::regclass, tgname;
```

**Red flag**: Any trigger with status = 'DISABLED' that should be active.

### Step 2: Verify critical triggers exist

```sql
SELECT
  -- updated_at triggers (should exist on every mutable table)
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'golf_rounds'::regclass AND tgname LIKE '%updated_at%') AS rounds_updated_at,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'golf_events'::regclass AND tgname LIKE '%updated_at%') AS events_updated_at,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'golf_qualifiers'::regclass AND tgname LIKE '%updated_at%') AS qualifiers_updated_at,
  -- RSVP count trigger
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'golf_event_rsvps'::regclass AND tgname LIKE '%rsvp_count%') AS rsvp_count_trigger,
  -- Stats calculation trigger
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'golf_rounds'::regclass AND tgname LIKE '%stats%') AS stats_trigger;
```

### Step 3: Verify trigger functions work (RSVP counts)

```sql
-- Pick an event with RSVPs and check if counts match
SELECT ge.id, ge.title,
  ge.rsvp_confirmed_count,
  ge.rsvp_maybe_count,
  ge.rsvp_declined_count,
  ge.rsvp_pending_count,
  ge.rsvp_total_count,
  (SELECT count(*) FROM golf_event_rsvps WHERE event_id = ge.id AND response = 'confirmed') AS real_confirmed,
  (SELECT count(*) FROM golf_event_rsvps WHERE event_id = ge.id AND response = 'maybe') AS real_maybe,
  (SELECT count(*) FROM golf_event_rsvps WHERE event_id = ge.id AND response = 'declined') AS real_declined,
  (SELECT count(*) FROM golf_event_rsvps WHERE event_id = ge.id AND response = 'pending') AS real_pending,
  (SELECT count(*) FROM golf_event_rsvps WHERE event_id = ge.id) AS real_total
FROM golf_events ge
WHERE ge.requires_rsvp = true
ORDER BY ge.start_date DESC
LIMIT 10;
```
If cached counts != real counts, the `update_event_rsvp_counts()` trigger is broken.

### Step 4: Verify stats cache trigger

```sql
-- Check if recently completed rounds have matching stats cache entries
SELECT gr.id, gr.round_date, gr.total_score, gr.status,
  rc.id IS NOT NULL AS has_round_cache,
  pc.id IS NOT NULL AS has_player_cache,
  CASE WHEN rc.id IS NULL AND gr.status = 'completed' THEN 'MISSING round cache'
       WHEN pc.id IS NULL AND gr.status = 'completed' THEN 'MISSING player cache'
       ELSE 'OK'
  END AS cache_status
FROM golf_rounds gr
LEFT JOIN golf_round_stats_cache rc ON rc.round_id = gr.id
LEFT JOIN golf_player_stats_cache pc ON pc.player_id = gr.player_id
WHERE gr.status = 'completed'
ORDER BY gr.round_date DESC
LIMIT 20;
```

---

## Cross-Reference Checker

Compares what the UI code queries vs what RLS would allow for a given user role.

**With Findings Brief**: If BROKEN_TEAMS has specific team_ids, use those in the
coach→team mismatch query instead of scanning all coaches. If UI_BLOCKERS flags
a specific page (e.g., "messages page empty"), jump directly to that page's
cross-reference check (query 4 for messages).

### Critical Cross-References

**1. Coach Dashboard queries player rounds via `player_id IN (team players)` but RLS
checks `player_id` against coach's team via organization path.**

Mismatch risk: If the UI uses `golf_coaches.team_id` to find team players, but the
RLS policy uses `golf_coaches.organization_id → golf_teams.organization_id`, they
might resolve to different teams.

```sql
-- Check if any coach's team_id and org-resolved team_id disagree
SELECT gc.id, gc.full_name, gc.team_id AS direct_team,
  gt.id AS org_resolved_team,
  CASE WHEN gc.team_id != gt.id THEN 'MISMATCH: team_id vs org path'
       WHEN gc.team_id IS NULL THEN 'WARNING: no direct team_id'
       ELSE 'OK'
  END AS status
FROM golf_coaches gc
LEFT JOIN golf_teams gt ON gt.organization_id = gc.organization_id
WHERE gc.team_id IS DISTINCT FROM gt.id;
```

**2. Player dashboard queries rounds with `player_id = self`, but the RLS policy
also checks team membership through golf_team_members.**

Risk: Player with team_id set but no active golf_team_members row might see their
own rounds through the `player_id = auth.uid()` direct policy, but not team features.

```sql
-- Players who can see own data but NOT team data
SELECT gp.id, gp.first_name, gp.last_name,
  gtm_any.team_id AS inactive_team_id, gtm_any.status AS membership_status,
  (SELECT count(*) FROM golf_rounds WHERE player_id = gp.id) AS total_rounds,
  'PARTIAL: has inactive membership — sees own data but NOT team features (calendar, qualifiers, tasks)' AS access_level
FROM golf_players gp
JOIN golf_team_members gtm_any ON gtm_any.player_id = gp.id
LEFT JOIN golf_team_members gtm_active ON gtm_active.player_id = gp.id AND gtm_active.status = 'active'
WHERE gtm_active.id IS NULL
LIMIT 50;
```

**3. Roster page queries `golf_team_members` joined to `golf_players` joined to `users`.**

Risk: If the RLS on golf_team_members blocks the coach's SELECT but the code expects
to see all team members, the roster appears empty.

```sql
-- Verify roster query would work for each coach
SELECT gc.id AS coach_id, gc.full_name,
  gt.id AS team_id,
  (SELECT count(*) FROM golf_team_members WHERE team_id = gt.id AND status = 'active') AS total_members,
  -- Simulate what is_golf_team_coach would return
  (SELECT EXISTS(
    SELECT 1 FROM golf_coaches gc2
    JOIN golf_teams gt2 ON gt2.organization_id = gc2.organization_id
    WHERE gc2.user_id = gc.user_id AND gt2.id = gt.id
  )) AS rls_would_pass
FROM golf_coaches gc
JOIN golf_teams gt ON gt.organization_id = gc.organization_id
WHERE NOT (SELECT EXISTS(
  SELECT 1 FROM golf_coaches gc2
  JOIN golf_teams gt2 ON gt2.organization_id = gc2.organization_id
  WHERE gc2.user_id = gc.user_id AND gt2.id = gt.id
));
```
Any rows returned = coaches whose roster page would be empty due to RLS.

**4. Messages: conversation_participants must include the user for message visibility.**

```sql
-- Users who are on a team but have 0 conversation participation
SELECT u.id AS user_id, u.email, u.role,
  CASE WHEN u.role = 'coach' THEN (SELECT full_name FROM golf_coaches WHERE user_id = u.id)
       ELSE (SELECT first_name || ' ' || last_name FROM golf_players WHERE user_id = u.id)
  END AS name,
  (SELECT count(*) FROM golf_conversation_participants WHERE user_id = u.id) AS conversations
FROM users u
WHERE (EXISTS (SELECT 1 FROM golf_coaches gc WHERE gc.user_id = u.id)
   OR EXISTS (SELECT 1 FROM golf_players gp WHERE gp.user_id = u.id))
  AND (SELECT count(*) FROM golf_conversation_participants WHERE user_id = u.id) = 0
LIMIT 50;
```
These users see an empty messages page even though they're on a team.
