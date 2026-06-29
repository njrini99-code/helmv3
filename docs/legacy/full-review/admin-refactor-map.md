# `admin-data.ts::getAdminDashboardData` — Refactor Map

**Target:** `/Users/ricknini/Downloads/helmv3/src/app/golf/actions/admin-data.ts` (4882 lines)
**Entry:** `getAdminDashboardData()` @ L1460 → returns `AdminDashboardData` (interface L152-L686)
**Public contract:** DO NOT CHANGE `AdminDashboardData`. Consumers rely on every field.

**Total DB calls inside `getAdminDashboardData` body: ~93** (5 `Promise.all` batches + a few inline). Table counts:
`golf_rounds`: 23 • `users`: 15 (2 inline + 13 in batches) • `admin_events`: 7 (3 inline resolver + 4 in batches) • other golf_*: ~35 • baseball_*: 14 • error_logs/audit_log/login_attempts: 8.

There is already one good RPC (`get_admin_dashboard_rollup` @ L68) returning `AdminDashboardRollup` — that function is NOT called by `getAdminDashboardData`. It only covers the lightweight rollup view. The refactor should extend the RPC pattern.

---

## 1. Query Inventory

### Outside `getAdminDashboardData` (leave alone)

| Line | Client | Table / RPC | Purpose |
|------|--------|-------------|---------|
| 92   | supabase | `users` (role check) | Auth gate for `getAdminDashboardRollup` |
| 1118 | supabase | `users` (role check) | Auth gate for `resolveDashboardIncident` |
| 1134, 1153, 1174 | supabase | `admin_events` (select + update + insert) | `resolveDashboardIncident` mutation — request-state dependent; KEEP as `.from()` |
| 1469 | supabase | `users` (role check) | Auth gate for `getAdminDashboardData` itself — MUST stay request-scoped |

### Batch 1 — Core counts & health (L1489-L1717 destructure, L1572-L1662 queries)

| Line | Table | Filter / Limit | Feeds |
|------|-------|----------------|-------|
| 1574 | golf_rounds | `select('player_id') gte created_at ago24h` | `health.activeUsers24h` |
| 1575 | golf_rounds | `select('player_id') gte ago7d` | `health.activeUsers7d` |
| 1576 | golf_rounds | `select('player_id') gte ago30d` | `health.activeUsers30d` |
| 1577 | golf_rounds | `count head gte ago7d` | `health.roundsThisWeek` |
| 1578 | golf_round_reviews | `count head gte ago7d` | `health.roundReviewsThisWeek` |
| 1579 | golf_insight_generation_log | `count head gte ago7d` | `health.insightsThisWeek` |
| 1580 | golf_rounds | `count head gte today` | `health.roundsToday` |
| 1581 | golf_rounds | `created_at order desc limit 1` | `health.lastRoundSubmitted`, `dataFreshness` |
| 1582 | golf_insight_generation_log | `created_at order desc limit 1` | `health.lastInsightGenerated` |
| 1585 | golf_coaches | `count head` | `users.totalCoaches` |
| 1586 | golf_players | `count head` | `users.totalPlayers` |
| 1587 | users | `count head filter role eq admin` | `users.totalAdmins` |
| 1588 | golf_coaches | `count head eq onboarding_completed true` | `users.coachOnboardingRate` num |
| 1589 | golf_players | `count head eq onboarding_completed true` | `users.playerOnboardingRate` num |
| 1590 | golf_team_members | `select team_id eq status active` | `users.activeTeams` |
| 1591 | users | `select created_at gte ago12w order asc` | `users.signupsByWeek` |
| 1592 | users | `count head gte ago7d` | `users.newUsersThisWeek` |
| 1593 | users | `count head gte ago14d lt ago7d` | `users.newUsersLastWeek`, `growth.userGrowthRate` |
| 1594 | golf_players | `select onboarding_completed` | `users.playersByOnboarding` |
| 1597 | golf_rounds | `select round_type, created_at gte ago12w` | `usage.roundsByType`, `usage.roundsByWeek` |
| 1598 | golf_shots | `count head` | `usage.totalShots`, `dataQuality.totalShots` |
| 1599 | golf_rounds | `count head` | `usage.totalRounds` |
| 1600 | golf_rounds | `count head eq status completed` | `usage.roundsCompletionRate` |
| 1601 | golf_rounds | `count head not total_score is null` | `usage.verifiedRoundsRate` |
| 1602-1608 | golf_qualifiers, golf_events, golf_tasks, golf_announcements, golf_messages, golf_documents, golf_travel_itineraries | `count head` | `usage.featureAdoption` (7 rows) |
| 1610-1616 | same 7 tables | `count head gte ago30d` | `bi.usage.featureAdoption.last30d` |
| 1619 | golf_prediction_model_performance | `order period_end desc limit 10` | `coachhelm.modelPerformance` |
| 1620 | golf_insight_effectiveness | `order period_end desc limit 10` | `coachhelm.insightEffectiveness` |
| 1621 | golf_patterns_v2 | `count head` | `coachhelm.totalPatternsDetected` |
| 1622 | golf_predictions | `count head` | `coachhelm.totalPredictionsMade` |
| 1623 | golf_round_reviews | `count head` | `coachhelm.totalReviewsAllTime` |
| 1624 | golf_insight_generation_log | `select insights_generated, created_at gte ago12w` | `coachhelm.insightsByWeek`, `avgInsightsPerGeneration` |
| 1625 | golf_coach_philosophy | `count head` | `coachhelm.coachPhilosophyAdoption` |
| 1627-1630 | golf_round_reviews, golf_patterns_v2, golf_predictions, golf_insight_generation_log | `... gte ago30d` | `bi.usage.featureAdoption` 30d cols |
| 1633 | users | `select id,email,role,created_at order desc limit 10` | `activity.recentSignups` |
| 1634 | golf_rounds | `select id,total_score,score_to_par,round_type,course_name,created_at,golf_players(name) order desc limit 10` | `activity.recentRounds` |
| 1635 | golf_insight_generation_log | `select id,insight_type,insights_generated,created_at order desc limit 10` | `activity.recentInsights` |
| 1638 | golf_rounds | `select created_at gte ago30d` | `growth.*` (DAU proxy) |
| 1639 | golf_rounds | `select player_id gte ago7d` | `engagement.weeklyRetention` |
| 1640 | golf_players | `select id` | denominator for retention |
| 1641 | golf_coach_insights | `select coach_id gte ago30d` | `engagement.coachesUsingInsights` |
| 1642 | golf_attendance_summary | `select attendance_percentage` | `engagement.eventAttendanceRate` |
| 1644 | golf_team_members | `select status, golf_players(graduation_year)` | `users.playersByStatus` |
| 1645 | golf_players | `select graduation_year` | `users.playersByYear` |
| 1646 | golf_rounds | `count head gte ago14d lt ago7d` | `growth.roundGrowthRate` |
| 1647 | golf_teams | `count head gte ago30d` | `growth.teamGrowthThisMonth` |
| 1648 | golf_rounds | `select player_id gte ago30d` | `growth.churnedPlayers30d` current set |
| 1649 | golf_rounds | `select player_id gte 60d lt 30d` | `growth.churnedPlayers30d` prior set |
| 1651-1654 | users (×4) | 4 cohort windows (28-21d, 21-14d, 14-7d, 7-0d) | `growth.retentionCohorts` (4 rows) |
| 1656-1658 | golf_shots (×3) | `count head not <col> is null` (distance, lie, club) | `dataQuality.shotsWithDistance/Lie/Club` |
| 1660 | golf_round_reviews | `select round_id` | `funnel.roundsReviewed` |
| 1662 | golf_insight_generation_log | `select player_id not null` | `funnel.roundsWithInsights`, `playerEngagement` |

### Batch 2 — Team & scoring intelligence (L1668-L1717)

| Line | Table | Filter | Feeds |
|------|-------|--------|-------|
| 1685 | golf_teams | `select id,name,organization_id,organizations(name)` | `teams[]`, `teamRosters[]` |
| 1687 | golf_team_members | `active, joined to golf_players(name)` | team membership |
| 1689 | golf_rounds | `select player_id,team_id gte ago7d` | `teams[].roundsThisWeek` |
| 1691 | golf_player_stats_cache | `select ... order scoring_average asc limit 50` | `scoring.topPerformers`, `scoring.platform*` |
| 1693 | golf_team_members | `select player_id, golf_teams(id,name) active` | user→team resolution for directory |
| 1695 | golf_rounds | `select total_score completed` | `scoring.scoringDistribution` |
| 1697 | golf_rounds | `select total_score,score_to_par,course_name,round_date,golf_players(name) order score_to_par asc limit 5` | `scoring.recentBestRounds` |
| 1699 | golf_insight_generation_log | `select created_at gte ago12w` | `coachhelm.insightsByWeek` (weekly) |
| 1700 | golf_round_reviews | `select created_at gte ago12w` | `coachhelm.reviewsByWeek` |
| 1702 | golf_insight_generation_log | `count head gte ago7d eq insights_generated 0` | `health.systemErrors7d` |
| 1704 | golf_players | `select id, user_id` | player↔user map |
| 1708 | RPC | `get_platform_health_stats` | `health.activeSessions/totalSessions/dbSize/...` |
| 1714 | golf_player_stats_cache | `select updated_at order desc limit 1` | `statsCacheLastUpdated` |
| 1716 | golf_coaches | `select organization_id` | `teams[].coachCount` |

### Batch 3 — User directory, team rosters, daily charts (L2124-L2153)

| Line | Table | Filter | Feeds |
|------|-------|--------|-------|
| 2136 | users | `select id,email,role,created_at,last_seen order desc` | `userDirectory`, `userActivity` |
| 2138 | golf_players | `select id,user_id,first_name,last_name,graduation_year,onboarding_completed` | same |
| 2140 | golf_coaches | `select id,user_id,full_name,email,organization_id,onboarding_completed` | `teamRosters[].coaches` |
| 2142 | golf_rounds | `select player_id` | per-player round totals |
| 2144 | golf_rounds | `select player_id,created_at order desc` | last round per player (FULL TABLE SCAN) |
| 2146 | users | `select created_at gte ago30d order asc` | `signupsByDay` |
| 2148 | golf_rounds | `select player_id,created_at gte ago30d order asc` | `visitsByDay`, `stickiness.dau/wau` |
| 2150 | RPC | `get_users_with_auth` | `userAuthDetails`, BI login metrics |
| 2152 | golf_coach_philosophy | `select coach_id` | `coachhelmRoi.coachesUsingAI` |

### Batch 4 — Errors, audit, security, baseball (L2429-L2541)

| Line | Table / RPC | Filter / Limit | Feeds |
|------|-------------|----------------|-------|
| 2469 | error_logs | `select ... order desc limit 500` | `errorLogs.recentErrors`, incident grouping |
| 2471 | error_logs | `count head gte ago7d` | `errorLogs.totalErrors7d` |
| 2473 | error_logs | `count head gte ago7d eq severity critical` | `errorLogs.criticalErrors7d` |
| 2477 | RPC | `get_error_summary(7)` | `errorLogs.bySeverity/topErrors/errorsByDay` |
| 2486 | RPC | `get_audit_log_recent(50)` | `auditLog.recentEvents` |
| 2493 | audit_log | `count head gte ago7d` | `auditLog.totalEvents7d` |
| 2495 | login_attempts | `order desc limit 20` | `loginSecurity.recentAttempts` |
| 2497 | login_attempts | `count head gte locked_until now()` | `loginSecurity.lockedAccounts` |
| 2499-2511 | baseball_players ×3, baseball_coaches ×2, baseball_watchlists, baseball_videos, baseball_player_engagement_events, baseball_messages, baseball_conversations, baseball_teams, baseball_events, baseball_camps (14 queries) | various counts | `baseball.*` (all 14 fields) |
| 2513-2515 | demo_requests ×3 | total, pending, recent×10 | `demoRequests.*` |
| 2517-2520 | golf_announcements, golf_announcement_acknowledgements, golf_messages, golf_conversations | `count head` | `golfCommunication.*` |
| 2522 | golf_player_stats_cache | `select strokes_gained_*` not null | `strokesGained.*` |
| 2524 | users | `count head` | `totalPlatformUsers` |
| 2526 | admin_events | `select ... order desc limit 500` | `adminEvents.recentEvents`, `activity.recentAdminEvents` |
| 2530 | RPC | `get_admin_event_summary(7)` | `adminEvents.eventsBy*`, `totalEvents7d`, `errorCount7d`, etc. |
| 2538 | admin_events | `eq resolved false in severity [critical,error] limit 20` | `adminEvents.unresolvedCritical` |
| 2540 | admin_events | `eq event_type error select metadata limit 500` | incident building (`errorLogs.recentErrors` narrative) |

### Batch 5 — Enhanced analytics (L3206-L3233)

| Line | Table | Filter | Feeds |
|------|-------|--------|-------|
| 3218 | admin_analytics_events | `gte ago7d` | `sessionHeatmap.*`, `infraHealth.apiPerf`, BI dead features |
| 3220 | golf_coach_insights | `select coach_id, created_at` | `coachIntelligence[].insightsViewed` |
| 3222 | golf_round_reviews | `select published_by,round_id,created_at, golf_rounds(player_id,created_at)` | `coachIntelligence[].reviewRate`, `avgResponseTimeHours` |
| 3224 | golf_rounds | `select player_id,created_at,team_id order desc` | `cohortMatrix`, `benchmarks.playerTrends`, TTFV, churnRisk, power users (FULL TABLE SCAN) |
| 3226 | golf_insight_generation_log | `select player_id, insights_generated not null` | `userActivity.teams[].members[].insightsReceived`, BI `featureRetentionCorrelation` |
| 3228 | golf_teams | `select id, season` | `userActivity.teams[].season` |
| 3230 | error_logs | `count head gte ago24h` | `errorDetection.errors24h`, `bi.health` |
| 3232 | admin_events | `in severity [error,critical] select id,event_type,severity,resolved,created_at` | `errorDetection.unresolvedErrors`, BI error breakdown |

---

## 2. Query → Return-field Mapping (summary)

| Query cluster (file:line range) | # queries | `AdminDashboardData` fields | Est. cost |
|----|----|----|----|
| Rounds full-table scans (1574-1576, 1597, 1599-1601, 1638-1639, 1646, 1648-1649, 1689, 1695, 1697, 2142, 2144, 2148, 3224) | **17** (of 23) | health.activeUsers*, usage.*, growth.*, scoring.*, engagement.*, cohortMatrix, benchmarks.playerTrends, userActivity, userDirectory.lastRoundDate | **HIGH** — 3+ full scans of rounds, partial scans ≥7d window |
| Users scans (1591-1594, 1633, 1651-1654, 2136, 2146, 2524) | 11 | users.*, growth.retentionCohorts, activity.recentSignups, signupsByDay, userDirectory, totalPlatformUsers | HIGH — one full scan @2136 is the dominant cost |
| Players scans (1586, 1589, 1594, 1640, 1645, 1704, 2138) | 7 | users.*, funnel, engagement, playersByYear, userDirectory, teamRosters | MED |
| Coaches scans (1585, 1588, 1716, 2140) | 4 | users.totalCoaches, teams[].coachCount, teamRosters, CoachhelmROI | LOW |
| golf_insight_generation_log (1579, 1582, 1624, 1630, 1635, 1662, 1699, 1702, 3226) | 9 | health.insightsThisWeek, lastInsightGenerated, coachhelm.*, activity.recentInsights, funnel, bi.usage | MED |
| golf_round_reviews (1578, 1623, 1627, 1660, 1700, 3222) | 6 | health.roundReviewsThisWeek, coachhelm.reviewsByWeek/total, funnel.roundsReviewed, coachIntelligence | MED |
| admin_events (2526, 2530, 2538, 2540, 3232) | 5 | adminEvents.*, activity.recentAdminEvents, errorDetection.*, errorLogs.recentErrors (narrative) | MED |
| error_logs (2469, 2471, 2473, 3230) | 4 | errorLogs.*, errorDetection.errors24h/errors7d | LOW |
| baseball_* counts (2499-2511) | 13 | baseball.* (all 14 fields) | LOW (indexes already on created_at) |
| Feature-adoption counts (1602-1616) | 14 | usage.featureAdoption, bi.usage.featureAdoption.last30d | LOW individually / HIGH in aggregate (14 round-trips) |

---

## 3. Consolidation Candidates (ranked)

### C1 — `golf_rounds` mega-rollup (17 queries → 1 RPC)  ★ TOP PRIORITY
**Score:** 17 queries × 1 huge table = highest impact.
Collapse every `golf_rounds` `.from()` call (L1574-1576, 1597, 1599-1601, 1638-1639, 1646, 1648-1649, 1689, 1695, 1697, 2142, 2144, 2148, 3224) into one RPC that scans the table once and returns a JSONB of all aggregates PLUS a few bounded arrays (recentRounds, bestRounds).

### C2 — Users + onboarding + cohort rollup (11 queries → 1 RPC)
Collapse users + golf_players + golf_coaches into one RPC. Covers users.total*, onboarding rates, signups by week/day, 4-week retention cohorts, players-by-status/year. Eliminates 4 separate cohort queries (1651-1654) and the full-users scan at 2136.

### C3 — Feature-adoption counts bulk rollup (14 queries → 1 RPC)
Lines 1602-1616 are 14 sequential `count head` calls across 7 tables (all-time + 30d). Trivial to collapse into one RPC returning a JSONB object `{ qualifiers: {total, last30d}, events: {…}, … }`. Highest "# queries collapsed per LOC written."

### C4 — CoachHelm analytics rollup (9 queries → 1 RPC)
`golf_insight_generation_log` + `golf_round_reviews` + `golf_patterns_v2` + `golf_predictions` + `golf_coach_philosophy` + `golf_prediction_model_performance` + `golf_insight_effectiveness` — combine into one `get_coachhelm_rollup()` RPC returning weekly series, totals, top-N model/effectiveness rows.

### C5 — Baseball counts rollup (14 queries → 1 RPC)
Lines 2499-2511. 13 count queries + watchlist pipeline aggregation. Pure SQL `GROUP BY`/count — no TS transforms needed. One RPC returning the exact `baseball` subshape.

### C6 — Admin events + error_logs rollup (9 queries → 1 RPC)
All of Batch-4 admin_events + error_logs + the admin_events query at L3232 and error_logs count at L3230. Keep `get_error_summary` and `get_admin_event_summary` as the backbone; wrap them plus the recent-events arrays in a single RPC. Preserves the existing JSONB shape those two RPCs already return.

### C7 — Teams/rosters/scoring rollup (9 queries → 1 RPC)
Batch-2 is 14 queries; 5 of them (RPC `get_platform_health_stats`, 3 of the cache queries) already return preformed JSON. The remaining 9 (`golf_teams`, `golf_team_members` ×2, `golf_rounds` ×3, `golf_player_stats_cache` ×2, `golf_coaches`) can collapse to one RPC returning the `teams[]`, `teamRosters[]`, `scoring.*` subtrees.

**If we implement C1-C7 → ~93 calls drop to ~8 RPCs + 3 kept queries** (Vercel analytics HTTP fetch, `get_platform_health_stats`, session-heatmap analytics events which needs row-level JSON detail).

---

## 4. Proposed Postgres RPC Signatures

Return types kept as `jsonb` to avoid regenerating Supabase types; TS layer casts to already-present types. All RPCs run as `security definer` + `set search_path = public` and begin with an `auth.uid() → users.role = 'admin'` check (same pattern as existing `get_admin_dashboard_rollup`).

```sql
-- C1
create or replace function public.get_admin_rounds_rollup(
  p_today timestamptz,
  p_ago24h timestamptz, p_ago7d timestamptz, p_ago14d timestamptz,
  p_ago30d timestamptz, p_ago60d timestamptz, p_ago12w timestamptz
) returns jsonb
-- returns {
--   activeUsers24h, activeUsers7d, activeUsers30d,  -- distinct player_id counts
--   roundsThisWeek, roundsToday, totalRounds, completedRounds, verifiedRounds,
--   lastRoundAt, roundsByType[], roundsByWeek[],
--   roundsLastWeek, playerSetActive30d, playerSetActive30_60d,
--   teamRoundsThisWeek[{team_id, player_id}], totalScoreDist[],
--   recentBestRounds[5], recentRounds[10],
--   allRoundsMinimal[{player_id, created_at, team_id}]  -- bounded to ago12w for TTFV/cohort work
-- }

-- C2
create or replace function public.get_admin_users_rollup(
  p_ago7d timestamptz, p_ago14d timestamptz, p_ago30d timestamptz, p_ago12w timestamptz
) returns jsonb
-- returns {
--   totalCoaches, totalPlayers, totalAdmins, totalPlatformUsers,
--   coachesOnboarded, playersOnboarded,
--   newUsersThisWeek, newUsersLastWeek,
--   signupsByWeek[], signupsByDay30d[],
--   playersByOnboarding[], playersByStatus[], playersByYear[],
--   cohortWeeks: {w1,w2,w3,w4}[],
--   playerMap[{id,user_id,first_name,last_name,grad_year,onboarding_completed}],
--   coachMap[{id,user_id,full_name,email,organization_id,onboarding_completed}],
--   usersListForDirectory[{id,email,role,created_at,last_seen}]  -- ordered desc
-- }

-- C3
create or replace function public.get_admin_feature_adoption_rollup(p_ago30d timestamptz)
returns jsonb
-- returns { qualifiers:{total,last30d}, events:{...}, tasks:{...},
--           announcements:{...}, messages:{...}, documents:{...}, travel:{...} }

-- C4
create or replace function public.get_admin_coachhelm_rollup(p_ago7d timestamptz, p_ago30d timestamptz, p_ago12w timestamptz)
returns jsonb
-- returns { totalPatterns, totalPredictions, totalReviewsAllTime,
--   reviews30d, patterns30d, predictions30d, insightsGenLog30d[],
--   modelPerformance[top10], insightEffectiveness[top10],
--   insightsByWeek[], reviewsByWeek[], latestInsights[10],
--   lastInsightAt, insightsThisWeek, reviewsThisWeek, insightsFailed7d,
--   coachPhilosophyCount,
--   insightPlayerRows[{player_id,insights_generated}] }

-- C5
create or replace function public.get_admin_baseball_rollup(p_ago30d timestamptz)
returns jsonb
-- returns { totalPlayers, totalCoaches, watchlistStages:{stage:count},
--   recruitingActivatedPlayers, videos30d, engagementEvents30d, messages30d,
--   conversations30d, playersOnboarded, coachesOnboarded,
--   totalTeams, totalEvents, totalCamps }

-- C6
create or replace function public.get_admin_errors_rollup(p_ago7d timestamptz, p_ago24h timestamptz)
returns jsonb
-- returns { errorLogs:{recent[500], total7d, critical7d, count24h},
--   errorSummary: {…get_error_summary output…},
--   auditLog: {recent[50], total7d},
--   loginSecurity: {recent[20], lockedCount, failedLogins7d},
--   adminEvents: {recent[500], errorOnly[500], unresolvedCritical[20],
--                 errorBySeverity[], summary: {…get_admin_event_summary…}} }

-- C7
create or replace function public.get_admin_teams_scoring_rollup(p_ago7d timestamptz)
returns jsonb
-- returns { teams[{id,name,org_name}], teamMembers[{team_id,player_id,first_name,last_name}],
--   playerTeamMap[{player_id,team_id,team_name}],
--   coachOrgs[{organization_id}],
--   playerStatsCache[top50 by scoring_avg: {player_id, scoring_avg, fairway, gir, putts, rounds, first_name, last_name}],
--   platformAverages: {scoring_avg, fairway_pct, gir_pct, putts},
--   strokesGained: {sgTotal, sgTee, sgApproach, sgAroundGreen, sgPutting},
--   statsCacheLastUpdated,
--   golfCommunication: {totalAnnouncements, acks, totalMessages, totalConversations},
--   demoRequests: {total, pending, recent[10]},
--   attendancePercentages[] }
```

**Kept as `.from()` or external calls:**
- Auth / role check L1465-1474 (request-scoped).
- `get_platform_health_stats` RPC L1708 (already an RPC; resilient try-catch must remain).
- `get_users_with_auth` RPC L2150 (reads `auth.users` — must stay `security definer` RPC).
- `admin_analytics_events` L3218 — row-level session/page/feature events; heatmap transforms are complex and the raw events are reused three times (sessionHeatmap, BI dead features, infraHealth.apiPerf). Keep or build a dedicated view+RPC.
- `fetchVercelAnalytics` HTTP (L1395).
- `resolveDashboardIncident` mutation paths (L1118-1205).

---

## 5. Risk Assessment (keep-as-`.from()`)

| Query | Why risky |
|-------|-----------|
| L1465-1474 auth + role | Needs request cookie; `unstable_cache` forbids request helpers inside body. MUST stay outside RPC boundary. |
| L1708 `get_platform_health_stats` RPC | Queries `pg_stat_*` + `auth.sessions`; already an RPC; leave. |
| L2150 `get_users_with_auth` RPC | Reads `auth.users`; must remain `security definer`. |
| L3218 `admin_analytics_events` scan | 3-way reuse (heatmap + BI dead features + infraHealth.apiPerf) with heavy JS grouping. Hard to express cleanly in SQL — incident risk. Keep a single `.from()` read. |
| L2469 `error_logs` recent 500 + L2540 `admin_events` error-only 500 | `buildDashboardErrorContext`, `deriveIncidentNarrative`, `normalizeIncidentKey` perform string normalization + heuristics (L714-987) that are awkward in SQL. Keep raw rows in RPC payload, keep TS post-processing. |
| L1691 player_stats_cache top50 + L2522 strokes_gained | Use `PostgREST.embedded` to golf_players(name). Straightforward to move, but validate aliasing behaviour when flattened in RPC JSONB. |
| L2477 `get_error_summary`, L2486 `get_audit_log_recent`, L2530 `get_admin_event_summary` | Already RPCs; all 3 wrapped in try-catch for resilience. C6 wrapper must preserve `errorSummaryDegraded` / `adminEventSummaryDegraded` flags. |
| BI TTFV / feature-retention correlation (L4075-4250) | Depends on cross-joins (users × players × rounds × insights × reviews). Cheaper to do in SQL but the aggregation tree is long — do this LAST, after C1/C2 are live. |

---

## 6. Ownership Slicing — Three Parallel Agents

Goal: three agents work on disjoint regions of `admin-data.ts` + disjoint migration files.

### Slice A — "Core entities" (agent-A)
- **Owns lines:** L1486-L2120 (Batch 1 destructure + processing) and the `users`, `growth`, `usage`, `coachhelm`, `engagement`, `activity`, `scoring` portions of the return object (L4672-4753).
- **Migration:** `supabase/migrations/<ts>_admin_rounds_users_featureadoption_rollup.sql` — implements RPCs **C1 + C2 + C3 + C4**.
- **Risk:** Largest slice; holds the 17 `golf_rounds` queries and the 11 `users` queries. Also owns `allRoundsForCohort` which Batch 5 re-reads — Slice A must expose `allRoundsMinimal` in the C1 payload so Slice C can drop L3224.

### Slice B — "Teams & platform auxiliary" (agent-B)
- **Owns lines:** L1665-L1717 (Batch 2) and L2426-L2541 (Batch 4) processing blocks; return shape for `teams`, `teamRosters`, `scoring.topPerformers`, `strokesGained`, `golfCommunication`, `demoRequests`, `baseball`, `loginSecurity`, `auditLog`, `errorLogs` (L4736-4824).
- **Migration:** `supabase/migrations/<ts>_admin_teams_errors_baseball_rollup.sql` — implements **C5 + C6 + C7**.
- **Risk:** Must preserve `errorSummaryDegraded` / `adminEventSummaryDegraded` + resilience try-catch when RPC absent. `get_platform_health_stats`, `get_users_with_auth` stay as separate RPCs called alongside C7.

### Slice C — "Enhanced analytics & BI" (agent-C)
- **Owns lines:** L3195-L4050 (Batch 5 + `cohortMatrix` + `coachIntelligence` + `playerFunnel` + `sessionHeatmap` + `infraHealth` + `freshnessAlerts` + `benchmarks` + `userActivity` + `errorDetection`) and L4052-L4640 (BI block).
- **Migration:** `supabase/migrations/<ts>_admin_analytics_bi_rollup.sql` — **new RPC `get_admin_analytics_rollup`** that bundles coach reviews + coach_insights + teams.season + insightPlayer rows + error_logs 24h count + admin_events error-severity set. Keeps `admin_analytics_events` as a raw `.from()` read owned by this slice.
- **Risk:** Depends on outputs from Slice A (needs `allRoundsMinimal`, `userIdToPlayerId` map, `allUsersRes`). Interface contract with Slice A: Slice A's C1 RPC must include an `allRoundsMinimal` array (player_id, created_at, team_id) limited to the last 12 weeks — enough for cohort / TTFV / power-user / at-risk computation. Agents A and C sign off on that shape at kickoff.

### Non-conflict rules
- Auth block L1460-1477, final `return { … }` L4642-4881, and cross-cutting helpers (L704-1022) are **read-only during the refactor**. Each slice assembles its own partial object, the final `return` is a merge. Coordinate through a shared helper `assembleAdminDashboardData(partialA, partialB, partialC)` committed FIRST by Slice A.
- Migrations go in 3 different files, timestamps sorted A→B→C. No shared SQL objects beyond table names.
- `AdminDashboardData` interface (L152-686) is frozen for the duration of refactor. Any shape change = full-team review.

---

## Expected End-state Shape

Inside `getAdminDashboardData` after refactor (pseudocode):

```ts
const [roundsRollup, usersRollup, featureAdoption, coachhelmRollup,
       teamsRollup, baseballRollup, errorsRollup, analyticsRollup,
       platformHealth, usersWithAuth, analyticsEvents, vercel] = await Promise.all([
  adminDb.rpc('get_admin_rounds_rollup', {...}),
  adminDb.rpc('get_admin_users_rollup', {...}),
  adminDb.rpc('get_admin_feature_adoption_rollup', {...}),
  adminDb.rpc('get_admin_coachhelm_rollup', {...}),
  adminDb.rpc('get_admin_teams_scoring_rollup', {...}),
  adminDb.rpc('get_admin_baseball_rollup', {...}),
  adminDb.rpc('get_admin_errors_rollup', {...}),
  adminDb.rpc('get_admin_analytics_rollup', {...}),
  adminDb.rpc('get_platform_health_stats'),           // kept
  adminDb.rpc('get_users_with_auth'),                  // kept
  adminDb.from('admin_analytics_events').select(...),  // kept
  fetchVercelAnalytics(),                              // kept
]);
```

**Before:** ~93 round-trips. **After:** 12 round-trips (8 new RPCs + 4 kept). Target met.
