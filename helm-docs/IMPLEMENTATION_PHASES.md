# Helm Sports Labs - Implementation Phases

> Detailed phase-by-phase build order with Claude CLI prompts and acceptance criteria.

---

## Overview

**Total Duration:** 35-40 days
**Approach:** Vertical slices - build complete features, not layers

### Phase Summary

| Phase | Days | Focus |
|-------|------|-------|
| 0 | 1-3 | Foundation |
| 1 | 4-7 | Video Infrastructure |
| 2 | 8-14 | College Coach - Recruiting |
| 3 | 15-20 | HS Coach - Team Management |
| 4 | 21-25 | Player Core |
| 5 | 26-28 | Player Recruiting |
| 6 | 29-31 | JUCO Coach |
| 7 | 32-33 | Showcase Coach |
| 8 | 34-35 | JUCO + College Players |
| 9 | 36-40 | Polish |

---

## Phase 0: Foundation (Days 1-3)

### Goals
- Project scaffolding
- Database schema
- Auth flow
- Design system
- Layout shells

### Tasks

#### Day 1: Project Setup

**Claude CLI Prompt:**
```
Create a new Next.js 14 project with TypeScript, Tailwind CSS, and the following structure:
- App Router
- src/ directory
- Strict TypeScript
- ESLint + Prettier configured
- Path aliases (@/components, @/lib, etc.)

Install dependencies:
- @supabase/supabase-js
- @supabase/ssr
- react-hook-form
- @hookform/resolvers
- zod
- lucide-react
- framer-motion
- date-fns
- clsx
- tailwind-merge

Create the folder structure as defined in CLAUDE.md.
```

**Acceptance Criteria:**
- [ ] `npm run dev` starts without errors
- [ ] TypeScript strict mode enabled
- [ ] Path aliases working
- [ ] Tailwind configured with custom colors

---

#### Day 1-2: Database Schema

**Claude CLI Prompt:**
```
Using the SCHEMA.sql file, create Supabase migrations for:
1. All enum types
2. Organization tables (colleges, high_schools, etc.)
3. User tables (users, coaches, players)
4. Settings tables

Then create TypeScript types that match the schema using supabase gen types.
```

**Acceptance Criteria:**
- [ ] All migrations apply without error
- [ ] Types generated and available
- [ ] Supabase dashboard shows all tables

---

#### Day 2: Auth Flow

**Claude CLI Prompt:**
```
Implement authentication using Supabase Auth:

1. Create auth pages:
   - /auth/login
   - /auth/signup (with role selection)
   - /auth/forgot-password
   - /auth/reset-password

2. Create middleware that:
   - Checks auth on protected routes
   - Redirects to login if not authenticated
   - Redirects to appropriate dashboard based on role

3. Create auth context with:
   - Current user state
   - Role (player/coach)
   - Coach type or player type
   - Loading state

Use the UI components from globals.css.
```

**Acceptance Criteria:**
- [ ] Can sign up as player or coach
- [ ] Can log in with email/password
- [ ] Protected routes redirect to login
- [ ] After login, redirects to correct dashboard

---

#### Day 2-3: Design System

**Claude CLI Prompt:**
```
Create the UI component library based on UI_SYSTEM.md and globals.css:

1. Primitives in /components/ui/:
   - button.tsx (with variants using cva)
   - input.tsx
   - select.tsx
   - checkbox.tsx
   - badge.tsx
   - avatar.tsx
   - card.tsx
   - modal.tsx
   - dropdown.tsx
   - tabs.tsx
   - toast.tsx (with Toaster provider)
   - skeleton.tsx
   - progress.tsx

2. Create a cn() utility in /lib/utils.ts using clsx and tailwind-merge.

3. Add globals.css to the project with all component classes.

Each component should:
- Be fully typed
- Support all states (loading, disabled, error)
- Use forwardRef where appropriate
- Include proper ARIA attributes
```

**Acceptance Criteria:**
- [ ] All primitive components render correctly
- [ ] Toast system works globally
- [ ] Components match design specs
- [ ] No TypeScript errors

---

#### Day 3: Layout Shells

**Claude CLI Prompt:**
```
Create layout components for the dashboard:

1. /components/layout/sidebar.tsx
   - Logo at top
   - Navigation sections
   - User menu at bottom
   - Support for mode toggle
   - Support for nav badges

2. /components/layout/header.tsx
   - Breadcrumbs
   - Page title
   - Action buttons area
   - Notification bell

3. /components/layout/mode-toggle.tsx
   - Pill-shaped toggle
   - Recruiting ↔ Team modes
   - Persists to localStorage

4. Create layouts:
   - /app/(dashboard)/coach/layout.tsx
   - /app/(dashboard)/coach/college/layout.tsx
   - /app/(dashboard)/player/layout.tsx

Use the cream background (#FAF6F1) and white sidebar.
```

**Acceptance Criteria:**
- [ ] Sidebar renders with navigation
- [ ] Mode toggle switches and persists
- [ ] Layouts nest correctly
- [ ] Responsive on mobile (sidebar collapses)

---

## Phase 1: Video Infrastructure (Days 4-7)

### Goals
- Video upload pipeline
- Processing integration
- Video player
- Clipping tool

### Tasks

#### Day 4-5: Video Upload

**Claude CLI Prompt:**
```
Implement video upload infrastructure:

1. Create /api/videos/upload-url endpoint:
   - Validate file type and size
   - Generate presigned URL for Supabase Storage
   - Create pending video record

2. Create /components/video/video-uploader.tsx:
   - Drag and drop zone
   - File type/size validation
   - Upload progress bar
   - Processing status display
   - Error handling with retry

3. Create /api/videos endpoint:
   - POST: Create video record after upload
   - GET: List videos for player
   - DELETE: Remove video

4. Set up Mux webhook handler at /api/webhooks/mux:
   - Handle video.asset.ready
   - Update video status to 'ready'
   - Save playback URL and thumbnail

Database tables: videos, video_clips, video_notes
```

**Acceptance Criteria:**
- [ ] Can upload video up to 500MB
- [ ] Progress bar shows accurate progress
- [ ] Video status updates when processing complete
- [ ] Videos appear in library after processing

---

#### Day 5-6: Video Player

**Claude CLI Prompt:**
```
Create video player component:

1. /components/video/video-player.tsx:
   - Use Mux Player or native HTML5 video
   - Thumbnail poster
   - Play/pause controls
   - Progress bar with seek
   - Volume control
   - Fullscreen toggle
   - Playback speed control

2. /components/video/video-thumbnail.tsx:
   - Thumbnail with play overlay
   - Duration badge
   - Click to open modal or navigate

3. /components/video/video-modal.tsx:
   - Full video player in modal
   - Title and description
   - View count
   - Tags

Include loading and error states for all components.
```

**Acceptance Criteria:**
- [ ] Video plays smoothly
- [ ] All controls work
- [ ] Mobile-friendly controls
- [ ] Loading skeleton shows while loading

---

#### Day 6-7: Clipping Tool

**Claude CLI Prompt:**
```
Create the video clipping tool:

1. /components/video/clip-tool.tsx:
   - Video player preview
   - Timeline scrubber with start/end markers
   - Fine adjustment buttons (±1s, ±0.1s)
   - Duration display
   - Title input
   - Tag selector (predefined + custom)
   - Thumbnail selection
   - Visibility selector
   - Save/Cancel buttons

2. Clip storage:
   - Create /api/videos/[id]/clips endpoint
   - Store start_time, end_time, title, tags
   - Don't create separate video files (reference original)

3. /components/video/clip-library.tsx:
   - Grid of clip thumbnails
   - Sort by date, views
   - Filter by tags
   - Drag to reorder

Clip constraints:
- Min length: 3 seconds
- Max length: 60 seconds
- Max clips per video: 20
```

**Acceptance Criteria:**
- [ ] Can set start and end points
- [ ] Fine adjustment works
- [ ] Clips save correctly
- [ ] Clips play from correct timestamps
- [ ] Can reorder clips

---

## Phase 2: College Coach - Recruiting (Days 8-14)

### Goals
- Complete recruiting dashboard
- Discover with map and filters
- Watchlist and pipeline
- Comparison tool
- Camps

### Tasks

#### Day 8-9: Dashboard Home

**Claude CLI Prompt:**
```
Build the College Coach dashboard at /app/(dashboard)/coach/college/page.tsx:

1. Stats Row:
   - Profile Views (with trend)
   - New Followers (with trend)
   - Top 5 Mentions (with trend)
   - Each clickable to filtered activity

2. Activity Feed:
   - Filter tabs (All, Views, Follows, Top 5)
   - Activity items with player avatar, action, time
   - "View Profile" and "+ Watchlist" buttons
   - Load more pagination

3. Pipeline Snapshot:
   - 4 cards for each stage with count
   - Preview avatars
   - Click to navigate to pipeline

4. Upcoming Camps:
   - List of next 2-3 camps
   - Registration progress bar
   - "+ New Camp" button

Create /lib/queries/coach-dashboard.ts for data fetching.
Use Server Components where possible.
```

**Acceptance Criteria:**
- [ ] Stats display with real data
- [ ] Activity feed filters work
- [ ] Pipeline snapshot links work
- [ ] Camp cards show correct info

---

#### Day 9-11: Discover Page

**Claude CLI Prompt:**
```
Build the Discover page at /app/(dashboard)/coach/college/discover/page.tsx:

1. Search bar with debounced search (300ms)

2. US Map component:
   - Interactive SVG map
   - Color-coded by player density
   - Click state to filter
   - Show selected state name

3. Filter panel:
   - Grad year chips
   - Position chips (multi-select)
   - State dropdown (synced with map)
   - Metric ranges (sliders)
   - Min GPA dropdown
   - Status (All/Uncommitted)
   - Has Video checkbox
   - Verified checkbox

4. Results grid:
   - Player cards (from COMPONENTS.md)
   - Infinite scroll
   - Sort dropdown (Best Match, Newest, Velo)
   - Result count

5. URL state:
   - All filters in URL params
   - Deep-linkable
   - Filters restore on page load

6. Saved searches:
   - Save current filters
   - Load saved search
   - Delete saved search

Create /lib/queries/discover.ts with proper filtering logic.
```

**Acceptance Criteria:**
- [ ] Map filters work
- [ ] All filters persist in URL
- [ ] Infinite scroll works
- [ ] Search is debounced
- [ ] Can save and load searches

---

#### Day 11-12: Player Profile View (Coach)

**Claude CLI Prompt:**
```
Build the player profile view at /app/(dashboard)/coach/college/player/[id]/page.tsx:

1. Hero section:
   - Avatar, name, position, grad year
   - Location, physical stats
   - GPA, test scores (if shared)
   - Pipeline dropdown
   - Action buttons (Message, Notes, Compare, Share, Export)

2. Tabs:
   - Overview: Metrics, about, teams, achievements
   - Stats: Season/career stats table, charts
   - Video: Video grid, clips
   - Timeline: Activity history with this player
   - Notes: Private notes (CRUD)

3. Scroll position restoration:
   - Store position in sessionStorage
   - Restore on back navigation

Create /lib/queries/player-profile.ts
Create /lib/actions/player-notes.ts for note CRUD
```

**Acceptance Criteria:**
- [ ] All tabs display correct data
- [ ] Pipeline dropdown updates stage
- [ ] Notes can be added/edited/deleted
- [ ] Scroll position restores

---

#### Day 12-13: Watchlist & Pipeline

**Claude CLI Prompt:**
```
Build watchlist and pipeline:

1. /app/(dashboard)/coach/college/watchlist/page.tsx:
   - Grid of player cards
   - Filter by grad year, position
   - Remove from watchlist (with confirmation)
   - Change stage inline

2. /app/(dashboard)/coach/college/pipeline/page.tsx:
   - 4-column Kanban board
   - Drag and drop between columns (use @dnd-kit/core)
   - Optimistic updates
   - Filter by grad year
   - Export to CSV

3. Server actions:
   - /lib/actions/watchlist.ts
   - /lib/actions/pipeline.ts

4. Real-time updates:
   - Subscribe to watchlist changes
   - Update UI when player commits elsewhere
```

**Acceptance Criteria:**
- [ ] Can add/remove from watchlist
- [ ] Drag and drop works smoothly
- [ ] Optimistic updates revert on error
- [ ] Export generates valid CSV

---

#### Day 13: Comparison Tool

**Claude CLI Prompt:**
```
Build the comparison tool at /app/(dashboard)/coach/college/compare/page.tsx:

1. Header:
   - Add player button (opens search modal)
   - Clear all button
   - Save comparison button

2. Player columns (2-4):
   - Avatar, name, position
   - View profile link
   - Remove button

3. Stats comparison table:
   - Collapsible sections (Pitching, Physical, Academic)
   - Best value highlighted with dot
   - Missing values show "—"

4. Video comparison:
   - Sync playback toggle
   - Clip selector per player
   - All videos play/pause together when synced

5. Notes section:
   - Note input per player
   - Auto-save on blur

6. Compare context:
   - Store selected players in context
   - Add from anywhere in app
   - Max 4 players
   - Toast when adding: "Added to compare (3/4)"

Create /contexts/compare-context.tsx
Create /lib/actions/comparisons.ts
```

**Acceptance Criteria:**
- [ ] Can add 2-4 players
- [ ] Stats table shows best values
- [ ] Synced video playback works
- [ ] Can save and load comparisons

---

#### Day 14: Camps

**Claude CLI Prompt:**
```
Build camp management:

1. /app/(dashboard)/coach/college/camps/page.tsx:
   - Tabs: Upcoming, Past, Drafts
   - Camp cards with details
   - Registration progress bar
   - Actions: Edit, Duplicate, Cancel, Delete

2. /app/(dashboard)/coach/college/camps/new/page.tsx:
   - Camp creation form
   - Location with Google Places autocomplete
   - Date/time with timezone
   - Capacity and fee
   - Eligibility settings
   - Save as draft / Publish

3. /app/(dashboard)/coach/college/camps/[id]/page.tsx:
   - Camp details
   - Attendee list
   - Message all attendees
   - Export roster

4. Server actions:
   - /lib/actions/camps.ts
   - CRUD operations
   - Registration management

5. API routes:
   - /api/camps for public listing
   - /api/camps/[id]/register for player registration
```

**Acceptance Criteria:**
- [ ] Can create, edit, delete camps
- [ ] Location autocomplete works
- [ ] Attendee list shows registered players
- [ ] Can message all attendees

---

## Phase 3: HS Coach - Team Management (Days 15-20)

### Goals
- Team dashboard
- Roster management
- Team invites
- Video library
- Dev plans
- College interest tracking

### Tasks

#### Day 15-16: Dashboard & Roster

**Claude CLI Prompt:**
```
Build HS Coach dashboard and roster:

1. /app/(dashboard)/coach/high-school/page.tsx:
   - Widget grid:
     - Hot Prospects (players with most college interest)
     - Week at a Glance (upcoming events)
     - Roster Completion (profile % average)
     - College Interest Feed (recent views)
     - Quick Announce (compose box)
     - Player Milestones (recent achievements)
     - Upcoming Tasks

2. /app/(dashboard)/coach/high-school/roster/page.tsx:
   - Player list/grid
   - Search and filter
   - Add player button (opens invite flow)
   - Remove player (with confirmation)
   - Player quick stats

3. /components/dashboard/hs-widgets/:
   - hot-prospects.tsx
   - week-glance.tsx
   - college-interest-feed.tsx
   - quick-announce.tsx
```

**Acceptance Criteria:**
- [ ] Dashboard widgets load with real data
- [ ] Roster displays all players
- [ ] Can search and filter roster
- [ ] Quick announce posts to team

---

#### Day 16-17: Team Invites

**Claude CLI Prompt:**
```
Build team invite system:

1. Invite modal/page:
   - Generate invite link
   - Copy link button
   - QR code option
   - Email invite form
   - Expiration setting (7 days default)

2. Pending invites list:
   - Show status, email, sent date
   - Resend, Cancel actions

3. /app/join/[code]/page.tsx:
   - Public page
   - Shows team info
   - If logged in: Join button
   - If not: Signup flow
   - After join: Redirect to team

4. Server actions:
   - /lib/actions/team-invites.ts
   - Generate code
   - Accept invite
   - Track usage

5. Database:
   - team_invites table with code, status, expiration
```

**Acceptance Criteria:**
- [ ] Invite link generates unique code
- [ ] Can copy link to clipboard
- [ ] New user can sign up via invite
- [ ] Existing user can accept invite
- [ ] Invite expires correctly

---

#### Day 17-18: Video Library & Notes

**Claude CLI Prompt:**
```
Build coach video library and notes:

1. /app/(dashboard)/coach/high-school/video-library/page.tsx:
   - Grid organized by player
   - Player folders/sections
   - Upload to specific player
   - View all videos
   - Filter by player, type

2. /app/(dashboard)/coach/high-school/roster/[playerId]/page.tsx:
   - Player detail view
   - Video section
   - Notes section (private to coach)
   - Dev plan section

3. Note system:
   - Rich text or plain text
   - Timestamp when created
   - Edit and delete
   - Private to coach

Create /components/video/video-library.tsx
Create /components/player/player-notes.tsx
```

**Acceptance Criteria:**
- [ ] Videos organized by player
- [ ] Can upload video for specific player
- [ ] Notes save and persist
- [ ] Notes are private to coach

---

#### Day 18-19: Development Plans

**Claude CLI Prompt:**
```
Build development plans:

1. /app/(dashboard)/coach/high-school/dev-plans/page.tsx:
   - List of all dev plans
   - Filter by player, status
   - Create new plan button

2. Dev plan creation/editing:
   - Select player
   - Title and description
   - Goals (checklist)
   - Phases with dates
   - Items per phase (tasks, drills, metrics)
   - Attachments

3. Player view of dev plan:
   - Read-only structure
   - Can mark items complete
   - Can add comments

4. Notifications:
   - Player notified when assigned
   - Coach notified when item completed

Create /components/dev-plan/:
- dev-plan-form.tsx
- dev-plan-view.tsx
- dev-plan-item.tsx
- dev-plan-phase.tsx
```

**Acceptance Criteria:**
- [ ] Can create multi-phase dev plans
- [ ] Players see assigned plans
- [ ] Players can mark items done
- [ ] Comments work both ways

---

#### Day 19-20: College Interest & Calendar

**Claude CLI Prompt:**
```
Build college interest tracking and calendar:

1. /app/(dashboard)/coach/high-school/college-interest/page.tsx:
   - List of which programs viewed which players
   - Filter by player, program
   - Trend over time chart
   - Heat map by region

2. /app/(dashboard)/coach/high-school/calendar/page.tsx:
   - Month view calendar
   - Event types: Practice, Game, Event
   - Create event modal
   - Edit event
   - Color coded by type

3. Calendar component:
   - /components/shared/calendar.tsx
   - Month/week/agenda views
   - Click slot to create
   - Click event to view/edit

4. Event sharing:
   - Events visible to team players
   - Parents can subscribe (future)

Create /lib/queries/college-interest.ts
Create /lib/actions/calendar.ts
```

**Acceptance Criteria:**
- [ ] College interest shows who's viewing
- [ ] Calendar displays events correctly
- [ ] Can create and edit events
- [ ] Events visible to players

---

## Phase 4: Player Core (Days 21-25)

### Goals
- Player dashboard
- Profile management
- Video upload
- Team hub

### Tasks

#### Day 21-22: Dashboard & Profile

**Claude CLI Prompt:**
```
Build player dashboard and profile:

1. /app/(dashboard)/player/page.tsx:
   - Profile snapshot card
   - Profile completion widget
   - Team info (if on team)
   - Quick actions
   - Recent activity

2. /app/(dashboard)/player/profile/page.tsx:
   - 5 tabs: Basic, Physical, Metrics, Academics, Content
   - Form per tab
   - Auto-save on blur
   - Progress indicator
   - Photo upload

3. Profile completion logic:
   - Calculate based on fields filled
   - Show what's missing
   - Update in real-time

Create /components/forms/profile-form/:
- basic-info-form.tsx
- physical-form.tsx
- metrics-form.tsx
- academics-form.tsx
- content-form.tsx
```

**Acceptance Criteria:**
- [ ] Dashboard shows accurate data
- [ ] Profile forms save correctly
- [ ] Profile completion updates
- [ ] Photo uploads work

---

#### Day 22-23: Video Upload

**Claude CLI Prompt:**
```
Adapt video upload for players:

1. /app/(dashboard)/player/team/videos/page.tsx:
   - My videos library
   - Upload button
   - Create clips
   - Set visibility
   - Reorder clips

2. Profile video section:
   - Select featured clips
   - Drag to reorder
   - Preview how coaches see it

3. Video privacy:
   - Private: Only me
   - Team: Team can see
   - Public: All coaches

Reuse video components from Phase 1.
```

**Acceptance Criteria:**
- [ ] Player can upload videos
- [ ] Can create clips from videos
- [ ] Visibility settings work
- [ ] Featured clips show on profile

---

#### Day 23-24: Team Hub

**Claude CLI Prompt:**
```
Build player team hub:

1. /app/(dashboard)/player/team/page.tsx:
   - Current team(s) display
   - Team switcher (if multi-team)
   - Announcements feed
   - Upcoming schedule
   - Teammates list

2. Team switcher:
   - Dropdown showing teams
   - HS team + Showcase team(s)
   - Switch updates all team views

3. /app/(dashboard)/player/team/schedule/page.tsx:
   - Calendar view of team events
   - List view option
   - Add to personal calendar

4. /app/(dashboard)/player/team/announcements/page.tsx:
   - Announcements from coach
   - Read status
   - Pinned at top

Create /contexts/team-context.tsx for multi-team state
```

**Acceptance Criteria:**
- [ ] Team switcher works
- [ ] Schedule shows team events
- [ ] Announcements display correctly
- [ ] Can be on multiple teams

---

#### Day 24-25: Settings & Messages

**Claude CLI Prompt:**
```
Build player settings and messages:

1. /app/(dashboard)/player/settings/page.tsx:
   - Account settings (email, password)
   - Privacy settings:
     - Is discoverable
     - Show GPA
     - Show test scores
     - Show contact info
   - Notification preferences
   - Calendar sharing settings

2. /app/(dashboard)/player/team/messages/page.tsx:
   - Team message threads
   - Coach DMs
   - Unread indicators
   - Real-time with Supabase

3. Message components:
   - /components/messages/conversation-list.tsx
   - /components/messages/message-thread.tsx
   - /components/messages/message-composer.tsx

Real-time implementation with Supabase Realtime.
```

**Acceptance Criteria:**
- [ ] Settings save correctly
- [ ] Privacy controls work
- [ ] Messages are real-time
- [ ] Unread counts accurate

---

## Phase 5: Player Recruiting (Days 26-28)

### Goals
- Recruiting activation
- College discovery
- Journey tracking
- Analytics

### Tasks

#### Day 26: Recruiting Activation

**Claude CLI Prompt:**
```
Build recruiting activation flow:

1. Activation CTA on dashboard:
   - Shows if not activated
   - Explains benefits
   - Check profile completion

2. Activation flow:
   - Step 1: Profile check (must be 60%+)
   - Step 2: Recruiting preferences
   - Step 3: Top schools (optional)
   - Step 4: Confirmation

3. After activation:
   - Mode toggle appears
   - Recruiting nav items unlock
   - Profile visible to coaches

4. Deactivation:
   - Option in settings
   - Profile hidden from coaches
   - Can reactivate anytime

Create /lib/actions/recruiting.ts
```

**Acceptance Criteria:**
- [ ] Can't activate below 60% completion
- [ ] Preferences save correctly
- [ ] Mode toggle appears after activation
- [ ] Can deactivate and reactivate

---

#### Day 26-27: Discover Colleges

**Claude CLI Prompt:**
```
Build college discovery for players:

1. /app/(dashboard)/player/recruiting/discover/page.tsx:
   - Search colleges
   - Filter by division, state, conference
   - College cards with info
   - Save to interests

2. College card:
   - Logo, name, location
   - Division, conference
   - Enrollment
   - "Interested" badge if saved
   - "Viewing You" badge if coaches from there viewed

3. Interest levels:
   - Researching
   - Interested
   - High Interest

4. Top 5 schools:
   - Separate section
   - Rank 1-5
   - Coaches notified

Create /lib/queries/colleges.ts
Create /lib/actions/recruiting-interests.ts
```

**Acceptance Criteria:**
- [ ] Can search and filter colleges
- [ ] Can save colleges to interests
- [ ] Top 5 saves correctly
- [ ] "Viewing You" badge shows

---

#### Day 27-28: Journey & Analytics

**Claude CLI Prompt:**
```
Build recruiting journey and analytics:

1. /app/(dashboard)/player/recruiting/journey/page.tsx:
   - Timeline view
   - Milestones (first contact, visit, offer, decision)
   - Offer tracking
   - Commitment status

2. /app/(dashboard)/player/recruiting/analytics/page.tsx:
   - Profile views (chart)
   - Video views (chart)
   - Watchlist adds
   - Geographic breakdown (heat map)
   - Top programs viewing

3. Anonymous vs Identified:
   - If recruiting not activated: Show "A program from Texas"
   - If activated: Show "Coach Davis from Texas A&M"

Create /lib/queries/player-analytics.ts
```

**Acceptance Criteria:**
- [ ] Timeline shows milestones
- [ ] Analytics charts display correctly
- [ ] Geographic breakdown works
- [ ] Anonymous/identified logic works

---

## Phase 6: JUCO Coach (Days 29-31)

### Goals
- Mode toggle implementation
- Hybrid recruiting/team experience

### Tasks

#### Day 29-30: Mode Toggle & Recruiting

**Claude CLI Prompt:**
```
Build JUCO coach dashboard with mode toggle:

1. Mode toggle in sidebar:
   - Recruiting ↔ Team
   - Persists to localStorage
   - Changes nav items

2. Recruiting mode:
   - Reuse College coach components:
     - Dashboard (adapted)
     - Discover
     - Watchlist
     - Pipeline
     - Compare
     - Messages

3. URL structure:
   - /coach/juco/recruiting/...
   - /coach/juco/team/...

Create /app/(dashboard)/coach/juco/layout.tsx with mode support
```

**Acceptance Criteria:**
- [ ] Mode toggle works
- [ ] Nav items change per mode
- [ ] Recruiting features work
- [ ] Mode persists across sessions

---

#### Day 30-31: Team Mode & Academics

**Claude CLI Prompt:**
```
Build JUCO team mode:

1. Team mode:
   - Reuse HS coach components:
     - Dashboard
     - Roster
     - Video Library
     - Dev Plans
     - Calendar
     - Messages

2. Academic tracking:
   - /app/(dashboard)/coach/juco/team/academics/page.tsx
   - GPA tracking per player
   - Credits tracker
   - Eligibility status calculator
   - At-risk alerts
   - Transfer requirements checklist

3. College interest:
   - Which 4-year programs viewing players
   - Similar to HS college interest

Create /lib/queries/juco-academics.ts
```

**Acceptance Criteria:**
- [ ] Team features work
- [ ] Academic tracking saves
- [ ] Eligibility calculator works
- [ ] College interest shows

---

## Phase 7: Showcase Coach (Days 32-33)

### Goals
- Multi-team structure
- Organization dashboard

### Tasks

#### Day 32-33: Multi-Team

**Claude CLI Prompt:**
```
Build Showcase coach multi-team structure:

1. /app/(dashboard)/coach/showcase/page.tsx:
   - Organization dashboard
   - All teams overview
   - Total players across org
   - College interest across org
   - Upcoming events

2. /app/(dashboard)/coach/showcase/teams/page.tsx:
   - List of teams
   - Team cards with player count
   - Add new team
   - Team settings

3. /app/(dashboard)/coach/showcase/teams/[teamId]/page.tsx:
   - Team detail
   - Roster
   - Video library
   - Dev plans
   - Calendar

4. Organization calendar:
   - All teams' events
   - Filter by team
   - Color coded

Create team switching context for showcase coaches
```

**Acceptance Criteria:**
- [ ] Can manage multiple teams
- [ ] Team switcher works
- [ ] Org dashboard aggregates data
- [ ] Calendar shows all teams

---

## Phase 8: JUCO + College Players (Days 34-35)

### Goals
- JUCO player experience
- College player (team-only)

### Tasks

#### Day 34-35: Player Types

**Claude CLI Prompt:**
```
Build remaining player types:

1. JUCO Player:
   - Mode toggle (Recruiting ↔ Team)
   - Recruiting: Discover 4-year programs
   - Team: JUCO team features
   - Academic tracking (eligibility, credits)

2. College Player:
   - Team-only (no recruiting)
   - Dashboard
   - Schedule
   - Videos
   - Messages
   - Announcements

3. Player type detection:
   - Set during onboarding
   - Determines available features

Create player type guards and route protection
```

**Acceptance Criteria:**
- [ ] JUCO player mode toggle works
- [ ] College player has no recruiting
- [ ] Academic tracking for JUCO works
- [ ] Route protection correct

---

## Phase 9: Polish (Days 36-40)

### Goals
- Mobile responsiveness
- Loading/error states
- Performance
- Testing

### Tasks

#### Day 36-37: Mobile & Responsiveness

**Claude CLI Prompt:**
```
Make all pages mobile responsive:

1. Sidebar → Bottom nav on mobile
2. Data tables → Card lists
3. Kanban → Vertical list
4. Calendar → Agenda view
5. Filter panels → Bottom sheets
6. Modals → Full screen on mobile

Test all pages at:
- 375px (iPhone SE)
- 390px (iPhone 14)
- 768px (iPad)
- 1024px (Desktop)

Fix any overflow, touch target, or layout issues.
```

---

#### Day 37-38: Loading & Error States

**Claude CLI Prompt:**
```
Add comprehensive loading and error handling:

1. Every data-fetching component needs:
   - Skeleton loading state
   - Error state with retry
   - Empty state with CTA

2. Global error boundary:
   - Catch unhandled errors
   - Show friendly message
   - "Try again" button

3. Toast notifications:
   - Success: Green
   - Error: Red with retry
   - Info: Gray
   - Auto-dismiss after 4s

4. Form validation:
   - Inline errors
   - Submit button disabled until valid
   - Loading state on submit

Review and fix all components.
```

---

#### Day 38-39: Performance

**Claude CLI Prompt:**
```
Optimize performance:

1. Images:
   - Use Next.js Image component
   - Proper sizing
   - Lazy loading

2. Data fetching:
   - Server Components where possible
   - Parallel fetching
   - Proper caching with unstable_cache
   - Revalidation on mutations

3. Bundle size:
   - Tree-shake icons (import individually)
   - Dynamic imports for heavy components
   - Analyze with @next/bundle-analyzer

4. Database:
   - Add any missing indexes
   - Optimize slow queries
   - Implement connection pooling

Run Lighthouse and fix any issues below 90.
```

---

#### Day 39-40: Testing

**Claude CLI Prompt:**
```
Add tests:

1. Unit tests (Vitest):
   - Utility functions
   - Hooks
   - Formatters

2. Integration tests (Playwright):
   - Auth flows
   - Discover and filter
   - Add to watchlist
   - Send message
   - Video upload
   - Team invite

3. Visual tests:
   - Storybook for components
   - Chromatic for visual regression

4. E2E critical paths:
   - Coach: Login → Discover → View Player → Add to Watchlist → Message
   - Player: Signup via Invite → Complete Profile → Activate Recruiting

Create CI/CD pipeline with tests.
```

---

## Definition of Done

For each phase to be complete:

- [ ] All features functional
- [ ] TypeScript: No errors
- [ ] Lint: No warnings
- [ ] Mobile: Responsive and usable
- [ ] Loading: Skeletons for all data
- [ ] Errors: Handled gracefully
- [ ] Empty: Helpful empty states
- [ ] A11y: Keyboard navigable, ARIA labels
- [ ] Tested: Critical paths covered

---

## Quick Reference: Claude CLI Prompts

### Starting a new feature:
```
Read CLAUDE.md and UI_SYSTEM.md, then build [feature] following the established patterns.
```

### Fixing a bug:
```
There's a bug in [component/feature]: [description]. Debug and fix it, ensuring no regressions.
```

### Adding a component:
```
Create a new [component] following the patterns in COMPONENTS.md with all states (loading, error, empty).
```

### Database changes:
```
Create a migration to [add/modify] the [table] table with [columns]. Update TypeScript types after.
```

### Performance issue:
```
The [page/component] is slow. Profile it, identify the bottleneck, and optimize.
```
