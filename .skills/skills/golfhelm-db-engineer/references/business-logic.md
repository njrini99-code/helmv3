# Business Logic Reference — GolfHelm

How GolfHelm is supposed to work from a data perspective. Use this to verify that
the database state matches expected business rules.

**Tool Rule**: Use ONLY the `execute_sql` MCP tool for all queries. No other
tools, APIs, or HTTP requests. Only SELECT queries — never modify data.

## Table of Contents
1. [User Lifecycle](#user-lifecycle)
2. [Team Structure](#team-structure)
3. [Team Join Flow](#team-join-flow)
4. [Round Recording Flow](#round-recording-flow)
5. [Events & Calendar](#events-calendar)
6. [Qualifiers](#qualifiers)
7. [Communication](#communication)
8. [CoachHelm AI](#coachhelm-ai)
9. [Diagnostic Queries](#diagnostic-queries)

---

## User Lifecycle

### Signup → Profile → Team → Active User

1. **Auth signup**: Creates `auth.users` row. Trigger `handle_new_user()` creates `public.users`
   with `role` from `raw_user_meta_data.role`.

2. **Onboarding**: Creates `golf_coaches` or `golf_players` row linked via `user_id`.
   Sets `onboarding_completed = true` when done.

3. **Team connection**:
   - **Coach**: Creates or joins an organization → organization gets a team → coach.organization_id set
   - **Player**: Uses invite code → creates `golf_team_members` row with status='active'

4. **Active**: User can now see team data through RLS policies.

### Verify user lifecycle completeness:
```sql
SELECT
  u.id, u.email, u.role,
  gc.id AS coach_id, gc.onboarding_completed AS coach_onboarded, gc.organization_id,
  gp.id AS player_id, gp.onboarding_completed AS player_onboarded,
  (SELECT count(*) FROM golf_team_members gtm WHERE gtm.player_id = gp.id AND gtm.status = 'active') AS active_memberships,
  (SELECT gtm.team_id FROM golf_team_members gtm WHERE gtm.player_id = gp.id AND gtm.status = 'active' LIMIT 1) AS player_team_id
FROM users u
LEFT JOIN golf_coaches gc ON gc.user_id = u.id
LEFT JOIN golf_players gp ON gp.user_id = u.id
WHERE gc.id IS NOT NULL OR gp.id IS NOT NULL  -- golf users have coach or player profile
ORDER BY u.created_at DESC
LIMIT 50;
```

**Red flags:**
- `role = 'coach'` but no golf_coaches row → onboarding incomplete
- `role = 'player'` but no golf_players row → onboarding incomplete
- Coach with NULL organization_id → can't see any team data
- Player with 0 active_memberships → RLS will block them from team data

---

## Team Structure

### Hierarchy
```
golf_organizations (school/club)
  └→ golf_teams (one per org per season)
      ├→ golf_coaches (via organization_id, NOT team_id)
      ├→ golf_team_members (junction table)
      │   └→ golf_players
      └→ [all team-scoped data: events, qualifiers, tasks, etc.]
```

### Critical Rule: Coach → Team Resolution
The app resolves a coach's team like this:
```
golf_coaches.organization_id → golf_teams WHERE organization_id = X
```
NOT via `golf_coaches.team_id`. The `team_id` on golf_coaches is a convenience
field that may or may not be set. The authoritative path is through organization.

### Verify team structure integrity:
```sql
-- Organizations without teams
SELECT go.id, go.name
FROM golf_organizations go
LEFT JOIN golf_teams gt ON gt.organization_id = go.id
WHERE gt.id IS NULL;

-- Teams without organizations
SELECT gt.id, gt.name, gt.organization_id
FROM golf_teams gt
LEFT JOIN golf_organizations go ON go.id = gt.organization_id
WHERE go.id IS NULL;

-- Teams with no members
SELECT gt.id, gt.name,
  (SELECT count(*) FROM golf_team_members gtm WHERE gtm.team_id = gt.id AND gtm.status = 'active') AS active_members,
  (SELECT count(*) FROM golf_coaches gc WHERE gc.organization_id = gt.organization_id) AS coaches
FROM golf_teams gt;
```

---

## Team Join Flow

### How a player joins a team:

1. Player gets invite code from coach
2. Player enters code → system looks up `golf_teams.invite_code`
3. Creates `golf_team_members` row: `{ team_id, player_id, status: 'active' }`

### Alternative: Join Request Flow
1. Player submits join request → `golf_team_join_requests` row created with status='pending'
2. Coach approves → status changes to 'approved'
3. System creates `golf_team_members` row with status='active'

### Verify join flow integrity:
```sql
-- Players with inactive or missing memberships
SELECT gp.id, gp.first_name, gp.last_name,
       gtm.team_id, gtm.status AS membership_status,
       gt.name AS team_name
FROM golf_players gp
LEFT JOIN golf_team_members gtm ON gtm.player_id = gp.id
LEFT JOIN golf_teams gt ON gt.id = gtm.team_id
WHERE gtm.id IS NULL OR gtm.status != 'active'
LIMIT 50;

-- Pending join requests (stuck)
SELECT tjr.id, tjr.request_status, tjr.requested_at,
       gp.first_name, gp.last_name,
       gt.name AS team_name
FROM golf_team_join_requests tjr
JOIN golf_players gp ON gp.id = tjr.player_id
JOIN golf_teams gt ON gt.id = tjr.team_id
WHERE tjr.request_status = 'pending'
  AND tjr.requested_at < NOW() - INTERVAL '7 days';

-- Duplicate team memberships
SELECT player_id, team_id, count(*) AS dupes
FROM golf_team_members
WHERE status = 'active'
GROUP BY player_id, team_id
HAVING count(*) > 1;
```

---

## Round Recording Flow

### Complete round data chain:
```
golf_rounds (1 per round per player)
  └→ golf_holes (1-18 per round)
      └→ golf_shots (N per hole, optional shot-by-shot tracking)
```

### Round completion triggers:
1. `calculate_round_stats()` aggregates holes → updates round totals
2. Stats cache should be invalidated/recalculated
3. CoachHelm round review may be generated
4. Qualifier entry updated if round is qualifier type

### Verify round data integrity:
```sql
-- Completed rounds with NULL totals (calc failed)
SELECT id, player_id, round_date, total_score, total_putts, status
FROM golf_rounds
WHERE status = 'completed'
  AND (total_score IS NULL OR total_putts IS NULL)
LIMIT 50;

-- Rounds where hole count != expected
SELECT gr.id, gr.round_date, gr.total_score,
  (SELECT count(*) FROM golf_holes gh WHERE gh.round_id = gr.id) AS hole_count
FROM golf_rounds gr
WHERE gr.status = 'completed'
  AND (SELECT count(*) FROM golf_holes gh WHERE gh.round_id = gr.id) NOT IN (9, 18)
LIMIT 50;

-- Rounds where SUM(holes.score) != round.total_score
SELECT gr.id, gr.total_score AS round_total,
  (SELECT SUM(gh.score) FROM golf_holes gh WHERE gh.round_id = gr.id) AS holes_sum,
  gr.total_score - COALESCE((SELECT SUM(gh.score) FROM golf_holes gh WHERE gh.round_id = gr.id), 0) AS diff
FROM golf_rounds gr
WHERE gr.status = 'completed'
  AND gr.total_score IS NOT NULL
  AND gr.total_score != COALESCE((SELECT SUM(gh.score) FROM golf_holes gh WHERE gh.round_id = gr.id), 0)
LIMIT 50;
```

---

## Events & Calendar

### Event lifecycle:
`draft → confirmed → completed` (or `cancelled`)

### RSVP system:
- Events with `requires_rsvp = true` expect RSVPs from team members
- RSVP counts on `golf_events` are maintained by trigger `update_event_rsvp_counts()`
- Counts: rsvp_confirmed_count, rsvp_maybe_count, rsvp_declined_count, rsvp_pending_count

### Verify event data:
```sql
-- Events with mismatched RSVP counts
SELECT ge.id, ge.title,
  ge.rsvp_confirmed_count AS cached_confirmed,
  (SELECT count(*) FROM golf_event_rsvps r WHERE r.event_id = ge.id AND r.response = 'confirmed') AS actual_confirmed,
  ge.rsvp_total_count AS cached_total,
  (SELECT count(*) FROM golf_event_rsvps r WHERE r.event_id = ge.id) AS actual_total
FROM golf_events ge
WHERE ge.requires_rsvp = true
  AND (
    ge.rsvp_confirmed_count != (SELECT count(*) FROM golf_event_rsvps r WHERE r.event_id = ge.id AND r.response = 'confirmed')
    OR ge.rsvp_total_count != (SELECT count(*) FROM golf_event_rsvps r WHERE r.event_id = ge.id)
  )
LIMIT 50;

-- Events without a valid team
SELECT ge.id, ge.title, ge.team_id
FROM golf_events ge
LEFT JOIN golf_teams gt ON gt.id = ge.team_id
WHERE gt.id IS NULL
LIMIT 50;
```

---

## Qualifiers

### Structure:
```
golf_qualifiers (the qualifier event)
  └→ golf_qualifier_entries (one per participating player)
      └→ golf_rounds (linked via qualifier_id, type='qualifier')
```

### Leaderboard calculation:
`update_qualifier_leaderboard(qualifier_id)` aggregates rounds into entries,
ranks by total_to_par, handles ties.

### Verify qualifier integrity:
```sql
-- Entries for non-existent qualifiers
SELECT qe.id, qe.qualifier_id, qe.player_id
FROM golf_qualifier_entries qe
LEFT JOIN golf_qualifiers q ON q.id = qe.qualifier_id
WHERE q.id IS NULL
LIMIT 50;

-- Entries with stale scores (entry total != sum of qualifying rounds)
SELECT qe.id, qe.qualifier_id, qe.player_id, qe.total_score AS entry_score,
  (SELECT SUM(gr.total_score) FROM golf_rounds gr
   WHERE gr.qualifier_id = qe.qualifier_id AND gr.player_id = qe.player_id
   AND gr.status = 'completed') AS actual_total
FROM golf_qualifier_entries qe
WHERE qe.total_score IS NOT NULL
  AND qe.total_score != COALESCE(
    (SELECT SUM(gr.total_score) FROM golf_rounds gr
     WHERE gr.qualifier_id = qe.qualifier_id AND gr.player_id = qe.player_id
     AND gr.status = 'completed'), 0)
LIMIT 50;
```

---

## Communication

### Messaging rules:
- `golf_conversations` scoped to team_id
- `golf_conversation_participants` controls who can see a conversation
- `golf_messages` scoped via conversation → participants chain
- Coach can broadcast to entire team (creates conversation with all members)

### Verify messaging:
```sql
-- Conversations without any participants
SELECT gc.id, gc.title, gc.team_id
FROM golf_conversations gc
LEFT JOIN golf_conversation_participants gcp ON gcp.conversation_id = gc.id
WHERE gcp.id IS NULL
LIMIT 50;

-- Messages from users not in the conversation
SELECT gm.id, gm.conversation_id, gm.sender_id
FROM golf_messages gm
LEFT JOIN golf_conversation_participants gcp
  ON gcp.conversation_id = gm.conversation_id AND gcp.user_id = gm.sender_id
WHERE gcp.id IS NULL
LIMIT 50;
```

---

## CoachHelm AI

### Philosophy settings:
Each coach should have ONE `golf_coach_philosophy` row (1:1 with golf_coaches).
Missing = CoachHelm uses defaults.

### Insights chain:
```
golf_rounds (completed)
  → golf_round_reviews (AI analysis per round)
  → golf_player_insights (alerts surfaced to player)
  → golf_coach_insights (alerts surfaced to coach)
  → golf_patterns_v2 (detected patterns)
```

### Verify CoachHelm data:
```sql
-- Coaches without philosophy settings
SELECT gc.id, gc.full_name
FROM golf_coaches gc
LEFT JOIN golf_coach_philosophy gcp ON gcp.coach_id = gc.id
WHERE gcp.id IS NULL;

-- Completed rounds without reviews
SELECT gr.id, gr.player_id, gr.round_date, gr.total_score
FROM golf_rounds gr
LEFT JOIN golf_round_reviews grr ON grr.round_id = gr.id
WHERE gr.status = 'completed'
  AND grr.id IS NULL
ORDER BY gr.round_date DESC
LIMIT 50;
```

---

## Diagnostic Queries

### Full user audit (run for a specific user email):
```sql
-- Replace 'user@email.com' with actual email
WITH target_user AS (
  SELECT id FROM users WHERE email = 'user@email.com'
)
SELECT
  u.id AS user_id, u.email, u.role,
  gc.id AS coach_id, gc.organization_id, gc.team_id AS coach_team_id,
  gc.onboarding_completed AS coach_onboarded,
  gp.id AS player_id,
  (SELECT gtm.team_id FROM golf_team_members gtm WHERE gtm.player_id = gp.id AND gtm.status = 'active' LIMIT 1) AS player_team_id,
  gp.onboarding_completed AS player_onboarded,
  gt_coach.id AS coach_resolved_team_id,
  gt_coach.name AS coach_team_name,
  (SELECT count(*) FROM golf_team_members gtm WHERE gtm.player_id = gp.id AND gtm.status = 'active') AS player_active_memberships,
  (SELECT count(*) FROM golf_rounds gr WHERE gr.player_id = gp.id) AS player_rounds,
  (SELECT count(*) FROM golf_rounds gr WHERE gr.player_id IN (
    SELECT gp2.id FROM golf_players gp2
    JOIN golf_team_members gtm2 ON gtm2.player_id = gp2.id AND gtm2.status = 'active'
    WHERE gtm2.team_id = gt_coach.id
  )) AS coach_visible_rounds
FROM users u
LEFT JOIN golf_coaches gc ON gc.user_id = u.id
LEFT JOIN golf_players gp ON gp.user_id = u.id
LEFT JOIN golf_teams gt_coach ON gt_coach.organization_id = gc.organization_id
WHERE u.id = (SELECT id FROM target_user);
```
