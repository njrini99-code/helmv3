# BaseballHelm RLS Security Audit

**Generated:** 2026-02-21  
**Project:** helmv3  
**Supabase Project:** qmnssrrolpinvwjjnufo

---

## Executive Summary

BaseballHelm uses comprehensive Row Level Security (RLS) policies across all baseball-prefixed tables. The security model is role-based with two primary personas:
- **Coaches** - Can manage teams, players, recruiting, content
- **Players** - Can manage their own profiles, join teams, activate recruiting

### Key Security Helper Functions

```sql
get_my_coach_id()        -- Returns current user's coach ID (NULL if not coach)
get_my_player_id()       -- Returns current user's player ID (NULL if not player)
is_baseball_team_coach() -- Checks if user is coach of specific team
is_baseball_team_member() -- Checks if user is player on specific team
```

---

## 1. baseball_coaches

### Schema Context
- Links `user_id` → `auth.uid()` (authenticated user)
- Contains `organization_id` for organization-level access

### RLS Policies

| Policy | Operation | Logic |
|--------|-----------|-------|
| `baseball_coaches_select` | SELECT | **All authenticated users** can read coach profiles |
| `baseball_coaches_insert` | INSERT | Only when `user_id = auth.uid()` |
| `baseball_coaches_update` | UPDATE | Only when `user_id = auth.uid()` |
| `baseball_coaches_delete` | DELETE | Only when `user_id = auth.uid()` |

### Analysis
✅ **Good**: Coaches can only modify their own profile  
⚠️ **Design Choice**: All coaches are publicly visible (for messaging, discovery)

---

## 2. baseball_players

### Schema Context
- Links `user_id` → `auth.uid()`
- **Critical field**: `recruiting_activated` controls visibility to coaches

### RLS Policies

| Policy | Operation | Logic |
|--------|-----------|-------|
| `baseball_players_select` | SELECT | See below - multi-condition |
| `baseball_players_insert` | INSERT | Only when `user_id = auth.uid()` |
| `baseball_players_update` | UPDATE | Only when `user_id = auth.uid()` |
| `baseball_players_delete` | DELETE | Only when `user_id = auth.uid()` |

### SELECT Logic (Detailed)

```sql
USING (
  user_id = auth.uid()                    -- 1. Own profile always visible
  OR recruiting_activated = true           -- 2. Recruiting ON = coaches see
  OR id IN (                               -- 3. Same team visibility
    SELECT tm.player_id FROM baseball_team_members tm
    WHERE tm.team_id IN (
      -- Teams where viewer is a player
      SELECT tm2.team_id FROM baseball_team_members tm2 
      WHERE tm2.player_id = get_my_player_id()
      UNION
      -- Teams where viewer is head coach
      SELECT t.id FROM baseball_teams t 
      WHERE t.head_coach_id = get_my_coach_id()
      UNION
      -- Teams where viewer is assistant coach
      SELECT tcs.team_id FROM baseball_team_coach_staff tcs 
      WHERE tcs.coach_id = get_my_coach_id()
    )
  )
)
```

### Analysis
✅ **Good**: `recruiting_activated` properly gates coach discovery  
✅ **Good**: Team members can always see teammates  
✅ **Good**: Players fully control their own profile

---

## 3. baseball_teams

### RLS Policies

| Policy | Operation | Logic |
|--------|-----------|-------|
| `baseball_teams_select` | SELECT | Team coach, team member, OR **same organization** coach |
| `baseball_teams_insert` | INSERT | Coach in same organization |
| `baseball_teams_update` | UPDATE | **Head coach only** |
| `baseball_teams_delete` | DELETE | **Head coach only** |

### SELECT Logic

```sql
USING (
  is_baseball_team_coach(id)              -- Viewer coaches this team
  OR is_baseball_team_member(id)          -- Viewer plays on this team
  OR organization_id IN (                 -- Organization-level access
    SELECT organization_id FROM baseball_coaches 
    WHERE id = get_my_coach_id()
  )
)
```

### Analysis
✅ **Good**: Head coach has exclusive update/delete rights  
✅ **Good**: Organization coaches can see all teams (showcase functionality)  
⚠️ **Note**: Any org coach can CREATE teams (may be intentional)

---

## 4. baseball_team_members

### RLS Policies

| Policy | Operation | Logic |
|--------|-----------|-------|
| `baseball_team_members_select` | SELECT | Team coach, team member, OR own record |
| `baseball_team_members_insert` | INSERT | **Team coaches only** |
| `baseball_team_members_update` | UPDATE | **Team coaches only** |
| `baseball_team_members_delete` | DELETE | Team coach OR **self** (leave team) |

### Analysis
✅ **Good**: Only coaches can add players to teams  
✅ **Good**: Players can remove themselves (leave team)  
✅ **Good**: Coaches control roster

---

## 5. baseball_team_coach_staff

### RLS Policies

| Policy | Operation | Logic |
|--------|-----------|-------|
| `baseball_team_coach_staff_select` | SELECT | Team coach OR viewing own record |
| `baseball_team_coach_staff_insert` | INSERT | **Head coach only** |
| `baseball_team_coach_staff_update` | UPDATE | **Head coach only** |
| `baseball_team_coach_staff_delete` | DELETE | **Head coach only** |

### Analysis
✅ **Good**: Only head coach controls assistant coaches

---

## 6. baseball_conversations / baseball_messages

### Conversation Policies

| Policy | Operation | Logic |
|--------|-----------|-------|
| `baseball_conversations_select` | SELECT | Participant only |
| `baseball_conversations_insert` | INSERT | **Any authenticated user** |
| `baseball_conversations_update` | UPDATE | Participant only |

### Message Policies

| Policy | Operation | Logic |
|--------|-----------|-------|
| `baseball_messages_select` | SELECT | Conversation participant only |
| `baseball_messages_insert` | INSERT | Sender must be participant + `sender_id = auth.uid()` |
| `baseball_messages_update_read` | UPDATE | Participant only (for read status) |

### Participant Policies (Fixed in migration 044)

| Policy | Operation | Logic |
|--------|-----------|-------|
| `baseball_participants_select_in_conversation` | SELECT | See all participants if you're in conversation |
| `baseball_participants_insert_by_creator` | INSERT | Add self OR conversation creator can add others |
| `baseball_participants_update_own` | UPDATE | Own record only (last_read_at) |

### Analysis
✅ **Good**: Messages are private to participants  
✅ **Good**: Sender verification prevents spoofing  
⚠️ **Note**: Anyone can start a conversation with anyone (no blocking system)

---

## 7. baseball_camps

### RLS Policies

| Policy | Operation | Logic |
|--------|-----------|-------|
| `baseball_camps_select` | SELECT | **All authenticated users** (public discovery) |
| `baseball_camps_insert` | INSERT | Coach only (`coach_id = get_my_coach_id()`) |
| `baseball_camps_update` | UPDATE | Camp creator only |
| `baseball_camps_delete` | DELETE | Camp creator only |

### Camp Registration Policies

| Policy | Operation | Logic |
|--------|-----------|-------|
| `baseball_camp_registrations_select` | SELECT | Player sees own, Camp owner sees all |
| `baseball_camp_registrations_insert` | INSERT | Player only (`player_id = get_my_player_id()`) |
| `baseball_camp_registrations_update` | UPDATE | Camp owner only (status changes) |
| `baseball_camp_registrations_delete` | DELETE | Player only (cancel own registration) |

### Analysis
✅ **Good**: Camps publicly visible for player discovery  
✅ **Good**: Players self-register, coaches manage approvals

---

## 8. Recruiting Tables

### 8a. baseball_watchlists

| Policy | Operation | Logic |
|--------|-----------|-------|
| ALL operations | SELECT/INSERT/UPDATE/DELETE | `coach_id = get_my_coach_id()` only |

✅ **Good**: Watchlists are completely private to each coach

### 8b. baseball_recruiting_interests

| Policy | Operation | Logic |
|--------|-----------|-------|
| `baseball_recruiting_interests_select` | SELECT | Player sees own, Coach sees org-matching interests |
| `baseball_recruiting_interests_insert` | INSERT | Player only |
| `baseball_recruiting_interests_update` | UPDATE | Player only |
| `baseball_recruiting_interests_delete` | DELETE | Player only |

### 8c. baseball_player_engagement_events

| Policy | Operation | Logic |
|--------|-----------|-------|
| SELECT | Player sees own, Coach sees events they created |
| INSERT | Coach only + **player must have recruiting_activated** |

### 8d. baseball_coach_notes

| Policy | Operation | Logic |
|--------|-----------|-------|
| ALL operations | `coach_id = get_my_coach_id()` only |

### 8e. baseball_videos

| Policy | Operation | Logic |
|--------|-----------|-------|
| SELECT | Own videos, OR player has `recruiting_activated`, OR same team |
| INSERT/UPDATE/DELETE | Player only (`player_id = get_my_player_id()`) |

### Analysis
✅ **Good**: Coach watchlists/notes are private  
✅ **Good**: Engagement tracking respects `recruiting_activated`  
✅ **Good**: Videos follow recruiting activation flag

---

## 9. How recruiting_activated Affects Visibility

### Tables Gated by recruiting_activated

| Table | Effect When OFF | Effect When ON |
|-------|----------------|----------------|
| `baseball_players` | Only visible to self + teammates | Visible to ALL coaches |
| `baseball_videos` | Only visible to self + teammates | Visible to ALL coaches |
| `baseball_player_engagement_events` | Coach INSERT blocked | Coach INSERT allowed |

### Code Path

```sql
-- Players query: coaches can only see recruiting-active players
OR recruiting_activated = true

-- Videos query: coaches can only see recruiting-active player videos  
OR player_id IN (SELECT id FROM baseball_players WHERE recruiting_activated = true)

-- Engagement insert: requires recruiting activation
WITH CHECK (
  coach_id = get_my_coach_id()
  AND player_id IN (SELECT id FROM baseball_players WHERE recruiting_activated = true)
)
```

---

## 10. Organization-Level Access (Showcase Coaches)

### How It Works

Coaches within the same organization can:
1. **See all teams** in their organization
2. **Create new teams** in their organization

```sql
-- Teams SELECT policy
OR organization_id IN (
  SELECT organization_id FROM baseball_coaches 
  WHERE id = get_my_coach_id()
)

-- Teams INSERT policy
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM baseball_coaches 
    WHERE id = get_my_coach_id()
  )
)
```

### Use Case
- **Showcase/Travel organizations** have multiple teams
- All org coaches can view all teams' info
- Head coach of each team controls their specific team

---

## 11. Security Concerns and Gaps

### ⚠️ Potential Issues

#### 1. **No Rate Limiting on Conversation Creation**
```sql
-- Anyone can create unlimited conversations
CREATE POLICY "baseball_conversations_insert" 
WITH CHECK (true);
```
**Risk**: Spam/harassment potential  
**Mitigation**: Add application-level rate limiting

#### 2. **No Message Blocking System**
Players cannot block coaches from messaging them (or vice versa).  
**Risk**: Unwanted contact  
**Mitigation**: Add blocking table + RLS check

#### 3. **Coach Notes Visible to Owning Coach Only**
If a coach leaves an organization, their notes are orphaned/inaccessible.  
**Consideration**: May want org-level note sharing option

#### 4. **No Audit Trail for Sensitive Actions**
Changes to `recruiting_activated`, team membership, etc. are not logged.  
**Recommendation**: Add audit triggers for compliance

### ✅ Well-Designed Security

1. **recruiting_activated** properly gates player discovery
2. **Team membership** properly controlled by coaches
3. **Watchlists/notes** completely private
4. **Messages** cannot be spoofed (sender_id verified)
5. **Organization hierarchy** works correctly
6. **Players can leave teams** without coach approval
7. **Head coach** has exclusive control over team updates

---

## 12. Team Management Tables (Migration 20260208)

### Documents
| Policy | Logic |
|--------|-------|
| SELECT (coach) | Team coach sees all |
| SELECT (player) | Player sees `is_player_visible = true` only |
| INSERT/UPDATE/DELETE | Team coaches only |

### Tasks & Assignments
| Policy | Logic |
|--------|-------|
| SELECT | Team coach OR team player |
| INSERT/UPDATE/DELETE | Team coaches only |
| Player UPDATE | Can update own assignments (mark complete) |

### Announcements
| Policy | Logic |
|--------|-------|
| SELECT (coach) | Team coach sees all |
| SELECT (player) | Broadcast OR explicitly targeted |
| INSERT/UPDATE/DELETE | Team coaches only |

### Travel
| Policy | Logic |
|--------|-------|
| SELECT | Team coach OR team player |
| INSERT/UPDATE/DELETE | Team coaches only |

### Academic (Classes/Eligibility)
| Policy | Logic |
|--------|-------|
| SELECT | Player sees own, coaches see team players |
| INSERT (classes) | Player only |
| INSERT (eligibility) | Coach only |

---

## 13. Summary Table

| Table | Read | Write | Delete |
|-------|------|-------|--------|
| baseball_coaches | All auth | Self only | Self only |
| baseball_players | Self/Team/Recruiting | Self only | Self only |
| baseball_teams | Org coaches/Members | Org coaches | Head coach |
| baseball_team_members | Team access | Team coach | Coach or self |
| baseball_watchlists | Self only | Self only | Self only |
| baseball_videos | Self/Team/Recruiting | Self only | Self only |
| baseball_messages | Participants | Self+Participant | N/A |
| baseball_camps | All auth | Creator | Creator |
| baseball_camp_registrations | Self/Owner | Self | Self |
| baseball_coach_notes | Self only | Self only | Self only |
| baseball_events | Team access | Team coach | Creator |
| baseball_documents | Team (visibility) | Team coach | Team coach |
| baseball_tasks | Team access | Team coach | Team coach |

---

## Recommendations

1. **Add rate limiting** for conversation/message creation
2. **Add blocking feature** for messaging privacy
3. **Consider audit logging** for `recruiting_activated` changes
4. **Document** the "all coaches public" design decision
5. **Test** organization cross-access scenarios thoroughly
