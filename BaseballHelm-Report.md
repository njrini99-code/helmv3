# BaseballHelm — Product & Architecture Report

## What Is BaseballHelm?

BaseballHelm is a multi-role SaaS platform for **college baseball recruiting** and **team management**. It connects coaches and players across four levels of competitive baseball (College, High School, JUCO, Showcase/Travel Ball), enabling coaches to discover and recruit talent while players manage their recruiting journey — all alongside full team management tools for calendars, tasks, messaging, documents, and travel.

The platform is part of **Helm Sports Labs**, which also includes GolfHelm (college golf team management). Both products share the same tech stack: Next.js 16 (App Router), TypeScript (strict mode), Supabase, and Tailwind CSS with a Linear/Vercel-inspired premium design system.

---

## Coach Types

BaseballHelm supports four distinct coach types, each with different capabilities:

| Coach Type | Can Recruit? | Team Management? | Description |
|------------|-------------|-------------------|-------------|
| **College** | Yes — full suite | No | Primary recruiter. Discovers prospects, builds pipeline, extends offers. D1/D2/D3/NAIA programs. |
| **High School** | No | Yes | Develops players locally, facilitates recruiting by helping players gain visibility to college coaches. |
| **JUCO** | Yes — toggle mode | Yes — toggle mode | Dual role. Can recruit transfer players AND manage their current team. Flexible switching between modes. |
| **Showcase** | No | Yes — multi-team | Manages travel ball organizations. Can oversee multiple teams under one org. Organizes exposure events/camps. |

**Key distinction:** Only College and JUCO coaches have access to the recruiting pipeline, discover page, and watchlist features. High School and Showcase coaches focus entirely on team operations.

---

## Player Types

| Player Type | Recruiting Eligible? | Team(s) | Notes |
|-------------|---------------------|---------|-------|
| **High School** | Yes (opt-in) | HS team + optional Showcase team | Primary recruiting target. Can be on 2 teams simultaneously. |
| **Showcase** | Yes (opt-in) | Showcase team + optional HS team | Travel ball players. Can also be on 2 teams. |
| **JUCO** | Yes (opt-in) | JUCO team only | Transfer recruiting pathway to 4-year programs. Single team. |
| **College** | **Never** | College team only | Already placed. Team features only — no recruiting activation possible. |

---

## Recruiting Activation Model

Recruiting is **opt-in**. Players must explicitly activate it.

**Before activation:**
- Coaches can view the player's public profile
- Interest is shown anonymously: *"A D1 coach viewed your profile"*
- No contact info revealed, no direct messaging

**After activation:**
- Coaches see identified interest: *"Coach Davis from Texas A&M viewed your profile"*
- Player appears in the Coach Discover search
- Coaches can message the player directly
- Full engagement tracking begins

**College players cannot activate recruiting** — they are already placed and only use team management features.

---

## Recruiting Pipeline (5 Stages)

Coaches move players through a linear pipeline:

```
watchlist → high_priority → offer_extended → committed
                                           → uninterested
```

| Stage | Meaning |
|-------|---------|
| **Watchlist** | Initial interest. Coach adds player for tracking. |
| **High Priority** | Elevated interest. Coach is actively pursuing this player. |
| **Offer Extended** | Formal recruiting offer has been made. |
| **Committed** | Player has committed to the coach's program. |
| **Uninterested** | Coach is no longer pursuing (or player declined). |

The pipeline page supports three view modes: **Kanban** (drag-and-drop columns), **Position Planner** (baseball diamond visual), and **List/Table** (sortable, filterable).

---

## Recruiting Philosophy System

College and JUCO coaches define detailed recruiting preferences that automatically score and rank players:

**Metric Weights (totaling 100):**
- Exit Velocity (bat speed/power)
- Pitch Velocity (arm strength)
- 60-Yard Dash Time (speed/athleticism)
- GPA (academics)
- Height, Weight, Arm Strength (physical tools)

**Minimum Standards (hard filters):**
- Min GPA, Min Exit Velocity, Min Pitch Velocity, Max 60-Time

**Geographic & Target Preferences:**
- Preferred states, max distance in miles
- Target graduation years
- Position priorities (ordered list)

---

## Player-Side Recruiting Features

Players manage their own recruiting journey:

- **College Discovery** (`/dashboard/colleges`) — Browse and search college programs
- **College Interest List** (`/dashboard/college-interest`) — Track schools they're interested in with status levels: researching → interested → visited → committed
- **Dream Schools** — Personal target list of programs
- **Recruiting Journey** (`/dashboard/journey`) — Timeline view of their entire recruiting process
- **Profile Visibility Controls** — Toggle what coaches can see: contact email, phone, videos, dream schools, stats, social links

---

## Engagement Tracking

Every coach-player interaction is tracked:

| Event Type | Description |
|------------|-------------|
| `watchlist_add` | Coach added player to their watchlist |
| `watchlist_remove` | Coach removed player |
| `profile_view` | Coach viewed player's profile (deduplicated per 24 hrs) |
| `contact_click` | Coach clicked player's email or phone |

Events respect the activation model — before activation, events are anonymous; after, they're identified.

---

## Team Management Features (All Coach + Player Types)

These features are shared across all roles:

| Feature | Route | Description |
|---------|-------|-------------|
| **Calendar & Events** | `/dashboard/calendar` | Team events with RSVP + check-in (pending/accepted/declined/tentative) |
| **Roster** | `/dashboard/roster` | Team membership, player cards |
| **Messaging** | `/dashboard/messages` | Threaded conversations with participants |
| **Announcements** | `/dashboard/announcements` | Team-wide announcements with urgency levels + required acknowledgement |
| **Tasks** | `/dashboard/tasks` | Coach-assigned tasks with due dates, reminders, templates |
| **Documents** | `/dashboard/documents` | Document library with version history |
| **Travel** | `/dashboard/travel` | Trip itineraries (transport, hotel, flights, gear, room assignments) + expense tracking |
| **Academics** | `/dashboard/academics` | Course schedules, eligibility tracking |
| **Videos** | `/dashboard/videos` | Upload, manage, clip video; primary video highlighting |
| **Stats** | `/dashboard/stats/upload` | CSV stat upload with matching engine |
| **Development Plans** | `/dashboard/dev-plans` | Player development plans with focus areas + progress tracking |
| **Team Info** | `/dashboard/team` | Team configuration, settings |

---

## Coach-Only Features

| Feature | Route | Description |
|---------|-------|-------------|
| **Discover** | `/dashboard/discover` | Search players by position, state, metrics, grad year. Search teams too. |
| **Pipeline** | `/dashboard/pipeline` | Kanban, position planner, and list views of recruiting funnel |
| **Watchlist** | `/dashboard/watchlist` | Dedicated watchlist table view |
| **Command Center** | `/dashboard/command-center` | Coach home dashboard: insights feed, player cards, team stats overview |
| **Analytics** | `/dashboard/analytics` | Recruiting and team analytics |
| **Compare** | `/dashboard/compare` | Side-by-side player comparison tool |
| **Recruiting Preferences** | `/dashboard/settings/recruiting-preferences` | Set philosophy weights, minimums, geographic preferences |
| **Lineups** | (action file) | Lineup configurations and position assignments |

---

## Player-Only Features

| Feature | Route | Description |
|---------|-------|-------------|
| **Activate Recruiting** | `/dashboard/activate` | Opt-in to recruiting |
| **College Discovery** | `/dashboard/colleges` | Browse college programs |
| **College Interest** | `/dashboard/college-interest` | Manage interest list |
| **Recruiting Journey** | `/dashboard/journey` | Timeline of recruiting events |
| **Profile** | `/dashboard/profile` | Manage public-facing profile |

---

## Showcase/Organization-Specific Features

| Feature | Route | Description |
|---------|-------|-------------|
| **Program Management** | `/dashboard/program` | Manage showcase organization |
| **Camps** | `/dashboard/camps` | Host and manage camps with player registrations |
| **Organization Settings** | `/dashboard/organization` | Org-level configuration |
| **Multi-Team** | `/dashboard/teams` | Switch between multiple teams in the org |

---

## Database Architecture

**42 baseball-prefixed tables** organized by domain:

### Core
| Table | Purpose |
|-------|---------|
| `baseball_coaches` | Coach profiles (type, org, contact) |
| `baseball_players` | Player profiles (type, metrics, recruiting status) |
| `baseball_teams` | Team records (type, org, invite code) |

### Recruiting
| Table | Purpose |
|-------|---------|
| `baseball_watchlists` | Coach pipeline tracking (stage, priority, fit score, notes, tags) |
| `baseball_recruiting_interests` | Player college interest list |
| `baseball_player_engagement_events` | Coach-player interaction tracking |
| `baseball_player_comparisons` | Side-by-side prospect comparisons |
| `baseball_dream_schools` | Player dream school targets |
| `baseball_coach_recruiting_philosophy` | Recruiting weights, minimums, preferences |

### Team Operations
| Table | Purpose |
|-------|---------|
| `baseball_team_members` | Player ↔ team membership |
| `baseball_team_coach_staff` | Coaching staff assignments |
| `baseball_team_invitations` | Pending join invitations |
| `baseball_team_lineups` | Lineup configurations |
| `baseball_lineup_positions` | Player position assignments in lineups |

### Communication
| Table | Purpose |
|-------|---------|
| `baseball_conversations` | Message threads |
| `baseball_conversation_participants` | Thread membership |
| `baseball_messages` | Individual messages |
| `baseball_announcements` | Team announcements (urgency, acknowledgement) |
| `baseball_announcement_recipients` | Targeted recipients |
| `baseball_announcement_acknowledgements` | Player acknowledgements |
| `baseball_announcement_documents` | Attached documents |
| `baseball_announcement_tasks` | Linked tasks |

### Stats & Performance
| Table | Purpose |
|-------|---------|
| `baseball_player_stats` | Individual stat records |
| `baseball_player_aggregates` | Season/career stat cache |
| `baseball_player_percentiles` | Percentile rankings vs peers |
| `baseball_player_metrics` | Advanced analytics |
| `baseball_stat_uploads` | CSV upload records |

### Content & Media
| Table | Purpose |
|-------|---------|
| `baseball_documents` | Team document library |
| `baseball_document_versions` | Version history |
| `baseball_videos` | Player videos (including clips via parent_video_id) |

### Calendar & Travel
| Table | Purpose |
|-------|---------|
| `baseball_events` | Team events (type, time, mandatory flag) |
| `baseball_event_attendance` | RSVP + check-in |
| `baseball_travel_itineraries` | Trip details (transport, hotel, flights, rooms) |
| `baseball_travel_expenses` | Trip expenses |

### Tasks & Development
| Table | Purpose |
|-------|---------|
| `baseball_tasks` | Coach-assigned tasks |
| `baseball_task_assignments` | Task ↔ player junction |
| `baseball_task_templates` | Reusable task templates |
| `baseball_developmental_plans` | Player development plans |

### Academics & Settings
| Table | Purpose |
|-------|---------|
| `baseball_player_classes` | Course schedules |
| `baseball_academic_eligibility` | Eligibility tracking |
| `baseball_coach_settings` | Coach preferences |
| `baseball_player_settings` | Player privacy/visibility settings |
| `baseball_coach_philosophy` | Alert sensitivity, priority thresholds |

### Camps
| Table | Purpose |
|-------|---------|
| `baseball_camps` | Camp events hosted by coaches |
| `baseball_camp_registrations` | Player camp registrations |

---

## File Structure

```
src/app/baseball/
├── (auth)/                    # Login, signup, forgot/reset password, complete signup
├── (dashboard)/dashboard/     # 42 dashboard routes (see feature tables above)
├── (onboarding)/              # Coach (3-step) + Player (4-step) onboarding
├── (public)/                  # Public profiles: player/[id], program/[id], team/[id]
├── actions/                   # 19 server action files
│   ├── academics.ts
│   ├── announcements.ts
│   ├── auth.ts
│   ├── calendar.ts
│   ├── discover.ts
│   ├── documents.ts
│   ├── engagement.ts
│   ├── insights.ts
│   ├── interests.ts
│   ├── lineups.ts
│   ├── messages.ts
│   ├── philosophy.ts
│   ├── profile-settings.ts
│   ├── recruiting-philosophy.ts
│   ├── stats.ts
│   ├── tasks.ts
│   ├── teams.ts
│   ├── travel.ts
│   └── watchlist.ts
└── join/[code]/               # Team join via invite code

src/components/baseball/       # 87+ components across 20 directories
├── academics/                 # 4 components
├── announcements/             # 7 components
├── calendar/                  # 10 components
├── coach/                     # Mode toggle
├── command-center/            # 6 components
├── dashboard/                 # 3 components (hot leads, position needs)
├── dev-plans/                 # 2 components
├── documents/                 # 5 components
├── player-profile/            # 5 components
├── position-planner/          # 5 components
├── program/                   # 2 components
├── recruiting-philosophy/     # 5 components
├── settings/                  # 1 component
├── showcase/                  # 2 components
├── stats/                     # 1 component
├── tasks/                     # 13 components
├── team/                      # 4 components
└── travel/                    # 6 components
```

---

## Codebase Stats

| Metric | Count |
|--------|-------|
| Dashboard routes | 42 |
| Auth routes | 5 |
| Onboarding routes | 3 |
| Public routes | 3 |
| Server action files | 19 |
| Component directories | 20 |
| Total components | 87+ |
| Total TypeScript files | 250+ |
| Database tables | 42 |
| Pipeline stages | 5 |
| Coach types | 4 |
| Player types | 4 |

---

*Report generated February 17, 2026*
