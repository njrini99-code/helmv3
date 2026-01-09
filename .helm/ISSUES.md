# Helm v3 - Consolidated Issue List
**All Known Issues Across the Platform**

Last Updated: 2026-01-08
Platform: Helm Sports Labs v3

This document consolidates ALL issues from:
- Feature specs (*.spec.md)
- Security audits (security/)
- Platform understanding (UNDERSTANDING.json)
- Technical essay (HELM_ESSAY.md)

---

## 🔴 CRITICAL ISSUES (Production Blockers)

### RLS-001: Golf Tables Completely Unprotected
**Severity:** 🔴 CRITICAL
**Discovered:** RLS Security Audit 2026-01-08
**Status:** OPEN
**Blocks:** Golf platform production launch

**Description:**
Migration 061 and 062 explicitly DISABLED ROW LEVEL SECURITY on all core golf tables. The comment states: "RLS disabled for development - re-enable in production". This appears to be running in production.

**Tables Affected:**
- golf_organizations
- golf_teams
- golf_rounds
- golf_shots
- golf_courses
- golf_events
- golf_players
- golf_coaches
- golf_team_members
- golf_event_participants

**Attack Scenario:**
```sql
-- As ANY authenticated user (even a baseball coach):
SELECT * FROM golf_rounds; -- See ALL rounds from ALL teams
SELECT * FROM golf_shots WHERE shot_type = 'putting'; -- See ALL putts from ALL players
SELECT * FROM golf_players; -- See ALL golf player profiles
SELECT email, phone FROM golf_coaches; -- Harvest ALL coach contact info
```

**Impact:**
- Complete data breach of golf platform
- Cross-team data exposure (Team A can see Team B)
- Personal information exposure (emails, phones)
- Performance data exposure (scores, stats, patterns)
- Competitive intelligence leak between teams
- GDPR/privacy violation

**Root Cause:**
Migrations 061/062 disabled RLS to "fix recursion issues" during development but were never re-enabled.

**Fix:**
See ACTIONS.md SEC-001 or security/RLS_AUDIT.md Part 1-6

**Related Issues:** RLS-004, RLS-006

---

### RLS-004: Missing Policies on 15 Golf Tables
**Severity:** 🔴 CRITICAL
**Discovered:** RLS Security Audit 2026-01-08
**Status:** OPEN
**Blocks:** Golf platform features

**Description:**
15 golf tables have RLS ENABLED but NO POLICIES defined, making them completely inaccessible (blocks all operations) OR completely open depending on Supabase defaults.

**Tables Affected:**
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

**Impact:**
- Data exposure if defaults are permissive
- Feature breakage if defaults are restrictive
- Inconsistent security posture
- Unpredictable behavior

**Root Cause:**
Tables were created with RLS enabled but policies were never added, likely due to development velocity vs security hardening trade-off.

**Fix:**
See ACTIONS.md SEC-002 or security/RLS_AUDIT.md Part 7

**Related Issues:** RLS-001

---

### CORE-001: JUCO Mode Toggle Not Implemented
**Severity:** 🔴 CRITICAL (P0)
**Discovered:** Feature Checklist Review
**Status:** OPEN
**Blocks:** 30% of JUCO coach features

**Description:**
JUCO coaches need to switch between recruiting mode (acting as college coach) and team mode (acting as HS coach). The coach_mode toggle exists in the auth store but no UI or logic actually allows JUCO coaches to switch modes. This blocks all JUCO coach functionality.

**Files Affected:**
- src/stores/auth-store.ts (store exists but unused)
- Baseball dashboard routing logic (no mode-based routing)
- No UI component for mode toggle

**Impact:**
JUCO coaches are completely blocked from using the platform effectively. They either get stuck in recruiting mode OR team mode but can't switch.

**Root Cause:**
Feature was architected (store field created) but never implemented in UI/routing.

**Fix:**
See ACTIONS.md CORE-001

**Related Issues:** CORE-002, CORE-003

---

### CORE-003: High School Coach Dashboard Incomplete
**Severity:** 🔴 CRITICAL (P0)
**Discovered:** Feature Checklist Review
**Status:** OPEN
**Blocks:** HS coach user segment (key revenue segment)

**Description:**
HS coaches are redirected to /baseball/dashboard/team/high-school but this dashboard is barely implemented. Routing exists but core features missing: roster management UI, college interest tracking, video upload workflow for multiple players, team analytics.

**Impact:**
High school coaches have poor experience, limited functionality. This is a key user segment for player-side revenue.

**Root Cause:**
Route was created as placeholder but feature implementation was deprioritized.

**Fix:**
See ACTIONS.md CORE-003

**Related Issues:** CORE-001, CORE-002

---

### CORE-002: Multi-Team Support Not Built for Showcase Coaches
**Severity:** 🔴 CRITICAL (P0)
**Discovered:** Feature Checklist Review
**Status:** OPEN
**Blocks:** 35% of showcase coach features (large enterprise customers)

**Description:**
Showcase organizations manage multiple teams but infrastructure is incomplete. Database tables exist (teams, team_members, organizations) but UI for switching between teams, cross-team roster management, and org-level analytics are missing or partial.

**Impact:**
Showcase coaches (large orgs like Perfect Game, PBR) cannot effectively use platform. Lost revenue opportunity from high-value customers.

**Root Cause:**
Database schema was designed for multi-team but UI was built assuming single-team coaches.

**Fix:**
See ACTIONS.md CORE-002

**Related Issues:** CORE-001, CORE-003

---

## 🟠 HIGH SEVERITY ISSUES

### RLS-002: Conversation Participants RLS History Unstable
**Severity:** 🟠 HIGH
**Discovered:** RLS Security Audit 2026-01-08
**Status:** FIXED (but monitor for regressions)
**Risk:** Messaging system privacy

**Description:**
Migration 078 DISABLED RLS on conversation_participants with the comment: "Nuclear Option: Drop ALL Policies". While migration 20260108000001 re-enabled it, the history shows the system couldn't maintain stable RLS policies without recursion issues.

**History:**
- Original policies had recursion issues
- Migration 078 disabled RLS entirely (CRITICAL vulnerability)
- Migration 20260108000001 re-enabled with simpler policies

**Current Status:**
Fixed but needs monitoring for recursion errors that caused original disable.

**Monitor For:**
- Postgres errors containing "infinite recursion"
- Messages failing to send
- Conversation creation failures

**Related Issues:** RLS-003, RLS-005

---

### RLS-003: Permissive Conversation Creation
**Severity:** 🟠 HIGH
**Discovered:** RLS Security Audit 2026-01-08
**Status:** OPEN
**Risk:** Unauthorized messaging, phishing

**Description:**
The policy "Users can create conversations" uses `WITH CHECK (true)`, allowing ANY authenticated user to create conversations without validation. Combined with the SECURITY DEFINER function `create_conversation_with_participants()`, there are minimal checks.

**Attack Scenario:**
```sql
-- Attacker creates conversation with arbitrary users
INSERT INTO conversations (sport, team_id, creator_id)
VALUES ('golf', 'victim-team-id', auth.uid());

-- Then adds any users as participants via the function
SELECT create_conversation_with_participants(ARRAY[
  'victim-coach-id',
  'victim-player-id',
  'attacker-id'
]);

-- Now attacker can:
-- 1. Monitor messages between coach and player
-- 2. Inject messages appearing to be from coach
-- 3. Phish players by impersonating coach
```

**Impact:**
- Unauthorized conversation creation
- Message injection
- Phishing and social engineering
- Impersonation attacks

**Fix:**
Add team/sport validation in WITH CHECK clause and in application layer before calling function.

**Related Issues:** RLS-002, RLS-005

---

### RLS-005: Complex SECURITY DEFINER Functions
**Severity:** 🟠 HIGH
**Discovered:** RLS Security Audit 2026-01-08
**Status:** OPEN
**Risk:** Authorization bypass via logic errors

**Description:**
18 SECURITY DEFINER functions bypass RLS to implement complex authorization logic. These functions are difficult to audit and may contain logic errors.

**Critical Functions:**
1. `can_users_message(sender_uuid, recipient_uuid)` - 200+ lines of complex logic
2. `create_conversation_with_participants(participant_user_ids[])` - Bypasses RLS
3. `handle_new_user()` - Trigger function on auth.users INSERT
4. `are_users_on_same_roster(user1, user2)` - Complex team checks

**Risk:**
Logic errors in these functions could allow:
- Cross-team message access
- Cross-sport message access (baseball ↔ golf)
- Unauthorized conversation creation
- Data leaks through JOIN abuse

**Recommendation:**
- Add comprehensive logging (see TECH-003)
- Add input validation
- Replace with RLS policies where possible
- Document expected behavior

**Related Issues:** RLS-002, RLS-003, TECH-003

---

### RLS-006: Permissive Policies Using USING (true)
**Severity:** 🟠 HIGH
**Discovered:** RLS Security Audit 2026-01-08
**Status:** OPEN
**Risk:** Data exposure

**Description:**
Multiple tables use `USING (true)` or `WITH CHECK (true)` in RLS policies, making data completely public to authenticated users.

**Vulnerable Tables:**
1. organizations: "Organizations are viewable by all authenticated users"
2. coaches: "Anyone can view coach profiles" - Exposes ALL coach emails/phones
3. team_invitations: "Active invitations viewable by code" - Invite enumeration
4. golf_calendar_notifications: INSERT with true - Notification spam
5. golf_global_patterns: "Authenticated can read global patterns" - AI IP leak
6. golf_confidence_calibration: "Authenticated can read calibration" - ML models exposed
7. profile_views: Allows viewer_id mismatch - View count manipulation

**Impact:**
- Personal information exposure
- Spam and phishing
- Competitive intelligence
- IP theft (ML models)
- Invite code enumeration

**Fix:**
See ACTIONS.md SEC-003 or security/RLS_AUDIT.md Part 8

**Related Issues:** RLS-001, RLS-007

---

### RLS-007: Coaches Can View All Players (Baseball)
**Severity:** 🟠 HIGH (downgraded from CRITICAL after partial fix)
**Discovered:** RLS Security Audit 2026-01-08
**Status:** PARTIALLY FIXED
**Risk:** Privacy violation, NCAA rules

**Description:**
The policy "Coaches can view all players" allows ANY user with role='coach' to see ALL player profiles, regardless of recruiting_activated status or commitment status.

**Current Behavior:**
Coach from School A can view:
- Players committed to School B
- Players with recruiting_activated = false
- All player contact info (email, phone)
- All academic data (GPA, test scores)
- All performance metrics

**NCAA Violation Risk:**
Viewing/contacting committed players may violate NCAA recruiting rules.

**Partial Fix:**
Feature checklist shows recruiting_activated policy exists, but "Coaches can view all players" is MORE permissive, so Postgres uses the permissive one.

**Complete Fix:**
Drop "Coaches can view all players" policy entirely. Keep only recruiting-scoped policy.

**Related Issues:** RLS-006

---

### ISSUE-C003: Calendar Sync iCal Format Invalid
**Severity:** 🟠 HIGH
**Discovered:** Full Application Spec
**Status:** OPEN
**Blocks:** Calendar sync to Google/Apple Calendar

**Description:**
Golf calendar exports iCal feeds but the format is invalid or non-standard. Users report feeds don't sync to Google Calendar or Apple Calendar.

**Files:**
- src/app/api/calendar/feeds/[token]/route.ts
- src/lib/calendar/ical-generator.ts

**Test:**
1. Generate iCal feed for team calendar
2. Import to Google Calendar
3. Expected: Events appear
4. Actual: Import fails with "Invalid format" error

**Possible Issues:**
- Missing required iCal fields (PRODID, VERSION)
- Incorrect date format (should be YYYYMMDDTHHMMSSZ)
- Missing VTIMEZONE definitions
- Incorrect line breaks (should be \r\n)

**Fix:**
Use well-tested iCal library like `ical-generator` instead of manual string building.

**Related Issues:** FEAT-007

---

### PERF-001: Discover Page Slow with Filters
**Severity:** 🟠 HIGH (Performance)
**Discovered:** Feature Spec Analysis
**Status:** OPEN
**Impact:** Poor user experience, 2-3s page loads

**Description:**
Player discovery page with filters (position, grad year, state, velocity) takes 2-3 seconds to load. Missing database indexes on commonly filtered columns.

**Slow Queries:**
```sql
-- Missing indexes cause full table scans
SELECT * FROM players
WHERE recruiting_activated = true
  AND primary_position = 'pitcher'
  AND grad_year = 2025
  AND state = 'TX';
-- Seq Scan on players (cost=0.00..1234.56 rows=?)
```

**Impact:**
- Coaches abandon discovery searches
- 80% performance improvement possible with indexes
- Affects platform core value prop

**Fix:**
See ACTIONS.md PERF-001 - 30 minute migration adds 5 indexes

**Related Issues:** PERF-002

---

### PERF-002: Large Watchlists Render Slowly
**Severity:** 🟠 HIGH (Performance)
**Discovered:** Feature Spec Analysis
**Status:** OPEN
**Impact:** Coaches with 100+ watchlist entries see UI lag

**Description:**
Watchlist table renders all rows at once. With 100+ prospects, the page becomes sluggish (janky scrolling, slow search).

**Root Cause:**
No virtual scrolling. DOM nodes for 100+ table rows + player cards cause layout thrashing.

**Fix:**
Implement virtual scrolling with `react-virtual` or `react-window`:
```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

export function WatchlistTable({ players }: Props) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: players.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72, // Row height
    overscan: 5
  })

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(virtualRow => {
          const player = players[virtualRow.index]
          return (
            <WatchlistRow
              key={player.id}
              player={player}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
```

**Related Issues:** PERF-001, TECH-002

---

### PERF-003: Console.log Statements in Production
**Severity:** 🟡 MEDIUM (but easy fix)
**Discovered:** Full Application Spec
**Status:** OPEN
**Impact:** Cluttered console, bundle size, info leakage

**Description:**
next.config.mjs has `removeConsole` commented out with note "temporarily for debugging PDF upload". This leaves 28+ console.log statements in production bundle.

**Files:**
- next.config.mjs line 35

**Fix:**
```javascript
// next.config.mjs
compiler: {
  removeConsole: process.env.NODE_ENV === 'production' ? {
    exclude: ['error', 'warn'] // Keep errors/warnings
  } : false
}
```

**Related Issues:** TECH-002

---

## 🟡 MEDIUM SEVERITY ISSUES

### RLS-008: profile_views Insert Permissive
**Severity:** 🟡 MEDIUM
**Discovered:** RLS Security Audit 2026-01-08
**Status:** OPEN
**Risk:** View count manipulation

**Description:**
Policy "Authenticated users can create profile views" allows viewer_id to be NULL OR not match auth.uid(). Enables fake view inflation.

**Attack:**
```sql
-- Inflate view counts
INSERT INTO profile_views (player_id, viewer_id, viewer_type)
SELECT 'target-player-id', NULL, 'college_coach'
FROM generate_series(1, 10000); -- 10k fake views
```

**Impact:**
- Fake view count inflation
- Analytics poisoning
- Player ranking manipulation

**Fix:**
```sql
DROP POLICY IF EXISTS "Authenticated users can create profile views"
  ON profile_views;

CREATE POLICY "Users can create own profile views"
ON profile_views FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND viewer_id = auth.uid()  -- MUST match!
);
```

**Related Issues:** RLS-006

---

### FEAT-PARTIAL-001: Video Management Incomplete
**Severity:** 🟡 MEDIUM
**Discovered:** Feature Checklist (60% complete)
**Status:** PARTIAL
**Blocks:** Video clipping feature, advanced analytics

**Description:**
Basic video upload/display works but missing:
- Video clipping tool (FEAT-001)
- Video transcoding
- Thumbnail generation
- Video analytics (watch time, engagement)

**Current Functionality:**
- ✅ Upload videos
- ✅ Display videos on profile
- ✅ Basic metadata (title, description)
- ❌ Clipping tool
- ❌ Auto-generated thumbnails
- ❌ Multiple quality levels
- ❌ Watch time tracking

**Fix:**
See ACTIONS.md FEAT-001

**Related Issues:** None

---

### FEAT-PARTIAL-002: Camps Payment Processing Missing
**Severity:** 🟡 MEDIUM (Revenue Impact)
**Discovered:** Feature Checklist (85% complete)
**Status:** PARTIAL
**Blocks:** Monetizing camps/showcases

**Description:**
Camps table has price field and registration system, but no payment processing integrated. Stripe environment variables exist but not used.

**Current Functionality:**
- ✅ Create camps
- ✅ Set pricing
- ✅ Registration form
- ❌ Payment processing
- ❌ Stripe integration
- ❌ Payment webhooks
- ❌ Refund handling

**Impact:**
- Cannot monetize camps/showcase events
- Coaches must handle payments externally
- Lost revenue opportunity

**Fix:**
See ACTIONS.md FEAT-008

**Related Issues:** None

---

### TECH-DEBT-001: Dead Code and Unused Routes
**Severity:** 🟡 MEDIUM (Maintenance)
**Discovered:** Feature Checklist TODO.md analysis
**Status:** OPEN
**Impact:** Code bloat, maintenance burden, confusion

**Description:**
126 tasks in TODO.md including many "missing detail pages" and "routes not linked from anywhere". This indicates incomplete feature development, orphaned code, and poor code hygiene.

**Examples:**
- 30+ routes exist but aren't in navigation
- Detail pages created but never linked
- Components imported but never rendered
- Actions defined but never called

**Impact:**
- Users cannot discover features
- Wasted development effort
- Confusing for maintenance
- Bundle size bloat

**Fix:**
Systematic audit:
1. Identify all orphaned routes
2. Delete truly unused routes
3. Link discoverable routes to navigation
4. Document intentionally unlisted routes
5. Set up linting for unused exports

**Related Issues:** TECH-002

---

### TECH-DEBT-002: Inconsistent State Management
**Severity:** 🟡 MEDIUM (Architecture)
**Discovered:** Technical Essay
**Status:** OPEN
**Impact:** Hard to debug, inconsistent patterns

**Description:**
Mix of Zustand (4 stores), React Context (2), custom hooks with useState, Supabase Realtime subscriptions, and URL params for state. No clear pattern for when to use each.

**Examples:**
- Auth: Zustand store
- Team selection: Zustand store
- Sidebar: React Context
- Mobile nav: React Context
- Filters: URL params
- Realtime data: Supabase subscriptions
- Form state: useState

**Impact:**
- New developers don't know which to use
- Inconsistent patterns across features
- State synchronization bugs

**Recommendation:**
Document decision tree:
1. Zustand for global auth/UI state
2. Context for feature-scoped state
3. Realtime for collaborative data
4. URL params for shareable filters
5. Server actions for mutations

**Related Issues:** None

---

### TECH-DEBT-003: Documentation Fragmentation
**Severity:** 🟡 MEDIUM (Maintenance)
**Discovered:** Docs directory review
**Status:** OPEN
**Impact:** No single source of truth

**Description:**
47 documentation files with overlapping information. Multiple README files. CLAUDE.md exists but unclear if up to date. Feature checklist detailed but TODO.md auto-generated.

**Files:**
- docs/* (47 files)
- README.md
- CLAUDE.md
- TODO.md
- Various *_GUIDE.md files

**Impact:**
- Developers don't know which docs to trust
- Outdated information persists
- Duplication of effort

**Fix:**
Consolidate:
1. README.md as primary entry
2. FEATURE_CHECKLIST.md as implementation reference
3. Archive old audit reports
4. Update CLAUDE.md for AI context
5. Create docs/architecture/README.md as architecture source of truth

**Related Issues:** None

---

### TECH-DEBT-004: Limited Test Coverage
**Severity:** 🟡 MEDIUM (Quality)
**Discovered:** Testing infrastructure review
**Status:** OPEN
**Impact:** Regression risk, low CI confidence

**Current Coverage:**
- E2E tests exist for: auth, discover, watchlist, messages
- Missing: Golf flows, pipeline, camps, roster
- No component tests (Vitest not set up)
- No API route tests

**Impact:**
- Regression risk when making changes
- No CI/CD confidence
- Manual testing burden

**Fix:**
See ACTIONS.md TECH-001

**Related Issues:** None

---

## 🟢 LOW SEVERITY ISSUES

### ISSUE-MINOR-001: Middleware Onboarding Routes Commented Out
**Severity:** 🟢 LOW (but potential security)
**Discovered:** Code Review
**Status:** OPEN
**Risk:** Unauthenticated access to onboarding

**Description:**
Middleware has onboarding routes commented out with "TEMPORARY: for development" note. Onboarding pages might not be properly protected in production.

**File:**
- src/lib/supabase/middleware.ts lines 88-94

**Potential Impact:**
- Unauthenticated users accessing onboarding
- Authenticated users re-running onboarding
- State corruption

**Fix:**
```typescript
// Uncomment and add proper checks
const onboardingRoutes = [
  '/baseball/coach-onboarding',
  '/golf/coach-onboarding'
]

if (onboardingRoutes.includes(pathname)) {
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Check if already onboarded
  if (user.onboarding_completed) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
}
```

**Related Issues:** None

---

### ISSUE-MINOR-002: Mobile Drag-Drop Suboptimal
**Severity:** 🟢 LOW (UX)
**Discovered:** Feature Spec Analysis
**Status:** OPEN
**Impact:** Poor mobile UX for pipeline

**Description:**
Pipeline board uses @dnd-kit for drag-and-drop. Desktop experience is smooth but mobile touch interactions may be suboptimal.

**Potential Issues:**
- Touch targets too small
- Scroll vs drag conflict
- No haptic feedback
- Long press to drag not intuitive

**Fix:**
- Increase card touch targets (min 44x44px)
- Add touch delay to distinguish scroll vs drag
- Add visual feedback (pulse animation on long press)
- Consider mobile-specific UI (buttons instead of drag?)

**Related Issues:** None

---

### ISSUE-MINOR-003: Duplicate Database Type Definitions
**Severity:** 🟢 LOW (Maintenance)
**Discovered:** Type System Review
**Status:** OPEN
**Impact:** Type inconsistencies

**Description:**
Database types auto-generated in `src/types/supabase.ts` (6,657 lines) but custom types scattered in `src/lib/types/database.ts` and `src/lib/types/golf.ts`. Risk of type drift.

**Example:**
```typescript
// src/types/supabase.ts (generated)
export type GolfRound = Database['public']['Tables']['golf_rounds']['Row']

// src/lib/types/golf.ts (manual)
export interface GolfRound {
  // ... fields
}

// Which one is source of truth?
```

**Fix:**
- Always use generated types as source of truth
- Custom types extend or transform generated types
- Document which types to import from where

**Related Issues:** TECH-DEBT-002

---

## 📊 Issue Statistics

### By Severity
| Severity | Count | % of Total |
|----------|-------|------------|
| 🔴 Critical | 5 | 19% |
| 🟠 High | 8 | 31% |
| 🟡 Medium | 8 | 31% |
| 🟢 Low | 3 | 11% |
| **Total** | **26** | **100%** |

### By Category
| Category | Count |
|----------|-------|
| Security (RLS) | 8 |
| Core Features | 3 |
| Performance | 3 |
| Features (Partial) | 2 |
| Technical Debt | 4 |
| Minor Issues | 3 |
| **Total** | **26** |

### By Status
| Status | Count |
|--------|-------|
| Open | 21 |
| Partial Fix | 2 |
| Fixed (Monitor) | 1 |
| **Total** | **26** |

---

## 🔗 Issue Relationships

### Security Cluster (All Related)
RLS-001 → RLS-004 → RLS-006
- All golf RLS issues stem from development shortcuts
- Can be fixed in single comprehensive migration
- See security/RLS_AUDIT.md for complete fix

### Messaging Security Chain
RLS-002 → RLS-003 → RLS-005 → TECH-003
- Conversation system has complex security requirements
- SECURITY DEFINER functions need audit logging
- Monitor for recursion issues

### Coach Dashboard Cluster
CORE-001 → CORE-002 → CORE-003
- All coach types need complete dashboards
- Share UI components across implementations
- Blocking key revenue segments

### Performance Cluster
PERF-001 → PERF-002 → TECH-002
- All performance issues fixable with known techniques
- Indexes + virtual scrolling + bundle optimization
- High ROI fixes (small effort, big impact)

---

## 🎯 Issue Priority Matrix

| Issue ID | Severity | Effort | Impact | ROI | Priority |
|----------|----------|--------|--------|-----|----------|
| RLS-001 | Critical | 30m | Very High | ⭐⭐⭐⭐⭐ | P0 |
| RLS-004 | Critical | 1h | Very High | ⭐⭐⭐⭐⭐ | P0 |
| SEC-003 (RLS-006) | High | 2h | High | ⭐⭐⭐⭐ | P1 |
| CORE-001 | Critical | 2-3d | High | ⭐⭐⭐⭐ | P0 |
| CORE-003 | Critical | 3-4d | High | ⭐⭐⭐⭐ | P0 |
| CORE-002 | Critical | 3-4d | High | ⭐⭐⭐⭐ | P0 |
| PERF-001 | High | 30m | Medium | ⭐⭐⭐⭐⭐ | P1 |
| PERF-002 | High | 2d | Medium | ⭐⭐⭐ | P2 |
| RLS-003 | High | 1d | High | ⭐⭐⭐⭐ | P1 |
| RLS-005 | High | 1d | High | ⭐⭐⭐ | P2 |
| ISSUE-C003 | High | 1d | Medium | ⭐⭐⭐ | P2 |

---

## 🔍 Root Cause Analysis

### Why So Many RLS Issues?
**Root Causes:**
1. Development velocity prioritized over security hardening
2. Migrations disabled RLS to fix recursion (quick fix vs proper fix)
3. No RLS policy review process for new tables
4. No automated RLS testing

**Prevention:**
- Require RLS policies in PR checklist
- Add RLS tests to CI/CD
- Regular security audits (quarterly)
- Document RLS patterns

### Why Core Features Incomplete?
**Root Causes:**
1. Database schema designed ahead of UI
2. Routes created as placeholders
3. Feature prioritization changed mid-development
4. Limited QA testing with real users

**Prevention:**
- Feature flag incomplete features
- User testing before considering "done"
- Don't create routes until feature complete
- Regular demo to stakeholders

### Why Performance Issues?
**Root Causes:**
1. Optimization done reactively, not proactively
2. No performance budgets
3. No load testing
4. Missing indexes from initial schema

**Prevention:**
- Performance testing in CI/CD
- Bundle size budgets
- Add indexes when creating tables
- Profile before production launch

---

## 📝 Issue Resolution Workflow

### For Critical Issues (P0):
1. ✅ Create branch: `fix/[ISSUE-ID]-short-description`
2. ✅ Write failing test first (TDD)
3. ✅ Implement fix
4. ✅ Verify test passes
5. ✅ Run full test suite
6. ✅ Update this ISSUES.md (mark as FIXED)
7. ✅ Update ACTIONS.md (mark task complete)
8. ✅ Submit PR with "Fixes [ISSUE-ID]" in description
9. ✅ Deploy to staging
10. ✅ Verify in staging
11. ✅ Deploy to production
12. ✅ Monitor for 24 hours

### For High/Medium Issues (P1/P2):
- Follow same workflow but can batch multiple fixes
- Can deploy in weekly release cycle
- Less intensive monitoring

### For Low Issues (P3):
- Can fix opportunistically
- Batch with related work
- Document workarounds if not fixing immediately

---

**Last Updated:** 2026-01-08
**Next Review:** After each sprint (weekly)
**Owner:** Development team lead

---

## 🚨 Issue Reporting Template

When discovering new issues, add them using this template:

```markdown
### [CATEGORY]-[NUMBER]: [SHORT TITLE]
**Severity:** 🔴/🟠/🟡/🟢 [CRITICAL/HIGH/MEDIUM/LOW]
**Discovered:** [DATE]
**Status:** OPEN/PARTIAL/FIXED
**Blocks:** [What functionality is blocked]

**Description:**
[Clear description of the issue]

**Files Affected:**
- [List relevant files]

**Impact:**
[Who is affected and how badly]

**Root Cause:**
[Why did this happen]

**Fix:**
[Proposed solution or link to ACTIONS.md]

**Related Issues:** [Other issue IDs]
```

---

**Remember:** This document is the single source of truth for ALL known issues. Keep it updated!
