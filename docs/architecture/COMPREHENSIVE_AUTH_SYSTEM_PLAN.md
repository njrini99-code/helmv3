<!--
STATUS: STALE
DATE: 2026-07-10
SUPERSEDED BY / WHY: Header dated 2026-01-01, "Ready for Implementation" pre-build plan. Auth has since shipped a dedicated W01 auth-foundation wave plus multiple P0/key-rotation runbooks (docs/operations/2026-05-17-p0-runbook.md, docs/operations/2026-07-03-p0-service-role-key-rotation-runbook.md). memory/registry.yml's auth_onboarding_join entry was re-pointed away from this doc (to docs/security/auth-config.md / docs/v3-rls-template.md) in this same sweep.
KEPT FOR HISTORY -- do not delete this file.
-->

# COMPREHENSIVE AUTH SYSTEM ANALYSIS & FIX PLAN

**Created:** 2026-01-01
**Status:** Analysis Complete, Ready for Implementation
**Scope:** End-to-end user signup, profile creation, team assignment, and dashboard access

---

## PART 1: SYSTEM ARCHITECTURE MAP

### 1.1 Current Data Flow (Signup → Dashboard)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER SIGNUP FLOW                                   │
└─────────────────────────────────────────────────────────────────────────────┘

[User Clicks "Sign Up"]
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  SIGNUP FORM (src/app/{sport}/(auth)/signup/page.tsx)                       │
│  Collects: email, password, role (player/coach)                             │
│  Golf also collects: firstName, lastName                                    │
└─────────────────────────────────────────────────────────────────────────────┘
       │
       │ signupAction() - src/app/{sport}/actions/auth.ts
       │ Passes to Supabase: { role, sport, first_name?, last_name? }
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  SUPABASE AUTH (auth.users table)                                           │
│  Creates auth user with raw_user_meta_data                                  │
│  Fires trigger: on_auth_user_created                                        │
└─────────────────────────────────────────────────────────────────────────────┘
       │
       │ TRIGGER: handle_new_user() - 045_comprehensive_auth_fix.sql
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  TRIGGER CREATES 3 RECORDS (with SECURITY DEFINER)                          │
│                                                                              │
│  1. public.users                                                             │
│     - id (from auth.users.id)                                               │
│     - email, role, sport                                                    │
│     - team_id: NOT SET ❌                                                    │
│                                                                              │
│  2. IF golf + player → public.golf_players                                  │
│     - user_id, first_name, last_name                                        │
│     - team_id: NULL ❌                                                       │
│     - onboarding_completed: false                                           │
│                                                                              │
│  3. IF golf + coach → public.golf_coaches                                   │
│     - user_id, full_name                                                    │
│     - team_id: NULL ❌                                                       │
│     - organization_id: NULL ❌                                               │
│     - onboarding_completed: false                                           │
│                                                                              │
│  (Same pattern for baseball → players/coaches tables)                       │
└─────────────────────────────────────────────────────────────────────────────┘
       │
       │ Redirect from signupAction()
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  ONBOARDING (src/app/{sport}/(onboarding)/{role}/page.tsx)                  │
│                                                                              │
│  FOR COACHES:                                                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Step 1: Organization Info → Creates golf_organizations record           ││
│  │ Step 2: Team Details     → Creates golf_teams record                    ││
│  │ Step 3: Profile          → Updates golf_coaches with team_id + org_id   ││
│  │ Step 4: Complete         → Sets onboarding_completed = true             ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  FOR PLAYERS:                                                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Step 1: Basic Info (name, email, phone)                                 ││
│  │ Step 2: Golf Info (year, handicap)                                      ││
│  │ Step 3: Academic Info (major, GPA)                                      ││
│  │ Step 4: Photo (optional)                                                ││
│  │ Step 5: Complete → Sets onboarding_completed = true                     ││
│  │                                                                          ││
│  │ ⚠️ NOTICE: NO TEAM ASSIGNMENT FOR PLAYERS IN ONBOARDING!                 ││
│  │ team_id remains NULL unless player joined via invite link               ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
       │
       │ router.push('/golf/dashboard')
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  DASHBOARD ACCESS                                                            │
│                                                                              │
│  Current State:                                                              │
│  - Dashboard DOES work without team_id (not blocked)                        │
│  - But team-related features show empty/broken states                       │
│  - Coach features expect organization_id/team_id to be set                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Alternative Flow: Team Invite Join

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       TEAM INVITE JOIN FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

[Player clicks invite link: /golf/join/ABC123]
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  CHECK AUTH (src/app/golf/join/[code]/page.tsx)                             │
│  - If not logged in → redirect to /golf/signup?returnTo=/golf/join/ABC123  │
│  - If logged in → continue                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  VALIDATE INVITE CODE                                                        │
│  - Find team by invite_code in golf_teams                                   │
│  - Check if player exists in golf_players                                   │
│  - Redirect to signup if no player record                                   │
└─────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  JOIN CONFIRMATION PAGE                                                      │
│  - Shows team name, organization                                             │
│  - Shows player name (from golf_players)                                    │
│  - User clicks "Confirm & Join Team"                                        │
└─────────────────────────────────────────────────────────────────────────────┘
       │
       │ processGolfTeamInvitation() - src/app/golf/actions/teams.ts
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  UPDATE PLAYER RECORD                                                        │
│  UPDATE golf_players SET team_id = [team.id] WHERE id = [player.id]         │
│  ✅ This is the ONLY place team_id gets assigned for players!               │
└─────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  REDIRECT TO DASHBOARD                                                       │
│  Player now has team_id, can see team features                              │
└─────────────────────────────────────────────────────────────────────────────┘


⚠️ PROBLEM: If player signs up DIRECTLY (not via invite link),
   they NEVER get assigned to a team!
```

---

## PART 2: IDENTIFIED PROBLEMS & ROOT CAUSES

### 2.1 Problem: 30 Orphaned Baseball Players

**Finding (Phase 4):**
- 30 player records in `players` table with NULL user_id
- All created at same timestamp: 2025-12-17T00:43:37
- All have realistic names (Dylan Anderson, Chase Taylor, etc.)

**Root Cause:**
- These are **seed/demo data** inserted for testing
- Inserted directly into `players` table without creating auth.users records
- The `user_id` column allows NULL (should it?)

**Relationship to System:**
```
players table:
┌──────────────────────────────────────────────────────┐
│ 39 total records                                     │
│ ├── 9 with user_id (real users)                     │
│ └── 30 with NULL user_id (seed data)               │
└──────────────────────────────────────────────────────┘

This affects:
- Coach Discover page shows fake players mixed with real
- Watchlist can include fake players
- Analytics/counts are inflated
```

### 2.2 Problem: 9 Players Without Names

**Finding (Phase 4):**
- 9 player records with NULL first_name/last_name
- All have valid user_id (real users)
- All have email addresses

**Root Cause:**
- Trigger creates player record with empty names
- User signs up but **skips or abandons onboarding**
- No enforcement of onboarding completion

**Flow Analysis:**
```
Signup → Trigger creates player with first_name=''
       → Redirect to onboarding
       → User closes browser / navigates away
       → Player record exists with empty names
       → User can still access dashboard (no gate)
```

**Affected Users:**
| Email | user_id | first_name | last_name |
|-------|---------|------------|-----------|
| bigblondebush69@gmail.com | 195b692e-... | NULL | NULL |
| 609@gmail.com | ba71c0a7-... | NULL | NULL |
| bob@gmail.com | 3421ffed-... | NULL | NULL |
| ... (6 more) | | | |

### 2.3 Problem: Golf Players Without Teams

**Finding (Phase 4):**
- 4 of 4 golf players have NULL team_id
- They can access dashboard but see empty team features

**Root Cause:**
- Player onboarding does NOT include team assignment
- The ONLY way to get team_id is via invite link join
- If player signs up directly, they're "teamless"

**This is a DESIGN problem, not a bug:**
```
Current Design:
- Players sign up → no team
- Coach creates team → gets team_id
- Coach sends invite to player
- Player joins via invite → gets team_id

The Gap:
- What if player signs up before being invited?
- What if player doesn't know the invite code?
- What if player is exploring before joining a team?

User's Requirement:
"Team IDs should be assigned during signup"
```

### 2.4 Problem: Golf Coaches Without Teams

**Finding (Phase 4):**
- 2 of 5 golf coaches have NULL team_id
- They can access dashboard but can't manage roster

**Root Cause:**
- Coach onboarding DOES create team and assign team_id
- But these coaches **skipped or failed onboarding**
- Similar to nameless players - abandoned onboarding

**Evidence:**
```
golf_coaches with team_id: 3
golf_coaches without team_id: 2

Those 2 coaches:
- Either skipped onboarding entirely
- Or onboarding failed silently (error handling catches all)
```

### 2.5 Problem: Golf Teams Without Coaches

**Finding (Phase 4):**
- 7 of 10 golf teams have no coach assigned
- These are "orphaned" teams

**Root Cause:**
- Multiple coaches created multiple teams during testing
- Coach creates team → gets team_id → but other teams remain orphaned
- No cleanup of test data

**Diagram:**
```
golf_teams (10 records):
├── Team 1 → Coach A (linked)
├── Team 2 → Coach B (linked)
├── Team 3 → Coach C (linked)
├── Team 4 → (no coach) ← orphaned
├── Team 5 → (no coach) ← orphaned
├── ... 5 more orphaned
```

### 2.6 Problem: RLS Exposes Players to Anonymous

**Finding (Phase 3):**
- `players` table returns 3 rows to anonymous (unauthenticated) users
- Missing RLS policy or incorrect "public" policy

**Root Cause:**
- Policy "Anyone can view coach profiles" exists on coaches
- Similar policy may have been applied to players incorrectly
- Or: seed data players have NULL user_id, bypassing user-based RLS

**Security Impact:**
```
Anonymous request to /rest/v1/players:
- Returns: 3 player records
- Exposes: names, positions, schools, contact info
- Should return: 0 (or only opted-in public profiles)
```

---

## PART 3: RELATIONSHIP DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ENTITY RELATIONSHIP MAP                               │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────┐
                    │   auth.users     │
                    │  (Supabase Auth) │
                    └────────┬─────────┘
                             │ trigger: handle_new_user
                             │ CREATES ↓
                    ┌────────▼─────────┐
                    │   public.users   │
                    │   id (=auth.id)  │
                    │   email          │
                    │   role           │
                    │   sport          │
                    └────────┬─────────┘
                             │
              ┌──────────────┴──────────────┐
              │ IF sport='golf'             │ IF sport='baseball'
              ▼                             ▼
    ┌─────────────────┐           ┌─────────────────┐
    │ IF role='coach' │           │ IF role='coach' │
    │       ▼         │           │       ▼         │
    │ golf_coaches    │           │ coaches         │
    │ - user_id (FK)  │           │ - user_id (FK)  │
    │ - team_id (FK)* │           │ - org_id (FK)   │
    │ - org_id (FK)*  │           │ - coach_type    │
    └─────────────────┘           └─────────────────┘
              │                             │
    ┌─────────────────┐           ┌─────────────────┐
    │ IF role='player'│           │ IF role='player'│
    │       ▼         │           │       ▼         │
    │ golf_players    │           │ players         │
    │ - user_id (FK)  │           │ - user_id (FK)  │
    │ - team_id (FK)* │           │ - player_type   │
    └─────────────────┘           └─────────────────┘

    * = SET DURING ONBOARDING (coach) or JOIN FLOW (player)


┌─────────────────────────────────────────────────────────────────────────────┐
│                         GOLF TEAM HIERARCHY                                  │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────┐
    │ golf_organizations  │◄──── Created by coach during onboarding
    │ - id                │
    │ - name              │
    │ - division          │
    └─────────┬───────────┘
              │ 1:many
              ▼
    ┌─────────────────────┐
    │ golf_teams          │◄──── Created by coach during onboarding
    │ - id                │
    │ - organization_id   │
    │ - name              │
    │ - invite_code       │◄──── Used by players to join
    └─────────┬───────────┘
              │
      ┌───────┴───────┐
      │ team_id FK    │ team_id FK
      ▼               ▼
┌─────────────┐ ┌─────────────┐
│golf_coaches │ │golf_players │
│ (1 per team)│ │ (many)      │
└─────────────┘ └─────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                       CURRENT STATE SUMMARY                                  │
└─────────────────────────────────────────────────────────────────────────────┘

GOLF:
┌────────────────────────────────────────────────────────────┐
│ users (sport='golf'): 9                                    │
│ golf_coaches: 5                                            │
│   ├── with team_id: 3                                      │
│   └── without team_id: 2 ← PROBLEM                         │
│ golf_players: 4                                            │
│   ├── with team_id: 0                                      │
│   └── without team_id: 4 ← ALL OF THEM                     │
│ golf_teams: 10                                             │
│   ├── with coach: 3                                        │
│   └── without coach: 7 ← ORPHANED                          │
│ golf_organizations: 11                                     │
└────────────────────────────────────────────────────────────┘

BASEBALL:
┌────────────────────────────────────────────────────────────┐
│ users (sport='baseball'): 10                               │
│ coaches: 1                                                 │
│ players: 39                                                │
│   ├── with user_id: 9                                      │
│   └── without user_id: 30 ← SEED DATA                      │
│   ├── with names: 30 (all seed)                            │
│   └── without names: 9 ← INCOMPLETE ONBOARDING             │
│ teams: 0 (baseball uses recruiting, not teams)            │
│ organizations: 33 (colleges for recruiting)                │
└────────────────────────────────────────────────────────────┘
```

---

## PART 4: USER'S REQUIREMENTS

> "Team ID's should be assigned during signup but hold off on requiring team id for any stage or data transfer yet so i can access dashboards even if not assigned to a team."

**Interpretation:**

1. **Team ID Assignment During Signup**: When a user signs up, they should get a team_id assigned somehow

2. **Do NOT Gate Dashboard Access**: Even without team_id, users should be able to access dashboards (current behavior, keep it)

3. **No Required Team for Data Operations**: Don't add validation that blocks data operations if team_id is NULL

**This creates a design challenge:**

```
OPTION A: Auto-create team on coach signup
- Coach signs up → trigger creates placeholder team → coach gets team_id
- Pro: Coach always has team_id
- Con: May create unwanted teams, coach might want to join existing team

OPTION B: Require team selection/creation during signup
- Add team step to signup form (before onboarding)
- Pro: User explicitly chooses
- Con: More friction, what about players?

OPTION C: Team assignment in onboarding (current + fix)
- Coach: Already creates team in onboarding → just ensure it completes
- Player: Add team selection/join step to onboarding
- Pro: Works with existing flow
- Con: Still allows skipping

OPTION D: Hybrid - different flows for coaches vs players
- Coaches: Create team during signup (lightweight)
- Players: Must have invite link OR create "unaffiliated" profile
- Pro: Matches real-world use case
- Con: Complex logic
```

---

## PART 5: SYSTEMATIC FIX PLAN

### Phase 1: Data Cleanup (No Code Changes)

**1.1 Handle Orphaned Seed Players**
```
Decision needed: Delete them or mark as demo?

Option A - Delete:
DELETE FROM players WHERE user_id IS NULL;
Result: 30 records removed, only real players remain

Option B - Mark as demo:
ALTER TABLE players ADD COLUMN is_demo BOOLEAN DEFAULT false;
UPDATE players SET is_demo = true WHERE user_id IS NULL;
Then: Update all queries to filter WHERE is_demo = false OR is_demo IS NULL
```

**1.2 Handle Orphaned Golf Teams**
```
-- Identify teams without any coach
SELECT gt.id, gt.name
FROM golf_teams gt
LEFT JOIN golf_coaches gc ON gc.team_id = gt.id
WHERE gc.id IS NULL;

-- Option A: Delete orphaned teams (test data)
DELETE FROM golf_teams
WHERE id NOT IN (SELECT team_id FROM golf_coaches WHERE team_id IS NOT NULL);

-- Option B: Assign to existing coaches (if appropriate)
-- Manual mapping required
```

**1.3 Handle Incomplete Player Profiles**
```
Decision needed: Contact users, delete, or mark incomplete?

-- Option A: Add incomplete flag
ALTER TABLE players ADD COLUMN profile_incomplete BOOLEAN DEFAULT false;
UPDATE players SET profile_incomplete = true
WHERE first_name IS NULL OR first_name = '';

-- Option B: Delete old incomplete accounts (>30 days)
DELETE FROM players
WHERE (first_name IS NULL OR first_name = '')
AND created_at < NOW() - INTERVAL '30 days';
-- Also need to delete from users and auth.users
```

### Phase 2: RLS Security Fix (Critical)

**2.1 Fix Players Table Exposure**
```sql
-- Remove any overly permissive policies
DROP POLICY IF EXISTS "Anyone can view players" ON public.players;
DROP POLICY IF EXISTS "Public player profiles" ON public.players;

-- Add proper policies
CREATE POLICY "Users can read own player profile" ON public.players
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Coaches can view players for recruiting" ON public.players
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'coach'
    )
    AND recruiting_activated = true
  );
```

**2.2 Apply Full RLS Migration**
- Run the migration from Phase 3: `046_comprehensive_rls_fix.sql`
- Covers all 14 tables identified as missing policies

### Phase 3: Team Assignment Logic

**3.1 For Golf Coaches: Ensure Onboarding Completes**

Current flow is correct, but need to:
- Add error tracking when onboarding fails
- Consider: Redirect back to onboarding if incomplete
- Consider: Add "Complete Profile" banner on dashboard

**3.2 For Golf Players: Add Team Assignment Path**

Two scenarios to handle:

**Scenario A: Player Signs Up via Invite Link**
```
Current: Works correctly
Flow: /golf/join/[code] → signup → onboarding → join team → dashboard

Fix needed: Ensure invite code is preserved through signup
- Store returnTo URL in session/localStorage
- After signup, automatically redirect to join page
- After onboarding, process the join
```

**Scenario B: Player Signs Up Directly (No Invite)**
```
Current: Player never gets team_id
Options:

Option 1: Add "Join Team" step to onboarding
- After profile completion, show:
  "Do you have a team invite code?"
  [Yes - enter code] [No - skip for now]
- If yes: validate and assign team_id
- If no: continue to dashboard (team_id = NULL)

Option 2: Prompt on dashboard if no team
- After onboarding, go to dashboard
- Dashboard shows banner: "You're not on a team yet"
- Banner has "Join Team" button
- Same join flow as invite link

Option 3: Create "unaffiliated" team
- Auto-create a personal team for the player
- Player can join "real" team later (replaces personal team)
```

**Recommended: Option 2 (Prompt on Dashboard)**
- Least disruptive to current flow
- Player can still use dashboard
- Clear call-to-action to join team

### Phase 4: Database Schema Refinements

**4.1 Consider NOT NULL Constraints (Future)**
```sql
-- DON'T do this yet per user request
-- But plan for future:

-- After cleanup, consider:
ALTER TABLE players
  ALTER COLUMN user_id SET NOT NULL;
-- This would prevent orphaned players

ALTER TABLE players
  ADD CONSTRAINT check_name_not_empty
  CHECK (first_name IS NOT NULL AND first_name != '');
-- This would enforce name completion
```

**4.2 Add Useful Indexes**
```sql
-- For common queries
CREATE INDEX IF NOT EXISTS idx_players_user_id ON players(user_id);
CREATE INDEX IF NOT EXISTS idx_golf_players_team_id ON golf_players(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_teams_invite_code ON golf_teams(invite_code);
```

### Phase 5: UI Improvements

**5.1 Dashboard "No Team" State**
- For golf players without team_id:
  - Show informative banner instead of broken features
  - Provide "Join Team" action
  - Don't hide team features, just show empty state

**5.2 Onboarding Completion Tracking**
- Add progress indicator
- If user navigates away, store progress
- On return, show "Continue Setup" prompt

**5.3 Profile Completeness Indicator**
- Show profile completion percentage
- List missing required fields
- Gentle prompts to complete

---

## PART 6: IMPLEMENTATION ORDER

### Immediate (Do First)
1. Apply RLS fix migration (security critical)
2. Decide on seed data strategy (delete vs mark)
3. Clean up orphaned golf teams (if test data)

### Short Term (This Week)
4. Add "Join Team" banner to golf player dashboard
5. Fix signup → join flow to preserve invite code
6. Add error tracking to onboarding

### Medium Term (Next Sprint)
7. Add team join step to player onboarding (optional)
8. Add profile completion prompts
9. Add data quality monitoring

### Long Term (Future)
10. Consider NOT NULL constraints after cleanup
11. Add self-serve team creation for players (if needed)
12. Implement team switching (baseball multi-team support)

---

## PART 7: DECISION POINTS FOR USER

Before implementing, need decisions on:

1. **Seed Data**: Delete the 30 orphaned baseball players, or mark them as demo?

2. **Incomplete Profiles**: Delete the 9 nameless accounts, or contact those users?

3. **Orphaned Golf Teams**: Delete the 7 teams without coaches?

4. **Player Team Assignment**: Use Option 2 (dashboard prompt) or different approach?

5. **Onboarding Enforcement**: Force completion, or allow skipping with prompts?

---

## APPENDIX: Files to Modify

### Database Migrations
- `supabase/migrations/047_rls_security_fix.sql` (new)
- `supabase/migrations/048_data_cleanup.sql` (new)

### Auth Actions
- `src/app/golf/actions/auth.ts` - Preserve returnTo for invite flow
- `src/app/baseball/actions/auth.ts` - Same

### Onboarding Pages
- `src/app/golf/(onboarding)/player/page.tsx` - Add team join option
- `src/app/golf/(onboarding)/coach/page.tsx` - Add error tracking

### Dashboard Pages
- `src/app/golf/(dashboard)/dashboard/page.tsx` - Add "no team" banner
- `src/app/golf/(dashboard)/layout.tsx` - Check team status

### Join Flow
- `src/app/golf/join/[code]/page.tsx` - Handle post-signup redirect
- `src/app/golf/(auth)/signup/page.tsx` - Handle returnTo param

### New Components
- `src/components/golf/JoinTeamBanner.tsx` (new)
- `src/components/shared/ProfileCompletionBanner.tsx` (new)
