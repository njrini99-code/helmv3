# Audit Playbooks — GolfHelm Database Engineer

Step-by-step audit procedures with exact SQL queries. This is the main entry point
for a full database audit. Each section is self-contained and can be run independently.

**Tool Rule**: Use ONLY the `execute_sql` MCP tool for all queries. No other
tools, APIs, or HTTP requests. Only SELECT queries — never modify data.

## How to Use This File

For a **full audit**: Run sections 1-6 in order. Dispatch agents for sections 2-5
in parallel, then run section 6 (summary) after all complete.

For a **targeted audit**: Jump to the relevant section based on user's complaint.

## Timeout Rules
- Always use `LIMIT 50` on SELECT queries
- Skip sections that return 0 issues (just note "PASS")
- Don't re-read reference files if you already have the query
- Report findings as you go, don't batch

---

## Section 1: Quick Health Check (Run First, ~2 minutes)

Run these 5 queries to get a quick picture before deep-diving.

### 1.1 User & Profile Counts
```sql
SELECT
  (SELECT count(*) FROM users u WHERE EXISTS (SELECT 1 FROM golf_coaches gc WHERE gc.user_id = u.id) OR EXISTS (SELECT 1 FROM golf_players gp WHERE gp.user_id = u.id)) AS golf_users,
  (SELECT count(*) FROM golf_coaches) AS coaches,
  (SELECT count(*) FROM golf_players) AS players,
  (SELECT count(*) FROM golf_teams) AS teams,
  (SELECT count(*) FROM golf_organizations) AS organizations,
  (SELECT count(*) FROM golf_team_members WHERE status = 'active') AS active_memberships;
```

### 1.2 Data Volume
```sql
SELECT
  (SELECT count(*) FROM golf_rounds) AS total_rounds,
  (SELECT count(*) FROM golf_rounds WHERE status = 'completed') AS completed_rounds,
  (SELECT count(*) FROM golf_holes) AS total_holes,
  (SELECT count(*) FROM golf_shots) AS total_shots,
  (SELECT count(*) FROM golf_events) AS events,
  (SELECT count(*) FROM golf_qualifiers) AS qualifiers,
  (SELECT count(*) FROM golf_conversations) AS conversations,
  (SELECT count(*) FROM golf_messages) AS messages;
```

### 1.3 RLS Status Check
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'golf_%'
  AND rowsecurity = false
ORDER BY tablename;
```
**Expected**: 0 rows (all golf tables should have RLS enabled).

### 1.4 Broken Auth Chain Count
```sql
SELECT
  (SELECT count(*) FROM users u WHERE u.role IN ('coach', 'player') AND NOT EXISTS (SELECT 1 FROM golf_coaches gc WHERE gc.user_id = u.id) AND NOT EXISTS (SELECT 1 FROM golf_players gp WHERE gp.user_id = u.id)) AS users_without_profiles,
  (SELECT count(*) FROM golf_coaches gc LEFT JOIN golf_teams gt ON gt.organization_id = gc.organization_id WHERE gc.organization_id IS NOT NULL AND gt.id IS NULL) AS coaches_without_teams,
  (SELECT count(*) FROM golf_players gp JOIN golf_team_members gtm_any ON gtm_any.player_id = gp.id LEFT JOIN golf_team_members gtm_active ON gtm_active.player_id = gp.id AND gtm_active.status = 'active' WHERE gtm_active.id IS NULL) AS players_without_active_memberships;
```
**Any non-zero** = blocking issue. Deep-dive with Section 2 or 3.

### 1.5 Stats Freshness
```sql
SELECT
  (SELECT count(*) FROM golf_player_stats_cache) AS cached_players,
  (SELECT count(*) FROM golf_players gp WHERE EXISTS (SELECT 1 FROM golf_rounds WHERE player_id = gp.id AND status = 'completed')) AS players_with_rounds,
  (SELECT count(*) FROM golf_round_stats_cache) AS cached_rounds,
  (SELECT count(*) FROM golf_rounds WHERE status = 'completed') AS completed_rounds;
```
**Compare**: cached_players should ≈ players_with_rounds. Big gap = stale caches.

---

## Section 2: Auth & RLS Deep Dive

**Read**: `references/rls-policies.md` for full context.

### 2.1 Tables without RLS policies
```sql
SELECT t.tablename
FROM pg_tables t
LEFT JOIN pg_policies p ON p.tablename = t.tablename AND p.schemaname = t.schemaname
WHERE t.schemaname = 'public' AND t.tablename LIKE 'golf_%'
  AND p.policyname IS NULL
ORDER BY t.tablename;
```

### 2.2 Auth users without public users
```sql
SELECT au.id, au.email, au.created_at
FROM auth.users au
LEFT JOIN public.users u ON u.id = au.id
WHERE u.id IS NULL
LIMIT 50;
```

### 2.3 Coach auth chain verification
```sql
SELECT gc.id, gc.full_name, gc.user_id, gc.organization_id, gc.team_id,
  u.email, u.role,
  go.name AS org_name,
  gt.id AS resolved_team_id, gt.name AS team_name,
  CASE
    WHEN gc.organization_id IS NULL THEN 'CRITICAL: no org_id'
    WHEN gt.id IS NULL THEN 'CRITICAL: org has no team'
    WHEN u.role != 'coach' THEN 'WARNING: role mismatch'
    ELSE 'OK'
  END AS auth_status
FROM golf_coaches gc
JOIN users u ON u.id = gc.user_id
LEFT JOIN golf_organizations go ON go.id = gc.organization_id
LEFT JOIN golf_teams gt ON gt.organization_id = gc.organization_id
ORDER BY auth_status
LIMIT 50;
```

### 2.4 Player auth chain verification
```sql
SELECT gp.id, gp.first_name || ' ' || gp.last_name AS name,
  gp.user_id,
  u.email, u.role,
  gtm.status AS membership_status, gtm.team_id AS member_team_id,
  CASE
    WHEN u.role != 'player' THEN 'WARNING: role mismatch'
    WHEN gtm.id IS NULL THEN 'INFO: no team membership yet'
    WHEN gtm.status != 'active' THEN 'WARNING: inactive membership'
    ELSE 'OK'
  END AS auth_status
FROM golf_players gp
JOIN users u ON u.id = gp.user_id
LEFT JOIN golf_team_members gtm ON gtm.player_id = gp.id
ORDER BY auth_status
LIMIT 50;
```

### 2.5 SECURITY DEFINER functions
```sql
SELECT routine_name, security_type, routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('get_user_golf_team_ids', 'get_user_golf_organization_id',
    'update_event_rsvp_counts', 'handle_new_user', 'calculate_round_stats')
LIMIT 20;
```

---

## Section 3: Team & Membership Audit

**Read**: `references/business-logic.md` for context.

### 3.1 Organizations without teams
```sql
SELECT go.id, go.name
FROM golf_organizations go
LEFT JOIN golf_teams gt ON gt.organization_id = go.id
WHERE gt.id IS NULL;
```

### 3.2 Teams without any members
```sql
SELECT gt.id, gt.name, gt.organization_id,
  (SELECT count(*) FROM golf_team_members WHERE team_id = gt.id AND status = 'active') AS active_members,
  (SELECT count(*) FROM golf_coaches WHERE organization_id = gt.organization_id) AS coaches
FROM golf_teams gt
WHERE (SELECT count(*) FROM golf_team_members WHERE team_id = gt.id AND status = 'active') = 0;
```

### 3.3 Duplicate invite codes
```sql
SELECT invite_code, count(*) AS teams_with_code
FROM golf_teams
WHERE invite_code IS NOT NULL
GROUP BY invite_code
HAVING count(*) > 1;
```

### 3.4 Stuck join requests
```sql
SELECT tjr.id, tjr.request_status, tjr.requested_at,
  gp.first_name || ' ' || gp.last_name AS player_name,
  gt.name AS team_name,
  NOW() - tjr.requested_at AS age
FROM golf_team_join_requests tjr
JOIN golf_players gp ON gp.id = tjr.player_id
JOIN golf_teams gt ON gt.id = tjr.team_id
WHERE tjr.request_status = 'pending'
ORDER BY tjr.requested_at ASC
LIMIT 50;
```

### 3.5 Players on multiple active teams (may be valid but worth flagging)
```sql
SELECT gtm.player_id, gp.first_name || ' ' || gp.last_name AS name,
  count(*) AS active_teams,
  array_agg(gt.name) AS team_names
FROM golf_team_members gtm
JOIN golf_players gp ON gp.id = gtm.player_id
JOIN golf_teams gt ON gt.id = gtm.team_id
WHERE gtm.status = 'active'
GROUP BY gtm.player_id, gp.first_name, gp.last_name
HAVING count(*) > 1;
```

---

## Section 4: Data Integrity Audit

### 4.1 Rounds with broken score totals
```sql
SELECT gr.id, gr.round_date, gr.total_score,
  (SELECT SUM(score) FROM golf_holes WHERE round_id = gr.id) AS actual_sum,
  gr.total_score - COALESCE((SELECT SUM(score) FROM golf_holes WHERE round_id = gr.id), 0) AS diff
FROM golf_rounds gr
WHERE gr.status = 'completed' AND gr.total_score IS NOT NULL
  AND gr.total_score != COALESCE((SELECT SUM(score) FROM golf_holes WHERE round_id = gr.id), 0)
LIMIT 50;
```

### 4.2 Completed rounds with NULL scores
```sql
SELECT id, player_id, round_date, total_score, total_putts, status
FROM golf_rounds
WHERE status = 'completed'
  AND (total_score IS NULL OR total_putts IS NULL)
LIMIT 50;
```

### 4.3 Rounds with wrong hole count
```sql
SELECT gr.id, gr.round_date,
  (SELECT count(*) FROM golf_holes WHERE round_id = gr.id) AS hole_count
FROM golf_rounds gr
WHERE gr.status = 'completed'
  AND (SELECT count(*) FROM golf_holes WHERE round_id = gr.id) NOT IN (9, 18, 0)
LIMIT 50;
```

### 4.4 Orphaned records
```sql
SELECT 'holes without rounds' AS issue, count(*) AS count
FROM golf_holes gh LEFT JOIN golf_rounds gr ON gr.id = gh.round_id WHERE gr.id IS NULL
UNION ALL
SELECT 'shots without holes', count(*)
FROM golf_shots gs LEFT JOIN golf_holes gh ON gh.id = gs.hole_id WHERE gh.id IS NULL
UNION ALL
SELECT 'rounds without players', count(*)
FROM golf_rounds gr LEFT JOIN golf_players gp ON gp.id = gr.player_id WHERE gp.id IS NULL
UNION ALL
SELECT 'events without teams', count(*)
FROM golf_events ge LEFT JOIN golf_teams gt ON gt.id = ge.team_id WHERE gt.id IS NULL
UNION ALL
SELECT 'qualifier entries without qualifiers', count(*)
FROM golf_qualifier_entries qe LEFT JOIN golf_qualifiers q ON q.id = qe.qualifier_id WHERE q.id IS NULL;
```

### 4.5 RSVP count mismatches
```sql
SELECT ge.id, ge.title,
  ge.rsvp_confirmed_count AS cached,
  (SELECT count(*) FROM golf_event_rsvps WHERE event_id = ge.id AND response = 'confirmed') AS actual,
  ge.rsvp_total_count AS cached_total,
  (SELECT count(*) FROM golf_event_rsvps WHERE event_id = ge.id) AS actual_total
FROM golf_events ge
WHERE ge.requires_rsvp = true
  AND (
    ge.rsvp_confirmed_count != (SELECT count(*) FROM golf_event_rsvps WHERE event_id = ge.id AND response = 'confirmed')
    OR ge.rsvp_total_count != (SELECT count(*) FROM golf_event_rsvps WHERE event_id = ge.id)
  )
LIMIT 50;
```

---

## Section 5: Stats Integrity Audit

**Read**: `references/stats-contracts.md` for calculation rules.

### 5.1 Player stats cache vs actual
```sql
WITH actual AS (
  SELECT player_id,
    COUNT(*) AS rounds,
    ROUND(AVG(total_score)::numeric, 2) AS avg_score,
    MIN(total_score) AS best
  FROM golf_rounds
  WHERE status = 'completed' AND total_score IS NOT NULL
  GROUP BY player_id
)
SELECT a.player_id, gp.first_name || ' ' || gp.last_name AS name,
  a.rounds AS actual_rounds, c.rounds_played AS cached_rounds,
  a.avg_score AS actual_avg, c.scoring_average AS cached_avg,
  ABS(a.avg_score - COALESCE(c.scoring_average, 0)) AS diff
FROM actual a
JOIN golf_players gp ON gp.id = a.player_id
LEFT JOIN golf_player_stats_cache c ON c.player_id = a.player_id
ORDER BY diff DESC NULLS FIRST
LIMIT 50;
```

### 5.2 Missing stats caches
```sql
SELECT gp.id, gp.first_name || ' ' || gp.last_name AS name,
  (SELECT count(*) FROM golf_rounds WHERE player_id = gp.id AND status = 'completed') AS rounds
FROM golf_players gp
LEFT JOIN golf_player_stats_cache c ON c.player_id = gp.id
WHERE c.id IS NULL
  AND EXISTS (SELECT 1 FROM golf_rounds WHERE player_id = gp.id AND status = 'completed')
LIMIT 50;
```

### 5.3 Qualifier leaderboard accuracy
```sql
SELECT qe.qualifier_id, qe.player_id, qe.total_score AS entry_score,
  (SELECT COALESCE(SUM(total_score), 0) FROM golf_rounds
   WHERE qualifier_id = qe.qualifier_id AND player_id = qe.player_id AND status = 'completed') AS actual_score,
  qe.rounds_completed AS entry_rounds,
  (SELECT count(*) FROM golf_rounds
   WHERE qualifier_id = qe.qualifier_id AND player_id = qe.player_id AND status = 'completed') AS actual_rounds
FROM golf_qualifier_entries qe
WHERE qe.total_score IS NOT NULL
  AND qe.total_score != (SELECT COALESCE(SUM(total_score), 0) FROM golf_rounds
   WHERE qualifier_id = qe.qualifier_id AND player_id = qe.player_id AND status = 'completed')
LIMIT 50;
```

---

## Section 6: Generate Report

After running all sections, compile findings into the report format defined in SKILL.md.

**Severity assignment:**
- 🔴 Critical: User is completely blocked from accessing data/features
- 🟠 High: Data shows incorrectly, stats are wrong, cache is stale
- 🟡 Medium: Minor mismatches, optimization opportunities
- 🟢 Low: Cosmetic, nice-to-have improvements

**Count summary**: Total checks run, pass/fail for each section, total issues by severity.

**Prioritized fix list**: Order by severity, then by number of users affected.
