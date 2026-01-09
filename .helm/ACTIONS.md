# Helm v3 - Action Items
**The definitive task list for Helm development**

Last Updated: 2026-01-08
Platform: Helm Sports Labs v3 (Baseball Recruiting + Golf Team Management)

---

## 🔴 DO TODAY - CRITICAL BLOCKERS

### SEC-001: Re-Enable RLS on All Golf Tables
**Priority:** P0 - BLOCKING PRODUCTION
**Status:** ✅ Complete (migration: `supabase/migrations/20260108000002_comprehensive_rls_fix.sql`)
**Time:** 30 minutes
**Impact:** Security breach - ALL golf data exposed to ANY authenticated user

**Problem:** Migrations 061 and 062 disabled RLS on 10 core golf tables with comment "RLS disabled for development - re-enable in production". This appears to be IN PRODUCTION.

**Files:**
- `/Users/ricknini/Downloads/helmv3/supabase/migrations/` - Need new migration

**Test:**
```bash
# Run this query in Supabase SQL editor - should return 0 rows
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'golf_%'
  AND rowsecurity = false;
```

**Action:**
```sql
-- Create new migration: supabase/migrations/YYYYMMDD_reenable_golf_rls.sql
ALTER TABLE golf_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_shots ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_event_participants ENABLE ROW LEVEL SECURITY;

-- Add team-scoped policies (see RLS_AUDIT.md for complete migration)
```

**Verification:**
```bash
# After migration, verify no data leaks
# As Player A from Team A, try to see Team B data:
SELECT COUNT(*) FROM golf_rounds
WHERE player_id NOT IN (SELECT id FROM golf_players WHERE user_id = auth.uid());
# Should return 0
```

---

### SEC-002: Add Policies for 15 Golf Tables
**Priority:** P0 - BLOCKING PRODUCTION
**Status:** ✅ Complete (migrations: `20260108000002_comprehensive_rls_fix.sql`, `064_enable_rls_team_scoping.sql`, `052_critical_audit_fixes.sql`)
**Time:** 1 hour
**Impact:** Feature breakage OR data exposure depending on Supabase defaults

**Problem:** 15 golf tables have RLS ENABLED but NO POLICIES defined. This makes them completely inaccessible or completely open.

**Affected Tables:**
- golf_qualifiers
- golf_qualifier_entries
- golf_announcements
- golf_announcement_acknowledgements
- golf_tasks
- golf_task_completions
- golf_documents
- golf_travel_itineraries
- golf_coach_notes (CONTAINS PRIVATE NOTES!)
- golf_player_classes
- golf_event_rsvps
- golf_holes
- golf_event_attendance
- golf_course_tees
- golf_player_stats

**Action:**
See `/Users/ricknini/Downloads/helmv3/.helm/security/RLS_AUDIT.md` Part 7 for complete migration SQL.

**Test:**
```sql
-- Verify all tables have policies
SELECT t.tablename, COUNT(p.policyname) as policy_count
FROM pg_tables t
LEFT JOIN pg_policies p ON p.tablename = t.tablename
WHERE t.schemaname = 'public' AND t.tablename LIKE 'golf_%'
GROUP BY t.tablename
HAVING COUNT(p.policyname) = 0;
-- Should return 0 rows
```

---

## 🟠 DO THIS WEEK - HIGH PRIORITY

### CORE-001: Implement JUCO Mode Toggle
**Priority:** P0 - BLOCKS 30% OF JUCO COACH FEATURES
**Status:** ✅ Complete (Mode toggle + routing guard + cookie sync)
**Time:** 2-3 days
**Impact:** JUCO coaches cannot use the platform

**Problem:** JUCO coaches need dual functionality:
1. Recruiting mode (acting as college coach recruiting players)
2. Team mode (acting as HS coach helping current players get recruited)

The `coach_mode` field exists in auth store but no UI or logic to switch modes.

**Files to modify:**
- `src/stores/auth-store.ts` - Already has coach_mode field
- `src/components/layout/Header.tsx` - Add mode toggle for JUCO coaches
- `src/middleware.ts` - Add routing logic based on mode
- `src/app/baseball/dashboard/page.tsx` - Conditional redirect based on mode

**Implementation:**
```typescript
// src/components/baseball/coach/ModeToggle.tsx
'use client'
import { useAuthStore } from '@/stores/auth-store'

export function JUCOModeToggle() {
  const { user, coachMode, setCoachMode } = useAuthStore()

  if (user?.coach_type !== 'juco') return null

  return (
    <ToggleGroup value={coachMode} onValueChange={setCoachMode}>
      <ToggleGroupItem value="recruiting">
        Recruiting Mode
      </ToggleGroupItem>
      <ToggleGroupItem value="team">
        Team Mode
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
```

**Test Plan:**
1. Sign up as JUCO coach
2. See mode toggle in header
3. In recruiting mode:
   - Can access /baseball/dashboard/discover
   - Can add players to watchlist
   - Cannot access /baseball/dashboard/team
4. In team mode:
   - Can access /baseball/dashboard/team
   - Can upload videos for players
   - Cannot access /baseball/dashboard/discover

---

### CORE-002: Multi-Team Support for Showcase Coaches
**Priority:** P0 - BLOCKS 35% OF SHOWCASE COACH FEATURES
**Status:** ✅ Complete (Org dashboard + team selector + nav/redirect updates)
**Time:** 3-4 days
**Impact:** Showcase organizations (large customers) cannot manage multiple teams

**Problem:** Showcase organizations like Perfect Game have 10-50 teams. Need:
1. Team selector UI
2. Organization-level dashboard
3. Cross-team roster view
4. Org-level analytics

Database schema exists but UI is incomplete.

**Files to create:**
- `src/components/baseball/showcase/TeamSelector.tsx`
- `src/components/baseball/showcase/OrgDashboard.tsx`
- `src/app/baseball/dashboard/organization/page.tsx`

**Database queries needed:**
```typescript
// src/lib/queries/organizations.ts
export async function getOrganizationTeams(orgId: string) {
  const supabase = await createClient()
  return supabase
    .from('teams')
    .select('*, team_members(count), team_coach_staff(count)')
    .eq('organization_id', orgId)
}

export async function getOrganizationStats(orgId: string) {
  // Aggregate stats across all teams
  // Total players, total videos, college interest, etc.
}
```

**Test Plan:**
1. Create showcase coach account
2. Create 3 teams under organization
3. Switch between teams - see correct roster
4. View org dashboard - see aggregated stats
5. Upload video for player on Team A while viewing Team B

---

### CORE-003: Complete High School Coach Dashboard
**Priority:** P0 - BLOCKS HS COACH USER SEGMENT
**Status:** ✅ Complete (Roster table, interest tracker, batch video upload, analytics, comms)
**Time:** 3-4 days
**Impact:** HS coaches have minimal functionality, blocking player-side revenue

**Problem:** Route exists at `/baseball/dashboard/team/high-school` but dashboard is barely implemented.

**Features to build:**
1. Roster management table with player cards
2. College interest tracker (which schools viewed each player)
3. Video upload workflow for multiple players
4. Team performance analytics
5. Communication tools

**Files to create:**
- `src/app/baseball/dashboard/team/high-school/page.tsx` - Main dashboard
- `src/components/baseball/team/RosterTable.tsx`
- `src/components/baseball/team/CollegeInterestTracker.tsx`
- `src/components/baseball/team/BatchVideoUpload.tsx`
- `src/components/baseball/team/TeamAnalytics.tsx`

**UI Layout:**
```typescript
<Dashboard>
  <StatsBar>
    <Stat label="Total Players" value={roster.length} />
    <Stat label="Videos Uploaded" value={videoCount} />
    <Stat label="College Views" value={viewCount} />
    <Stat label="Active Offers" value={offerCount} />
  </StatsBar>

  <TwoColumnLayout>
    <MainColumn>
      <RosterTable players={roster} />
    </MainColumn>

    <Sidebar>
      <CollegeInterestFeed />
      <UpcomingEvents />
    </Sidebar>
  </TwoColumnLayout>
</Dashboard>
```

**Test Plan:**
1. Sign up as HS coach
2. Add 10 players to roster
3. Upload videos for 5 players
4. Verify college coaches can discover players
5. Track which colleges view player profiles
6. See interest feed update in real-time

---

### PERF-001: Add Database Indexes for Discovery Page
**Priority:** P1 - USER EXPERIENCE
**Status:** ✅ Complete (migration: `supabase/migrations/20260109000002_discovery_indexes.sql`)
**Time:** 30 minutes
**Impact:** Discovery page slow (2-3s with filters), 80% faster with indexes

**Problem:** Player discovery with filters (position, grad year, state, velocity) is slow due to missing indexes.

**Files:**
- Create `supabase/migrations/YYYYMMDD_discovery_indexes.sql`

**Migration:**
```sql
-- Index for common discovery filters
CREATE INDEX idx_players_recruiting_active
  ON players(recruiting_activated)
  WHERE recruiting_activated = true;

CREATE INDEX idx_players_position_grad_year
  ON players(primary_position, grad_year);

CREATE INDEX idx_players_state
  ON players(state);

CREATE INDEX idx_player_metrics_velocity
  ON player_metrics(player_id, throwing_velocity)
  WHERE throwing_velocity IS NOT NULL;

CREATE INDEX idx_player_metrics_exit_velo
  ON player_metrics(player_id, exit_velocity)
  WHERE exit_velocity IS NOT NULL;

-- Composite index for common filter combination
CREATE INDEX idx_players_discovery_composite
  ON players(recruiting_activated, primary_position, grad_year, state)
  WHERE recruiting_activated = true;
```

**Test:**
```sql
-- Before: EXPLAIN ANALYZE
SELECT * FROM players
WHERE recruiting_activated = true
  AND primary_position = 'pitcher'
  AND grad_year = 2025
  AND state = 'TX';
-- Expected: Seq Scan, ~500ms

-- After: EXPLAIN ANALYZE (same query)
-- Expected: Index Scan, ~50ms (10x faster)
```

---

### SEC-003: Fix Permissive Policies
**Priority:** P1 - SECURITY
**Status:** ✅ Complete (migration: `supabase/migrations/20260108000002_comprehensive_rls_fix.sql`)
**Time:** 2 hours
**Impact:** Data exposure, spam, competitive intelligence leaks

**Problem:** 8 tables use `USING (true)` or overly permissive policies:
1. organizations - ALL orgs visible
2. coaches - ALL coach emails/phones exposed
3. team_invitations - Invite code enumeration
4. golf_calendar_notifications - Notification spam
5. golf_global_patterns - AI IP exposed
6. golf_confidence_calibration - ML models exposed
7. profile_views - View count manipulation
8. players - "Coaches can view all players"

**Action:**
See `/Users/ricknini/Downloads/helmv3/.helm/security/RLS_AUDIT.md` Part 8-9 for complete fix.

**Test:**
```sql
-- Verify no permissive policies remain
SELECT tablename, policyname, qual::text, with_check::text
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual::text = 'true' OR with_check::text = 'true');
-- Review each result - should be minimal/justified
```

---

## 🟡 DO THIS MONTH - IMPORTANT

### FEAT-001: Video Clipping Tool
**Priority:** P2 - FEATURE REQUEST
**Status:** ✅ Complete (VideoClipper component + migration: 20260109000004_video_clips_support.sql)
**Time:** 5 days
**Impact:** Players want to create highlight reels without external tools

**Problem:** Players upload full game videos then need external tools (iMovie, etc.) to create clips. Want in-app clipping.

**Design:**
- Web-based video editor using browser VideoContext API
- Timeline with markers for clip start/end
- Preview and trim functionality
- Export to new video file
- Save clips to player profile

**Files to create:**
- `src/components/video/VideoClipper.tsx`
- `src/app/baseball/dashboard/videos/[id]/edit/page.tsx`
- `src/lib/video/clipper.ts` - Video processing logic

**Dependencies:**
- Consider library: `@ffmpeg/ffmpeg` (WASM) or server-side with FFmpeg

**Test Plan:**
1. Upload 5-minute video
2. Mark clip from 1:30 to 2:15
3. Preview clip
4. Export clip
5. See new clip in video library

---

### FEAT-002: Email/Push Notifications
**Priority:** P2 - USER ENGAGEMENT
**Status:** ✅ Complete (src/lib/notifications/* + migration: 20260109000005_notification_preferences.sql)
**Time:** 4 days
**Impact:** Users miss important events without notifications

**Events to notify:**
1. Baseball:
   - New message from coach/player
   - Coach adds player to watchlist
   - Stage change in pipeline
   - Camp registration confirmed
   - Profile view from college coach
2. Golf:
   - New team announcement
   - Qualifier created/updated
   - Event RSVP reminder
   - Round submitted for qualifier
   - CoachHelm insight available

**Implementation:**
```typescript
// src/lib/notifications/email.ts
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendNewMessageNotification(userId: string, from: string) {
  const { data: user } = await supabase
    .from('users')
    .select('email, notification_preferences')
    .eq('id', userId)
    .single()

  if (!user.notification_preferences.email_messages) return

  await resend.emails.send({
    from: 'Helm <notifications@helmsportslabs.com>',
    to: user.email,
    subject: `New message from ${from}`,
    html: MessageEmailTemplate({ from })
  })
}
```

**Database Migration:**
```sql
ALTER TABLE users ADD COLUMN notification_preferences JSONB DEFAULT '{
  "email_messages": true,
  "email_pipeline_updates": true,
  "email_event_reminders": true,
  "push_messages": false,
  "push_events": false
}'::jsonb;
```

---

### FEAT-003: Golf Qualifiers Create UI
**Priority:** P2 - PARTIAL IMPLEMENTATION
**Status:** ✅ Complete (CreateQualifier modal + server action)
**Time:** 2 days
**Impact:** Coaches can view qualifiers but cannot create them

**Problem:** Backend logic exists but create UI is missing.

**Files to create:**
- `src/app/golf/dashboard/qualifiers/new/page.tsx`
- `src/components/golf/qualifiers/CreateQualifierForm.tsx`

**Form fields:**
- Qualifier name
- Start date
- Number of rounds
- Spots available (how many players make traveling lineup)
- Course (optional - rounds can specify different courses)
- Notes

**Test Plan:**
1. Navigate to /golf/dashboard/qualifiers
2. Click "Create Qualifier"
3. Fill form and submit
4. See qualifier in list
5. Add rounds to qualifier
6. View leaderboard

---

### FEAT-004: Saved Player Comparisons
**Priority:** P2 - PARTIAL IMPLEMENTATION
**Status:** ✅ Complete (save modal + saved comparisons page)
**Time:** 1 day
**Impact:** Coaches compare players repeatedly but comparisons aren't saved

**Problem:** Comparison tool works but results aren't saved. Coaches want to bookmark comparisons.

**Files to modify:**
- `src/app/baseball/dashboard/comparisons/page.tsx`
- `src/components/baseball/comparisons/SavedComparisons.tsx`

**Database:**
Table already exists: `player_comparisons`
```sql
CREATE TABLE player_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID REFERENCES coaches(id),
  name TEXT,
  player_ids UUID[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**UI Flow:**
1. Compare 3 players
2. Click "Save Comparison"
3. Enter name: "2025 Pitchers - Top Prospects"
4. See in saved list
5. Click saved comparison - loads same 3 players

---

### FEAT-005: Development Plans Detail Pages
**Priority:** P2 - PLACEHOLDER
**Status:** ✅ Complete (detail page + progress tracker)
**Time:** 2 days
**Impact:** Feature exists in nav but no detail view

**Problem:** `/baseball/dashboard/dev-plans` lists plans but no detail view for individual plan.

**Files to create:**
- `src/app/baseball/dashboard/dev-plans/[id]/page.tsx`
- `src/components/baseball/dev-plans/PlanDetail.tsx`
- `src/components/baseball/dev-plans/ProgressTracker.tsx`

**UI Layout:**
```typescript
<PlanDetail>
  <Header>
    <PlayerInfo />
    <ProgressBar percent={plan.completion} />
  </Header>

  <GoalsSection>
    {plan.goals.map(goal => (
      <GoalCard
        goal={goal}
        progress={goal.progress}
        milestones={goal.milestones}
      />
    ))}
  </GoalsSection>

  <TimelineSection>
    <ActivityFeed activities={plan.activities} />
  </TimelineSection>
</PlanDetail>
```

---

### TECH-001: Expand Test Coverage
**Priority:** P2 - QUALITY
**Status:** ✅ Complete (e2e/golf-round.spec.ts, golf-qualifier.spec.ts, baseball-pipeline.spec.ts, camps.spec.ts, roster.spec.ts)
**Time:** 5 days
**Impact:** Regression risk, no CI confidence

**Current Coverage:**
- E2E tests: Auth, discover, watchlist, messages
- Missing: Golf flows, pipeline, camps, roster

**Tests to add:**
1. Golf round submission (happy path + error cases)
2. Golf qualifier creation and completion
3. Pipeline drag-and-drop (mock @dnd-kit)
4. Camp registration flow
5. Roster management CRUD
6. Real-time messaging delivery
7. CoachHelm AI insights generation

**Files:**
- `e2e/golf-round.spec.ts`
- `e2e/golf-qualifier.spec.ts`
- `e2e/baseball-pipeline.spec.ts`
- `e2e/camps.spec.ts`

---

### TECH-002: Bundle Size Optimization
**Priority:** P2 - PERFORMANCE
**Status:** ✅ Complete (already configured in next.config.mjs - bundle analyzer, optimizePackageImports, chunk splitting)
**Time:** 2 days
**Impact:** Bundle size not monitored, risk of creep

**Actions:**
1. Add bundle analyzer to CI
2. Lazy load heavy features:
   - Recharts (charts on dashboard)
   - Framer Motion animations
   - Video player components
   - @dnd-kit (pipeline)
3. Code split by route (already done via Next.js)
4. Remove unused dependencies

**Script:**
```bash
# Add to package.json
"analyze": "ANALYZE=true npm run build"

# Add to .github/workflows/ci.yml
- name: Analyze bundle
  run: npm run analyze
- name: Check bundle size
  run: npx bundlewatch
```

---

### TECH-003: Add Audit Logging to SECURITY DEFINER Functions
**Priority:** P2 - SECURITY
**Status:** ✅ Complete (migration: `supabase/migrations/20260109000003_function_audit_log.sql`)
**Time:** 1 day
**Impact:** No visibility into function usage, hard to debug

**Problem:** 18 SECURITY DEFINER functions bypass RLS but have no logging. Need audit trail.

**Functions to log:**
- can_users_message()
- create_conversation_with_participants()
- are_users_on_same_roster()
- handle_new_user()

**Implementation:**
```sql
CREATE TABLE function_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  called_by UUID, -- auth.uid()
  input_params JSONB,
  output_result JSONB,
  error TEXT,
  execution_time_ms INTEGER,
  called_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add to each SECURITY DEFINER function:
INSERT INTO function_audit_log (
  function_name,
  called_by,
  input_params,
  output_result
) VALUES (
  'can_users_message',
  auth.uid(),
  jsonb_build_object('sender', sender_id, 'recipient', recipient_id),
  jsonb_build_object('allowed', result)
);
```

---

## 🟢 BACKLOG - NICE TO HAVE

### FEAT-006: Weather Integration for Golf
**Priority:** P3
**Time:** 2 days
**Impact:** Contextualizes round performance

Add weather data to rounds (wind, temp, precipitation) to help explain scores.

---

### FEAT-007: Google Calendar Sync
**Priority:** P3
**Time:** 3 days
**Impact:** Coaches want team events in personal calendar

Golf calendar currently exports iCal feeds. Add 2-way sync with Google Calendar.

---

### FEAT-008: Stripe Payment Integration for Camps
**Priority:** P3 - REVENUE OPPORTUNITY
**Time:** 4 days
**Impact:** Cannot monetize camps without payments

Database has `camps.price` field but no payment processing. Integrate Stripe Checkout.

---

### FEAT-009: Recruiting Journey Timeline Visualization
**Priority:** P3
**Time:** 2 days
**Impact:** Players want to see recruiting progress

Visual timeline showing:
- Profile created
- First coach view
- Added to watchlist
- First message
- Offers received
- Commitment

---

### FEAT-010: CoachHelm Mobile App
**Priority:** P3 - FUTURE
**Time:** 6+ weeks
**Impact:** Golf coaches want round entry on mobile

React Native app for:
- Round entry during play
- Quick stats lookup
- Live leaderboards during qualifiers

---

## 📊 Priority Matrix

| Priority | Count | Total Effort |
|----------|-------|--------------|
| 🔴 P0 Today | 2 | 1.5 hours |
| 🟠 P0 This Week | 3 | 9-11 days |
| 🟡 P1 This Week | 2 | 2.5 hours |
| 🟡 P2 This Month | 8 | 24 days |
| 🟢 P3 Backlog | 5 | 17+ days |

---

## 🎯 Recommended Sprint Plan

### Sprint 1 (Days 1-3) - SECURITY CRITICAL
**Goal:** Fix all RLS vulnerabilities

- ✅ SEC-001: Re-enable RLS on golf tables (30 min)
- ✅ SEC-002: Add policies for 15 tables (1 hour)
- ✅ SEC-003: Fix permissive policies (2 hours)
- ✅ Run full security verification suite (1 hour)
- ✅ Monitor error logs for 24 hours

**Outcome:** Security score 28 → 85

---

### Sprint 2 (Days 4-8) - JUCO & HS COACHES
**Goal:** Unblock key user segments

- ✅ CORE-001: JUCO mode toggle (2-3 days)
- ✅ CORE-003: HS coach dashboard (3-4 days)
- ✅ PERF-001: Discovery indexes (30 min)
- ✅ Test with real JUCO/HS coaches

**Outcome:** 2 major user segments fully functional

---

### Sprint 3 (Days 9-13) - SHOWCASE COACHES
**Goal:** Enable multi-team management

- ✅ CORE-002: Multi-team support (3-4 days)
- ✅ Test with showcase organization (1 day)

**Outcome:** Large enterprise customers can use platform

---

### Sprint 4 (Days 14-18) - FEATURES & POLISH
**Goal:** Complete partial implementations

- ✅ FEAT-003: Golf qualifiers create UI (2 days)
- ✅ FEAT-004: Saved comparisons (1 day)
- ✅ FEAT-005: Dev plans detail pages (2 days)

**Outcome:** All nav items have complete functionality

---

### Sprint 5 (Days 19-24) - QUALITY & PERFORMANCE
**Goal:** Production-ready hardening

- ✅ TECH-001: Test coverage expansion (5 days)
- ✅ TECH-002: Bundle optimization (2 days)
- ✅ TECH-003: Audit logging (1 day)

**Outcome:** 70%+ test coverage, optimized bundle

---

## 🔍 Issue Cross-References

Many issues are related and can be fixed together:

### Security Cluster
- SEC-001, SEC-002, SEC-003 → All fixed by comprehensive RLS migration
- Total time: 3.5 hours combined (not 3.5 hours each)

### Coach Dashboard Cluster
- CORE-001 (JUCO), CORE-003 (HS), CORE-002 (Showcase) → Share UI components
- Create shared: `TeamDashboardLayout`, `RosterTable`, `PlayerCard`
- Reduces total time by ~20%

### Golf Feature Cluster
- FEAT-003 (Qualifiers), FEAT-006 (Weather), FEAT-007 (Calendar) → Golf coaches
- Can be prioritized together for single release

---

## 📝 Notes for Developers

### Before Starting ANY Task:
1. ✅ Read relevant spec in `.helm/features/*.spec.md`
2. ✅ Check security audit: `.helm/security/RLS_AUDIT.md`
3. ✅ Review database schema in Supabase dashboard
4. ✅ Run existing tests: `npm run test:e2e`

### After Completing ANY Task:
1. ✅ Update feature spec with implementation details
2. ✅ Add/update tests
3. ✅ Run full test suite
4. ✅ Check bundle size hasn't increased >10%
5. ✅ Update this ACTIONS.md (mark task complete)

### When Stuck:
1. Check `.helm/UNDERSTANDING.json` for architecture context
2. Check `.helm/HELM_ESSAY.md` for technical deep dive
3. Check `.helm/ISSUES.md` for known problems
4. Check `.helm/DEPENDENCIES.md` for feature relationships

---

## ✅ Completion Checklist

Use this to track overall progress:

### Security (Critical)
- [x] SEC-001: Re-enable RLS on golf tables
- [x] SEC-002: Add policies for 15 tables
- [x] SEC-003: Fix permissive policies
- [ ] Run verification suite (100% pass)

### Core Features (Blocking Users)
- [x] CORE-001: JUCO mode toggle
- [x] CORE-002: Multi-team support
- [x] CORE-003: HS coach dashboard
- [ ] Test with real users from each segment

### Performance
- [x] PERF-001: Discovery indexes
- [x] TECH-002: Bundle optimization (already configured in next.config.mjs)
- [ ] Load test critical paths (< 200ms p95)

### Features
- [x] FEAT-001: Video clipping (src/components/video/VideoClipper.tsx, migration: 20260109000004)
- [x] FEAT-002: Notifications (src/lib/notifications/*, migration: 20260109000005)
- [x] FEAT-003: Qualifiers create
- [x] FEAT-004: Saved comparisons
- [x] FEAT-005: Dev plans detail

### Quality
- [x] TECH-001: Expand test coverage (e2e/golf-round.spec.ts, golf-qualifier.spec.ts, baseball-pipeline.spec.ts, camps.spec.ts, roster.spec.ts)
- [x] TECH-003: Audit logging
- [ ] Zero critical Sentry errors for 7 days

---

**Last Updated:** 2026-01-09
**Next Review:** Weekly (update priorities based on user feedback)
**Owner:** Development team lead

---

## 🚀 Quick Start for New Developers

1. Read this ACTIONS.md (you're here! ✅)
2. Read `.helm/UNDERSTANDING.json` - 5 min overview
3. Read `.helm/DEPENDENCIES.md` - understand relationships
4. Pick P0 task from "Do Today" section
5. Read relevant `.spec.md` file
6. Write tests first (TDD)
7. Implement feature
8. Update docs
9. Submit PR with reference to task ID (e.g., "Fixes CORE-001")

Welcome to the team! 🎉
