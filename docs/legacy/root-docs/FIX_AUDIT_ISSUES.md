# BaseballHelm Security & Production Fixes - Guided Resolution

> **Purpose**: Step-by-step guide to fix all critical, high, and medium priority issues from the Coach Dashboard Audit
> **Location**: `/Users/ricknini/Downloads/helmv3`
> **Estimated Time**: 30-44 hours total
> **Priority**: Fix in order - Critical issues block production deployment

---

## 🎯 AGENT INSTRUCTIONS

You are a senior security engineer fixing production-critical issues in BaseballHelm. Work through each phase sequentially. For each issue:

1. **Read** the problem description
2. **Locate** the affected files
3. **Implement** the fix exactly as specified
4. **Verify** with the provided test/query
5. **Mark complete** before moving to next issue

**IMPORTANT**: Do NOT skip steps. Do NOT batch fixes without verification. Each fix should be atomic and testable.

---

## 📋 PRE-FIX CHECKLIST

Before starting, run these commands to establish baseline:

```bash
# Verify current state
npm run typecheck
npm run lint
npm run build

# Check current RLS policies
# Run in Supabase SQL Editor:
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'public' AND tablename LIKE 'baseball_%'
ORDER BY tablename, policyname;
```

Save the output - you'll compare after fixes.

---

# PHASE 1: CRITICAL SECURITY FIXES

## Issue 1.1: Verify RLS Policy Status

**Priority**: CRITICAL
**Time**: 30 minutes
**Risk**: Complete data exposure

### Step 1: Run Diagnostic Query

Execute in Supabase SQL Editor:

```sql
-- Check which baseball tables have RLS enabled
SELECT 
    tablename,
    rowsecurity as rls_enabled,
    (SELECT COUNT(*) FROM pg_policies WHERE pg_policies.tablename = pg_tables.tablename) as policy_count
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename LIKE 'baseball_%'
ORDER BY tablename;
```

### Step 2: Document Results

Create file `docs/audits/RLS_STATUS_BEFORE_FIX.md` with the query results.

### Step 3: Identify Missing Policies

Expected tables that MUST have RLS:
- `baseball_coaches` - Coach can only see own record
- `baseball_players` - Complex (own record + recruiting visibility)
- `baseball_teams` - Coach can see teams they manage
- `baseball_team_members` - Team coaches + player themselves
- `baseball_watchlists` - Coach can only see own watchlist
- `baseball_videos` - Player owns + coaches see if recruiting active
- `baseball_messages` - Conversation participants only
- `baseball_conversations` - Participants only
- `baseball_conversation_participants` - Participants only
- `baseball_events` - Team coaches + players
- `baseball_camps` - Organization coaches
- `baseball_camp_registrations` - Camp owner + registered player
- `baseball_developmental_plans` - Team coach + assigned player
- `baseball_player_engagement_events` - Player (own) + coach (anonymized)
- `baseball_recruiting_interests` - Player + interested coach

### Step 4: Mark Complete
- [ ] Diagnostic query executed
- [ ] Results documented
- [ ] Missing policies identified

---

## Issue 1.2: Create Comprehensive RLS Migration

**Priority**: CRITICAL
**Time**: 4-6 hours
**File**: `supabase/migrations/070_fix_baseball_rls_comprehensive.sql`

### Step 1: Create the Migration File

```sql
-- ============================================================================
-- Migration: 070_fix_baseball_rls_comprehensive.sql
-- Purpose: Fix RLS policies for all baseball_* tables after table rename
-- CRITICAL: This migration fixes security vulnerabilities
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get current user's coach ID (returns NULL if not a coach)
CREATE OR REPLACE FUNCTION get_my_coach_id()
RETURNS UUID AS $$
  SELECT id FROM baseball_coaches WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Get current user's player ID (returns NULL if not a player)
CREATE OR REPLACE FUNCTION get_my_player_id()
RETURNS UUID AS $$
  SELECT id FROM baseball_players WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Check if user is coach of a specific team
CREATE OR REPLACE FUNCTION is_team_coach(p_team_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM baseball_teams t
    WHERE t.id = p_team_id 
    AND (
      t.head_coach_id = get_my_coach_id()
      OR EXISTS (
        SELECT 1 FROM baseball_team_coach_staff tcs 
        WHERE tcs.team_id = t.id AND tcs.coach_id = get_my_coach_id()
      )
    )
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Check if user is member of a specific team (as player)
CREATE OR REPLACE FUNCTION is_team_member(p_team_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM baseball_team_members tm
    WHERE tm.team_id = p_team_id 
    AND tm.player_id = get_my_player_id()
    AND tm.status = 'active'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================================
-- BASEBALL_COACHES
-- ============================================================================
ALTER TABLE baseball_coaches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_coaches_select" ON baseball_coaches;
DROP POLICY IF EXISTS "baseball_coaches_insert" ON baseball_coaches;
DROP POLICY IF EXISTS "baseball_coaches_update" ON baseball_coaches;
DROP POLICY IF EXISTS "baseball_coaches_delete" ON baseball_coaches;

-- Coaches are publicly readable (for messaging, profile viewing)
CREATE POLICY "baseball_coaches_select" ON baseball_coaches
FOR SELECT TO authenticated
USING (true);

-- Only the user can create their own coach profile
CREATE POLICY "baseball_coaches_insert" ON baseball_coaches
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Only the user can update their own coach profile
CREATE POLICY "baseball_coaches_update" ON baseball_coaches
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Only the user can delete their own coach profile
CREATE POLICY "baseball_coaches_delete" ON baseball_coaches
FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ============================================================================
-- BASEBALL_PLAYERS
-- ============================================================================
ALTER TABLE baseball_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_players_select" ON baseball_players;
DROP POLICY IF EXISTS "baseball_players_insert" ON baseball_players;
DROP POLICY IF EXISTS "baseball_players_update" ON baseball_players;
DROP POLICY IF EXISTS "baseball_players_delete" ON baseball_players;

-- Players visible if: own profile, recruiting activated, or on same team
CREATE POLICY "baseball_players_select" ON baseball_players
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()  -- Own profile
  OR recruiting_activated = true  -- Recruiting active (coaches can discover)
  OR id IN (  -- Same team as viewer
    SELECT tm.player_id FROM baseball_team_members tm
    WHERE tm.team_id IN (
      SELECT team_id FROM baseball_team_members WHERE player_id = get_my_player_id()
      UNION
      SELECT id FROM baseball_teams WHERE head_coach_id = get_my_coach_id()
      UNION
      SELECT team_id FROM baseball_team_coach_staff WHERE coach_id = get_my_coach_id()
    )
  )
);

-- Only the user can create their own player profile
CREATE POLICY "baseball_players_insert" ON baseball_players
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Only the user can update their own player profile
CREATE POLICY "baseball_players_update" ON baseball_players
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Only the user can delete their own player profile
CREATE POLICY "baseball_players_delete" ON baseball_players
FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ============================================================================
-- BASEBALL_WATCHLISTS
-- ============================================================================
ALTER TABLE baseball_watchlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_watchlists_select" ON baseball_watchlists;
DROP POLICY IF EXISTS "baseball_watchlists_insert" ON baseball_watchlists;
DROP POLICY IF EXISTS "baseball_watchlists_update" ON baseball_watchlists;
DROP POLICY IF EXISTS "baseball_watchlists_delete" ON baseball_watchlists;

-- Coaches can only see their own watchlist
CREATE POLICY "baseball_watchlists_select" ON baseball_watchlists
FOR SELECT TO authenticated
USING (coach_id = get_my_coach_id());

-- Coaches can only add to their own watchlist
CREATE POLICY "baseball_watchlists_insert" ON baseball_watchlists
FOR INSERT TO authenticated
WITH CHECK (coach_id = get_my_coach_id());

-- Coaches can only update their own watchlist entries
CREATE POLICY "baseball_watchlists_update" ON baseball_watchlists
FOR UPDATE TO authenticated
USING (coach_id = get_my_coach_id())
WITH CHECK (coach_id = get_my_coach_id());

-- Coaches can only delete from their own watchlist
CREATE POLICY "baseball_watchlists_delete" ON baseball_watchlists
FOR DELETE TO authenticated
USING (coach_id = get_my_coach_id());

-- ============================================================================
-- BASEBALL_VIDEOS
-- ============================================================================
ALTER TABLE baseball_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_videos_select" ON baseball_videos;
DROP POLICY IF EXISTS "baseball_videos_insert" ON baseball_videos;
DROP POLICY IF EXISTS "baseball_videos_update" ON baseball_videos;
DROP POLICY IF EXISTS "baseball_videos_delete" ON baseball_videos;

-- Videos visible if: own video, player has recruiting active, or same team
CREATE POLICY "baseball_videos_select" ON baseball_videos
FOR SELECT TO authenticated
USING (
  player_id = get_my_player_id()  -- Own videos
  OR player_id IN (SELECT id FROM baseball_players WHERE recruiting_activated = true)  -- Recruiting active
  OR player_id IN (  -- Same team
    SELECT tm.player_id FROM baseball_team_members tm
    WHERE is_team_coach(tm.team_id) OR is_team_member(tm.team_id)
  )
);

-- Only the player can upload their own videos
CREATE POLICY "baseball_videos_insert" ON baseball_videos
FOR INSERT TO authenticated
WITH CHECK (player_id = get_my_player_id());

-- Only the player can update their own videos
CREATE POLICY "baseball_videos_update" ON baseball_videos
FOR UPDATE TO authenticated
USING (player_id = get_my_player_id())
WITH CHECK (player_id = get_my_player_id());

-- Only the player can delete their own videos
CREATE POLICY "baseball_videos_delete" ON baseball_videos
FOR DELETE TO authenticated
USING (player_id = get_my_player_id());

-- ============================================================================
-- BASEBALL_TEAMS
-- ============================================================================
ALTER TABLE baseball_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_teams_select" ON baseball_teams;
DROP POLICY IF EXISTS "baseball_teams_insert" ON baseball_teams;
DROP POLICY IF EXISTS "baseball_teams_update" ON baseball_teams;
DROP POLICY IF EXISTS "baseball_teams_delete" ON baseball_teams;

-- Teams visible to coaches of that team and players on that team
CREATE POLICY "baseball_teams_select" ON baseball_teams
FOR SELECT TO authenticated
USING (
  is_team_coach(id) OR is_team_member(id)
  OR organization_id IN (  -- Same organization
    SELECT organization_id FROM baseball_coaches WHERE id = get_my_coach_id()
  )
);

-- Only organization coaches can create teams
CREATE POLICY "baseball_teams_insert" ON baseball_teams
FOR INSERT TO authenticated
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM baseball_coaches WHERE id = get_my_coach_id()
  )
);

-- Only head coach can update team
CREATE POLICY "baseball_teams_update" ON baseball_teams
FOR UPDATE TO authenticated
USING (head_coach_id = get_my_coach_id())
WITH CHECK (head_coach_id = get_my_coach_id());

-- Only head coach can delete team
CREATE POLICY "baseball_teams_delete" ON baseball_teams
FOR DELETE TO authenticated
USING (head_coach_id = get_my_coach_id());

-- ============================================================================
-- BASEBALL_TEAM_MEMBERS
-- ============================================================================
ALTER TABLE baseball_team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_team_members_select" ON baseball_team_members;
DROP POLICY IF EXISTS "baseball_team_members_insert" ON baseball_team_members;
DROP POLICY IF EXISTS "baseball_team_members_update" ON baseball_team_members;
DROP POLICY IF EXISTS "baseball_team_members_delete" ON baseball_team_members;

-- Visible to team coaches and team members
CREATE POLICY "baseball_team_members_select" ON baseball_team_members
FOR SELECT TO authenticated
USING (is_team_coach(team_id) OR is_team_member(team_id) OR player_id = get_my_player_id());

-- Only team coaches can add members
CREATE POLICY "baseball_team_members_insert" ON baseball_team_members
FOR INSERT TO authenticated
WITH CHECK (is_team_coach(team_id));

-- Only team coaches can update members
CREATE POLICY "baseball_team_members_update" ON baseball_team_members
FOR UPDATE TO authenticated
USING (is_team_coach(team_id))
WITH CHECK (is_team_coach(team_id));

-- Team coaches can remove members, players can remove themselves
CREATE POLICY "baseball_team_members_delete" ON baseball_team_members
FOR DELETE TO authenticated
USING (is_team_coach(team_id) OR player_id = get_my_player_id());

-- ============================================================================
-- BASEBALL_MESSAGES
-- ============================================================================
ALTER TABLE baseball_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_messages_select" ON baseball_messages;
DROP POLICY IF EXISTS "baseball_messages_insert" ON baseball_messages;

-- Only conversation participants can see messages
CREATE POLICY "baseball_messages_select" ON baseball_messages
FOR SELECT TO authenticated
USING (
  conversation_id IN (
    SELECT conversation_id FROM baseball_conversation_participants
    WHERE user_id = auth.uid()
  )
);

-- Only conversation participants can send messages
CREATE POLICY "baseball_messages_insert" ON baseball_messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND conversation_id IN (
    SELECT conversation_id FROM baseball_conversation_participants
    WHERE user_id = auth.uid()
  )
);

-- Messages cannot be updated or deleted (immutable)
-- No UPDATE or DELETE policies

-- ============================================================================
-- BASEBALL_CONVERSATIONS
-- ============================================================================
ALTER TABLE baseball_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_conversations_select" ON baseball_conversations;
DROP POLICY IF EXISTS "baseball_conversations_insert" ON baseball_conversations;
DROP POLICY IF EXISTS "baseball_conversations_update" ON baseball_conversations;

-- Only participants can see conversations
CREATE POLICY "baseball_conversations_select" ON baseball_conversations
FOR SELECT TO authenticated
USING (
  id IN (
    SELECT conversation_id FROM baseball_conversation_participants
    WHERE user_id = auth.uid()
  )
);

-- Any authenticated user can start a conversation
CREATE POLICY "baseball_conversations_insert" ON baseball_conversations
FOR INSERT TO authenticated
WITH CHECK (true);

-- Only participants can update (e.g., mark as read)
CREATE POLICY "baseball_conversations_update" ON baseball_conversations
FOR UPDATE TO authenticated
USING (
  id IN (
    SELECT conversation_id FROM baseball_conversation_participants
    WHERE user_id = auth.uid()
  )
);

-- ============================================================================
-- BASEBALL_CONVERSATION_PARTICIPANTS
-- ============================================================================
ALTER TABLE baseball_conversation_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_conversation_participants_select" ON baseball_conversation_participants;
DROP POLICY IF EXISTS "baseball_conversation_participants_insert" ON baseball_conversation_participants;
DROP POLICY IF EXISTS "baseball_conversation_participants_update" ON baseball_conversation_participants;

-- Only participants can see who's in a conversation
CREATE POLICY "baseball_conversation_participants_select" ON baseball_conversation_participants
FOR SELECT TO authenticated
USING (
  conversation_id IN (
    SELECT conversation_id FROM baseball_conversation_participants cp
    WHERE cp.user_id = auth.uid()
  )
);

-- Can add participants to conversations you're part of
CREATE POLICY "baseball_conversation_participants_insert" ON baseball_conversation_participants
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()  -- Adding yourself
  OR conversation_id IN (
    SELECT conversation_id FROM baseball_conversation_participants
    WHERE user_id = auth.uid()
  )
);

-- Participants can update their own record (read status, etc.)
CREATE POLICY "baseball_conversation_participants_update" ON baseball_conversation_participants
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- BASEBALL_EVENTS
-- ============================================================================
ALTER TABLE baseball_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_events_select" ON baseball_events;
DROP POLICY IF EXISTS "baseball_events_insert" ON baseball_events;
DROP POLICY IF EXISTS "baseball_events_update" ON baseball_events;
DROP POLICY IF EXISTS "baseball_events_delete" ON baseball_events;

-- Events visible to team coaches and team members
CREATE POLICY "baseball_events_select" ON baseball_events
FOR SELECT TO authenticated
USING (
  team_id IS NULL  -- Organization-wide events
  OR is_team_coach(team_id) 
  OR is_team_member(team_id)
);

-- Only team coaches can create events
CREATE POLICY "baseball_events_insert" ON baseball_events
FOR INSERT TO authenticated
WITH CHECK (
  created_by = get_my_coach_id()
  AND (team_id IS NULL OR is_team_coach(team_id))
);

-- Only event creator can update
CREATE POLICY "baseball_events_update" ON baseball_events
FOR UPDATE TO authenticated
USING (created_by = get_my_coach_id())
WITH CHECK (created_by = get_my_coach_id());

-- Only event creator can delete
CREATE POLICY "baseball_events_delete" ON baseball_events
FOR DELETE TO authenticated
USING (created_by = get_my_coach_id());

-- ============================================================================
-- BASEBALL_CAMPS
-- ============================================================================
ALTER TABLE baseball_camps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_camps_select" ON baseball_camps;
DROP POLICY IF EXISTS "baseball_camps_insert" ON baseball_camps;
DROP POLICY IF EXISTS "baseball_camps_update" ON baseball_camps;
DROP POLICY IF EXISTS "baseball_camps_delete" ON baseball_camps;

-- Camps are publicly visible (for player discovery)
CREATE POLICY "baseball_camps_select" ON baseball_camps
FOR SELECT TO authenticated
USING (true);

-- Only organization coaches can create camps
CREATE POLICY "baseball_camps_insert" ON baseball_camps
FOR INSERT TO authenticated
WITH CHECK (coach_id = get_my_coach_id());

-- Only camp creator can update
CREATE POLICY "baseball_camps_update" ON baseball_camps
FOR UPDATE TO authenticated
USING (coach_id = get_my_coach_id())
WITH CHECK (coach_id = get_my_coach_id());

-- Only camp creator can delete
CREATE POLICY "baseball_camps_delete" ON baseball_camps
FOR DELETE TO authenticated
USING (coach_id = get_my_coach_id());

-- ============================================================================
-- BASEBALL_CAMP_REGISTRATIONS
-- ============================================================================
ALTER TABLE baseball_camp_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_camp_registrations_select" ON baseball_camp_registrations;
DROP POLICY IF EXISTS "baseball_camp_registrations_insert" ON baseball_camp_registrations;
DROP POLICY IF EXISTS "baseball_camp_registrations_update" ON baseball_camp_registrations;
DROP POLICY IF EXISTS "baseball_camp_registrations_delete" ON baseball_camp_registrations;

-- Camp owner can see all registrations, players can see their own
CREATE POLICY "baseball_camp_registrations_select" ON baseball_camp_registrations
FOR SELECT TO authenticated
USING (
  player_id = get_my_player_id()
  OR camp_id IN (SELECT id FROM baseball_camps WHERE coach_id = get_my_coach_id())
);

-- Players can register themselves
CREATE POLICY "baseball_camp_registrations_insert" ON baseball_camp_registrations
FOR INSERT TO authenticated
WITH CHECK (player_id = get_my_player_id());

-- Camp owner can update registrations (status changes)
CREATE POLICY "baseball_camp_registrations_update" ON baseball_camp_registrations
FOR UPDATE TO authenticated
USING (
  camp_id IN (SELECT id FROM baseball_camps WHERE coach_id = get_my_coach_id())
);

-- Players can cancel their own registration
CREATE POLICY "baseball_camp_registrations_delete" ON baseball_camp_registrations
FOR DELETE TO authenticated
USING (player_id = get_my_player_id());

-- ============================================================================
-- BASEBALL_DEVELOPMENTAL_PLANS
-- ============================================================================
ALTER TABLE baseball_developmental_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_developmental_plans_select" ON baseball_developmental_plans;
DROP POLICY IF EXISTS "baseball_developmental_plans_insert" ON baseball_developmental_plans;
DROP POLICY IF EXISTS "baseball_developmental_plans_update" ON baseball_developmental_plans;
DROP POLICY IF EXISTS "baseball_developmental_plans_delete" ON baseball_developmental_plans;

-- Coaches can see plans they created, players can see plans assigned to them
CREATE POLICY "baseball_developmental_plans_select" ON baseball_developmental_plans
FOR SELECT TO authenticated
USING (
  coach_id = get_my_coach_id()
  OR player_id = get_my_player_id()
);

-- Only coaches can create plans
CREATE POLICY "baseball_developmental_plans_insert" ON baseball_developmental_plans
FOR INSERT TO authenticated
WITH CHECK (coach_id = get_my_coach_id());

-- Only plan creator can update
CREATE POLICY "baseball_developmental_plans_update" ON baseball_developmental_plans
FOR UPDATE TO authenticated
USING (coach_id = get_my_coach_id())
WITH CHECK (coach_id = get_my_coach_id());

-- Only plan creator can delete
CREATE POLICY "baseball_developmental_plans_delete" ON baseball_developmental_plans
FOR DELETE TO authenticated
USING (coach_id = get_my_coach_id());

-- ============================================================================
-- BASEBALL_PLAYER_ENGAGEMENT_EVENTS
-- ============================================================================
ALTER TABLE baseball_player_engagement_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_player_engagement_events_select" ON baseball_player_engagement_events;
DROP POLICY IF EXISTS "baseball_player_engagement_events_insert" ON baseball_player_engagement_events;

-- Players can see their own engagement (anonymized coach info)
-- Coaches can see engagement they created
CREATE POLICY "baseball_player_engagement_events_select" ON baseball_player_engagement_events
FOR SELECT TO authenticated
USING (
  player_id = get_my_player_id()
  OR coach_id = get_my_coach_id()
);

-- Coaches can create engagement events
CREATE POLICY "baseball_player_engagement_events_insert" ON baseball_player_engagement_events
FOR INSERT TO authenticated
WITH CHECK (coach_id = get_my_coach_id());

-- Engagement events are immutable (no UPDATE or DELETE)

-- ============================================================================
-- BASEBALL_RECRUITING_INTERESTS
-- ============================================================================
ALTER TABLE baseball_recruiting_interests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "baseball_recruiting_interests_select" ON baseball_recruiting_interests;
DROP POLICY IF EXISTS "baseball_recruiting_interests_insert" ON baseball_recruiting_interests;
DROP POLICY IF EXISTS "baseball_recruiting_interests_update" ON baseball_recruiting_interests;
DROP POLICY IF EXISTS "baseball_recruiting_interests_delete" ON baseball_recruiting_interests;

-- Players can see interest in them, coaches can see interest they expressed
CREATE POLICY "baseball_recruiting_interests_select" ON baseball_recruiting_interests
FOR SELECT TO authenticated
USING (
  player_id = get_my_player_id()
  OR coach_id = get_my_coach_id()
);

-- Players can express interest in schools
CREATE POLICY "baseball_recruiting_interests_insert" ON baseball_recruiting_interests
FOR INSERT TO authenticated
WITH CHECK (player_id = get_my_player_id());

-- Players can update their own interest
CREATE POLICY "baseball_recruiting_interests_update" ON baseball_recruiting_interests
FOR UPDATE TO authenticated
USING (player_id = get_my_player_id())
WITH CHECK (player_id = get_my_player_id());

-- Players can remove their interest
CREATE POLICY "baseball_recruiting_interests_delete" ON baseball_recruiting_interests
FOR DELETE TO authenticated
USING (player_id = get_my_player_id());

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run this after migration to verify:
-- SELECT tablename, policyname, cmd FROM pg_policies 
-- WHERE tablename LIKE 'baseball_%' ORDER BY tablename, cmd;
```

### Step 2: Apply the Migration

```bash
# Option 1: Via Supabase CLI
supabase db push

# Option 2: Via Supabase Dashboard
# Go to SQL Editor > Paste migration > Run
```

### Step 3: Verify Policies Applied

```sql
SELECT tablename, COUNT(*) as policy_count 
FROM pg_policies 
WHERE tablename LIKE 'baseball_%'
GROUP BY tablename
ORDER BY tablename;
```

Expected: Each table should have 2-4 policies (SELECT, INSERT, UPDATE, DELETE as appropriate)

### Step 4: Test Cross-User Access

```sql
-- As Coach A, try to select Coach B's watchlist
-- Should return 0 rows
SELECT * FROM baseball_watchlists WHERE coach_id = '[COACH_B_ID]';
```

### Step 5: Mark Complete
- [ ] Migration file created
- [ ] Migration applied successfully
- [ ] Policy counts verified
- [ ] Cross-user access test passed

---

## Issue 1.3: Fix IDOR in Calendar Actions

**Priority**: CRITICAL
**Time**: 1-2 hours
**File**: `src/app/baseball/actions/calendar.ts`

### Step 1: Open the File

```bash
code src/app/baseball/actions/calendar.ts
```

### Step 2: Find updateBaseballEvent Function (around line 94)

Current vulnerable code:
```typescript
export async function updateBaseballEvent(eventId: string, data: UpdateEventInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { error } = await supabase
    .from('baseball_events')
    .update(data)
    .eq('id', eventId);
```

### Step 3: Replace with Fixed Version

```typescript
export async function updateBaseballEvent(eventId: string, data: UpdateEventInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  // Get the current user's coach ID
  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    return { error: 'Not authorized - coach profile not found' };
  }

  // Update only if user owns the event (created_by matches their coach ID)
  const { data: updated, error } = await supabase
    .from('baseball_events')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId)
    .eq('created_by', coach.id)  // OWNERSHIP CHECK
    .select()
    .single();

  if (error) {
    console.error('Error updating event:', error);
    return { error: error.message };
  }

  if (!updated) {
    return { error: 'Event not found or you do not have permission to update it' };
  }

  revalidatePath('/baseball/dashboard/calendar');
  return { success: true, data: updated };
}
```

### Step 4: Find deleteBaseballEvent Function (around line 140)

Replace with:

```typescript
export async function deleteBaseballEvent(eventId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  // Get the current user's coach ID
  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    return { error: 'Not authorized - coach profile not found' };
  }

  // Delete only if user owns the event
  const { error, count } = await supabase
    .from('baseball_events')
    .delete()
    .eq('id', eventId)
    .eq('created_by', coach.id);  // OWNERSHIP CHECK

  if (error) {
    console.error('Error deleting event:', error);
    return { error: error.message };
  }

  if (count === 0) {
    return { error: 'Event not found or you do not have permission to delete it' };
  }

  revalidatePath('/baseball/dashboard/calendar');
  return { success: true };
}
```

### Step 5: Run Type Check

```bash
npm run typecheck
```

### Step 6: Mark Complete
- [ ] updateBaseballEvent fixed with ownership check
- [ ] deleteBaseballEvent fixed with ownership check
- [ ] Type check passes

---

## Issue 1.4: Fix IDOR in Team Join

**Priority**: CRITICAL
**Time**: 1 hour
**File**: `src/app/baseball/actions/teams.ts`

### Step 1: Open the File

```bash
code src/app/baseball/actions/teams.ts
```

### Step 2: Find joinTeam Function (around line 226)

### Step 3: Add Ownership Verification

```typescript
export async function joinTeam(playerId: string, teamId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  // CRITICAL: Verify the caller owns this player profile
  const { data: player } = await supabase
    .from('baseball_players')
    .select('id, user_id')
    .eq('id', playerId)
    .single();

  if (!player) {
    return { error: 'Player not found' };
  }

  if (player.user_id !== user.id) {
    return { error: 'You can only join teams with your own player profile' };
  }

  // ... rest of existing function logic
}
```

### Step 4: Also Fix joinTeamByCode if it exists

Apply same pattern - verify playerId belongs to current user.

### Step 5: Mark Complete
- [ ] joinTeam has ownership verification
- [ ] joinTeamByCode has ownership verification (if exists)
- [ ] Type check passes

---

## Issue 1.5: Add Authentication to Stats Functions

**Priority**: CRITICAL
**Time**: 1-2 hours
**File**: `src/app/baseball/actions/stats.ts`

### Step 1: Open the File

```bash
code src/app/baseball/actions/stats.ts
```

### Step 2: Create Auth Helper at Top of File

Add after imports:

```typescript
async function requireCoach() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Unauthorized');
  }

  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    throw new Error('Coach profile not found');
  }

  return { user, coach, supabase };
}
```

### Step 3: Add Auth to getPlayerStats (around line 393)

```typescript
export async function getPlayerStats(playerId: string) {
  try {
    const { coach, supabase } = await requireCoach();

    // Only allow viewing stats for:
    // 1. Players on coach's watchlist
    // 2. Players on coach's teams
    // 3. Players with recruiting activated
    const { data: authorized } = await supabase
      .from('baseball_players')
      .select('id')
      .eq('id', playerId)
      .or(`recruiting_activated.eq.true,id.in.(${
        await supabase
          .from('baseball_watchlists')
          .select('player_id')
          .eq('coach_id', coach.id)
          .then(r => r.data?.map(w => w.player_id).join(',') || '')
      })`)
      .single();

    if (!authorized) {
      return { error: 'Not authorized to view this player\'s stats' };
    }

    // ... rest of function
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
```

### Step 4: Add Auth to getRecentUploads (around line 420)

```typescript
export async function getRecentUploads() {
  try {
    const { coach, supabase } = await requireCoach();
    
    // Only return uploads from coach's organization
    const { data, error } = await supabase
      .from('baseball_stat_uploads')
      .select('*')
      .eq('coach_id', coach.id)
      .order('created_at', { ascending: false })
      .limit(10);

    // ... rest of function
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
```

### Step 5: Add Auth to recalculatePlayerAggregates (around line 449)

```typescript
export async function recalculatePlayerAggregates(playerId: string) {
  try {
    const { coach, supabase } = await requireCoach();

    // Verify coach has permission for this player (on their team)
    const { data: teamMember } = await supabase
      .from('baseball_team_members')
      .select('team_id')
      .eq('player_id', playerId)
      .in('team_id', 
        await supabase
          .from('baseball_teams')
          .select('id')
          .eq('head_coach_id', coach.id)
          .then(r => r.data?.map(t => t.id) || [])
      )
      .single();

    if (!teamMember) {
      return { error: 'Not authorized - player not on your team' };
    }

    // ... rest of function
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
```

### Step 6: Mark Complete
- [ ] requireCoach helper added
- [ ] getPlayerStats has auth
- [ ] getRecentUploads has auth
- [ ] recalculatePlayerAggregates has auth
- [ ] Type check passes

---

## Issue 1.6: Add Authentication to Discover Functions

**Priority**: CRITICAL  
**Time**: 1 hour
**File**: `src/app/baseball/actions/discover.ts`

### Step 1: Fix getWatchlistIds

```typescript
export async function getWatchlistIds(coachId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { error: 'Unauthorized' };
  }

  // Verify the caller is requesting their own watchlist
  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('id', coachId)
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    return { error: 'Not authorized to view this watchlist' };
  }

  const { data, error } = await supabase
    .from('baseball_watchlists')
    .select('player_id')
    .eq('coach_id', coachId);

  if (error) return { error: error.message };
  
  return { data: data?.map(w => w.player_id) || [] };
}
```

### Step 2: Mark Complete
- [ ] getWatchlistIds has ownership verification
- [ ] Type check passes

---

## Issue 1.7: Add Authentication to Insights Functions

**Priority**: HIGH
**Time**: 2 hours
**File**: `src/app/baseball/actions/insights.ts`

### Step 1: Create requireCoach helper (if not exists)

### Step 2: Fix generateTeamInsights

```typescript
export async function generateTeamInsights(teamId: string, coachId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return { error: 'Unauthorized' };

  // Verify caller owns this coach ID
  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('id', coachId)
    .eq('user_id', user.id)
    .single();

  if (!coach) return { error: 'Not authorized' };

  // Verify coach has access to this team
  const { data: team } = await supabase
    .from('baseball_teams')
    .select('id')
    .eq('id', teamId)
    .or(`head_coach_id.eq.${coach.id}`)
    .single();

  if (!team) return { error: 'Not authorized for this team' };

  // ... rest of function
}
```

### Step 3: Fix dismissInsight and markInsightAddressed

```typescript
export async function dismissInsight(insightId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return { error: 'Unauthorized' };

  // Get coach ID
  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) return { error: 'Not a coach' };

  // Only dismiss insights belonging to this coach
  const { error } = await supabase
    .from('baseball_coach_insights')
    .update({ dismissed: true, dismissed_at: new Date().toISOString() })
    .eq('id', insightId)
    .eq('coach_id', coach.id);  // OWNERSHIP CHECK

  if (error) return { error: error.message };
  return { success: true };
}
```

### Step 4: Mark Complete
- [ ] generateTeamInsights has auth
- [ ] dismissInsight has ownership check
- [ ] markInsightAddressed has ownership check
- [ ] All other insight functions reviewed
- [ ] Type check passes

---

# PHASE 2: HIGH PRIORITY FIXES

## Issue 2.1: Replace Console.error with Proper Logging

**Priority**: HIGH
**Time**: 2 hours

### Step 1: Create Error Logging Utility

Create file `src/lib/error-logging.ts`:

```typescript
type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  additionalData?: Record<string, unknown>;
}

export function logError(
  error: unknown,
  context: ErrorContext = {},
  severity: ErrorSeverity = 'medium'
) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // In development, still log to console
  if (process.env.NODE_ENV === 'development') {
    console.error(`[${severity.toUpperCase()}]`, errorMessage, context);
    if (errorStack) console.error(errorStack);
    return;
  }

  // In production, send to Sentry or logging service
  // TODO: Integrate with Sentry
  // Sentry.captureException(error, { extra: context, level: severity });
}

export function logWarning(message: string, context: ErrorContext = {}) {
  if (process.env.NODE_ENV === 'development') {
    console.warn('[WARNING]', message, context);
    return;
  }
  // TODO: Send to logging service
}
```

### Step 2: Replace console.error in Each File

**Files to update:**
- `src/app/baseball/(dashboard)/dashboard/discover/page.tsx`
- `src/app/baseball/(dashboard)/dashboard/pipeline/page.tsx`
- `src/app/baseball/(dashboard)/dashboard/compare/page.tsx`
- `src/app/baseball/(dashboard)/dashboard/roster/page.tsx`
- `src/app/baseball/(dashboard)/dashboard/command-center/error.tsx`

Example replacement:
```typescript
// Before:
console.error('Error fetching players:', error);

// After:
import { logError } from '@/lib/error-logging';
logError(error, { component: 'DiscoverPage', action: 'fetchPlayers' }, 'medium');
```

### Step 3: Mark Complete
- [ ] Error logging utility created
- [ ] All console.error replaced
- [ ] Lint passes

---

## Issue 2.2: Fix N+1 Query in Unread Count Hook

**Priority**: HIGH
**Time**: 1 hour
**File**: `src/hooks/use-unread-count.ts`

### Step 1: Find the Loop (around line 35-44)

### Step 2: Replace with Single Query

```typescript
// Before: Loop with N queries
for (const participant of participantData) {
  const { count } = await supabase
    .from('baseball_messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', participant.conversation_id)
    .gt('created_at', participant.last_read_at || '1970-01-01')
    .neq('sender_id', user.id);
  
  unreadTotal += count || 0;
}

// After: Single query
const conversationIds = participantData.map(p => p.conversation_id);
const lastReadMap = new Map(
  participantData.map(p => [p.conversation_id, p.last_read_at || '1970-01-01'])
);

const { data: unreadMessages } = await supabase
  .from('baseball_messages')
  .select('conversation_id, created_at')
  .in('conversation_id', conversationIds)
  .neq('sender_id', user.id);

const unreadTotal = (unreadMessages || []).filter(msg => {
  const lastRead = lastReadMap.get(msg.conversation_id);
  return lastRead && new Date(msg.created_at) > new Date(lastRead);
}).length;
```

### Step 3: Mark Complete
- [ ] N+1 query fixed
- [ ] Performance verified

---

# PHASE 3: MEDIUM PRIORITY FIXES

## Issue 3.1: Add Missing Loading State for Program Page

**Priority**: MEDIUM
**Time**: 30 minutes
**File**: Create `src/app/baseball/(dashboard)/dashboard/program/loading.tsx`

```typescript
import { SkeletonCard } from '@/components/ui/skeleton-loader';

export default function ProgramLoading() {
  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonCard className="h-64" />
        <SkeletonCard className="h-64" />
      </div>
      <SkeletonCard className="h-96" />
    </div>
  );
}
```

---

## Issue 3.2: Add Missing updated_at Triggers

**Priority**: MEDIUM
**Time**: 1 hour
**File**: Create `supabase/migrations/071_add_missing_updated_at.sql`

```sql
-- Add updated_at column and trigger to baseball_team_members
ALTER TABLE baseball_team_members 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TRIGGER update_baseball_team_members_updated_at
  BEFORE UPDATE ON baseball_team_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add to baseball_team_coach_staff
ALTER TABLE baseball_team_coach_staff 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TRIGGER update_baseball_team_coach_staff_updated_at
  BEFORE UPDATE ON baseball_team_coach_staff
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add to baseball_messages (for edit tracking if needed later)
ALTER TABLE baseball_messages 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TRIGGER update_baseball_messages_updated_at
  BEFORE UPDATE ON baseball_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

# POST-FIX VERIFICATION

After completing all fixes, run:

```bash
# 1. Type checking
npm run typecheck

# 2. Linting
npm run lint

# 3. Build
npm run build

# 4. RLS verification query
SELECT tablename, COUNT(*) as policy_count 
FROM pg_policies 
WHERE tablename LIKE 'baseball_%'
GROUP BY tablename
ORDER BY tablename;

# 5. Security test queries (run as different users)
# Test Coach A cannot see Coach B's data
```

---

# COMPLETION CHECKLIST

## Phase 1: Critical Security
- [ ] 1.1 RLS status verified
- [ ] 1.2 Comprehensive RLS migration applied
- [ ] 1.3 Calendar IDOR fixed
- [ ] 1.4 Team join IDOR fixed
- [ ] 1.5 Stats auth added
- [ ] 1.6 Discover auth added
- [ ] 1.7 Insights auth added

## Phase 2: High Priority
- [ ] 2.1 Console.error replaced
- [ ] 2.2 N+1 query fixed

## Phase 3: Medium Priority
- [ ] 3.1 Program loading state added
- [ ] 3.2 updated_at triggers added

## Final Verification
- [ ] npm run typecheck passes
- [ ] npm run lint passes
- [ ] npm run build succeeds
- [ ] RLS policies verified
- [ ] Cross-user access test passed

---

**After completing all fixes, re-run the audit:**
```
Read AUDIT_COACH_DASHBOARD.md and verify all critical issues are resolved.
```

Expected new score: **85+/100** (Production Ready)
