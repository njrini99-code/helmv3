<!--
STATUS: STALE
DATE: 2026-07-10
SUPERSEDED BY / WHY: Dated 2026-01-25 (baseball coach dashboard, scored 62/100). Superseded by docs/audits/BASEBALLHELM_CANONICAL_SPEC.md and docs/audits/PRODUCTION_READINESS_MISSION_2026-07-09.md, the current sources of truth for BaseballHelm state.
KEPT FOR HISTORY -- do not delete this file.
-->

# BaseballHelm Coach Dashboard - Production Readiness Audit Report

> **Audit Date:** January 25, 2026
> **Auditor:** Claude Opus 4.5 (automated audit agents)
> **Project:** Helm Sports Labs - BaseballHelm
> **Scope:** All coach-facing features and infrastructure

---

## Executive Summary

### Overall Production Readiness Score: **62/100**

| Category | Score | Status |
|----------|-------|--------|
| Page Completeness | 95/100 | PASS |
| UI/UX Compliance | 90/100 | PASS |
| Authentication & Authorization | 45/100 | **FAIL** |
| RLS Security | 35/100 | **CRITICAL** |
| Server Actions Security | 40/100 | **FAIL** |
| Database Schema | 70/100 | NEEDS WORK |
| Performance (Hooks/Queries) | 75/100 | PASS |
| Code Quality | 80/100 | PASS |

### Verdict: **NOT PRODUCTION READY**

The platform has excellent frontend implementation but **critical security vulnerabilities** in server actions and RLS policies that must be fixed before any production deployment.

---

## Critical Blockers (MUST FIX BEFORE LAUNCH)

### 1. RLS Policy Table Reference Mismatch

**Severity:** CRITICAL
**Risk:** Complete data exposure across coaches
**Effort:** 4-6 hours

**Issue:** Migration 034 defines RLS policies for tables like `watchlists`, `coaches`, `teams`, etc., but Migration 036 renamed all these tables to `baseball_watchlists`, `baseball_coaches`, `baseball_teams`. The RLS policies may not be attached to the renamed tables.

**Impact:**
- All `baseball_*` tables may have NO RLS protection
- Any authenticated user could read/write any coach's data
- Complete HIPAA/FERPA violation risk

**Fix Required:**
```sql
-- Create migration: 060_fix_baseball_rls_policies.sql
-- Re-apply all policies with correct baseball_* table names
DROP POLICY IF EXISTS "watchlists_all_coach" ON baseball_watchlists;
CREATE POLICY "baseball_watchlists_all_coach"
ON baseball_watchlists FOR ALL TO authenticated
USING (coach_id IN (SELECT id FROM baseball_coaches WHERE user_id = auth.uid()));
-- ... repeat for all 16+ baseball tables
```

**Verification Query:**
```sql
SELECT tablename, policyname FROM pg_policies
WHERE tablename LIKE 'baseball_%' ORDER BY tablename;
```

---

### 2. IDOR Vulnerability in Calendar Actions

**Severity:** CRITICAL
**Risk:** Data tampering/deletion
**Effort:** 1-2 hours
**File:** `src/app/baseball/actions/calendar.ts:94-161`

**Issue:** `updateBaseballEvent` and `deleteBaseballEvent` verify authentication but do NOT verify the user owns the event. Any authenticated user can modify or delete any calendar event by ID.

**Current Code (Vulnerable):**
```typescript
export async function updateBaseballEvent(eventId: string, data: UpdateEventInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  // MISSING: Verify user owns this event!
  const { error } = await supabase
    .from('baseball_events')
    .update(data)
    .eq('id', eventId);
}
```

**Fix Required:**
```typescript
export async function updateBaseballEvent(eventId: string, data: UpdateEventInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  // Get coach ID for current user
  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!coach) return { error: 'Not a coach' };

  // Verify ownership before update
  const { error } = await supabase
    .from('baseball_events')
    .update(data)
    .eq('id', eventId)
    .eq('created_by', coach.id); // ADD OWNERSHIP CHECK

  if (error) return { error: error.message };
  return { success: true };
}
```

---

### 3. IDOR Vulnerability in Team Join

**Severity:** CRITICAL
**Risk:** Unauthorized roster manipulation
**Effort:** 1-2 hours
**File:** `src/app/baseball/actions/teams.ts:226-304`

**Issue:** `joinTeam(playerId, teamId)` does not verify the caller owns the playerId. An attacker can add any player to any team.

**Fix Required:**
```typescript
export async function joinTeam(playerId: string, teamId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  // ADD: Verify caller owns this player ID
  const { data: player } = await supabase
    .from('baseball_players')
    .select('id')
    .eq('id', playerId)
    .eq('user_id', user.id)
    .single();

  if (!player) return { error: 'Not your player profile' };

  // ... rest of function
}
```

---

### 4. Missing Authentication in Stats Functions

**Severity:** CRITICAL
**Risk:** PII exposure
**Effort:** 1-2 hours
**File:** `src/app/baseball/actions/stats.ts:393-449`

**Issue:** `getPlayerStats`, `getRecentUploads`, `recalculatePlayerAggregates` have NO authentication checks. Player performance data is publicly accessible.

**Fix Required:** Add `requireAuth()` or `requireCoach()` wrapper to all functions.

---

### 5. Missing Authentication in Discover Functions

**Severity:** HIGH
**Risk:** Data leakage
**Effort:** 1-2 hours
**File:** `src/app/baseball/actions/discover.ts`

**Issue:** `getWatchlistIds(coachId)` has no auth check - anyone can query any coach's watchlist. While player discovery may intentionally be public, watchlist data should be private.

**Fix Required:**
```typescript
export async function getWatchlistIds(coachId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  // Verify this is the user's own coach record
  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('id', coachId)
    .eq('user_id', user.id)
    .single();

  if (!coach) return { error: 'Forbidden' };

  // ... rest of function
}
```

---

### 6. Missing Authentication in Insights Functions

**Severity:** HIGH
**Risk:** Data manipulation
**Effort:** 2 hours
**File:** `src/app/baseball/actions/insights.ts:31-403`

**Issue:** Multiple functions accept `coachId` or `teamId` as parameters without verifying the caller owns them:
- `generateTeamInsights(teamId, coachId)` - any user can trigger for any coach
- `dismissInsight(insightId)` - any user can dismiss any insight
- `markInsightAddressed(insightId)` - any user can mark as addressed

**Fix Required:** Use `requireCoach()` pattern and verify ownership.

---

## High Priority Issues (SHOULD FIX BEFORE LAUNCH)

### 7. Overly Permissive Video SELECT Policy

**Severity:** HIGH
**Risk:** Privacy violation
**Effort:** 1 hour

**Issue:** Current policy allows ANY authenticated user to view ALL videos:
```sql
CREATE POLICY "videos_select_public" ON videos FOR SELECT TO authenticated
USING (true);
```

**Fix Required:**
```sql
CREATE POLICY "baseball_videos_select_activated"
ON baseball_videos FOR SELECT TO authenticated
USING (
  -- Own videos
  player_id IN (SELECT id FROM baseball_players WHERE user_id = auth.uid())
  OR
  -- Coaches can only view videos of players with recruiting activated
  (
    auth.uid() IN (SELECT user_id FROM baseball_coaches)
    AND player_id IN (SELECT id FROM baseball_players WHERE recruiting_activated = true)
  )
);
```

---

### 8. Console.error Statements in Production Code

**Severity:** HIGH
**Risk:** Information disclosure, unprofessional
**Effort:** 1-2 hours

**Affected Files (9 instances):**
- `src/app/baseball/(dashboard)/dashboard/discover/page.tsx` - 4 instances
- `src/app/baseball/(dashboard)/dashboard/pipeline/page.tsx` - 1 instance
- `src/app/baseball/(dashboard)/dashboard/compare/page.tsx` - 2 instances
- `src/app/baseball/(dashboard)/dashboard/roster/page.tsx` - 1 instance
- `src/app/baseball/(dashboard)/dashboard/command-center/error.tsx` - 1 instance

**Fix Required:** Replace with proper error logging:
```typescript
import { logError } from '@/lib/error-logging';
// Instead of: console.error('Error:', err);
logError(err, { component: 'DiscoverPage', action: 'fetchPlayers' }, 'medium');
```

---

### 9. N+1 Query in Unread Count Hook

**Severity:** HIGH
**Risk:** Performance degradation
**Effort:** 1 hour
**File:** `src/hooks/use-unread-count.ts:35-44`

**Issue:** Loop executes separate query for each conversation:
```typescript
for (const participant of participantData) {
  const { count } = await supabase
    .from('baseball_messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', participant.conversation_id)
    // ...
}
```

**Fix Required:**
```typescript
const conversationIds = participantData.map(p => p.conversation_id);
const { count } = await supabase
  .from('baseball_messages')
  .select('*', { count: 'exact', head: true })
  .in('conversation_id', conversationIds)
  .neq('sender_id', user.id);
```

---

### 10. Missing updated_at Triggers

**Severity:** MEDIUM
**Risk:** Data integrity, audit trail gaps
**Effort:** 2 hours

**Affected Tables:**
- `baseball_team_members` - No updated_at column or trigger
- `baseball_team_coach_staff` - No updated_at column or trigger
- `baseball_messages` - No updated_at column

**Fix Required:**
```sql
-- Migration: 061_add_missing_updated_at.sql
ALTER TABLE baseball_team_members ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE TRIGGER update_baseball_team_members_updated_at
  BEFORE UPDATE ON baseball_team_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Repeat for other tables
```

---

### 11. Missing Zod Validation in Server Actions

**Severity:** MEDIUM
**Risk:** Invalid data, runtime errors
**Effort:** 4-6 hours

**Affected Actions:**
- `calendar.ts` - No schema validation for CreateEventInput/UpdateEventInput
- `lineups.ts` - No schema validation for LineupPosition array
- `stats.ts` - No schema validation for CSV upload
- `insights.ts` - No schema validation
- `engagement.ts` - No schema validation for playerId
- `interests.ts` - No schema validation
- `philosophy.ts` - No centralized Zod schema
- `teams.ts` - Missing validation in join functions

**Good Example (from watchlist.ts):**
```typescript
const WatchlistSchemas = {
  addToWatchlist: z.object({
    playerId: z.string().uuid(),
    notes: z.string().max(1000).optional(),
    pipelineStage: z.enum(['watchlist', 'high_priority', 'offer_extended', 'committed', 'uninterested']).optional()
  }),
  // ...
};
```

---

## Medium Priority Issues (CAN FIX POST-LAUNCH)

### 12. Program Page Missing Loading State

**Severity:** MEDIUM
**Effort:** 30 minutes
**File:** Missing `src/app/baseball/(dashboard)/dashboard/program/loading.tsx`

**Fix Required:** Create loading.tsx with skeleton loader.

---

### 13. SELECT * Anti-Pattern in Hooks

**Severity:** MEDIUM
**Risk:** Unnecessary data transfer
**Effort:** 2 hours

**Affected Files (8 instances):**
- `src/hooks/use-players.ts:28,72`
- `src/hooks/use-notifications.ts:33`
- `src/hooks/use-auth.ts:26,37`
- `src/hooks/use-messages-subscription.ts:45,71`
- `src/lib/queries/teams.ts:79`

**Fix:** Specify explicit columns in all SELECT queries.

---

### 14. Team Invitations SELECT Too Broad

**Severity:** MEDIUM
**Risk:** Information disclosure
**Effort:** 1 hour

**Issue:** Any authenticated user can see ALL active team invitations.

**Fix:** Restrict to team coaches only.

---

### 15. Missing DELETE Policies

**Severity:** MEDIUM
**Effort:** 1 hour

**Affected Tables:**
- `baseball_messages` - Messages should NOT be deletable
- `baseball_conversations` - Only by participants
- `baseball_player_engagement_events` - Should not be deletable

---

## Low Priority Issues (NICE-TO-HAVE)

### 16. Type Safety: RPC Function Casts

**Severity:** LOW
**Effort:** 2 hours

4 instances of `(supabase.rpc as any)` in:
- `src/hooks/use-messages.ts:104`
- `src/hooks/golf/use-golf-messages.ts:329`
- `src/hooks/golf/use-task-realtime.ts:493,555`

**Fix:** Add proper type definitions for RPC functions.

---

### 17. Deprecated college_id Column

**Severity:** LOW
**Effort:** 1 hour

**Issue:** `baseball_coaches` still has `college_id` FK to deprecated `colleges` table.

**Fix:** Remove column after verifying no code references it.

---

### 18. Missing Indexes

**Severity:** LOW
**Risk:** Performance at scale
**Effort:** 1 hour

**Recommended Indexes:**
```sql
CREATE INDEX idx_baseball_messages_created_at ON baseball_messages(created_at);
CREATE INDEX idx_baseball_conversations_updated_at ON baseball_conversations(updated_at);
CREATE INDEX idx_baseball_team_members_status ON baseball_team_members(status);
CREATE INDEX idx_baseball_watchlists_updated_at ON baseball_watchlists(updated_at);
CREATE INDEX idx_baseball_events_start_end ON baseball_events(start_time, end_time);
```

---

## Summary: Estimated Effort

| Priority | Issue Count | Estimated Hours |
|----------|-------------|-----------------|
| Critical | 6 | 12-18 hours |
| High | 5 | 8-12 hours |
| Medium | 4 | 6-8 hours |
| Low | 3 | 4-6 hours |
| **TOTAL** | **18** | **30-44 hours** |

---

## Recommended Fix Order

### Phase 1: Critical Security (Before ANY Production Traffic)
1. Verify RLS policies are attached to baseball_* tables (30 min)
2. Fix RLS policies with correct table references (4-6 hours)
3. Fix IDOR in calendar actions (1 hour)
4. Fix IDOR in team join (1 hour)
5. Add auth to stats functions (1 hour)
6. Add auth to discover watchlist function (30 min)
7. Add auth to insights functions (2 hours)

### Phase 2: High Priority (Before Public Launch)
8. Fix overly permissive video policy (1 hour)
9. Replace console.error with proper logging (2 hours)
10. Fix N+1 query in unread count (1 hour)
11. Add missing updated_at triggers (2 hours)
12. Add Zod validation to server actions (4-6 hours)

### Phase 3: Post-Launch Improvements
13. Add Program page loading state (30 min)
14. Remove SELECT * anti-pattern (2 hours)
15. Restrict team invitation visibility (1 hour)
16. Add missing DELETE policies (1 hour)
17. Fix RPC type casts (2 hours)
18. Remove deprecated columns (1 hour)
19. Add performance indexes (1 hour)

---

## Positive Findings

### What's Working Well

1. **All 12 Coach Dashboard Pages Exist** - 100% feature completeness
2. **Excellent Error Boundaries** - All pages have dedicated error.tsx
3. **Consistent Loading States** - 11/12 pages have loading.tsx
4. **Design System Compliance** - Proper glassmorphism usage per guidelines
5. **Well-Secured Auth Actions** - auth.ts has rate limiting, lockout, IP tracking
6. **Well-Secured Watchlist Actions** - Uses Zod schemas, ownership verification, audit logging
7. **Well-Secured Messages** - Uses sanitizeHtml, conversation participation checks
8. **Consolidated Dashboard Queries** - 5-6 parallel batches instead of 15+ sequential
9. **Proper Subscription Cleanup** - All real-time hooks properly cleanup
10. **Pipeline Stages Correct** - Only 5 valid stages as documented

---

## Verification Checklist

Before marking security fixes complete, verify:

- [ ] Run `SELECT tablename, policyname FROM pg_policies WHERE tablename LIKE 'baseball_%';` and confirm all tables have policies
- [ ] Test cross-coach data access (Coach A should NOT see Coach B's watchlist)
- [ ] Test IDOR by modifying event with wrong owner
- [ ] Test unauthenticated access to stats endpoints
- [ ] Run `npm run typecheck` with no errors
- [ ] Run `npm run lint` with no errors
- [ ] Test all error boundaries render correctly
- [ ] Test skeleton loaders display during data loading

---

*Report generated by Claude Opus 4.5 automated audit agents*
*Audit methodology: Parallel analysis of RLS policies, server actions, database schema, React hooks, and page components*
