# GolfHelm Player Dashboard Scan

**Date**: 2026-02-12 | **Scope**: Player dashboard data health | **Database**: Production Supabase (direct SQL)

## Prior Audit Status (from 2026-02-12 full audit)

| Prior Issue | Status |
|------------|--------|
| Stats cache empty | FIXED — 17 players cached, all accurate |
| Score mismatches (40/61 rounds) | FIXED — all 61 completed rounds match hole sums |
| All course_ids NULL | FIXED — 61/61 completed rounds have course_id |
| All team timezones NULL | FIXED — all 4 teams now set to `America/New_York` |
| 19 rounds missing `team_id` | MOSTLY FIXED — down from 19 to 3 remaining |
| DM privacy leak | CONFIRMED — see Security section below |

---

## Critical Blockers

### 1. 3 Rounds Still Missing `team_id` (down from 19)

| Player | Status | Has Course | Created |
|--------|--------|------------|---------|
| bob claude | in_progress | Yes | 2026-02-08 |
| bob claude | completed | Yes | 2026-02-08 |
| Nicholas rini | in_progress | No | 2026-01-23 |

- **Impact**: 1 completed round invisible to coaches via RLS. Players can still see their own rounds.
- **Root cause**: Both players have **no active team membership** — the backfill migration can't resolve `team_id` without a team.
- **Fix**: Either assign these players to teams, or treat as test accounts and clean up.

### 2. DM Privacy Leak — Coaches Can Read Player DMs

- **Issue**: The `golf_conversations_select_accessible` RLS policy allows access if `is_golf_team_coach(team_id)` — meaning **any coach on the team can read all DM conversations** that have a `team_id` set, even if they are not a participant.
- **Affected**: 5 DM conversations (all with `is_team_chat = false`, `is_team_channel = false`) have `team_id` set, making them visible to team coaches.
- **Messages policy**: `golf_messages_select` correctly restricts to participants only. However, the conversation metadata (existence, title) leaks.
- **Severity**: Medium — message content is protected, but conversation existence is exposed.
- **Fix**: Modify the conversations SELECT policy to only allow coach access for team chats/channels:
  ```sql
  -- Change the policy to restrict coach access to team chats only
  CREATE POLICY golf_conversations_select_accessible ON golf_conversations FOR SELECT USING (
    id IN (SELECT conversation_id FROM golf_conversation_participants WHERE user_id = auth.uid())
    OR (is_team_chat = true AND is_golf_team_coach(team_id))
    OR (is_team_channel = true AND is_golf_team_coach(team_id))
    OR (is_team_chat = true AND is_golf_team_player(team_id))
    OR (is_team_channel = true AND is_golf_team_player(team_id))
  );
  ```

---

## High Priority

### 3. CoachHelm AI Features Largely Empty

| Data Source | Count | Expected | Status |
|-------------|-------|----------|--------|
| Coach Insights | 103 | 100+ | OK |
| Round Reviews | 4 | 61 (one per completed round) | **57 missing** |
| Patterns (v2) | 0 | Should detect patterns | **Empty** |
| Player Focus Areas | 0 | Should be set by coaches | **Empty** |
| Putting Tendencies | 0 | Should be computed from shots | **Empty** |
| Review Insights | 0 | Should be generated from reviews | **Empty** |
| Review Events | 0 | Should track review actions | **Empty** |
| Predictions | 0 | Should generate predictions | **Empty** |

- **User sees**: CoachHelm, Patterns, and My Development pages are empty/minimal for players.
- **Impact**: The AI layer — a core differentiator — is non-functional for player-facing features.
- **Fix**: Run the CoachHelm insight generation pipeline for all 61 completed rounds. Populate putting tendencies from shot data.

### 4. Empty Dashboard for Real Teams

| Team | Players | Completed Rounds | In-Progress | Events | Upcoming Events | Tasks | Announcements |
|------|---------|-----------------|-------------|--------|-----------------|-------|---------------|
| Demo University Golf | 16 | 60 | 1 | 2 | 0 | 0 | 0 |
| Men's Golf (Guilford) | 6 | 0 | 1 | 0 | 0 | 0 | 0 |
| Women's Golf (Lynchburg) | 5 | 0 | 0 | 1 | 0 | 0 | 0 |
| QA Test Golf Team | 0 | 0 | 0 | 1 | 0 | 1 | 0 |

- **Zero upcoming events** across all teams.
- **Men's Golf** (6 real players) and **Women's Golf** (5 real players) have completely empty dashboards — no rounds, no stats, no events.
- **Fix**: Not a data bug — real teams haven't entered data yet. Ensure empty state UX is polished.

### 5. Course Holes Not Populated

- **15 courses** exist in `golf_courses`, but `golf_course_holes` has **0 rows**.
- **Impact**: Any feature relying on course hole data (par, yardage, handicap per hole) will be empty. Scorecards can't show course-specific par info from this table.
- **Note**: Hole pars are stored in `golf_holes` per round, so scoring works. But course-level reference data is missing.

---

## Medium Priority

### 6. 4 Players Without Team Membership

| Player | Onboarding | Completed Rounds | In-Progress |
|--------|------------|-----------------|-------------|
| bob claude | Complete | 1 | 1 |
| Nicholas rini | Complete | 0 | 1 |
| Ben Potter | Incomplete | 0 | 0 |
| Larsen Gallimore | Incomplete | 0 | 0 |

- bob claude has 1 completed round no coach can see.
- Ben Potter and Larsen Gallimore haven't finished onboarding — expected behavior.

### 7. Coach Configuration Sparse

| Metric | Count |
|--------|-------|
| Total coaches | 5 |
| Coaches with philosophy set | 1 |
| Coaches with settings | 0 |
| Coaches on teams | 5 |

- Only 1 of 5 coaches has set their CoachHelm philosophy preferences. The other 4 get default values.
- 0 coaches have custom settings configured.

### 8. Round Stats Cache Full But No Course Holes

- **61 rounds** have entries in `golf_round_stats_cache` — perfect coverage.
- However, without `golf_course_holes` data, features like hole-by-hole course comparison or course difficulty analysis won't work.

---

## Passing Checks

| Check | Result | Details |
|-------|--------|---------|
| Stats cache accuracy | PASS | 0.00 scoring avg diff across all 17 players |
| Stats cache freshness | PASS | All caches `is_stale = false`, updated 2026-02-12 |
| Round score integrity | PASS | All 61 completed rounds: `SUM(holes.score) = total_score`, all have 18 holes |
| Course assignment | PASS | 61/61 completed rounds have `course_id` |
| Shot data coverage | PASS | 62 rounds with shot data, 11,353 total shots, 0 completed rounds missing shots |
| Round stats cache | PASS | 61/61 completed rounds have stats cache entries |
| Auth chain | PASS | 0 players without user records, 0 orphaned team members, 0 duplicate memberships |
| RLS enabled | PASS | All 76 golf tables have `rowsecurity = true` |
| Team timezones | PASS | All 4 teams set to `America/New_York` |
| Messages INSERT policy | PASS | Correctly requires `sender_id = auth.uid()` AND participant membership |
| Messages SELECT policy | PASS | Restricts to conversation participants only |

---

## Player Dashboard Data Requirements

For a player dashboard to render fully:

| Requirement | Status | Coverage |
|-------------|--------|----------|
| Player authenticated | PASS | 31/31 have valid auth |
| Player has `golf_players` record | PASS | 31/31 |
| `onboarding_completed = true` | PASS | 29/31 (2 incomplete = expected) |
| Player on a team | PARTIAL | 27/31 (4 without team) |
| Team has timezone set | PASS | 4/4 teams |
| Player has completed rounds | PARTIAL | 17/31 players (11 real team players have 0 rounds) |
| Rounds have shot data | PASS | 62/62 rounds with shots |
| Stats cache accurate | PASS | 17/17 cached, 0.00 diff |
| CoachHelm insights | SPARSE | 103 coach insights, only 4 round reviews |
| Events/tasks/announcements | SPARSE | 4 events (0 upcoming), 0 tasks, 1 announcement |

---

## Recommended Actions (Priority Order)

1. **FIX: DM privacy leak** — Restrict conversation SELECT policy to only expose team chats/channels to coaches, not private DMs
2. **FIX: Clean up 3 orphan rounds** — Assign bob claude and Nicholas rini to teams, or delete test data
3. **GENERATE: Round reviews** for 57 completed rounds missing them — run CoachHelm pipeline
4. **POPULATE: Course holes** for all 15 courses — enables course-level analytics
5. **POPULATE: Putting tendencies** from existing shot data (11,353 shots available)
6. **POPULATE: Player focus areas** via coach workflow
7. **CONFIGURE: Coach philosophies** for remaining 4 coaches
8. **UX: Create upcoming events** — 0 upcoming events across all teams
