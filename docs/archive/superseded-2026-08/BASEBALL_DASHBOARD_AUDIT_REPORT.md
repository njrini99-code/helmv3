<!--
STATUS: STALE
DATE: 2026-07-10
SUPERSEDED BY / WHY: Generated "February 2025" (likely meant 2026) — long predates docs/audits/BASEBALLHELM_CANONICAL_SPEC.md, docs/audits/BASEBALLHELM_PRODUCTION_VERDICT.md, and docs/audits/DB_FORENSIC_AUDIT_2026-07-08.md, which cover identical ground with current data.
KEPT FOR HISTORY -- do not delete this file.
-->

# BaseballHelm Dashboard Audit Report
## Comprehensive Analysis: UI, UX, Features, Database, and Wiring

> Generated: February 2025
> Purpose: Map every dashboard type, identify gaps vs GolfHelm, and create a roadmap to finish and correctly wire all baseball dashboards

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Dashboard Inventory by Role](#2-dashboard-inventory-by-role)
3. [Golf vs Baseball Feature Comparison](#3-golf-vs-baseball-feature-comparison)
4. [Critical Issues by Dashboard Type](#4-critical-issues-by-dashboard-type)
5. [Database Gap Analysis](#5-database-gap-analysis)
6. [Navigation & Routing Issues](#6-navigation--routing-issues)
7. [UI/UX Issues](#7-uiux-issues)
8. [Component Gap Analysis](#8-component-gap-analysis)
9. [Implementation Roadmap](#9-implementation-roadmap)
10. [Appendix: Complete Route Map](#10-appendix-complete-route-map)

---

## 1. EXECUTIVE SUMMARY

### Current State
BaseballHelm has **68 page routes** and strong **recruiting features** (discover, pipeline, watchlist, compare, camps). However, **team management is severely underdeveloped** compared to GolfHelm, which has **74+ database tables** and **200+ components** for team operations.

### Key Finding
Baseball's recruiting side (College Coach, Player Recruiting) is ~80% complete. Baseball's **team management side** (HS Coach, JUCO Team Mode, Showcase Coach, Player Team Mode) is only **~30% complete** compared to what GolfHelm delivers.

### Impact Summary
| Area | Baseball Status | Golf Benchmark | Gap Severity |
|------|----------------|----------------|--------------|
| Recruiting (Coach) | ✅ 80% | N/A (golf doesn't recruit) | Low |
| Team Dashboard | ⚠️ 40% | ✅ 95% | **HIGH** |
| Calendar/Events | ⚠️ 25% | ✅ 95% | **CRITICAL** |
| Announcements | ❌ 0% | ✅ 95% | **CRITICAL** |
| Tasks | ❌ 0% | ✅ 90% | **CRITICAL** |
| Documents | ❌ 0% | ✅ 85% | **HIGH** |
| Travel | ❌ 0% | ✅ 80% | **MEDIUM** |
| Messages | ✅ 75% | ✅ 90% | Low |
| Roster | ✅ 70% | ✅ 90% | Medium |
| Dev Plans | ✅ 60% | ✅ 85% (focus areas) | Medium |
| Stats/Analytics | ⚠️ 30% | ✅ 90% | **HIGH** |
| Player Profile | ✅ 80% | ✅ 85% | Low |
| Video Library | ✅ 70% | N/A (golf doesn't have video) | Low |

---

## 2. DASHBOARD INVENTORY BY ROLE

### 2.1 College Coach Dashboard
**Purpose**: Recruiting only (no team management)
**Status**: ✅ Most Complete Dashboard

| Nav Item | Route | Status | Notes |
|----------|-------|--------|-------|
| Dashboard | `/baseball/dashboard` | ✅ Complete | Bento stats, pipeline hero, hot leads, position needs, engagement chart, activity feed, player map |
| Command Center | `/dashboard/command-center` | ⚠️ Exists | Needs wiring to real AI insights (similar to GolfHelm Intelligence) |
| Upload Stats | `/dashboard/stats/upload` | ⚠️ Exists | Basic upload page, needs polish |
| Discover | `/dashboard/discover` | ✅ Complete | FilterPanel, map, player cards, peek panel |
| Pipeline | `/dashboard/pipeline` | ✅ Complete | 5-stage kanban (watchlist → committed → uninterested) with dnd-kit |
| Compare | `/dashboard/compare` | ✅ Complete | 2-4 player side-by-side comparison |
| Calendar | `/dashboard/calendar` | ⚠️ Partial | BaseballCalendarWrapper exists but minimal features vs golf's 40+ calendar components |
| Camps | `/dashboard/camps` | ✅ Complete | Create, edit, browse, register |
| Messages | `/dashboard/messages` | ✅ Complete | Conversations, real-time, file attachments |
| Program | `/dashboard/program` | ✅ Exists | Program profile editor |
| Settings | `/dashboard/settings` | ✅ Complete | Password, email, notifications, privacy |

**Missing vs Spec (CLAUDE.md Section 5.1)**:
- ❌ Watchlist page is at `/dashboard/watchlist` but nav shows Pipeline. Spec says both should exist separately.

---

### 2.2 High School Coach Dashboard
**Purpose**: Team management only (no recruiting)
**Status**: ⚠️ Partially Complete — Missing core team management features

| Nav Item | Route | Status | Notes |
|----------|-------|--------|-------|
| Dashboard | `/dashboard/team/high-school` | ✅ Complete | Stats (roster, GPA, dev plans, interest), roster table, college interest tracker, batch video upload, team analytics, quick actions |
| Roster | `/dashboard/roster` | ✅ Complete | Player management, invite modal, lineup builder, status tracking |
| Videos | `/dashboard/videos` | ✅ Complete | Upload, view, clip, delete, filter by type |
| Dev Plans | `/dashboard/dev-plans` | ✅ Complete | Create, assign, filter by status |
| College Interest | `/dashboard/college-interest` | ✅ Exists | Shows which colleges are viewing players |
| Calendar | `/dashboard/calendar` | ⚠️ Minimal | Basic event display — NO RSVP, NO attendance tracking, NO recurring events, NO event creation flow matching golf |
| Messages | `/dashboard/messages` | ✅ Complete | Full messaging |
| Program | `/dashboard/program` | ✅ Exists | |
| Settings | `/dashboard/settings` | ✅ Complete | |

**CRITICAL MISSING FEATURES (Golf Has These)**:
- ❌ **Announcements** — Golf has full announcement system with urgency, targeting, acknowledgement tracking, attached docs/tasks
- ❌ **Tasks** — Golf has standalone task system with templates, reminders, assignments
- ❌ **Documents** — Golf has document management with versioning, categories, player visibility controls
- ❌ **Travel** — Golf has tournament travel itineraries and expense tracking
- ❌ **Enhanced Calendar** — Golf has RSVP, attendance check-in, availability polls, conflict warnings, recurring events, calendar sync
- ❌ **Team Settings** — Golf has dedicated team settings (join code management, team branding)

---

### 2.3 JUCO Coach Dashboard
**Purpose**: Dual mode — Recruiting AND Team Management
**Status**: ⚠️ Mode toggle works, but team mode has same gaps as HS Coach

**Recruiting Mode** (same as College Coach):
| Nav Item | Route | Status |
|----------|-------|--------|
| Dashboard | `/baseball/dashboard` | ✅ |
| Command Center | `/dashboard/command-center` | ⚠️ |
| Upload Stats | `/dashboard/stats/upload` | ⚠️ |
| Discover | `/dashboard/discover` | ✅ |
| Pipeline | `/dashboard/pipeline` | ✅ |
| Compare | `/dashboard/compare` | ✅ |
| Calendar | `/dashboard/calendar` | ⚠️ |
| Camps | `/dashboard/camps` | ✅ |
| Messages | `/dashboard/messages` | ✅ |

**Team Mode** (unique nav: `jucoTeamNav`):
| Nav Item | Route | Status | Notes |
|----------|-------|--------|-------|
| Dashboard | `/dashboard/team` | ✅ Basic | Generic team dashboard, not JUCO-specific |
| Roster | `/dashboard/roster` | ✅ | |
| Videos | `/dashboard/videos` | ✅ | |
| Dev Plans | `/dashboard/dev-plans` | ✅ | |
| **Academics** | `/dashboard/academics` | ⚠️ Stub | **JUCO-only feature** - page exists but implementation is minimal |
| College Interest | `/dashboard/college-interest` | ✅ | Transfer tracking |
| Calendar | `/dashboard/calendar` | ⚠️ Minimal | |
| Messages | `/dashboard/messages` | ✅ | |

**JUCO-Specific Missing**:
- ❌ **Academics page needs full implementation** — JUCO coaches need academic eligibility tracking for transfer players (similar to golf's classes feature)
- ❌ Same team management gaps as HS Coach (announcements, tasks, documents, travel, enhanced calendar)

---

### 2.4 Showcase Coach Dashboard
**Purpose**: Multi-team organization management
**Status**: ⚠️ Organization structure exists but thin on features

**Organization Nav** (`showcaseOrgNav`):
| Nav Item | Route | Status | Notes |
|----------|-------|--------|-------|
| Dashboard | `/dashboard/organization` | ✅ Exists | OrgDashboard component with team selector |
| Teams | `/dashboard/teams` | ⚠️ Stub | Team listing page needs full implementation |
| Events | `/dashboard/events` | ⚠️ Stub | Events page exists but minimal |
| Messages | `/dashboard/messages` | ✅ | |

**Team-Specific Nav** (appears when team selected via TeamSwitcher):
| Nav Item | Route | Status |
|----------|-------|--------|
| Roster | `/dashboard/roster` | ✅ |
| Videos | `/dashboard/videos` | ✅ |
| Dev Plans | `/dashboard/dev-plans` | ✅ |
| Calendar | `/dashboard/calendar` | ⚠️ Minimal |

**CRITICAL MISSING (per CLAUDE.md spec Section 5.4)**:
- ❌ **Organization Profile** page (separate from program profile)
- ❌ **Multi-team event coordination** — showcase orgs run tournaments across teams
- ❌ Same team management gaps (announcements, tasks, documents)
- ⚠️ **Team Switcher** exists but may not properly scope roster/calendar/videos to selected team

---

### 2.5 Player Dashboard — Recruiting Mode (HS/Showcase/JUCO with activation)
**Status**: ✅ Well implemented

| Nav Item | Route | Status | Notes |
|----------|-------|--------|-------|
| Dashboard | `/baseball/dashboard` | ✅ | Profile card, stats, recruiting activation banner |
| My Profile | `/dashboard/profile` | ✅ | Full profile editor |
| Colleges | `/dashboard/colleges` | ✅ | Browse, filter, track interest |
| Journey | `/dashboard/journey` | ✅ | Timeline with milestones, school interest status |
| Camps | `/dashboard/camps` | ✅ | Browse and register |
| Messages | `/dashboard/messages` | ✅ | Coach messaging |
| Analytics | `/dashboard/analytics` | ✅ | Profile views, watchlist adds, video views chart |

**Minor Issues**:
- ⚠️ Analytics chart uses placeholder data in some views
- ⚠️ Journey page status updates may not trigger notifications to coaches

---

### 2.6 Player Dashboard — Team Mode (All player types)
**Status**: ⚠️ Basic but missing depth

| Nav Item | Route | Status | Notes |
|----------|-------|--------|-------|
| Dashboard | `/dashboard/team` | ✅ Basic | Profile card, video count, dev plan tasks, schedule |
| My Profile | `/dashboard/profile` | ✅ | |
| Videos | `/dashboard/videos` | ✅ | Upload, view, clip |
| Dev Plan | `/dashboard/dev-plan` | ✅ | View assigned plan (singular) |
| Calendar | `/dashboard/calendar` | ⚠️ Minimal | Events display but NO RSVP |
| Messages | `/dashboard/messages` | ✅ | |

**CRITICAL MISSING (Golf Player Has These)**:
- ❌ **Announcements view** — Player should see team announcements, acknowledge them, complete inline tasks
- ❌ **Tasks view** — Player should see assigned tasks with due dates and reminders
- ❌ **Schedule with RSVP** — Player should be able to RSVP to practices/games
- ❌ **Team Info page** — View team details, coaches, roster
- ❌ **Documents** — Access shared team documents

---

### 2.7 College Player Dashboard
**Purpose**: Team-only (NO recruiting features)
**Status**: Same as Player Team Mode above — uses `playerTeamNav`

**Key Difference**: No mode toggle, no recruiting activation banner. College players ONLY see team features.

---

## 3. GOLF vs BASEBALL FEATURE COMPARISON

### 3.1 Team Management Feature Matrix

| Feature | Golf Implementation | Baseball Implementation | Gap |
|---------|-------------------|----------------------|-----|
| **Roster** | Full with status, year badges, invite, join requests, quick cards, online indicator | Good — invite, lineup builder, status, jersey numbers | Minor polish needed |
| **Calendar** | 40+ components: month/week/day views, RSVP, availability polls, attendance check-in, recurring events, conflict warnings, mobile swipeable, calendar sync | Basic wrapper with event display only | **MASSIVE GAP** |
| **Events** | Rich event types (practice, tournament, qualifier, meeting, workout, class, travel), max attendees, cancellation, mandatory flags | Simple event type with start_time | **MASSIVE GAP** |
| **Announcements** | Full system: urgency levels, player targeting, document attachment, inline tasks, acknowledgement tracking | **DOES NOT EXIST** | **MISSING ENTIRELY** |
| **Tasks** | Templates, reminders, assignments, completion tracking, categories | **DOES NOT EXIST** (only dev plans) | **MISSING ENTIRELY** |
| **Documents** | Upload, versioning, categories, player visibility, PDF/image preview | **DOES NOT EXIST** | **MISSING ENTIRELY** |
| **Travel** | Itineraries, expenses, expense splits, budgets | **DOES NOT EXIST** | **MISSING ENTIRELY** |
| **Messages** | Team-wide, DMs, attachments, broadcast, real-time | Team-wide, DMs, attachments, real-time | Parity (close) |
| **Dev Plans / Focus Areas** | Focus areas with target metrics, progress tracking, linked to stats | Dev plans with goals, drills, status tracking | Similar concept, different approach |
| **Stats** | Strokes gained, dispersion charts, heatmaps, trend visualization, player comparison, data completeness | Basic stat uploads, aggregates, percentiles | **LARGE GAP** |
| **AI/Intelligence** | CoachHelm: insights, patterns, predictions, round reviews, reasoning chains, 50+ AI components | Command Center exists but minimal wiring | **LARGE GAP** |
| **Qualifiers** | Create, leaderboard, bracket, entries, position tracking | **N/A** (baseball doesn't need this) | N/A |
| **Classes** | Academic schedule management | Academics page (JUCO only, stub) | Medium gap |
| **Settings** | Personal info, email, password, location, phone, notifications, appearance, team settings, invite management, join team | Password, email, notifications, account deletion | Medium gap |

### 3.2 Component Count Comparison

| Category | Golf Components | Baseball Components | Ratio |
|----------|----------------|-------------------|-------|
| Calendar | 40+ | ~5 | 8:1 |
| Announcements | 15+ | 0 | ∞ |
| Tasks | 15+ | 0 | ∞ |
| Documents | 8+ | 0 | ∞ |
| Travel | 3+ | 0 | ∞ |
| Roster | 10+ | 5+ | 2:1 |
| Stats | 20+ | 5+ | 4:1 |
| Messages | 8+ | 5+ | 1.6:1 |
| AI/Intelligence | 50+ | ~2 | 25:1 |
| Settings | 10+ | 3+ | 3:1 |

---

## 4. CRITICAL ISSUES BY DASHBOARD TYPE

### 4.1 HIGH SCHOOL COACH — Priority Issues

| # | Issue | Severity | Type | Description |
|---|-------|----------|------|-------------|
| 1 | No Announcements | 🔴 Critical | Feature | HS coaches cannot communicate announcements to team. Must build full announcement system (create, target players, urgency, docs, acknowledgements) |
| 2 | No Tasks | 🔴 Critical | Feature | No standalone task assignment. Dev Plans exist but coaches need quick tasks (e.g., "Submit fitness test results by Friday") |
| 3 | Calendar Minimal | 🔴 Critical | Feature | No RSVP, no attendance, no recurring events, no event creation flow. Calendar is view-only. |
| 4 | No Documents | 🟡 High | Feature | Coaches can't share playbooks, practice plans, rules, waivers with team |
| 5 | No Travel | 🟡 High | Feature | No tournament travel coordination |
| 6 | Dev Plan Progress Placeholders | 🟡 High | Bug | HS dashboard uses `Math.random()` for dev plan progress (lines 206-210 of TeamDashboardClient) |
| 7 | No Team Settings Page | 🟡 High | Feature | No dedicated page for managing join code, team branding, roster permissions |
| 8 | College Interest Limited | 🟡 Medium | UX | Interest tracker only shows last 30 days of engagement events. Needs persistent tracking. |

### 4.2 JUCO COACH — Priority Issues

| # | Issue | Severity | Type | Description |
|---|-------|----------|------|-------------|
| 1 | Academics Page Stub | 🔴 Critical | Feature | Key JUCO differentiator. Needs academic eligibility tracking, GPA monitoring, transfer credit tracking |
| 2 | All HS Coach Issues | 🔴 Critical | Feature | Same missing team features (announcements, tasks, calendar, documents, travel) |
| 3 | Team Dashboard Generic | 🟡 High | UX | JUCO team dashboard uses generic TeamDashboardClient, not JUCO-specific like HS has HSCoachDashboardPage |
| 4 | Transfer Recruiting Not Differentiated | 🟡 Medium | UX | JUCO recruiting mode is identical to college coach. Should emphasize transfer-eligible players, academic requirements |

### 4.3 SHOWCASE COACH — Priority Issues

| # | Issue | Severity | Type | Description |
|---|-------|----------|------|-------------|
| 1 | Teams Page Stub | 🔴 Critical | Feature | Multi-team management is the core showcase value prop. Teams page needs full implementation. |
| 2 | Events Page Stub | 🔴 Critical | Feature | Showcase orgs run tournaments/showcases — this is their primary activity. Needs event management. |
| 3 | Organization Dashboard Thin | 🟡 High | UX | Org dashboard exists but needs richer metrics (total players across teams, event schedule, college connections) |
| 4 | Team Scoping | 🟡 High | Bug | When TeamSwitcher selects a team, roster/calendar/videos may not properly filter to that team's data |
| 5 | No Organization Profile Page | 🟡 High | Feature | Spec calls for `/dashboard/org-profile` separate from program profile |
| 6 | All HS Coach Issues | 🟡 High | Feature | Same missing team features within each team context |

### 4.4 COLLEGE COACH — Priority Issues

| # | Issue | Severity | Type | Description |
|---|-------|----------|------|-------------|
| 1 | Command Center Not Wired | 🟡 Medium | Feature | AI command center page exists but needs integration with real insights/analytics (like GolfHelm Intelligence Center) |
| 2 | Watchlist vs Pipeline Confusion | 🟡 Medium | UX | Sidebar shows Pipeline but spec also calls for separate Watchlist page. Currently watchlist IS pipeline stage 1. |
| 3 | Stats Upload Minimal | 🟡 Medium | Feature | Upload page exists but processing/display pipeline needs work |

### 4.5 PLAYER (ALL TYPES) — Priority Issues

| # | Issue | Severity | Type | Description |
|---|-------|----------|------|-------------|
| 1 | No Announcements View | 🔴 Critical | Feature | Players can't see team announcements or acknowledge them |
| 2 | No Tasks View | 🔴 Critical | Feature | Players can't see assigned tasks or mark them complete |
| 3 | Calendar No RSVP | 🔴 Critical | Feature | Players can't RSVP to practices/games |
| 4 | No Team Info Page | 🟡 Medium | Feature | Players should see team details (coaches, roster, contact info) |
| 5 | No Document Access | 🟡 Medium | Feature | Players can't access shared team documents |
| 6 | Player Team Dashboard Basic | 🟡 Medium | UX | Team dashboard for players only shows video count, dev plan, schedule. Needs richer content. |
| 7 | Multi-Team Toggle Limited | 🟡 Medium | UX | Players with 2 teams (HS + Showcase) have team switcher but scoping may not work correctly |

---

## 5. DATABASE GAP ANALYSIS

### 5.1 Tables Baseball NEEDS (Modeled After Golf)

#### 🔴 Critical — Must Build

```sql
-- 1. ANNOUNCEMENTS SYSTEM
baseball_announcements (
  id, team_id, title, content, urgency, created_by_id, created_at
)
baseball_announcement_recipients (
  announcement_id, player_id
)
baseball_announcement_acknowledgements (
  announcement_id, player_id, acknowledged_at
)
baseball_announcement_documents (
  announcement_id, document_id
)
baseball_announcement_tasks (
  announcement_id, task_id
)

-- 2. TASKS SYSTEM
baseball_tasks (
  id, team_id, title, description, due_date, status, category,
  reminder_at, assigned_to_name, created_by_id, created_at
)
baseball_task_assignments (
  task_id, player_id, status, completed_at
)
baseball_task_completions (
  task_id, player_id, completed_at, notes
)
baseball_task_templates (
  id, team_id, title, description, category, created_by_id
)
baseball_task_reminders (
  task_id, reminder_at, sent
)

-- 3. ENHANCED CALENDAR
baseball_event_attendance (
  event_id, player_id, status, response_date  -- status: going/maybe/not_going
)
baseball_event_rsvps (
  event_id, player_id, rsvp_status, responded_at
)
baseball_recurring_events (
  id, team_id, title, recurrence_rule, event_type
)
-- Also need to ADD columns to baseball_events:
--   max_attendees, is_mandatory, cancellation_reason,
--   recurrence_id, rsvp_deadline
```

#### 🟡 High Priority — Should Build

```sql
-- 4. DOCUMENTS SYSTEM
baseball_documents (
  id, team_id, title, file_url, file_type, file_size,
  category, is_player_visible, uploaded_by_id, created_at
)
baseball_document_versions (
  id, document_id, file_url, version_number, uploaded_by_id, created_at
)

-- 5. TRAVEL SYSTEM
baseball_travel_itineraries (
  id, team_id, event_name, departure_date, return_date,
  location, accommodation, transportation, notes
)
baseball_travel_expenses (
  id, itinerary_id, category, amount, description, paid_by
)

-- 6. ACADEMICS (JUCO Enhancement)
baseball_player_classes (
  id, player_id, class_name, instructor, days, start_time,
  end_time, building, room, credits, semester
)
baseball_academic_eligibility (
  id, player_id, semester, gpa, credits_completed,
  is_eligible, notes
)
```

#### 🟢 Nice to Have

```sql
-- 7. ENHANCED FEATURES
baseball_availability_polls (
  id, event_id, options, deadline
)
baseball_poll_responses (
  poll_id, player_id, selected_option, responded_at
)
baseball_calendar_syncs (
  id, user_id, provider, external_calendar_id, last_synced
)
baseball_player_availability_blocks (
  id, player_id, start_time, end_time, reason
)
```

### 5.2 Existing Tables Needing Enhancement

| Table | Current | Needs |
|-------|---------|-------|
| `baseball_events` | Basic (id, team_id, title, event_type, start_time) | Add: end_time, location, description, max_attendees, is_mandatory, cancellation_reason, recurrence_id, rsvp_deadline, created_by_id |
| `baseball_developmental_plans` | Goals as JSON, status tracking | Add: target metrics, current values, progress percentage calculation, linked drills with video URLs |
| `baseball_team_invitations` | Basic join code | Add: expiration_at, max_uses, current_uses, is_active |

---

## 6. NAVIGATION & ROUTING ISSUES

### 6.1 Sidebar Navigation Gaps

| Role | Spec Says | Currently Has | Missing Nav Items |
|------|-----------|---------------|-------------------|
| HS Coach | Dashboard, Roster, Videos, Dev Plans, College Interest, Calendar, Messages | ✅ All present | ❌ Announcements, Tasks, Documents, Team Settings |
| JUCO Team | Dashboard, Roster, Videos, Dev Plans, Academics, College Interest, Calendar, Messages | ✅ All present | ❌ Announcements, Tasks, Documents |
| Showcase | Org Dashboard, Teams, Events, Per-Team (Roster, Videos, Dev Plans, Calendar, Messages) | Partially present | ❌ Org Profile, Announcements, Tasks per team |
| Player Team | Dashboard, Schedule, Videos, Dev Plan, Messages, Announcements | Has: Dashboard, Profile, Videos, Dev Plan, Calendar, Messages | ❌ Announcements, Tasks, Team Info |

### 6.2 Routing Architecture Issues

1. **HS Coach routes to `/dashboard/team/high-school`** but nav says `/dashboard/team/high-school`. This is correct but the generic team dashboard at `/dashboard/team` also exists and is used by JUCO team mode — potential confusion.

2. **Showcase coach team-specific routes** should use `/dashboard/team/[teamId]/roster` pattern but currently all teams share `/dashboard/roster`. Team scoping happens via `useTeamStore` which may not be URL-persistent.

3. **Player mode toggle** correctly switches nav between `playerRecruitingNav` and `playerTeamNav`, but the URL doesn't change to reflect mode (could cause confusion on deep links).

4. **College player** correctly has no mode toggle and no recruiting nav. ✅

### 6.3 Missing Routes (Need to Create)

```
/baseball/dashboard/announcements       -- Coach create + Player view
/baseball/dashboard/tasks               -- Coach create + Player view
/baseball/dashboard/documents           -- Coach upload + Player browse
/baseball/dashboard/travel              -- Coach manage + Player view
/baseball/dashboard/team-settings       -- Coach team administration
/baseball/dashboard/team-info           -- Player view of team details
```

---

## 7. UI/UX ISSUES

### 7.1 Design Consistency Issues

| Issue | Location | Description | Priority |
|-------|----------|-------------|----------|
| Grid responsiveness | HS Coach Dashboard | `grid-cols-4` stat cards break on tablet. Golf uses responsive `grid-cols-1 md:grid-cols-2 lg:grid-cols-4` | 🟡 Medium |
| Placeholder data | HS Coach Dashboard | Dev plan progress uses `Math.random()` | 🔴 Critical |
| Glass card inconsistency | Multiple dashboards | Some cards use `variant="glass"`, some use plain white. Should be consistent per design system. | 🟡 Medium |
| Empty states | Multiple | Some features have empty states, others just show blank space. All features need proper empty states with CTAs. | 🟡 Medium |
| Loading states | Team Dashboard | Uses generic `PageLoading` spinner. Should use skeleton loaders (per design system). | 🟡 Medium |
| Mobile nav items | Bottom nav | Only 4 items. Doesn't match full sidebar nav. Missing quick access to key team features. | 🟡 Medium |

### 7.2 UX Flow Issues

| Issue | Description | Impact | Priority |
|-------|-------------|--------|----------|
| No onboarding for team features | When HS coach first loads team dashboard, no guidance on setting up team (invite players, create schedule, etc.) | High — coaches don't know what to do | 🟡 High |
| Calendar is passive | Calendar only displays events. No way to create events from calendar view (golf has QuickAddEventFAB). | High — coaches need to create events | 🔴 Critical |
| No notification system | No bell icon, no notification center. Golf has NotificationCenter in calendar. Baseball has `notifications` table but no UI. | Medium — users miss important updates | 🟡 High |
| Recruiting activation buried | Players see small banner to activate recruiting. Should be more prominent for non-college players. | Medium — conversion to premium | 🟡 Medium |
| No confirmation on destructive actions | Removing players from roster, deleting videos — should have confirmation dialogs | Medium — prevents accidents | 🟡 Medium |

### 7.3 Dashboard-Specific UX Issues

**HS Coach Dashboard**:
- ✅ Good: Has roster table, college interest tracker, analytics sidebar
- ❌ Bad: No way to create events from dashboard
- ❌ Bad: Batch video upload section feels out of place on main dashboard

**JUCO Coach Team Dashboard**:
- ❌ Bad: Uses generic `TeamDashboardClient` instead of JUCO-specific dashboard. Should show academic eligibility status, transfer tracking, eligibility alerts.

**Showcase Coach Dashboard**:
- ❌ Bad: Org dashboard needs richer metrics (total players, upcoming events, college connections made)
- ❌ Bad: Team context switching may not persist through page navigation

**Player Team Dashboard**:
- ✅ Good: Profile card, stat cards, schedule, dev plan
- ❌ Bad: No team announcements section
- ❌ Bad: No upcoming tasks section
- ❌ Bad: No "teammates" section

---

## 8. COMPONENT GAP ANALYSIS

### 8.1 Components to Build (Modeled After Golf)

#### Calendar Components (Priority: Critical)
```
baseball/calendar/
├── BaseballCalendarWrapper.tsx     -- EXISTS but needs major enhancement
├── CalendarHeader.tsx              -- Month/week/day toggle, navigation
├── MonthView.tsx                   -- Month calendar grid
├── WeekView.tsx                    -- Week view with time slots
├── DayView.tsx                     -- Day detail with events
├── EventCard.tsx                   -- Event display card
├── EventDetailModal.tsx            -- Event details + RSVP
├── QuickAddEventFAB.tsx            -- Floating action button for quick event creation
├── RSVPButtons.tsx                 -- Going/Maybe/Not Going buttons
├── RSVPStatusSection.tsx           -- Who's going/not going summary
├── AttendanceCheckIn.tsx           -- Mark attendance on event day
├── RecurrencePicker.tsx            -- Set up recurring events
└── MobileCalendarView.tsx          -- Mobile-optimized calendar
```

#### Announcement Components (Priority: Critical)
```
baseball/announcements/
├── AnnouncementsCoachView.tsx      -- Coach list with create button
├── AnnouncementsPlayerView.tsx     -- Player list with acknowledge
├── AnnouncementCard.tsx            -- Display card with urgency badge
├── CreateAnnouncementFlow.tsx      -- Multi-step creation wizard
├── PlayerSelector.tsx              -- Select target players
├── UrgencyPicker.tsx               -- Set urgency level
├── DocumentAttacher.tsx            -- Attach files
├── InlineTaskBuilder.tsx           -- Create inline tasks
├── AcknowledgementTracker.tsx      -- Track who acknowledged
└── AnnouncementTaskItem.tsx        -- Task within announcement
```

#### Task Components (Priority: Critical)
```
baseball/tasks/
├── TasksList.tsx                   -- All tasks with filters
├── TaskCard.tsx                    -- Task display card
├── CreateTaskModal.tsx             -- New task dialog
├── TaskFormWithReminder.tsx        -- Form with reminder picker
├── ReminderPicker.tsx              -- Date/time picker for reminders
├── TaskTemplateList.tsx            -- Available templates
├── TemplateForm.tsx                -- Create/edit template
└── TaskSkeleton.tsx                -- Loading skeleton
```

#### Document Components (Priority: High)
```
baseball/documents/
├── DocumentCard.tsx                -- Document display
├── DocumentPreview.tsx             -- File preview (PDF, image)
├── UploadModal.tsx                 -- Upload new document
├── VersionHistory.tsx              -- View versions
└── UploadNewVersion.tsx            -- Add new version
```

#### Travel Components (Priority: Medium)
```
baseball/travel/
├── TravelItinerary.tsx             -- Trip display
├── ExpenseForm.tsx                 -- Add expense
├── ExpenseList.tsx                 -- View expenses
└── ExpenseSummary.tsx              -- Total summary
```

### 8.2 Existing Components Needing Enhancement

| Component | Current State | Needs |
|-----------|--------------|-------|
| `BaseballCalendarWrapper` | Basic event display | Full calendar with views, RSVP, creation |
| `TeamDashboardClient` | Generic stats + quick actions | Role-specific content, announcements section, tasks preview, richer activity feed |
| `RosterTable` (HS dashboard) | Read-only table | Should link to full roster page, show online status |
| `CollegeInterestTracker` | Last 30 days only | Persistent tracking, per-player breakdown |

---

## 9. IMPLEMENTATION ROADMAP

### Phase 1: Calendar + Events Enhancement (Week 1)
**Impact**: Affects ALL dashboard types (HS, JUCO, Showcase, Players)

1. Enhance `baseball_events` table (add columns)
2. Create `baseball_event_attendance` table
3. Create `baseball_recurring_events` table
4. Build calendar component suite (12+ components)
5. Wire to all dashboard types
6. Add event creation flow for coaches
7. Add RSVP flow for players

### Phase 2: Announcements System (Week 1-2)
**Impact**: ALL team-mode dashboards

1. Create 5 announcement tables
2. Build 10 announcement components
3. Add `/dashboard/announcements` route
4. Wire to coach dashboards (create) and player dashboards (view/acknowledge)
5. Add announcement section to team dashboards

### Phase 3: Tasks System (Week 2)
**Impact**: ALL team-mode dashboards

1. Create 5 task tables
2. Build 8 task components
3. Add `/dashboard/tasks` route
4. Wire to coach dashboards (create/assign) and player dashboards (view/complete)

### Phase 4: Documents & Travel (Week 2-3)
**Impact**: Team coaches + players

1. Create document tables
2. Create travel tables
3. Build components
4. Add routes
5. Wire to dashboards

### Phase 5: Dashboard Polish (Week 3)
**Impact**: All dashboards

1. Fix HS Coach dashboard placeholder data
2. Build JUCO-specific team dashboard
3. Enhance Showcase org dashboard
4. Enrich player team dashboard
5. Add notification center
6. Fix responsive grid issues
7. Standardize glass card usage
8. Add proper skeleton loaders everywhere
9. Add empty states with CTAs everywhere

### Phase 6: Academics (JUCO) Enhancement (Week 3)
1. Create academic tables
2. Build academic tracking UI
3. Wire to JUCO coach dashboard
4. Add eligibility alerts

### Phase 7: Navigation Updates (Week 3-4)
1. Add missing nav items to sidebar for each role
2. Update mobile bottom nav
3. Add team settings page
4. Add notification bell to header
5. Ensure team scoping works for showcase coaches

---

## 10. APPENDIX: COMPLETE ROUTE MAP

### All Existing Baseball Routes (68 pages)

```
AUTH (5 routes):
  /baseball/login
  /baseball/signup
  /baseball/complete-signup
  /baseball/forgot-password
  /baseball/reset-password

ONBOARDING (3 routes):
  /baseball/player            (8-step player onboarding)
  /baseball/coach             (coach entry)
  /baseball/coach-onboarding  (multi-step coach onboarding)

JOIN (1 route):
  /baseball/join/[code]       (team invite handler)

PUBLIC (3+ routes):
  /baseball/player/[id]           (public player profile)
  /baseball/player/[id]/profile   (alt player profile)
  /baseball/program/[id]          (public program profile)
  /baseball/team/[id]             (public team profile)

DASHBOARD - RECRUITING (8 routes):
  /baseball/dashboard                    (coach recruiting dashboard)
  /baseball/dashboard/discover           (player discovery)
  /baseball/dashboard/watchlist          (watchlist view)
  /baseball/dashboard/pipeline           (kanban pipeline)
  /baseball/dashboard/compare            (player comparison)
  /baseball/dashboard/comparisons        (saved comparisons)
  /baseball/dashboard/camps              (camp management)
  /baseball/dashboard/command-center     (AI command center)

DASHBOARD - TEAM (10 routes):
  /baseball/dashboard/team               (generic team dashboard)
  /baseball/dashboard/team/high-school   (HS coach dashboard)
  /baseball/dashboard/roster             (roster management)
  /baseball/dashboard/videos             (video library)
  /baseball/dashboard/videos/[id]/edit   (video editing)
  /baseball/dashboard/dev-plans          (dev plans list)
  /baseball/dashboard/dev-plans/[id]     (dev plan detail)
  /baseball/dashboard/dev-plan           (player dev plan view)
  /baseball/dashboard/organization       (showcase org dashboard)
  /baseball/dashboard/teams              (multi-team list)

DASHBOARD - PLAYER RECRUITING (4 routes):
  /baseball/dashboard/activate           (recruiting activation)
  /baseball/dashboard/colleges           (browse colleges)
  /baseball/dashboard/journey            (recruiting journey)
  /baseball/dashboard/college-interest   (college interest tracker)

DASHBOARD - SHARED (8 routes):
  /baseball/dashboard/calendar           (calendar)
  /baseball/dashboard/messages           (messaging)
  /baseball/dashboard/messages/[id]      (conversation)
  /baseball/dashboard/profile            (player profile editor)
  /baseball/dashboard/analytics          (player analytics)
  /baseball/dashboard/program            (coach program profile)
  /baseball/dashboard/events             (events listing)
  /baseball/dashboard/academics          (JUCO academics)

DASHBOARD - SETTINGS (4 routes):
  /baseball/dashboard/settings                        (main settings)
  /baseball/dashboard/settings/philosophy             (coach philosophy)
  /baseball/dashboard/settings/privacy                (privacy settings)
  /baseball/dashboard/settings/recruiting-preferences (recruiting prefs)

DASHBOARD - STATS (1 route):
  /baseball/dashboard/stats/upload       (stats upload)
```

### Routes That Need to Be Created

```
NEW ROUTES NEEDED:
  /baseball/dashboard/announcements      -- Announcements (coach + player)
  /baseball/dashboard/tasks              -- Tasks (coach + player)
  /baseball/dashboard/documents          -- Documents (coach + player)
  /baseball/dashboard/travel             -- Travel (coach + player)
  /baseball/dashboard/team-settings      -- Team admin settings
  /baseball/dashboard/team-info          -- Player team info view
  /baseball/dashboard/team/juco          -- JUCO-specific team dashboard
  /baseball/dashboard/org-profile        -- Showcase org profile
```

---

## Summary of All Issues (Sorted by Priority)

### 🔴 CRITICAL (Must Fix)
1. No Announcements system (entire feature missing — DB + components + routes)
2. No Tasks system (entire feature missing — DB + components + routes)
3. Calendar/Events minimal (no RSVP, no attendance, no creation, no recurring)
4. Dev plan progress uses Math.random() placeholder data
5. JUCO Academics page is a stub (key differentiator)
6. Showcase Events page is a stub (core showcase feature)
7. Showcase Teams page is a stub (core showcase feature)

### 🟡 HIGH (Should Fix)
8. No Documents system (DB + components + routes)
9. No Travel system (DB + components + routes)
10. JUCO team dashboard is generic (not JUCO-specific)
11. No Team Settings page
12. No notification center/bell
13. Player team dashboard missing announcements, tasks, team info
14. Showcase team scoping may not persist
15. Missing nav items in sidebar for new features
16. No event creation from any dashboard

### 🟢 MEDIUM (Nice to Fix)
17. Command Center not wired to real AI
18. Stats upload/display pipeline incomplete
19. Analytics chart has some placeholder data
20. Responsive grid issues on some dashboards
21. Glass card usage inconsistency
22. Mobile bottom nav limited items
23. No onboarding guidance for team features
24. No confirmation dialogs on destructive actions

---

*End of Report*
