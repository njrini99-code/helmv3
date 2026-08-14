# Helm Sports Labs
use this when completing tasks to reference Md's
## Project Overview
Dual-platform sports management system:
- **Baseball Recruiting Platform** — Connect high school/showcase players with college coaches
- **Golf Team Management Platform** — Track rounds, shots, and player development

## Tech Stack
- Next.js 14 (App Router)
- TypeScript
- Supabase (Auth, Database, Storage, Realtime)
- Tailwind CSS
- Zustand (state management)
- Recharts (charts/analytics)
- @dnd-kit (drag-and-drop)

## Key Documentation
| Document | Location | Purpose |
|----------|----------|---------|
| Feature Checklist | `docs/FEATURE_CHECKLIST.md` | Full list of completed, in-progress, and planned features with implementation specs |
| PRD | `docs/PRD.md` | Product requirements document |

**Always check `docs/FEATURE_CHECKLIST.md` first when implementing features.**

## Folder Structure

```
src/
├── app/
│   ├── baseball/
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   └── signup/
│   │   ├── (onboarding)/
│   │   │   ├── coach/
│   │   │   └── player/
│   │   ├── (public)/
│   │   │   ├── player/[id]/
│   │   │   └── program/[id]/
│   │   └── dashboard/
│   │       ├── page.tsx              # Main dashboard (role-based)
│   │       ├── discover/             # Player discovery (college coaches)
│   │       ├── watchlist/            # Watchlist management
│   │       ├── pipeline/             # Recruiting pipeline board
│   │       ├── compare/              # Player comparison
│   │       ├── roster/               # Team roster
│   │       ├── team/                 # Team dashboard
│   │       ├── videos/               # Video library
│   │       ├── messages/             # Messaging
│   │       ├── calendar/             # Calendar/events
│   │       ├── camps/                # Camp management
│   │       ├── analytics/            # Player analytics
│   │       ├── journey/              # Recruiting journey (players)
│   │       ├── profile/              # Profile editing
│   │       ├── program/              # Program profile (coaches)
│   │       ├── settings/             # User settings
│   │       ├── dev-plans/            # Developmental plans
│   │       ├── college-interest/     # College interest tracking
│   │       └── colleges/             # College discovery (players)
│   │
│   ├── golf/
│   │   └── dashboard/                # Golf coach dashboard
│   │
│   ├── player-golf/
│   │   ├── page.tsx                  # Golf player dashboard
│   │   └── rounds/
│   │       └── [id]/
│   │           └── play/             # Shot tracking during round
│   │
│   └── join/[code]/                  # Team invite links
│
├── components/
│   ├── ui/                           # 40+ reusable UI components
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Modal.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   ├── Badge.tsx
│   │   ├── Avatar.tsx
│   │   ├── Toast.tsx
│   │   └── ...
│   │
│   ├── layout/
│   │   ├── Sidebar.tsx               # Dynamic role-based navigation
│   │   ├── Header.tsx
│   │   ├── MobileMenu.tsx
│   │   └── ModeToggle.tsx            # JUCO mode toggle (not integrated)
│   │
│   ├── coach/
│   │   ├── discover/                 # Player discovery components
│   │   ├── watchlist/                # Watchlist components
│   │   ├── pipeline/                 # Pipeline board components
│   │   └── dashboard/                # Coach dashboard widgets
│   │
│   ├── player/
│   │   ├── dashboard/                # Player dashboard components
│   │   ├── profile/                  # Profile components
│   │   └── journey/                  # Recruiting journey components
│   │
│   ├── golf/
│   │   ├── ShotTracking.tsx
│   │   ├── Scorecard.tsx
│   │   └── ShotTrackingFinal_WITH_SCORECARD.tsx
│   │
│   ├── shared/
│   │   ├── USAMap.tsx                # Interactive state map
│   │   ├── PlayerCard.tsx
│   │   └── VideoPlayer.tsx
│   │
│   └── panels/                       # ⚠️ DEAD CODE - to be removed
│       ├── PeekPanelRoot.tsx
│       └── PlayerPeekPanel.tsx
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts                 # Browser client
│   │   └── server.ts                 # Server client
│   │
│   ├── queries/                      # Centralized database queries
│   │   ├── players.ts
│   │   ├── coaches.ts
│   │   ├── teams.ts
│   │   ├── watchlist.ts
│   │   ├── messages.ts
│   │   ├── videos.ts
│   │   ├── camps.ts
│   │   ├── calendar.ts
│   │   └── analytics.ts
│   │
│   ├── actions/                      # Server actions
│   │   ├── auth.ts
│   │   ├── players.ts
│   │   ├── coaches.ts
│   │   ├── watchlist.ts
│   │   ├── messages.ts
│   │   └── videos.ts
│   │
│   ├── types.ts                      # All TypeScript types
│   ├── utils.ts                      # Utility functions (cn, etc.)
│   └── permissions.ts                # Permission check functions
│
├── stores/
│   └── auth-store.ts                 # Zustand auth store
│
├── hooks/
│   ├── use-auth.ts                   # Auth hook (user, coach, player)
│   ├── use-watchlist.ts
│   ├── use-pipeline.ts
│   ├── use-messages.ts
│   ├── use-videos.ts
│   ├── use-calendar.ts
│   ├── use-roster.ts
│   └── use-route-protection.ts
│
└── middleware.ts                     # Auth middleware for protected routes

docs/
├── FEATURE_CHECKLIST.md              # ⭐ Primary reference for features
└── PRD.md                            # Product requirements

.claude/
└── commands/                         # Custom slash commands
    ├── status.md
    ├── next.md
    ├── complete.md
    ├── start.md
    └── ...
```

## User Roles & Coach Types

| Role | Coach Type | Key Features |
|------|------------|--------------|
| Coach | `college` | Discover, Watchlist, Pipeline, Compare, Camps |
| Coach | `high-school` | Roster, Videos, Dev Plans, College Interest |
| Coach | `juco` | Both (mode toggle) — ⚠️ NOT IMPLEMENTED |
| Coach | `showcase` | Multi-team, Events, Roster, Videos |
| Player | `high-school` | Dashboard, Profile, Journey, Analytics |
| Player | `showcase` | Dashboard, Profile, Journey, Analytics |
| Player | `juco` | Dashboard, Profile, limited features |
| Player | `college` | Dashboard, Profile (no recruiting) |

## Feature ID Patterns

When implementing features, look for these IDs in `docs/FEATURE_CHECKLIST.md`:

| Prefix | Category | Example |
|--------|----------|---------|
| `AUTH-` | Authentication | AUTH-001: User Authentication |
| `RECRUIT-` | Recruiting (coaches) | RECRUIT-001: Player Discovery |
| `PLAYER-` | Player features | PLAYER-001: Player Dashboard |
| `MSG-` | Messaging | MSG-001: Real-time Messaging |
| `VIDEO-` | Video features | VIDEO-001: Video Library |
| `CAMP-` | Camp management | CAMP-001: Camp System |
| `CAL-` | Calendar | CAL-001: Team Calendar |
| `TEAM-` | Team management | TEAM-001: Roster Management |
| `SET-` | Settings | SET-001: User Settings |
| `SYS-` | Infrastructure | SYS-001: Navigation System |
| `GOLF-` | Golf platform | GOLF-001: Golf Dashboard |
| `HS-` | HS Coach specific | HS-001: HS Coach Dashboard |
| `JUCO-` | JUCO specific | JUCO-001: Mode Toggle |
| `SHOW-` | Showcase specific | SHOW-001: Multi-Team |
| `PUB-` | Public profiles | PUB-001: Public Player Profiles |
| `CORE-` | Critical fixes (P0) | CORE-001: JUCO Mode Toggle |
| `FEATURE-` | New features | FEATURE-001: Video Clipping |
| `TECH-` | Technical debt | TECH-001: Type Cleanup |
| `FUTURE-` | Future/P3 | FUTURE-001: Mobile App |

## Priority Levels

| Priority | Meaning | Action |
|----------|---------|--------|
| P0 | Critical | Must be done first, blocks other work |
| P1 | High | Complete partially built features |
| P2 | Medium | New features and enhancements |
| P3 | Low | Future vision, nice-to-have |

## Design System

| Element | Value |
|---------|-------|
| Primary Color | Kelly Green `#16A34A` (`green-600`) |
| Background | Cream White `#FAF6F1` |
| Cards | White `#FFFFFF` with glass morphism |
| Text | Slate 900/600/400 |
| Borders | Slate 200 |
| Effects | `backdrop-blur-xl`, `shadow-md`, `rounded-2xl` |
| Font | Inter (system-ui fallback) |

## Database Tables (Key)

- `users` — Supabase Auth users
- `coaches` — Coach profiles (links to users)
- `players` — Player profiles (links to users)
- `organizations` — Schools/programs
- `teams` — Teams within organizations
- `team_members` — Player-team relationships
- `watchlists` — Coach recruiting watchlists
- `messages` — Messaging system
- `conversations` — Message threads
- `videos` — Player videos
- `camps` — Camp events
- `camp_registrations` — Camp signups
- `coach_calendar_events` — Calendar events
- `player_engagement_events` — Analytics events
- `recruiting_interests` — Player's college interests

## Common Commands

```bash
# Development
npm run dev

# Type checking
npm run typecheck

# Build
npm run build

# Lint
npm run lint
```

## When Implementing Features

1. **Read the spec first:** Check `docs/FEATURE_CHECKLIST.md` for the feature ID
2. **Check what exists:** Look at "What Exists" section
3. **Understand what's missing:** Look at "What's Missing" section
4. **Follow patterns:** Match existing code patterns in the codebase
5. **Use existing components:** Check `src/components/ui/` before creating new ones
6. **Use existing queries:** Check `src/lib/queries/` for database patterns
7. **Update the checklist:** Mark features complete when done

## Dead Code to Remove (CORE-005)

These files should be deleted:
- `components/panels/PeekPanelRoot.tsx`
- `components/panels/PlayerPeekPanel.tsx`
- `components/panels/SchoolPeekPanel.tsx`
- `components/coach/pipeline/PipelineBoard.tsx` (old version)
- `components/coach/pipeline/PipelineColumn.tsx` (old version)
- `components/coach/discover/USAMap.tsx` (duplicate)
- `src/app/dev/page.tsx`
- `src/app/test-shot-tracking/page.tsx`
