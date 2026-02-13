# Stats Contracts & UI Data Expectations — GolfHelm

This file defines exactly what stats the UI expects to display and how they should
be calculated, plus diagnostic queries to verify the database matches.

**Tool Rule**: Use ONLY the `execute_sql` MCP tool for all queries. No other
tools, APIs, or HTTP requests. Only SELECT queries — never modify data.

## Table of Contents
1. [Stats Calculation Rules](#stats-calculation-rules)
2. [Stats Cache Verification](#stats-cache-verification)
3. [UI Page Data Contracts](#ui-page-data-contracts)
4. [Strokes Gained Reference](#strokes-gained-reference)

---

## Stats Calculation Rules

### Scoring Average
```
scoring_average = SUM(total_score) / COUNT(completed rounds)
```
Only includes rounds where `status = 'completed'` and `total_score IS NOT NULL`.

### Trend Calculation
```
recent_5_avg = AVG(last 5 rounds by round_date DESC)
previous_5_avg = AVG(rounds 6-10 by round_date DESC)
if recent < previous - 0.5 → 'improving'  (lower is better in golf)
if recent > previous + 0.5 → 'declining'
else → 'stable'
```
Needs at least 6 rounds to calculate. Otherwise returns 'stable'.

### Fairway Percentage
```
fir% = SUM(total_fairways_hit across all rounds) / SUM(fairways_total across all rounds) * 100
```
Only counts holes where fairway_hit is relevant (par 4s and 5s).

### GIR Percentage
```
gir% = SUM(total_gir) / SUM(total_gir_possible) * 100
```
GIR = reaching the green in (par - 2) strokes or fewer.

### Putts Per Round
```
putts_per_round = SUM(all hole putts) / COUNT(rounds)
```

### Scrambling
```
scrambling% = scrambles_converted / scramble_attempts * 100
```
Scramble = missed GIR but still made par or better.

---

## Stats Cache Verification

### Verify golf_player_stats_cache accuracy

```sql
-- Compare cached stats to actual computed stats
WITH actual_stats AS (
  SELECT
    gr.player_id,
    COUNT(*) AS rounds_played,
    ROUND(AVG(gr.total_score)::numeric, 2) AS actual_scoring_avg,
    MIN(gr.total_score) AS actual_best_round,
    MAX(gr.total_score) AS actual_worst_round,
    ROUND(AVG(gr.total_putts)::numeric, 2) AS actual_putts_per_round,
    SUM(COALESCE(gr.total_fairways_hit, 0)) AS actual_fairways_hit,
    SUM(COALESCE(gr.fairways_total, 0)) AS actual_fairways_total,
    SUM(COALESCE(gr.total_gir, 0)) AS actual_gir_hit,
    SUM(COALESCE(gr.total_gir_possible, 0)) AS actual_gir_total
  FROM golf_rounds gr
  WHERE gr.status = 'completed' AND gr.total_score IS NOT NULL
  GROUP BY gr.player_id
)
SELECT
  a.player_id,
  gp.first_name || ' ' || gp.last_name AS name,
  a.rounds_played AS actual_rounds,
  c.rounds_played AS cached_rounds,
  a.actual_scoring_avg,
  c.scoring_average AS cached_scoring_avg,
  ABS(a.actual_scoring_avg - COALESCE(c.scoring_average, 0)) AS scoring_diff,
  a.actual_best_round,
  c.best_round AS cached_best,
  a.actual_putts_per_round,
  c.putts_per_round AS cached_putts,
  c.updated_at AS cache_updated
FROM actual_stats a
JOIN golf_players gp ON gp.id = a.player_id
LEFT JOIN golf_player_stats_cache c ON c.player_id = a.player_id
WHERE a.rounds_played > 0
ORDER BY ABS(a.actual_scoring_avg - COALESCE(c.scoring_average, 0)) DESC NULLS FIRST
LIMIT 50;
```
**Issues to look for:**
- `cached_rounds` = NULL → cache never populated
- `scoring_diff` > 0.5 → cache is significantly stale
- `cache_updated` older than latest round → cache needs refresh

### Verify golf_round_stats_cache accuracy

```sql
-- Compare round cache to actual hole-level aggregation
WITH actual_round_stats AS (
  SELECT
    gh.round_id,
    SUM(gh.score) AS actual_total,
    SUM(gh.score) - SUM(gh.par) AS actual_to_par,
    SUM(COALESCE(gh.putts, 0)) AS actual_putts,
    COUNT(CASE WHEN gh.fairway_hit = true THEN 1 END) AS actual_fairways,
    COUNT(CASE WHEN gh.gir = true THEN 1 END) AS actual_gir,
    COUNT(CASE WHEN gh.score - gh.par <= -2 THEN 1 END) AS actual_eagles,
    COUNT(CASE WHEN gh.score - gh.par = -1 THEN 1 END) AS actual_birdies,
    COUNT(CASE WHEN gh.score - gh.par = 0 THEN 1 END) AS actual_pars,
    COUNT(CASE WHEN gh.score - gh.par = 1 THEN 1 END) AS actual_bogeys,
    COUNT(CASE WHEN gh.score - gh.par = 2 THEN 1 END) AS actual_doubles,
    COUNT(CASE WHEN gh.score - gh.par >= 3 THEN 1 END) AS actual_triple_plus
  FROM golf_holes gh
  GROUP BY gh.round_id
)
SELECT
  a.round_id,
  gr.round_date,
  gr.total_score AS round_total,
  a.actual_total AS holes_total,
  gr.total_score - a.actual_total AS score_diff,
  gr.total_putts AS round_putts,
  a.actual_putts AS holes_putts,
  c.total_score AS cache_total,
  c.birdies AS cache_birdies,
  a.actual_birdies AS actual_birdies
FROM actual_round_stats a
JOIN golf_rounds gr ON gr.id = a.round_id
LEFT JOIN golf_round_stats_cache c ON c.round_id = a.round_id
WHERE gr.status = 'completed'
  AND (gr.total_score != a.actual_total
    OR COALESCE(c.total_score, -1) != a.actual_total
    OR COALESCE(c.birdies, -1) != a.actual_birdies)
ORDER BY gr.round_date DESC
LIMIT 50;
```

### Check for stale caches

```sql
-- Players whose most recent round is newer than their cache
SELECT gp.id, gp.first_name, gp.last_name,
  (SELECT MAX(round_date) FROM golf_rounds WHERE player_id = gp.id AND status = 'completed') AS last_round,
  c.updated_at AS cache_updated,
  CASE WHEN c.updated_at < (SELECT MAX(round_date) FROM golf_rounds WHERE player_id = gp.id AND status = 'completed')::timestamptz
       THEN 'STALE' ELSE 'OK' END AS cache_status
FROM golf_players gp
LEFT JOIN golf_player_stats_cache c ON c.player_id = gp.id
WHERE EXISTS (SELECT 1 FROM golf_rounds WHERE player_id = gp.id AND status = 'completed')
LIMIT 50;
```

---

## UI Page Data Contracts

These define exactly what each UI page queries and what it expects to receive.

### Coach Dashboard
**Queries:**
1. `golf_teams` WHERE org matches coach → expects 1 team row
2. `golf_team_members` COUNT WHERE team_id AND status='active' → roster size (integer)
3. `golf_events` COUNT WHERE team_id AND start_date >= today → upcoming events (integer)
4. `golf_qualifiers` COUNT WHERE team_id AND status IN ('upcoming','in_progress') → active qualifiers
5. `golf_rounds` with player join WHERE player_id IN team players, status='completed', LIMIT 50 → recent rounds list
6. GROUP rounds by player → compute top 5 by average score

**Verify coach dashboard data availability:**
```sql
WITH coach_data AS (
  SELECT gc.id AS coach_id, gc.organization_id,
         gt.id AS team_id, gt.name AS team_name
  FROM golf_coaches gc
  JOIN golf_teams gt ON gt.organization_id = gc.organization_id
  LIMIT 1
)
SELECT
  cd.team_name,
  (SELECT count(*) FROM golf_team_members WHERE team_id = cd.team_id AND status = 'active') AS roster_size,
  (SELECT count(*) FROM golf_events WHERE team_id = cd.team_id AND start_date >= CURRENT_DATE) AS upcoming_events,
  (SELECT count(*) FROM golf_qualifiers WHERE team_id = cd.team_id AND status IN ('upcoming', 'in_progress')) AS active_qualifiers,
  (SELECT count(*) FROM golf_rounds gr
   JOIN golf_players gp ON gp.id = gr.player_id
   JOIN golf_team_members gtm ON gtm.player_id = gp.id AND gtm.team_id = cd.team_id AND gtm.status = 'active'
   WHERE gr.status = 'completed') AS total_completed_rounds
FROM coach_data cd;
```

### Player Dashboard
**Queries:**
1. `golf_players` WHERE user_id = current → player profile
2. `golf_teams` via team_members → team info (may be null)
3. `golf_rounds` WHERE player_id = self, status='completed', LIMIT 50 → round history
4. Compute: rounds_played, scoring_average, best_round, handicap, trend

**Verify player dashboard data:**
```sql
SELECT gp.id, gp.first_name, gp.last_name, gp.handicap,
  (SELECT count(*) FROM golf_rounds WHERE player_id = gp.id AND status = 'completed') AS rounds_played,
  (SELECT ROUND(AVG(total_score)::numeric, 1) FROM golf_rounds WHERE player_id = gp.id AND status = 'completed' AND total_score IS NOT NULL) AS scoring_avg,
  (SELECT MIN(total_score) FROM golf_rounds WHERE player_id = gp.id AND status = 'completed') AS best_round,
  (SELECT count(*) FROM golf_team_members WHERE player_id = gp.id AND status = 'active') AS team_memberships
FROM golf_players gp
LIMIT 50;
```

### Roster Page
**Expects:** List of team_members with player profile + online status + round stats.
**Joins:** `golf_team_members` → `golf_players` → `users.last_seen`

```sql
-- Verify roster data completeness
SELECT gtm.player_id, gtm.status,
  gp.first_name, gp.last_name, gp.handicap, gp.avatar_url, gp.graduation_year,
  u.email,
  (SELECT count(*) FROM golf_rounds WHERE player_id = gp.id AND status = 'completed') AS rounds,
  (SELECT ROUND(AVG(total_score)::numeric, 1) FROM golf_rounds WHERE player_id = gp.id AND status = 'completed' AND total_score IS NOT NULL) AS avg_score
FROM golf_team_members gtm
JOIN golf_players gp ON gp.id = gtm.player_id
JOIN users u ON u.id = gp.user_id
WHERE gtm.team_id = (SELECT id FROM golf_teams LIMIT 1)
  AND gtm.status = 'active';
```

### Calendar Page
**Expects:** Events for team with RSVP data, color-coded by type.
```sql
-- Verify calendar events have required fields
SELECT ge.id, ge.title, ge.event_type, ge.start_date, ge.status,
  ge.team_id,
  CASE WHEN ge.start_date IS NULL THEN 'MISSING DATE' ELSE 'OK' END AS date_check,
  CASE WHEN ge.event_type IS NULL THEN 'MISSING TYPE' ELSE 'OK' END AS type_check,
  CASE WHEN ge.requires_rsvp AND ge.rsvp_total_count = 0 THEN 'NO RSVPS' ELSE 'OK' END AS rsvp_check
FROM golf_events ge
WHERE ge.status != 'cancelled'
ORDER BY ge.start_date DESC
LIMIT 50;
```

### Messages Page
**Expects:** Conversations with participants, last message, unread count.
```sql
-- Verify message system integrity
SELECT
  (SELECT count(*) FROM golf_conversations) AS total_conversations,
  (SELECT count(*) FROM golf_conversations gc
   WHERE NOT EXISTS (SELECT 1 FROM golf_conversation_participants WHERE conversation_id = gc.id)
  ) AS orphan_conversations,
  (SELECT count(*) FROM golf_messages) AS total_messages,
  (SELECT count(*) FROM golf_messages gm
   WHERE NOT EXISTS (SELECT 1 FROM golf_conversations WHERE id = gm.conversation_id)
  ) AS orphan_messages;
```

---

## Strokes Gained Reference

Strokes gained calculations compare a player's performance to PGA Tour benchmarks.
The system breaks it down into 4 categories:

1. **SG: Off the Tee** — Tee shots on par 4s and 5s
2. **SG: Approach** — Approach shots (not from tee on par 3s, second shots on 4s/5s)
3. **SG: Around the Green** — Chips, pitches, sand shots within ~30 yards
4. **SG: Putting** — All putts on the green

### Verify strokes gained data exists:

```sql
SELECT
  (SELECT count(*) FROM golf_player_stats_cache WHERE strokes_gained_total IS NOT NULL) AS players_with_sg,
  (SELECT count(*) FROM golf_round_stats_cache WHERE strokes_gained_total IS NOT NULL) AS rounds_with_sg,
  (SELECT count(*) FROM golf_shots) AS total_shots_recorded;
```

Strokes gained requires shot-by-shot data in `golf_shots`. If `total_shots_recorded = 0`,
strokes gained won't work — that's expected for teams not using shot tracking.
