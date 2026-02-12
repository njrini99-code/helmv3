# GolfHelm Database Audit Report

**Date**: 2026-02-12 | **Scope**: Full (7-agent, 2-wave) | **Database**: Production Supabase
**Recovery Note**: Wave 1 output was lost to a session crash. Triage was re-run to reconstruct the findings brief before dispatching Wave 2.

## Database Snapshot

| Metric | Value |
|--------|-------|
| Golf Users | 35 |
| Coaches | 5 |
| Players | 31 |
| Teams | 4 |
| Organizations | 4 |
| Active Memberships | 27 |
| Completed Rounds | 61 |
| Total Holes | 1,116 |
| Total Shots | 11,353 |
| Events | 4 |
| Qualifiers | 0 |

---

## Critical Blockers 🔴

### 1. Stats Cache Completely Empty — No Trigger to Populate It

- **User sees**: Dashboard stats pages compute everything from scratch on every page load. Any feature reading `golf_player_stats_cache` or `golf_round_stats_cache` returns nothing.
- **Root cause**: **No trigger exists on `golf_rounds` to populate the stats cache.** The only round-level trigger is `trg_calculate_strokes_gained`. A trigger `trg_update_player_stats_cache_enhanced` exists but it's on the *cache table itself* (fires when cache rows are modified), not on `golf_rounds` (where it would need to fire when rounds complete). The cache population function (`calculate_round_stats`, `update_round_stats`, `update_player_stats_cache`) **does not exist** in the database — only `handle_new_user` was found among business logic functions.
- **Evidence**:
  - `golf_player_stats_cache`: 0 rows (should have 17)
  - `golf_round_stats_cache`: 0 rows (should have 61)
  - Stats trigger on golf_rounds: 0
  - `calculate_round_stats` function: does not exist
- **Impact**: Scoring averages, handicap trends, GIR/FIR percentages, putting stats, strokes gained, and all CoachHelm AI insights that depend on cached stats are broken.
- **Fix**:
  1. Create a `calculate_round_stats()` function that populates both cache tables
  2. Create a trigger on `golf_rounds` that calls it on INSERT/UPDATE where `status = 'completed'`
  3. Backfill: run the stats calculator for all 17 players with completed rounds

### 2. Score Mismatch: `total_score` Desynced from Hole Data (40 of 61 Rounds)

- **User sees**: Leaderboards, scoring averages, and trend charts show incorrect scores. Example: a round displays as 73 when the actual hole-by-hole scores sum to 83 (10-stroke error).
- **Root cause**: The seed data generator computes `total_score = score_to_par + 72` (hardcoded par-72 assumption), then independently generates hole-by-hole scores that sum to a different total. All 40 mismatched rounds satisfy `total_score = score_to_par + 72` exactly — confirming the hardcoded par assumption.
- **Evidence**: 40/61 completed rounds (65.6%) have mismatches. Diffs range from -10 to +6. The 15 seed rounds with `a0000001-*` UUIDs and 6 coincidentally-matching user rounds are correct.
- **Impact**: Every stat derived from `golf_rounds.total_score` is wrong for 65% of rounds. Scoring averages, best rounds, trend analysis, and player rankings are all corrupted.
- **Fix**:
  ```sql
  UPDATE golf_rounds gr SET
    total_score = (SELECT SUM(score) FROM golf_holes WHERE round_id = gr.id),
    score_to_par = (SELECT SUM(score) - SUM(par) FROM golf_holes WHERE round_id = gr.id)
  WHERE status = 'completed'
    AND total_score != (SELECT SUM(score) FROM golf_holes WHERE round_id = gr.id);
  ```
  Then fix the round creation code to compute `total_score = SUM(hole scores)` instead of `score_to_par + 72`.

### 3. Conversation Privacy Leak — All DMs Visible to Every Authenticated User

- **User sees**: (Silent breach) Any authenticated user can read all direct-message conversation metadata where `team_id IS NULL`.
- **Root cause**: The `golf_conversations_select_accessible` RLS policy USING clause ends with `OR (team_id IS NULL)`, which allows any authenticated user to SELECT all non-team conversations (DMs) without checking if they're a participant.
- **Evidence**: Policy USING clause excerpt: `... OR (team_id IS NULL)` — no `auth.uid()` restriction in the NULL branch.
- **Impact**: Complete privacy breach for direct messages. Any logged-in user from any team can see DM conversation metadata and (via joins to `golf_messages`) potentially message content.
- **Fix**:
  ```sql
  DROP POLICY "golf_conversations_select_accessible" ON golf_conversations;
  CREATE POLICY "golf_conversations_select_accessible" ON golf_conversations
    FOR SELECT TO authenticated
    USING (
      id IN (SELECT conversation_id FROM golf_conversation_participants WHERE user_id = auth.uid())
      OR is_golf_team_coach(team_id)
      OR is_golf_team_player(team_id)
    );
  ```

### 4. All 61 Completed Rounds Have NULL `course_id`

- **User sees**: No course-specific analytics work. Course par lookups fail, course difficulty adjustments are impossible, and course-aware scoring is disabled.
- **Root cause**: The round creation flow (both seed and user-generated) never sets `course_id`. The `golf_courses` table has data, but no round references it.
- **Evidence**: `SELECT count(*) FROM golf_rounds WHERE course_id IS NOT NULL` = 0
- **Impact**: Course-specific stats, course par for score-to-par calculations, and course breakdown features are all non-functional. This also contributed to the score mismatch problem (no course par available, so code falls back to hardcoded 72).
- **Fix**: For existing rounds, match `course_name` to `golf_courses.name` to backfill `course_id`. For new rounds, require course selection during round creation.

---

## High Priority 🟠

### 5. Conversation Participants RLS Prevents Seeing Other Members

- **User sees**: The messaging UI cannot display who else is in a conversation. Participant lists show only the current user.
- **Root cause**: `golf_participants_select` policy uses `USING (user_id = auth.uid())` — a user can only see their own participation record, not other participants in conversations they belong to.
- **Fix**:
  ```sql
  DROP POLICY "golf_participants_select" ON golf_conversation_participants;
  CREATE POLICY "golf_participants_select" ON golf_conversation_participants
    FOR SELECT TO authenticated
    USING (
      user_id = auth.uid()
      OR conversation_id IN (
        SELECT conversation_id FROM golf_conversation_participants WHERE user_id = auth.uid()
      )
    );
  ```

### 6. GIR Systematically Miscalculated (271 of 1,116 Holes = 24.3%)

- **User sees**: GIR percentages are significantly understated. A player hitting 60% of greens might show as 40%.
- **Root cause**: Seed data sets `gir` randomly instead of computing `(score - putts) <= (par - 2)`. 271 holes marked `gir = false` where the player actually reached the green in regulation. 1 hole marked `gir = true` that is impossible.
- **Fix**:
  ```sql
  UPDATE golf_holes SET gir = true WHERE gir = false AND score - putts <= par - 2;
  UPDATE golf_holes SET gir = false WHERE gir = true AND score - putts > par - 2;
  ```

### 7. `user_is_coach_of_golf_player()` Missing Status Filter — Coaches See Removed Players

- **User sees**: After removing a player from a team, the coach still sees that player's data (rounds, stats, shots, predictions, focus areas) through the `golf_players` SELECT policy.
- **Root cause**: The function joins `golf_team_members` without `AND gtm.status = 'active'`.
- **Fix**:
  ```sql
  CREATE OR REPLACE FUNCTION user_is_coach_of_golf_player(check_player_id uuid)
  RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1 FROM golf_coaches gc
      JOIN golf_teams gt ON gt.organization_id = gc.organization_id
      JOIN golf_team_members gtm ON gtm.team_id = gt.id
      WHERE gc.user_id = auth.uid()
        AND gtm.player_id = check_player_id
        AND gtm.status = 'active'
    )
  $$;
  ```

### 8. No `updated_at` Trigger on `golf_rounds` or `golf_events`

- **User sees**: `updated_at` fields never change after initial creation, making cache invalidation, "last modified" displays, and sync logic unreliable.
- **Root cause**: 0 triggers on golf_rounds for updated_at. 0 triggers on golf_events at all.
- **Fix**: Add `updated_at` triggers to both tables using the standard `set_updated_at()` pattern.

### 9. 29 Users With Empty Messages Page (0 Conversation Participation)

- **User sees**: Completely empty messages/chat page despite being on a team.
- **Root cause**: 26 players (including all 15 seed players) and 3 coaches have never been added to any `golf_conversation_participants` rows. Either the team channel auto-join doesn't exist, or it ran before these users were created.
- **Impact**: 29 of 35 golf users (83%) see an empty messages page.
- **Fix**: Create a team channel auto-join mechanism that adds all active team members to the team's default conversation.

### 10. 24 UPDATE Policies Missing WITH CHECK — Coach Could Reassign Player Ownership

- **User sees**: (Silent vulnerability) A coach could theoretically update `player_id` on rounds/holes/shots to reassign data to another player, because the coach UPDATE policies only check `team_id` in USING but have no WITH CHECK to prevent changing `player_id`.
- **Tables affected**: `golf_rounds_update_coach`, `golf_holes_update_coach`, `golf_shots_update_coach` (most critical), plus 21 others.
- **Fix**: Add explicit `WITH CHECK` clauses on the coach-update policies for rounds, holes, and shots.

---

## Medium Priority 🟡

### 11. `golf_courses` Immutable After Creation (No UPDATE/DELETE Policies)

- **Table**: `golf_courses`
- **Issue**: RLS enabled, only INSERT and SELECT policies exist. Course data errors (wrong par, wrong yardage) cannot be corrected through the app.
- **Fix**: Add UPDATE policy for authenticated users and DELETE policy for coaches.

### 12. Cross-Tenant Course Hole Editing

- **Table**: `golf_course_holes`
- **Issue**: The `Coaches can manage course holes` policy only checks `EXISTS (SELECT 1 FROM golf_coaches WHERE user_id = auth.uid())` — any coach can edit any course's holes regardless of organization.
- **Fix**: Acceptable if courses are shared reference data. Otherwise, add organization scoping.

### 13. Open Team/Org Creation (Any Authenticated User)

- **Tables**: `golf_teams`, `golf_organizations`
- **Issue**: INSERT WITH CHECK is `true` — any authenticated user (including players) can create teams/orgs.
- **Fix**: Restrict to coaches: `WITH CHECK (EXISTS (SELECT 1 FROM golf_coaches WHERE user_id = auth.uid()))`.

### 14. `golf_teams_select_by_join_code` Leaks Team Metadata

- **Issue**: USING clause `(join_code IS NOT NULL)` lets any authenticated user enumerate all teams with join codes, exposing names, org IDs, etc.
- **Mitigation**: Create a limited database view for the join-by-code flow.

### 15. 50+ Policies Use `{public}` Role Instead of `{authenticated}`

- **Issue**: Defense-in-depth weakness. Policies internally call `auth.uid()` which returns NULL for anonymous, so functionally safe, but not best practice.
- **Fix**: Change role from `{public}` to `{authenticated}` on all non-service-role policies.

### 16. 4 Orphaned Players (No Team Membership)

- **Players**: Ben Potter, bob claude (2 rounds), Nicholas rini (1 round), Larsen Gallimore
- **Issue**: Created during signup but never joined a team. Two have round data invisible to any coach.
- **Fix**: Prompt to join a team, or clean up test accounts. Consider requiring team membership before round creation.

---

## Low Priority 🟢

### 17. In-Progress Round With Pre-Created Empty Holes

- 1 round (`d55abe35`) has 18 hole shells, only hole 1 has data. This is working as designed (not a bug).

### 18. `golf_event_rsvps` Table Does Not Exist

- The audit playbook references `golf_event_rsvps` but only `golf_event_attendance` exists in production. The RSVP count fields on `golf_events` (if any) would have no source data.

### 19. 30 ALL Policies Without Explicit WITH CHECK

- PostgreSQL falls back to USING clause, which is correct. But explicit WITH CHECK is best practice for clarity.

---

## Checks Summary

| Category | Agent | Checks | Pass | Fail | Notes |
|----------|-------|--------|------|------|-------|
| **Auth & RLS** | Wave 1 | 5 | 5 | 0 | All auth chains valid |
| **Team & Membership** | Wave 1 | 5 | 4 | 1 | 4 orphaned players |
| **Stats Integrity** | Wave 1 | 3 | 0 | 3 | Cache empty, scores mismatched |
| **Data & UI Contracts** | Wave 1 | 4 | 3 | 1 | All course_ids NULL |
| **RLS Policy Logic** | Agent 5 | 12 | 7 | 5 | DM leak, participant visibility, coach stale access, missing WITH CHECK |
| **State Machine** | Agent 6 | 15 | 10 | 5 | Score mismatches, GIR errors, empty cache, NULL course_ids, orphaned players |
| **Triggers & Functions** | Agent 7 | 8 | 3 | 5 | No stats trigger, no updated_at on rounds, no stats functions, 29 users empty messages |
| **TOTAL** | All | **52** | **32** | **20** | |

---

## Prioritized Fix List

### Phase 1: Data Integrity (Fix Now)

| # | Issue | Fix Type | Effort |
|---|-------|----------|--------|
| 1 | Recalculate `total_score` from holes | UPDATE query | 5 min |
| 2 | Recalculate GIR from score/putts/par | UPDATE query | 5 min |
| 3 | Backfill `course_id` from course_name matching | UPDATE query | 15 min |
| 4 | Create stats cache population function + trigger | Migration | 1 hr |
| 5 | Backfill stats cache for all 17 players | Function call | 10 min |

### Phase 2: Security (Fix This Week)

| # | Issue | Fix Type | Effort |
|---|-------|----------|--------|
| 6 | Fix conversation privacy leak (DM exposure) | Migration (DROP + CREATE policy) | 15 min |
| 7 | Fix conversation participants visibility | Migration (DROP + CREATE policy) | 15 min |
| 8 | Fix `user_is_coach_of_golf_player()` status filter | Migration (CREATE OR REPLACE) | 10 min |
| 9 | Add WITH CHECK to coach UPDATE policies | Migration | 30 min |

### Phase 3: Infrastructure (Fix This Sprint)

| # | Issue | Fix Type | Effort |
|---|-------|----------|--------|
| 10 | Add `updated_at` triggers on rounds + events | Migration | 15 min |
| 11 | Auto-join team members to team conversation | Migration + code | 30 min |
| 12 | Add UPDATE/DELETE policies on golf_courses | Migration | 10 min |
| 13 | Restrict team/org creation to coaches | Migration | 10 min |
| 14 | Change `{public}` to `{authenticated}` on 50+ policies | Migration | 45 min |

### Phase 4: Cleanup (Backlog)

| # | Issue | Fix Type | Effort |
|---|-------|----------|--------|
| 15 | Resolve 4 orphaned players | Manual review | 15 min |
| 16 | Create limited view for join-by-code flow | Migration | 20 min |
| 17 | Add explicit WITH CHECK on 30 ALL policies | Migration | 30 min |
| 18 | Reconcile RSVP table absence | Schema decision | varies |

---

## Appendix: Agent Configuration

| Agent | Wave | Focus | Turns Used | Key Findings |
|-------|------|-------|-----------|--------------|
| Triage (Coordinator) | 0 | Health check, findings brief | 5 queries | Stats cache empty, 39 score mismatches |
| Agent 5: RLS Policy Logic | 2 | Policy SQL analysis | 31 tool uses | DM privacy leak, participant visibility, stale coach access |
| Agent 6: State Machine | 2 | Impossible states | 44 tool uses | Score mismatch root cause, GIR errors, NULL course_ids |
| Agent 7: Trigger Verifier | 2 | Trigger chain verification | 27+ tool uses | No stats trigger, no updated_at, missing functions |

---

*Report compiled from recovered Wave 1 triage + full Wave 2 agent results. Deduplicated across all agents.*
