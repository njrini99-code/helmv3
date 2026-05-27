# GolfHelm — Project Context

> College golf team management platform + CoachHelm AI intelligence layer
> Last updated: 2026-02-13
> **Use this file to find where code lives** (routes, actions, components, hooks)

---

## How to Use This File

- **"Where is the code for X?"** → Search the action files or component directories below
- **"What route serves X?"** → Check the routes tables by role
- **"What features exist?"** → Go to `memory/context/golfhelm-features.md` instead
- **"What tables does X use?"** → Go to `memory/glossary.md`

---

## Architecture

- **Framework**: Next.js 16 (App Router), TypeScript strict
- **Backend**: Supabase (PostgreSQL + RLS + Auth + Storage + Realtime)
- **Styling**: Tailwind CSS + Framer Motion + Glassmorphism design system
- **AI**: CoachHelm V2 intelligence engine (pattern mining, predictions, NLG)
- **State**: Zustand (golf-auth-store.ts), React context (golf-user-context)

---

## User Types

### Coach (Administrator)
- Creates team, invites players via invite code
- Full team management: roster, events, calendar, tasks, documents, travel
- Views all player rounds, stats, and development
- CoachHelm AI: insights, patterns, predictions, round reviews, alerts
- Philosophy settings control how CoachHelm prioritizes alerts

### Player (Consumer + Data Provider)
- Joins team via invite link from coach
- Records rounds (shot-by-shot tracking with 50+ stats per round)
- Views own stats, development areas, and AI insights
- RSVP to events, complete tasks, view announcements
- Upload class schedule for conflict detection

### Onboarding Flows
- **Coach (3 steps):** Organization → Team → Profile → Dashboard
- **Player (4 steps):** Basic info → Golf info (year, handicap) → Academic (major, GPA) → Photo → Dashboard

---

## Routes by Role

### Coach-Only Routes
| Route | Purpose |
|-------|---------|
| `/golf/dashboard/alerts` | AI performance alerts |
| `/golf/dashboard/patterns` | Pattern analysis dashboard |
| `/golf/dashboard/insights` | AI insights management |
| `/golf/dashboard/intelligence` | CoachHelm intelligence hub |
| `/golf/dashboard/analytics/coachhelm` | CoachHelm analytics |
| `/golf/dashboard/settings/coaching-intelligence` | AI philosophy config |
| `/golf/dashboard/development` | Player development plans (focus areas) |
| `/golf/dashboard/qualifiers/new` | Create qualifier |
| `/golf/dashboard/stats/team` | Team-level analytics |

### Player-Only Routes
| Route | Purpose |
|-------|---------|
| `/golf/dashboard/hub` | Player home (travel, tasks, events) |
| `/golf/dashboard/coachhelm` | Player AI dashboard |
| `/golf/dashboard/my-development` | My development focus areas |
| `/golf/dashboard/my-qualifiers` | My qualifier progress |
| `/golf/dashboard/my-insights` | → Redirects to `/dashboard/coachhelm` |
| `/golf/dashboard/rounds/new` | Create new round |
| `/golf/dashboard/rounds/continue/[id]` | Resume in-progress round |
| `/golf/dashboard/rounds/[id]/review` | AI round review |
| `/golf/dashboard/classes` | Class schedule management |

### Shared Routes (Both Coach + Player)
| Route | Purpose |
|-------|---------|
| `/golf/dashboard` | Main dashboard hub (role-specific view) |
| `/golf/dashboard/roster` | Team roster |
| `/golf/dashboard/roster/[id]` | Player profile detail |
| `/golf/dashboard/rounds` | Round history |
| `/golf/dashboard/rounds/[id]` | Round details |
| `/golf/dashboard/calendar` | Team calendar + RSVP |
| `/golf/dashboard/qualifiers` | Qualifier events list |
| `/golf/dashboard/qualifiers/[id]` | Qualifier detail/leaderboard |
| `/golf/dashboard/stats` | Statistics |
| `/golf/dashboard/messages` | Team messaging |
| `/golf/dashboard/announcements` | Announcements |
| `/golf/dashboard/tasks` | Task management |
| `/golf/dashboard/documents` | Document library |
| `/golf/dashboard/travel` | Travel itineraries |
| `/golf/dashboard/team` | Team info page |
| `/golf/dashboard/settings` | User settings |

### Auth & Platform Routes
| Route | Purpose |
|-------|---------|
| `/golf/login`, `/golf/signup` | Auth |
| `/golf/forgot-password`, `/golf/reset-password` | Password recovery |
| `/golf/(onboarding)/coach` | Coach onboarding |
| `/golf/(onboarding)/player` | Player onboarding |
| `/golf/join/[code]` | Team join via invite |
| `/golf/admin` | Admin dashboard |
| `/golf` | Landing page |

---

## Server Actions by Role (41 files)

### Coach-Specific Actions
| File | Purpose |
|------|---------|
| `alerts.ts` | Coach alert CRUD (get, acknowledge, dismiss, generate) |
| `insight-management.ts` | Insight search, filter, acknowledge, dismiss, export |
| `insight-evidence.ts` | Insight evidence/supporting data |
| `insights.ts` | CoachHelm AI insight generation (pattern mining, predictions, analysis) |
| `pattern-management.ts` | Pattern lifecycle (validate, address, resolve, dismiss) |
| `intelligence-dashboard.ts` | Intelligence hub data aggregation |
| `coachhelm-analytics.ts` | CoachHelm effectiveness analytics |
| `development.ts` | Player focus area CRUD |
| `admin-data.ts` | Admin dashboard data aggregation |

### Player-Specific Actions
| File | Purpose |
|------|---------|
| `golf.ts` | Round CRUD, qualifier operations, shot tracking |
| `round-drafts.ts` | Draft round handling (auto-save) |
| `round-reviews.ts` | AI review generation and retrieval |
| `round-review-system.ts` | Review system operations (share with coach) |
| `shot-analytics.ts` | Shot data analytics (player CoachHelm) |
| `player-profile-stats.ts` | Player stat calculation |

### Team/Shared Actions
| File | Purpose |
|------|---------|
| `auth.ts` | Authentication |
| `onboarding.ts` | Onboarding flow |
| `teams.ts` | Team management |
| `roster.ts` | Roster operations (invite, join, approve) |
| `dashboard-data.ts` | Dashboard data (coach + player views) |
| `messages.ts` | Message operations |
| `message-attachments.ts` | Attachment handling |
| `communication.ts` | Communication utils |
| `announcements.ts` | Announcement management |
| `event-lifecycle.ts` | Event CRUD/lifecycle |
| `recurring-events.ts` | Recurring events |
| `attendance.ts` | Attendance tracking |
| `availability-polling.ts` | Availability polls |
| `availability-locking.ts` | Availability locking |
| `calendar-sync.ts` | Calendar integration |
| `calendar-feeds.ts` | iCal feed management |
| `caldav-sync.ts` | CalDAV protocol |
| `tasks.ts` | Task management |
| `task-templates.ts` | Task templates |
| `task-reminders.ts` | Reminders |
| `documents.ts` | Document management |
| `stats.ts` | Stats calculation |
| `stats-v2.ts` | V2 stats calculation |
| `stats-data.ts` | Stats data operations |
| `courses.ts` | Course management |
| `travel.ts` | Travel itineraries |

---

## Component Directories

```
src/components/golf/           # 256+ components total
├── layout/                    # Header, nav, mobile nav
├── dashboard/                 # Dashboard home components (CoachDashboard, PlayerDashboard)
├── rounds/                    # Round entry and display
├── calendar/                  # Calendar system (30+ components)
│   ├── MonthView.tsx, WeekView.tsx, DayView.tsx
│   ├── MobileCalendarWrapper.tsx
│   ├── EventCreateModal, EventDetailModal
│   └── AttendanceCheckIn, AvailabilityPoll
├── roster/                    # Roster management
├── messages/                  # Messaging
├── announcements/             # Announcements
├── tasks/                     # Task management (18 components)
├── qualifiers/                # Qualifier/bracket display
├── classes/                   # Class schedule (AddClassModal, UploadScheduleModal)
├── stats/                     # Statistics views
├── documents/                 # Document management
├── travel/                    # Travel itineraries
├── settings/                  # Settings panels (Personal, Email, Password, Notifications, etc.)
├── profile/                   # Player profiles
├── player-hub/                # PlayerHub.tsx (40KB), PlayerHubWrapper.tsx
├── coachhelm/                 # 80+ CoachHelm AI components
│   ├── insights/              #   Insight cards, filters, search, export
│   ├── settings/              #   Philosophy config UI (PriorityRanker, ThresholdSlider, etc.)
│   ├── patterns/              #   Pattern dashboard (PatternCard, PatternTimeline)
│   ├── round-review/          #   Round review display (V1 + V2 components)
│   ├── analytics/             #   Analytics dashboards
│   ├── alerts/                #   Alert system (AlertCard)
│   ├── player/                #   Player intelligence views (PlayerCoachHelmDashboard)
│   ├── reviews/               #   Review management
│   └── v2/                    #   V2 engine components (IntelligenceCommandCenter)
└── ShotTrackingComprehensive.tsx  # Main shot tracking component
```

---

## Hooks (12 golf hooks)

| Hook | Purpose |
|------|---------|
| `use-golf-messages` | Realtime messaging subscription |
| `use-golf-rounds` | Round data fetching |
| `use-golf-team` | Team context provider |
| `use-team-context` | Team context consumer |
| `use-auto-save-round` | Auto-save round every 15s |
| `use-message-attachments` | File attachment management |
| `use-offline-sync` | Offline round sync (disabled) |
| `use-qualifier-realtime` | Realtime qualifier updates |
| `use-rsvp-realtime` | Realtime RSVP updates |
| `use-task-realtime` | Realtime task updates |
| `use-connection-status` | Network connectivity status |
| `use-service-worker` | Service worker registration |

---

## CoachHelm AI Engine

Location: `src/lib/coachhelm/` (V1 legacy + V2 current)
Full reference: `memory/context/coachhelm-ai.md`

```
src/lib/coachhelm/
├── types.ts, constants.ts     # Core types and defaults
├── index.ts                   # Exports
├── insight-engine.ts          # V1 insight generation (DEPRECATED)
├── round-review-generator.ts  # V1 round reviews (DEPRECATED)
├── strokes-gained.ts          # SG calculations
└── v2/                        # V2 Intelligence Engine (CURRENT)
    ├── orchestrator.ts        # Main orchestrator (1509 lines)
    ├── gate.ts                # Feature flags (global, per-user, per-team)
    ├── mining/                # Pattern mining (10+ files)
    ├── prediction/            # Forecasting (3 files)
    ├── features/              # Feature engineering (temporal, sequence, contextual)
    ├── learning/              # Behavior learning (3 files)
    ├── reasoning/             # Reasoning engine (causal, root cause)
    ├── nlg/                   # Natural language generation
    └── services/              # Persistence layer
```

---

## Database

74 golf_ tables in production.
- **Table list**: `memory/glossary.md`
- **Full column schema**: `memory/context/golfhelm-database.md`
- **Supabase project**: Helm-Production (qmnssrrolpinvwjjnufo)


---

## Auto-generated inventory: routes

<!-- AUTOGEN:routes:start -->
<!-- DO NOT EDIT — regenerated by scripts/regen-docs.mjs -->

**141 routes** (source: `src/app/**/page.tsx`).

<details><summary>Full alphabetical route list</summary>

- `/about`
- `/baseball/coach`
- `/baseball/coach-onboarding`
- `/baseball/coach/college`
- `/baseball/coach/high-school`
- `/baseball/coach/juco`
- `/baseball/coach/showcase`
- `/baseball/complete-signup`
- `/baseball/dashboard`
- `/baseball/dashboard/academics`
- `/baseball/dashboard/activate`
- `/baseball/dashboard/analytics`
- `/baseball/dashboard/announcements`
- `/baseball/dashboard/calendar`
- `/baseball/dashboard/camps`
- `/baseball/dashboard/camps/[id]`
- `/baseball/dashboard/college-interest`
- `/baseball/dashboard/colleges`
- `/baseball/dashboard/command-center`
- `/baseball/dashboard/compare`
- `/baseball/dashboard/comparisons`
- `/baseball/dashboard/dev-plan`
- `/baseball/dashboard/dev-plans`
- `/baseball/dashboard/dev-plans/[id]`
- `/baseball/dashboard/discover`
- `/baseball/dashboard/documents`
- `/baseball/dashboard/events`
- `/baseball/dashboard/journey`
- `/baseball/dashboard/messages`
- `/baseball/dashboard/messages/[id]`
- `/baseball/dashboard/my-stats`
- `/baseball/dashboard/organization`
- `/baseball/dashboard/pipeline`
- `/baseball/dashboard/players/[id]`
- `/baseball/dashboard/players/[id]/profile`
- `/baseball/dashboard/players/[id]/stats`
- `/baseball/dashboard/profile`
- `/baseball/dashboard/program`
- `/baseball/dashboard/roster`
- `/baseball/dashboard/settings`
- `/baseball/dashboard/settings/philosophy`
- `/baseball/dashboard/settings/privacy`
- `/baseball/dashboard/settings/recruiting-preferences`
- `/baseball/dashboard/stats`
- `/baseball/dashboard/stats/games`
- `/baseball/dashboard/stats/games/[gameId]`
- `/baseball/dashboard/stats/games/new`
- `/baseball/dashboard/stats/season`
- `/baseball/dashboard/stats/upload`
- `/baseball/dashboard/tasks`
- `/baseball/dashboard/team`
- `/baseball/dashboard/team/high-school`
- `/baseball/dashboard/teams`
- `/baseball/dashboard/travel`
- `/baseball/dashboard/videos`
- `/baseball/dashboard/videos/[id]/edit`
- `/baseball/dashboard/watchlist`
- `/baseball/forgot-password`
- `/baseball/join/[code]`
- `/baseball/login`
- `/baseball/player`
- `/baseball/player/[id]`
- `/baseball/player/college`
- `/baseball/player/high-school`
- `/baseball/player/juco`
- `/baseball/player/showcase`
- `/baseball/program/[id]`
- `/baseball/reset-password`
- `/baseball/signup`
- `/baseball/team/[id]`
- `/golf`
- `/golf/admin`
- `/golf/admin/crm`
- `/golf/admin/crm/coach/[id]`
- `/golf/admin/crm/inbox`
- `/golf/admin/crm/insights`
- `/golf/admin/crm/sequences`
- `/golf/admin/crm/settings/automations`
- `/golf/admin/crm/settings/suppressions`
- `/golf/coach`
- `/golf/dashboard`
- `/golf/dashboard/analytics/coachhelm`
- `/golf/dashboard/announcements`
- `/golf/dashboard/calendar`
- `/golf/dashboard/classes`
- `/golf/dashboard/coachhelm`
- `/golf/dashboard/coachhelm/chat`
- `/golf/dashboard/coachhelm/genome/[playerId]`
- `/golf/dashboard/coachhelm/genome/compare`
- `/golf/dashboard/coachhelm/qualifying/[id]`
- `/golf/dashboard/development`
- `/golf/dashboard/documents`
- `/golf/dashboard/hub`
- `/golf/dashboard/insights`
- `/golf/dashboard/intelligence`
- `/golf/dashboard/messages`
- `/golf/dashboard/my-development`
- `/golf/dashboard/my-game-profile`
- `/golf/dashboard/my-insights`
- `/golf/dashboard/my-qualifiers`
- `/golf/dashboard/my-standing`
- `/golf/dashboard/patterns`
- `/golf/dashboard/players/[playerId]`
- `/golf/dashboard/players/[playerId]/game`
- `/golf/dashboard/players/[playerId]/game/print`
- `/golf/dashboard/qualifiers`
- `/golf/dashboard/qualifiers/[id]`
- `/golf/dashboard/qualifiers/new`
- `/golf/dashboard/recruiting`
- `/golf/dashboard/roster`
- `/golf/dashboard/roster/[id]`
- `/golf/dashboard/rounds`
- `/golf/dashboard/rounds/[id]`
- `/golf/dashboard/rounds/[id]/review`
- `/golf/dashboard/rounds/continue/[id]`
- `/golf/dashboard/rounds/new`
- `/golf/dashboard/rounds/recover`
- `/golf/dashboard/settings`
- `/golf/dashboard/settings/coaching-intelligence`
- `/golf/dashboard/settings/notifications`
- `/golf/dashboard/stats`
- `/golf/dashboard/stats/team`
- `/golf/dashboard/tasks`
- `/golf/dashboard/team`
- `/golf/dashboard/travel`
- `/golf/dashboard/whats-new`
- `/golf/forgot-password`
- `/golf/join`
- `/golf/join/[code]`
- `/golf/login`
- `/golf/player`
- `/golf/reset-password`
- `/golf/signup`
- `/golf/welcome`
- `/help`
- `/page.tsx`
- `/privacy`
- `/products`
- `/splash`
- `/support`
- `/terms`

</details>

<!-- AUTOGEN:routes:end -->


---

## Auto-generated inventory: actions

<!-- AUTOGEN:actions:start -->
<!-- DO NOT EDIT — regenerated by scripts/regen-docs.mjs -->

**105 server-action files** (source: `src/app/**/actions/**/*.ts`).

<details><summary>Full alphabetical action file list</summary>

- `src/app/actions/demo-request.ts`
- `src/app/actions/messages.ts`
- `src/app/actions/notification-preferences.ts`
- `src/app/baseball/actions/academics.ts`
- `src/app/baseball/actions/announcements.ts`
- `src/app/baseball/actions/auth.ts`
- `src/app/baseball/actions/calendar.ts`
- `src/app/baseball/actions/dev-plans.ts`
- `src/app/baseball/actions/discover.ts`
- `src/app/baseball/actions/documents.ts`
- `src/app/baseball/actions/games.ts`
- `src/app/baseball/actions/insights.ts`
- `src/app/baseball/actions/interests.ts`
- `src/app/baseball/actions/lineups.ts`
- `src/app/baseball/actions/messages.ts`
- `src/app/baseball/actions/onboarding.ts`
- `src/app/baseball/actions/philosophy.ts`
- `src/app/baseball/actions/player-dashboard.ts`
- `src/app/baseball/actions/player-peek.ts`
- `src/app/baseball/actions/recruiting-philosophy.ts`
- `src/app/baseball/actions/stats.ts`
- `src/app/baseball/actions/tasks.ts`
- `src/app/baseball/actions/team-dashboard.ts`
- `src/app/baseball/actions/teams.ts`
- `src/app/baseball/actions/travel.ts`
- `src/app/baseball/actions/watchlist.ts`
- `src/app/golf/actions/access-code.ts`
- `src/app/golf/actions/admin-bi-data.ts`
- `src/app/golf/actions/admin-data.ts`
- `src/app/golf/actions/admin-people-data.ts`
- `src/app/golf/actions/admin-system-data.ts`
- `src/app/golf/actions/admin-tracer-data.ts`
- `src/app/golf/actions/admin/rollup-a.ts`
- `src/app/golf/actions/admin/rollup-b.ts`
- `src/app/golf/actions/admin/rollup-c.shared.ts`
- `src/app/golf/actions/admin/rollup-c.ts`
- `src/app/golf/actions/alerts.ts`
- `src/app/golf/actions/announcements.ts`
- `src/app/golf/actions/attendance.ts`
- `src/app/golf/actions/auth.ts`
- `src/app/golf/actions/calendar-feeds.ts`
- `src/app/golf/actions/calendar-sync.ts`
- `src/app/golf/actions/coach-notifications.ts`
- `src/app/golf/actions/coachhelm-analytics.ts`
- `src/app/golf/actions/coachhelm-data.ts`
- `src/app/golf/actions/coaching-philosophy.ts`
- `src/app/golf/actions/command-palette.ts`
- `src/app/golf/actions/communication.ts`
- `src/app/golf/actions/courses.ts`
- `src/app/golf/actions/crm-automations.ts`
- `src/app/golf/actions/crm-engagement.ts`
- `src/app/golf/actions/crm-foundations.ts`
- `src/app/golf/actions/crm-insights.ts`
- `src/app/golf/actions/crm-replies.ts`
- `src/app/golf/actions/crm-sequences.ts`
- `src/app/golf/actions/crm-timeline.ts`
- `src/app/golf/actions/dashboard-data.ts`
- `src/app/golf/actions/development.ts`
- `src/app/golf/actions/documents.ts`
- `src/app/golf/actions/drills.ts`
- `src/app/golf/actions/event-documents.ts`
- `src/app/golf/actions/golf.ts`
- `src/app/golf/actions/insight-celebration.ts`
- `src/app/golf/actions/insight-delivery.ts`
- `src/app/golf/actions/insight-evidence.ts`
- `src/app/golf/actions/insight-management.ts`
- `src/app/golf/actions/insights.ts`
- `src/app/golf/actions/intelligence-dashboard.ts`
- `src/app/golf/actions/message-attachments.ts`
- `src/app/golf/actions/messages.ts`
- `src/app/golf/actions/onboarding.ts`
- `src/app/golf/actions/pattern-management.ts`
- `src/app/golf/actions/player-effectiveness.ts`
- `src/app/golf/actions/player-feedback.ts`
- `src/app/golf/actions/player-fingerprint-types.ts`
- `src/app/golf/actions/player-fingerprint.ts`
- `src/app/golf/actions/player-notifications.ts`
- `src/app/golf/actions/player-profile-stats.ts`
- `src/app/golf/actions/push-notifications.ts`
- `src/app/golf/actions/recruiting.ts`
- `src/app/golf/actions/recurring-events.ts`
- `src/app/golf/actions/resend-activity.ts`
- `src/app/golf/actions/roster.ts`
- `src/app/golf/actions/round-drafts.ts`
- `src/app/golf/actions/round-recap.ts`
- `src/app/golf/actions/round-review-system.ts`
- `src/app/golf/actions/round-reviews.ts`
- `src/app/golf/actions/shot-analytics.ts`
- `src/app/golf/actions/stats-data-types.ts`
- `src/app/golf/actions/stats-data.ts`
- `src/app/golf/actions/stats-intelligence.ts`
- `src/app/golf/actions/stats.ts`
- `src/app/golf/actions/task-reminders.ts`
- `src/app/golf/actions/task-templates.ts`
- `src/app/golf/actions/tasks.ts`
- `src/app/golf/actions/team-category-insights.ts`
- `src/app/golf/actions/teams.ts`
- `src/app/golf/actions/travel.ts`
- `src/app/golf/actions/v3/goals.ts`
- `src/app/golf/actions/v3/intent.ts`
- `src/app/golf/actions/v3/llm.ts`
- `src/app/golf/actions/v3/notification-prefs.ts`
- `src/app/golf/actions/v3/practice-rx.ts`
- `src/app/golf/actions/v3/qualifying.ts`
- `src/app/golf/actions/whats-new.ts`

</details>

<!-- AUTOGEN:actions:end -->


---

## Auto-generated inventory: hooks

<!-- AUTOGEN:hooks:start -->
<!-- DO NOT EDIT — regenerated by scripts/regen-docs.mjs -->

**50 custom hooks** (source: `src/hooks/**/*.ts`).

<details><summary>Full alphabetical hook list</summary>

- `src/hooks/coachhelm/useCoachHelmSettings.ts`
- `src/hooks/coachhelm/useCoachPhilosophy.ts`
- `src/hooks/coachhelm/useRoundReviewV2.ts`
- `src/hooks/golf/use-appearance-preferences.ts`
- `src/hooks/golf/use-auto-save-round.ts`
- `src/hooks/golf/use-calendar-keyboard.ts`
- `src/hooks/golf/use-connection-status.ts`
- `src/hooks/golf/use-edit-shot-modal.ts`
- `src/hooks/golf/use-golf-messages.ts`
- `src/hooks/golf/use-message-attachments.ts`
- `src/hooks/golf/use-offline-sync.ts`
- `src/hooks/golf/use-penalty-handler.ts`
- `src/hooks/golf/use-qualifier-realtime.ts`
- `src/hooks/golf/use-round-status-sync.ts`
- `src/hooks/golf/use-service-worker.ts`
- `src/hooks/golf/use-shot-state-machine.ts`
- `src/hooks/golf/use-task-realtime.ts`
- `src/hooks/golf/use-team-context.ts`
- `src/hooks/golf/use-undo-manager.ts`
- `src/hooks/use-analytics.ts`
- `src/hooks/use-auth.ts`
- `src/hooks/use-baseball-auth.ts`
- `src/hooks/use-baseball-dashboard.ts`
- `src/hooks/use-colleges.ts`
- `src/hooks/use-dashboard.ts`
- `src/hooks/use-focus-trap.ts`
- `src/hooks/use-haptic-feedback.ts`
- `src/hooks/use-journey.ts`
- `src/hooks/use-local-storage.ts`
- `src/hooks/use-media-query.ts`
- `src/hooks/use-messages.ts`
- `src/hooks/use-mobile-detection.ts`
- `src/hooks/use-notifications.ts`
- `src/hooks/use-player-teams.ts`
- `src/hooks/use-presence.ts`
- `src/hooks/use-route-protection.ts`
- `src/hooks/use-sequenced-navigation.ts`
- `src/hooks/use-teams.ts`
- `src/hooks/use-unread-count.ts`
- `src/hooks/use-watchlist.ts`
- `src/hooks/useAdminAlerts.ts`
- `src/hooks/useAdminPresence.ts`
- `src/hooks/useAdminRealtime.ts`
- `src/hooks/useAnalyticsTracking.ts`
- `src/hooks/useAnimatedNumber.ts`
- `src/hooks/useCalendarEvents.ts`
- `src/hooks/useNotifications.ts`
- `src/hooks/useRSVP.ts`
- `src/hooks/useSmoothScroll.ts`
- `src/hooks/useVisibilityAwareInterval.ts`

</details>

<!-- AUTOGEN:hooks:end -->
