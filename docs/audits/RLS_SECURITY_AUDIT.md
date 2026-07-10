<!--
STATUS: STALE
DATE: 2026-07-10
SUPERSEDED BY / WHY: Generated 2026-01-01 against the same 19-user snapshot DB as docs/architecture/USER_ROLE_DATA_OWNERSHIP.md. Superseded by the Wave A IDOR/RLS/anon-grant hardening (#327) and docs/audits/DB_FORENSIC_AUDIT_2026-07-08.md.
KEPT FOR HISTORY -- do not delete this file.
-->

# RLS POLICY & SECURITY AUDIT
> PHASE 3 AUDIT REPORT
> Generated: 2026-01-01
> Verified against live Supabase database

---

## EXECUTIVE SUMMARY

| Metric | Count | Status |
|--------|-------|--------|
| Tables Audited | 29 | ✅ |
| Tables with Data | 9 | - |
| Tables with RLS Policies | 9 | ⚠️ |
| Critical Tables Without Policies | 14 | 🔴 |
| Tables Exposed to Anonymous | 2 | 🔴 |

### CRITICAL FINDINGS

1. **🔴 CRITICAL: `players` table exposed to anonymous users**
   - Anonymous users can see 3 player rows
   - This should be blocked by RLS

2. **🟡 BY DESIGN: `coaches` table publicly readable**
   - "Anyone can view coach profiles" policy exists
   - This is intentional for discovery features

3. **🔴 HIGH: 14 critical tables lack documented RLS policies**

---

## SECTION 1: TABLE INVENTORY & RLS STATUS

### 1.1 Tables with Data

| Table | Rows | Owner Column | Has Policy | Anonymous Access |
|-------|------|--------------|------------|------------------|
| `users` | 19 | `id` | ✅ | ❌ Blocked |
| `coaches` | 1 | `user_id` | ✅ | ⚠️ Public |
| `players` | 39 | `user_id` | ✅ | 🔴 **EXPOSED** |
| `golf_coaches` | 5 | `user_id` | ✅ | ❌ Blocked |
| `golf_players` | 4 | `user_id` | ✅ | ❌ Blocked |
| `organizations` | 33 | none | ✅ | ❌ Blocked |
| `golf_organizations` | 11 | none | ✅ | ❌ Blocked |
| `golf_teams` | 10 | `organization_id` | ✅ | ❌ Blocked |
| `player_settings` | 39 | `player_id` | ❌ | ❌ Blocked |

### 1.2 Empty Tables (Still Need RLS)

| Table | Owner Column | Critical | Has Policy |
|-------|--------------|----------|------------|
| `teams` | `organization_id` | 🟡 | ✅ |
| `team_members` | `player_id` | 🔴 | ❌ |
| `team_invitations` | `team_id` | 🟡 | ❌ |
| `videos` | `player_id` | 🔴 | ❌ |
| `player_metrics` | `player_id` | 🟡 | ❌ |
| `recruiting_interests` | `player_id` | 🔴 | ❌ |
| `player_engagement_events` | `player_id` | 🔴 | ❌ |
| `watchlists` | `coach_id` | 🔴 | ❌ |
| `coach_notes` | `coach_id` | 🔴 | ❌ |
| `developmental_plans` | `coach_id` | 🔴 | ❌ |
| `camps` | `coach_id` | 🔴 | ❌ |
| `camp_registrations` | `player_id` | 🔴 | ❌ |
| `messages` | `sender_id` | 🔴 | ❌ |
| `conversations` | none | 🔴 | ❌ |
| `conversation_participants` | `user_id` | 🔴 | ❌ |
| `notifications` | `user_id` | 🔴 | ❌ |
| `golf_rounds` | `player_id` | 🟡 | ❌ |
| `golf_events` | `team_id` | 🟡 | ❌ |
| `golf_qualifiers` | `team_id` | 🟡 | ❌ |
| `golf_announcements` | `team_id` | 🟡 | ❌ |

---

## SECTION 2: DOCUMENTED RLS POLICIES

### 2.1 Users Table
```sql
-- SELECT: Users can read own data
USING (auth.uid() = id)

-- INSERT: Users can insert own profile
WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = id)

-- UPDATE: Users can update own data
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id)
```
✅ **SECURE**: Only own data accessible

### 2.2 Coaches Table (Baseball)
```sql
-- SELECT: Users can read own coach profile
USING (auth.uid() = user_id)

-- SELECT: Anyone can view coach profiles ⚠️
USING (true)

-- INSERT: Users can insert own coach profile
WITH CHECK (auth.uid() = user_id)

-- UPDATE: Users can update own coach profile
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id)
```
⚠️ **PUBLIC READ**: By design for discovery features

### 2.3 Players Table (Baseball)
```sql
-- SELECT: Users can read own player profile
USING (auth.uid() = user_id)

-- SELECT: Coaches can view all players
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'coach'
  )
)

-- INSERT: Users can insert own player profile
WITH CHECK (auth.uid() = user_id)

-- UPDATE: Users can update own player profile
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id)
```
🔴 **ISSUE**: Anonymous users can see 3 rows - investigate!

### 2.4 Golf Coaches Table
```sql
-- SELECT: Users can read own golf coach profile
USING (auth.uid() = user_id)

-- INSERT: Users can insert own golf coach profile
WITH CHECK (auth.uid() = user_id)

-- UPDATE: Users can update own golf coach profile
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id)
```
✅ **SECURE**: Only own data accessible

### 2.5 Golf Players Table
```sql
-- SELECT: Users can read own golf player profile
USING (auth.uid() = user_id)

-- INSERT: Users can insert own golf player profile
WITH CHECK (auth.uid() = user_id)

-- UPDATE: Users can update own golf player profile
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id)
```
✅ **SECURE**: Only own data accessible

### 2.6 Organizations Table
```sql
-- SELECT: Authenticated users can read organizations
USING (auth.role() = 'authenticated')

-- INSERT: Coaches can create organizations
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'coach'
  )
)

-- UPDATE: Coaches can update own organization
USING (coaches.organization_id = organizations.id)
```
✅ **SECURE**: Authenticated read, coach-only write

### 2.7 Teams Table
```sql
-- SELECT: Users can view their own teams
USING (
  -- Player on team
  EXISTS (SELECT 1 FROM team_members WHERE ...)
  OR
  -- Coach in org
  EXISTS (SELECT 1 FROM coaches WHERE ...)
)
```
✅ **SECURE**: Only related users can access

### 2.8 Golf Teams Table
```sql
-- SELECT: Users can view their golf teams
USING (
  golf_coaches.team_id = golf_teams.id
  OR
  golf_players.team_id = golf_teams.id
)

-- INSERT: Golf coaches can insert teams
WITH CHECK (users.role = 'coach')

-- UPDATE: Golf coaches can update their team
USING (golf_coaches.team_id = golf_teams.id)
```
✅ **SECURE**: Only related users can access

---

## SECTION 3: TABLES MISSING RLS POLICIES

### 3.1 Critical (User Data) - MUST FIX

| Table | Owner Column | Required Policies |
|-------|--------------|-------------------|
| `videos` | `player_id` | Own player only, coaches can view for recruiting |
| `player_settings` | `player_id` | Own player only |
| `watchlists` | `coach_id` | Own coach only |
| `coach_notes` | `coach_id` | Own coach only |
| `messages` | `sender_id` | Participants only |
| `conversations` | participants | Participants only |
| `conversation_participants` | `user_id` | Own user only |
| `notifications` | `user_id` | Own user only |
| `developmental_plans` | `coach_id`/`player_id` | Coach owner + player recipient |

### 3.2 Medium Priority

| Table | Owner Column | Required Policies |
|-------|--------------|-------------------|
| `team_members` | `player_id` | Team coaches + player |
| `camps` | `coach_id` | Creator coach, public read |
| `camp_registrations` | `player_id` | Own player + camp coach |
| `recruiting_interests` | `player_id` | Own player only |
| `player_engagement_events` | `player_id` | Own player only |

### 3.3 Lower Priority (Golf)

| Table | Owner Column | Required Policies |
|-------|--------------|-------------------|
| `golf_rounds` | `player_id` | Own player + team coach |
| `golf_events` | `team_id` | Team members |
| `golf_qualifiers` | `team_id` | Team members |
| `golf_announcements` | `team_id` | Team members |

---

## SECTION 4: SECURITY ISSUES

### 4.1 CRITICAL: Players Table Anonymous Access

**Finding**: Anonymous users can read 3 rows from `players` table.

**Expected Behavior**: Only coaches (authenticated with role='coach') should see all players.

**Possible Causes**:
1. RLS not enabled on table (unlikely, other policies work)
2. Legacy permissive policy still exists
3. Default policy allowing read

**Investigation Required**:
```sql
-- Run in Supabase SQL Editor
SELECT * FROM pg_policies WHERE tablename = 'players';
SELECT relrowsecurity FROM pg_class WHERE relname = 'players';
```

**Recommended Fix**:
```sql
-- Ensure RLS is enabled
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- Drop any overly permissive policies
DROP POLICY IF EXISTS "Enable read access for all users" ON public.players;

-- Recreate correct policies
DROP POLICY IF EXISTS "Users can read own player profile" ON public.players;
CREATE POLICY "Users can read own player profile" ON public.players
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Coaches can view all players" ON public.players;
CREATE POLICY "Coaches can view all players" ON public.players
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'coach'
    )
  );
```

### 4.2 HIGH: No RLS on Messaging Tables

**Finding**: `messages`, `conversations`, `conversation_participants` have no RLS policies.

**Risk**: When data is added, any authenticated user could read all messages.

**Recommended Fix**:
```sql
-- Messages: Only participants can read
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own messages" ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can send messages" ON public.messages
  FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- Conversations: Only participants can read
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their conversations" ON public.conversations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = conversations.id
      AND user_id = auth.uid()
    )
  );

-- Participants: Only own records
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their participations" ON public.conversation_participants
  FOR SELECT
  USING (user_id = auth.uid());
```

### 4.3 HIGH: No RLS on Videos Table

**Finding**: `videos` table has no RLS policies.

**Risk**: When data is added, any user could access any player's videos.

**Recommended Fix**:
```sql
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

-- Players can manage their own videos
CREATE POLICY "Players can manage own videos" ON public.videos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.id = videos.player_id
      AND players.user_id = auth.uid()
    )
  );

-- Coaches can view videos (for recruiting)
CREATE POLICY "Coaches can view all videos" ON public.videos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'coach'
    )
  );
```

### 4.4 MEDIUM: No RLS on Watchlists/Coach Notes

**Finding**: `watchlists` and `coach_notes` have no RLS policies.

**Risk**: Coaches could see other coaches' watchlists and notes.

**Recommended Fix**:
```sql
-- Watchlists: Only owning coach
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage own watchlist" ON public.watchlists
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM coaches
      WHERE coaches.id = watchlists.coach_id
      AND coaches.user_id = auth.uid()
    )
  );

-- Coach Notes: Only owning coach
ALTER TABLE public.coach_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage own notes" ON public.coach_notes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM coaches
      WHERE coaches.id = coach_notes.coach_id
      AND coaches.user_id = auth.uid()
    )
  );
```

---

## SECTION 5: RECOMMENDED MIGRATION

Create a new migration file to fix all RLS issues:

```sql
-- Migration: 046_comprehensive_rls_fix.sql
-- Purpose: Add missing RLS policies to all critical tables

-- ============================================
-- 1. FIX PLAYERS TABLE ANONYMOUS ACCESS
-- ============================================
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- Remove any legacy permissive policies
DROP POLICY IF EXISTS "Enable read access for all users" ON public.players;
DROP POLICY IF EXISTS "Public read access" ON public.players;

-- ============================================
-- 2. MESSAGING TABLES
-- ============================================
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

-- Messages
CREATE POLICY "Participants can read messages" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can send messages" ON public.messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- Conversations
CREATE POLICY "Participants can read conversations" ON public.conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = conversations.id
      AND user_id = auth.uid()
    )
  );

-- Participants
CREATE POLICY "Users see own participations" ON public.conversation_participants
  FOR SELECT USING (user_id = auth.uid());

-- ============================================
-- 3. VIDEOS TABLE
-- ============================================
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players manage own videos" ON public.videos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.id = videos.player_id
      AND players.user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches can view videos" ON public.videos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'coach'
    )
  );

-- ============================================
-- 4. COACH DATA TABLES
-- ============================================
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage own watchlist" ON public.watchlists
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM coaches
      WHERE coaches.id = watchlists.coach_id
      AND coaches.user_id = auth.uid()
    )
  );

CREATE POLICY "Coaches manage own notes" ON public.coach_notes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM coaches
      WHERE coaches.id = coach_notes.coach_id
      AND coaches.user_id = auth.uid()
    )
  );

-- ============================================
-- 5. PLAYER SETTINGS
-- ============================================
ALTER TABLE public.player_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players manage own settings" ON public.player_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.id = player_settings.player_id
      AND players.user_id = auth.uid()
    )
  );

-- ============================================
-- 6. NOTIFICATIONS
-- ============================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users manage own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

-- ============================================
-- 7. DEVELOPMENTAL PLANS
-- ============================================
ALTER TABLE public.developmental_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage own plans" ON public.developmental_plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM coaches
      WHERE coaches.id = developmental_plans.coach_id
      AND coaches.user_id = auth.uid()
    )
  );

CREATE POLICY "Players view assigned plans" ON public.developmental_plans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.id = developmental_plans.player_id
      AND players.user_id = auth.uid()
    )
  );

-- ============================================
-- 8. CAMPS
-- ============================================
ALTER TABLE public.camps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage own camps" ON public.camps
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM coaches
      WHERE coaches.id = camps.coach_id
      AND coaches.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can view camps" ON public.camps
  FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE public.camp_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players manage own registrations" ON public.camp_registrations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.id = camp_registrations.player_id
      AND players.user_id = auth.uid()
    )
  );

CREATE POLICY "Camp owners see registrations" ON public.camp_registrations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM camps
      JOIN coaches ON coaches.id = camps.coach_id
      WHERE camps.id = camp_registrations.camp_id
      AND coaches.user_id = auth.uid()
    )
  );

-- ============================================
-- 9. GRANTS
-- ============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.developmental_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.camps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.camp_registrations TO authenticated;
```

---

## SECTION 6: VERIFICATION STEPS

After applying the migration:

1. **Test Anonymous Access**
   ```bash
   # Should return 0 rows for players
   curl -X GET "https://qmnssrrolpinvwjjnufo.supabase.co/rest/v1/players?select=*&limit=1" \
     -H "apikey: ${ANON_KEY}"
   ```

2. **Test Cross-User Access**
   - Login as Player A
   - Try to access Player B's videos → Should fail
   - Try to access Player B's settings → Should fail

3. **Test Coach Access**
   - Login as Coach A
   - Try to access Coach B's watchlist → Should fail
   - Try to access Coach B's notes → Should fail
   - Can view all players → Should succeed

4. **Test Message Privacy**
   - Login as User A
   - Try to read User B's conversations → Should fail

---

## SECTION 7: SUMMARY

### Fixed by Design
- ✅ Coaches table public read (discovery feature)
- ✅ Organizations readable by authenticated users
- ✅ Golf tables properly restricted

### Needs Investigation
- 🔴 Players table anonymous access (3 rows visible)

### Needs Migration
- 🔴 14 critical tables need RLS policies
- 🔴 Messaging tables completely unprotected
- 🔴 Videos table unprotected
- 🔴 Coach data tables unprotected

### Action Items
1. **Immediate**: Investigate players table anonymous access
2. **Immediate**: Create and apply migration 046_comprehensive_rls_fix.sql
3. **After Migration**: Run verification tests
4. **Ongoing**: Add E2E tests for cross-user access

---

*End of RLS Security Audit Report*
