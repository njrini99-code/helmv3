# Supabase Database Performance Report
## Helm Sports Labs - BaseballHelm & GolfHelm

**Generated:** 2026-01-12
**Database:** Supabase PostgreSQL
**Total Tables Analyzed:** 50+

---

## Executive Summary

The Helm Sports Labs database is generally well-structured with good indexing practices on most foreign keys. However, several areas require attention:

| Category | Severity | Issues Found |
|----------|----------|--------------|
| Missing FK Indexes | Medium | 13 columns |
| Duplicate Indexes | Low | 60+ pairs |
| Complex RLS Policies | High | 10 policies with nested subqueries |
| N+1 Query Patterns | High | 2 critical locations |
| Unused Indexes | Low | 30 indexes |
| Sequential Scan Issues | Medium | 1 table (golf_shots) |

---

## 1. Table Size Analysis

### Largest Tables (by total size including indexes)

| Table | Total Size | Row Count | Notes |
|-------|-----------|-----------|-------|
| `players` | 1,376 KB | 761 | Main baseball players table |
| `team_members` | 488 KB | 820 | Player-team relationships |
| `player_settings` | 376 KB | 761 | Privacy settings |
| `golf_shots` | 288 KB | 154 | Shot-level tracking |
| `organizations` | 280 KB | 114 | Schools/programs |
| `golf_events` | 240 KB | 17 | Calendar events |
| `teams` | 200 KB | 81 | Baseball teams |

### Tables with High Dead Row Ratios

| Table | Live Rows | Dead Rows | Recommendation |
|-------|-----------|-----------|----------------|
| `golf_holes` | 36 | 54 | Consider VACUUM ANALYZE |
| `golf_teams` | 1 | 13 | Consider VACUUM ANALYZE |
| `organizations` | 114 | 40 | Consider VACUUM ANALYZE |
| `users` | 7 | 32 | Consider VACUUM ANALYZE |

---

## 2. Missing Foreign Key Indexes

**Priority: MEDIUM**

The following foreign key columns lack indexes, which can cause slow JOIN operations and RLS policy evaluation:

```sql
-- RECOMMENDED: Add these indexes
CREATE INDEX CONCURRENTLY idx_golf_academic_exclusions_created_by
  ON golf_academic_exclusions(created_by);

CREATE INDEX CONCURRENTLY idx_golf_availability_polls_created_by
  ON golf_availability_polls(created_by);

CREATE INDEX CONCURRENTLY idx_golf_availability_polls_created_event
  ON golf_availability_polls(created_event_id);

CREATE INDEX CONCURRENTLY idx_golf_coach_insights_team_id
  ON golf_coach_insights(team_id);

CREATE INDEX CONCURRENTLY idx_golf_event_attendance_checked_in_by
  ON golf_event_attendance(checked_in_by);

CREATE INDEX CONCURRENTLY idx_golf_event_attendance_no_show_marked_by
  ON golf_event_attendance(no_show_marked_by);

CREATE INDEX CONCURRENTLY idx_golf_event_status_log_changed_by
  ON golf_event_status_log(changed_by);

CREATE INDEX CONCURRENTLY idx_golf_events_cancelled_by
  ON golf_events(cancelled_by);

CREATE INDEX CONCURRENTLY idx_golf_events_conflict_override_by
  ON golf_events(conflict_override_by);

CREATE INDEX CONCURRENTLY idx_golf_insight_generation_log_player
  ON golf_insight_generation_log(player_id);

CREATE INDEX CONCURRENTLY idx_golf_player_focus_areas_coach
  ON golf_player_focus_areas(coach_id);

CREATE INDEX CONCURRENTLY idx_golf_predictions_target_round
  ON golf_predictions(target_round_id);

CREATE INDEX CONCURRENTLY idx_golf_round_reviews_linked_focus
  ON golf_round_reviews(linked_focus_area_id);
```

---

## 3. Duplicate Indexes (Wasted Storage)

**Priority: LOW**

Found **60+ duplicate index pairs** - these waste storage and slow down INSERT/UPDATE operations. Here are the most impactful ones to remove:

### High-Impact Duplicates to Remove

```sql
-- Remove these duplicate indexes (keep the unique constraint versions)

-- players table (288 KB savings)
DROP INDEX CONCURRENTLY idx_players_full_name_trgm;  -- 288 KB, never used

-- organizations table (128 KB savings)
DROP INDEX CONCURRENTLY idx_organizations_name_trgm;  -- 128 KB, never used

-- players table (128 KB savings)
DROP INDEX CONCURRENTLY idx_players_search;  -- 128 KB, never used

-- golf_teams table (duplicate invite_code indexes)
DROP INDEX CONCURRENTLY idx_golf_teams_invite;  -- duplicate of idx_golf_teams_invite_code

-- golf_coaches table (duplicate user_id indexes)
DROP INDEX CONCURRENTLY idx_golf_coaches_user_id;  -- duplicate of golf_coaches_user_id_key

-- golf_coachhelm_settings (duplicate user_id indexes)
DROP INDEX CONCURRENTLY idx_coachhelm_settings_user;  -- duplicate

-- golf_round_reviews (duplicate round_id indexes)
DROP INDEX CONCURRENTLY idx_round_reviews_round;  -- duplicate of idx_golf_round_reviews_round

-- team_members table
DROP INDEX CONCURRENTLY idx_team_members_team;  -- duplicate
DROP INDEX CONCURRENTLY idx_team_members_player;  -- duplicate
```

**Estimated Storage Savings:** ~600 KB+ (will grow with data)

---

## 4. Complex RLS Policies (Performance Risk)

**Priority: HIGH**

These RLS policies contain nested EXISTS subqueries that execute on every row access. At scale, they will cause significant performance degradation:

### Critical Policies to Optimize

#### 1. `players` - "Coaches can update team players"
- **Complexity:** Nested EXISTS with 3-table JOIN + OR with another nested EXISTS
- **Impact:** Affects all UPDATE operations on players table (761 rows)
- **Recommendation:** Create a security definer function to cache coach-player relationships

```sql
-- Example optimization: Create helper function
CREATE OR REPLACE FUNCTION can_coach_update_player(player_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM team_members tm
    JOIN team_coach_staff tcs ON tcs.team_id = tm.team_id
    JOIN coaches c ON c.id = tcs.coach_id
    WHERE tm.player_id = player_uuid
      AND c.user_id = auth.uid()
      AND tm.status = 'active'
  );
END;
$$;
```

#### 2. `organizations` - "organizations_select_authenticated"
- **Complexity:** 4-way UNION with multiple JOINs
- **Impact:** Affects all SELECT operations on organizations (114 rows)
- **Recommendation:** Denormalize user's organization IDs into a materialized view or use RPC

#### 3. `approach_miss_details` & `putt_details` - SELECT policies
- **Complexity:** 4-table JOIN with nested EXISTS
- **Impact:** Affects shot detail queries
- **Recommendation:** Add composite index on the join path

#### 4. `golf_event_status_log` - SELECT policy
- **Complexity:** IN subquery with nested IN subqueries (3 levels deep)
- **Recommendation:** Rewrite using EXISTS or create helper function

---

## 5. N+1 Query Patterns in Codebase

**Priority: HIGH**

Found critical N+1 patterns that will cause performance issues at scale:

### Location 1: `/src/hooks/use-messages.ts` (Lines 139-180)

```typescript
// PROBLEM: For each conversation, makes 3 separate queries
const conversationsWithMessages = await Promise.all(
  conversationsData.map(async (conv) => {
    // Query 1: Get last message
    const { data: lastMessage } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conv.id)
      .order('sent_at', { ascending: false })
      .limit(1)
      .single();

    // Query 2: Get participant
    const { data: participant } = await supabase
      .from('conversation_participants')
      .select('last_read_at')
      .eq('conversation_id', conv.id)
      .eq('user_id', user.id)
      .single();

    // Query 3: Get unread count
    const { count: unreadCount } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conv.id)
      .neq('sender_id', user.id)
      .gt('sent_at', participant?.last_read_at || '1970-01-01');
    ...
  })
);
```

**Impact:** With 10 conversations = 30 queries. With 100 conversations = 300 queries.

**Recommended Fix:** Use a database function or single query with lateral joins:

```sql
-- Create an RPC function
CREATE OR REPLACE FUNCTION get_conversations_with_meta(user_uuid UUID)
RETURNS TABLE (
  conversation_id UUID,
  updated_at TIMESTAMPTZ,
  last_message JSONB,
  unread_count BIGINT,
  other_participant JSONB
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id,
    c.updated_at,
    (SELECT to_jsonb(m) FROM messages m
     WHERE m.conversation_id = c.id
     ORDER BY sent_at DESC LIMIT 1),
    (SELECT count(*) FROM messages m
     WHERE m.conversation_id = c.id
       AND m.sender_id != user_uuid
       AND m.sent_at > COALESCE(cp.last_read_at, '1970-01-01')),
    -- other_participant logic here
    NULL::JSONB
  FROM conversations c
  JOIN conversation_participants cp ON cp.conversation_id = c.id
  WHERE cp.user_id = user_uuid
  ORDER BY c.updated_at DESC;
$$;
```

### Location 2: `/src/hooks/golf/use-golf-messages.ts` (Lines 154-220)

Same pattern as above but even worse - makes **5 queries per conversation** (adds coach/player lookup).

---

## 6. Sequential Scan Analysis

**Priority: MEDIUM**

### Tables with High Sequential Scan Ratios

| Table | Seq Scans | Index Scans | Seq Scan % | Row Count |
|-------|-----------|-------------|------------|-----------|
| `golf_shots` | 133 | 63 | **67.86%** | 154 |
| `organizations` | 92 | 499 | 15.57% | 114 |
| `players` | 789 | 6,224 | 11.25% | 761 |

### Recommendation for `golf_shots`

The high sequential scan ratio (67.86%) indicates missing indexes for common query patterns:

```sql
-- Check what queries are causing seq scans
-- Consider adding these indexes based on common access patterns:

-- If filtering by shot_type frequently
CREATE INDEX CONCURRENTLY idx_golf_shots_type_round
  ON golf_shots(shot_type, round_id);

-- If filtering by club_type
CREATE INDEX CONCURRENTLY idx_golf_shots_club_round
  ON golf_shots(club_type, round_id);

-- If doing hole-level aggregations
CREATE INDEX CONCURRENTLY idx_golf_shots_round_hole
  ON golf_shots(round_id, hole_number) INCLUDE (shot_type, club_type);
```

---

## 7. Unused Indexes

**Priority: LOW**

These indexes have never been used (0 scans) and can potentially be dropped:

| Table | Index Name | Size |
|-------|------------|------|
| `players` | `idx_players_full_name_trgm` | 288 KB |
| `organizations` | `idx_organizations_name_trgm` | 128 KB |
| `players` | `idx_players_search` | 128 KB |
| `team_members` | `team_members_team_id_player_id_key` | 72 KB |
| `player_settings` | `idx_player_settings_discoverable` | 56 KB |
| `players` | `idx_players_position` | 40 KB |
| `golf_shots` | `golf_shots_round_id_hole_number_shot_number_key` | 32 KB |

**Note:** Some may be unused due to low traffic. Monitor before dropping in production.

---

## 8. Index Recommendations Summary

### Must-Add Indexes (Missing FK indexes)
```sql
-- Run these in a migration
CREATE INDEX CONCURRENTLY idx_golf_coach_insights_team_id ON golf_coach_insights(team_id);
CREATE INDEX CONCURRENTLY idx_golf_insight_generation_log_player ON golf_insight_generation_log(player_id);
CREATE INDEX CONCURRENTLY idx_golf_player_focus_areas_coach ON golf_player_focus_areas(coach_id);
CREATE INDEX CONCURRENTLY idx_golf_predictions_target_round ON golf_predictions(target_round_id);
CREATE INDEX CONCURRENTLY idx_golf_round_reviews_linked_focus ON golf_round_reviews(linked_focus_area_id);
```

### Should-Add Indexes (Query optimization)
```sql
-- Composite indexes for common query patterns
CREATE INDEX CONCURRENTLY idx_messages_conversation_sent
  ON messages(conversation_id, sent_at DESC);

CREATE INDEX CONCURRENTLY idx_golf_events_team_status_date
  ON golf_events(team_id, status, start_date);

CREATE INDEX CONCURRENTLY idx_players_recruiting_grad_year
  ON players(recruiting_activated, grad_year) WHERE recruiting_activated = true;
```

### Can-Drop Indexes (Duplicates/Unused)
```sql
-- Free up storage (run after verifying no impact)
DROP INDEX CONCURRENTLY idx_players_full_name_trgm;
DROP INDEX CONCURRENTLY idx_organizations_name_trgm;
DROP INDEX CONCURRENTLY idx_players_search;
DROP INDEX CONCURRENTLY idx_golf_teams_invite;
DROP INDEX CONCURRENTLY idx_coachhelm_settings_user;
```

---

## 9. Action Items by Priority

### Immediate (This Sprint)

1. **Fix N+1 in messaging hooks** - Create database function `get_conversations_with_meta()`
2. **Add missing FK indexes** - 13 indexes needed (see Section 2)
3. **Vacuum tables with high dead rows** - `golf_holes`, `golf_teams`, `organizations`

### Short-Term (Next 2 Sprints)

4. **Optimize critical RLS policies** - Create helper functions for `players` and `organizations`
5. **Add composite indexes** for common query patterns
6. **Review and drop duplicate indexes** - Free ~600KB+ storage

### Long-Term (Quarterly)

7. **Set up pg_stat_statements** monitoring to identify slow queries
8. **Implement query result caching** for frequently accessed data
9. **Consider read replicas** for analytics queries if growth continues
10. **Review RLS policies** when tables exceed 10K rows

---

## 10. Monitoring Recommendations

### Enable These PostgreSQL Extensions (Already Available)
```sql
-- Already installed: pg_stat_statements
-- Use it to find slow queries:
SELECT
  query,
  calls,
  mean_time,
  total_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 20;
```

### Key Metrics to Monitor

| Metric | Current | Warning Threshold | Critical Threshold |
|--------|---------|-------------------|-------------------|
| Seq scan ratio on `players` | 11.25% | 20% | 40% |
| Seq scan ratio on `golf_shots` | 67.86% | 50% | 80% |
| Index bloat | Unknown | 20% | 40% |
| Dead tuple ratio | Variable | 10% | 30% |

---

## Appendix: Full Missing Index List

| Table | Column | Foreign Table |
|-------|--------|---------------|
| golf_academic_exclusions | created_by | golf_coaches |
| golf_availability_polls | created_by | golf_coaches |
| golf_availability_polls | created_event_id | golf_events |
| golf_coach_insights | team_id | golf_teams |
| golf_event_attendance | checked_in_by | golf_coaches |
| golf_event_attendance | no_show_marked_by | golf_coaches |
| golf_event_status_log | changed_by | golf_coaches |
| golf_events | cancelled_by | golf_coaches |
| golf_events | conflict_override_by | golf_coaches |
| golf_insight_generation_log | player_id | golf_players |
| golf_player_focus_areas | coach_id | golf_coaches |
| golf_predictions | target_round_id | golf_rounds |
| golf_round_reviews | linked_focus_area_id | golf_player_focus_areas |

---

*Report generated by Claude Code - SQL Database Performance Analysis*
