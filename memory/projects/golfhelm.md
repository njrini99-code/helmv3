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

## Hooks (13 golf hooks)

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
