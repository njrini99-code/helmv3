# Golf Platform - Revised Architecture
**Date:** December 22, 2024
**Based on:** User clarification - Coach-centric platform

---

## ✅ Correct Architecture

### User Flow from Home Page

```
helmv3.com
    │
    └── Golf Section Link
        │
        └── /golf (Landing page with golf-helm-logo)
            │
            ├── "I'm a Coach" → /golf/signup
            │   │
            │   └── Coach Signup Flow
            │       ├── Create account (email/password)
            │       ├── Create golf_coaches record
            │       └── Redirect to /golf/coach (onboarding)
            │           │
            │           └── 3-Step Onboarding
            │               ├── Step 1: Organization (school/university)
            │               ├── Step 2: Team (men's/women's golf)
            │               ├── Step 3: Profile (name, title, photo)
            │               └── Complete → /golf/dashboard (Coach Dashboard)
            │
            └── "I'm a Player" → "Ask your coach for invite link"
                │
                └── Coach sends invite link: /golf/join/[invite-code]
                    │
                    └── Player Join Flow
                        ├── If not logged in: Sign up first
                        ├── Create golf_players record (linked to team)
                        └── Redirect to /golf/player (onboarding)
                            │
                            └── 4-Step Onboarding
                                ├── Step 1: Basic (name, hometown, state)
                                ├── Step 2: Golf (year, grad year, handicap)
                                ├── Step 3: Academic (major, GPA)
                                ├── Step 4: Photo
                                └── Complete → /golf/dashboard (Player Dashboard)
```

---

## 🎯 Core Concepts

### Coach Role (Administrator)
**Controls & Manages:**
- ✅ Roster (add/remove players via invite links)
- ✅ Calendar & Events (create, edit, delete)
- ✅ Travel Plans (create itineraries, track attendance)
- ✅ Announcements (team-wide notifications)
- ✅ Tasks (assign to players, track completion)
- ✅ Documents (upload/organize team files)
- ✅ Qualifiers (create scoring events, view results)
- ✅ View ALL player rounds and stats
- ✅ Sync player schedules to calendar

### Player Role (Consumer + Data Provider)
**Views (Read-Only):**
- ✅ Team calendar
- ✅ Travel itineraries (RSVP to events)
- ✅ Announcements
- ✅ Tasks assigned to them
- ✅ Team documents
- ✅ Team roster

**Manages (Own Data):**
- ✅ Profile (photo, hometown, year, height, weight)
- ✅ Academic schedule (upload class schedule)
- ✅ Videos (upload highlight reels)
- ✅ Record rounds (using ShotTrackingFinal)
- ✅ View own stats

**Data Contribution:**
- ✅ Rounds recorded → stored in golf_rounds
- ✅ Stats auto-calculated → visible to both player & coach
- ✅ Academic schedule → coach can view for practice scheduling
- ✅ RSVP status → visible on calendar events

---

## 📊 Dashboard Structure

### `/golf/dashboard` (Role-Based)

**Coach View:**
```
Welcome back, Coach Smith
Texas A&M Men's Golf Dashboard

[Quick Stats]
- Roster Size: 12
- Upcoming Events: 3
- Active Qualifiers: 1
- Team Average: 72.4

[Quick Actions]
- Manage Roster
- Create Qualifier
- Schedule Event
- Post Announcement

[Recent Rounds] (ALL players)
- John Doe | Barton Creek | 72 (E)
- Jane Smith | Austin CC | 74 (+2)
```

**Player View:**
```
Welcome back, John
Texas A&M Men's Golf • Sophomore

[Quick Stats]
- Rounds Played: 12
- Scoring Average: 73.2
- Best Round: 68
- Handicap: 2.5

[Quick Actions]
- Submit Round
- View Stats
- View Calendar
- My Classes

[My Recent Rounds]
- Barton Creek | 72 (E)
- Austin CC | 74 (+2)
```

---

## 🗂️ Directory Structure (Corrected)

```
/golf/
├── (auth)/
│   ├── login/              ✅ Login page
│   └── signup/             ✅ Coach signup ONLY
│
├── (onboarding)/
│   ├── coach/              ✅ Coach 3-step onboarding
│   └── player/             ✅ Player 4-step onboarding
│
├── (dashboard)/
│   └── dashboard/          ✅ Role-based dashboard
│       ├── page.tsx        ✅ Coach/Player dashboard (implemented)
│       │
│       ├── roster/         🟡 Coach: Manage | Player: View
│       ├── calendar/       🟡 Coach: CRUD | Player: View + RSVP
│       ├── qualifiers/     🔴 Coach: Create/Manage | Player: View
│       ├── stats/          🔴 Coach: All players | Player: Own stats
│       ├── messages/       🔴 Team communication
│       │
│       ├── travel/         🔴 Coach: Create plans | Player: View + RSVP
│       ├── documents/      🔴 Coach: Upload/Manage | Player: View
│       ├── tasks/          🔴 Coach: Create/Assign | Player: View + Complete
│       ├── announcements/  🔴 Coach: Create | Player: View
│       │
│       ├── rounds/         🔴 Coach: View all | Player: Submit + View own
│       ├── classes/        🔴 Player only: Academic schedule
│       ├── team/           🔴 Player only: Team info
│       └── settings/       🟡 Both: User settings
│
└── join/[code]/            🔴 Player invite link handler

/player-golf/               ⚠️ TO BE INTEGRATED
├── round/new/              ✅ 8-step round wizard (MOVE TO /golf/dashboard/rounds/new)
├── round/[id]/             🟡 Round detail view (MOVE TO /golf/dashboard/rounds/[id])
└── stats/                  🟡 Stats page (MERGE WITH /golf/dashboard/stats)
```

---

## 🔄 Integration Plan: /player-golf/ → /golf/

### Step 1: Move Round Submission
```bash
FROM: /player-golf/round/new/page.tsx
TO:   /golf/dashboard/rounds/new/page.tsx

Changes needed:
- Keep 8-step wizard structure
- Integrate ShotTrackingFinal component
- Update navigation to /golf/dashboard/rounds
```

### Step 2: Move Round Detail View
```bash
FROM: /player-golf/round/[id]/page.tsx
TO:   /golf/dashboard/rounds/[id]/page.tsx

Changes needed:
- Add role-based viewing (coach sees all, player sees own)
- Keep ShotTrackingFinal integration
```

### Step 3: Merge Stats Page
```bash
FROM: /player-golf/stats/page.tsx
TO:   /golf/dashboard/stats/page.tsx

Changes needed:
- Coach view: Team stats + individual player stats
- Player view: Own stats only
- Add charts (Recharts)
```

### Step 4: Delete /player-golf/
```bash
rm -rf /player-golf/
```

---

## 🏗️ Feature Implementation Priority

### Phase 1: Foundation (Complete) ✅
- [x] Database schema (golf tables)
- [x] Auth flow (coach signup, player join)
- [x] Onboarding (coach 3-step, player 4-step)
- [x] Dashboard layout (role-based sidebar)
- [x] Main dashboard page (coach & player views)

### Phase 2: Round Tracking (HIGH PRIORITY)
**Estimated: 12 hours**

**2.1 Move Round Submission** (4 hours)
- [ ] Create `/golf/dashboard/rounds/new/page.tsx`
- [ ] Copy 8-step wizard from `/player-golf/round/new/`
- [ ] Integrate ShotTrackingFinal component
- [ ] Save rounds to `golf_rounds` table
- [ ] Save hole data to `golf_holes` table
- [ ] Save shot data to `golf_hole_shots` table

**2.2 Rounds List Page** (4 hours)
- [ ] Create `/golf/dashboard/rounds/page.tsx`
- [ ] Coach: View all player rounds (table with filters)
- [ ] Player: View own rounds only
- [ ] Add filters: date range, player (coach only), course
- [ ] Link to round detail page

**2.3 Round Detail View** (4 hours)
- [ ] Create `/golf/dashboard/rounds/[id]/page.tsx`
- [ ] Display scorecard with shot-by-shot breakdown
- [ ] Show hole scores, putts, fairways, greens
- [ ] Coach: Can view any round
- [ ] Player: Can view own rounds only

### Phase 3: Stats & Analytics (HIGH PRIORITY)
**Estimated: 10 hours**

**3.1 Stats Calculations** (4 hours)
- [ ] Create `/lib/golf/stats.ts` with calculation functions
- [ ] Scoring average (9-hole, 18-hole, overall)
- [ ] Best round, worst round
- [ ] Fairways hit percentage
- [ ] Greens in regulation (GIR)
- [ ] Putts per round
- [ ] Scoring by hole (par 3, 4, 5)

**3.2 Stats Dashboard** (6 hours)
- [ ] Create `/golf/dashboard/stats/page.tsx`
- [ ] Coach view: Team leaderboard + individual player stats
- [ ] Player view: Personal stats only
- [ ] Add charts: scoring trends, shot distribution, hole averages
- [ ] Filterable by: date range, round type (tournament/practice)

### Phase 4: Team Management (MEDIUM PRIORITY)
**Estimated: 16 hours**

**4.1 Roster Management** (4 hours)
- [ ] Complete `/golf/dashboard/roster/page.tsx`
- [ ] Generate invite link (unique code per team)
- [ ] Copy invite link to clipboard
- [ ] View active players, pending invites
- [ ] Remove player (soft delete)
- [ ] Player profile modal (view stats, rounds, schedule)

**4.2 Calendar & Events** (6 hours)
- [ ] Create `/golf/dashboard/calendar/page.tsx`
- [ ] Coach: Create events (practice, tournament, qualifier, meeting)
- [ ] Month/week view calendar
- [ ] Event details: date, time, location, type
- [ ] Player RSVP system (attending/not attending/maybe)
- [ ] Coach can see RSVP status for each event

**4.3 Player Schedule Sync** (4 hours)
- [ ] Player: Upload class schedule (file upload or manual entry)
- [ ] Store in `golf_classes` table
- [ ] Coach: View player class schedules
- [ ] Calendar integration: show when players have classes
- [ ] Conflict detection when scheduling practice

**4.4 Announcements** (2 hours)
- [ ] Create `/golf/dashboard/announcements/page.tsx`
- [ ] Coach: Create/edit/delete announcements
- [ ] Player: View announcements (read-only)
- [ ] Pin important announcements
- [ ] Notification badge for unread

### Phase 5: Advanced Features (MEDIUM PRIORITY)
**Estimated: 14 hours**

**5.1 Travel Planning** (4 hours)
- [ ] Create `/golf/dashboard/travel/page.tsx`
- [ ] Coach: Create travel plans (linked to events)
- [ ] Transportation type (bus, van, fly, carpool)
- [ ] Departure/arrival times, locations
- [ ] Hotel/accommodation info
- [ ] Player RSVP/attendance tracking

**5.2 Task Management** (4 hours)
- [ ] Create `/golf/dashboard/tasks/page.tsx`
- [ ] Coach: Create tasks, assign to player(s)
- [ ] Task types: practice drill, academic, video review, etc.
- [ ] Due dates, urgency levels
- [ ] Player: View assigned tasks, mark complete
- [ ] Coach: Track completion status

**5.3 Document Library** (3 hours)
- [ ] Create `/golf/dashboard/documents/page.tsx`
- [ ] Coach: Upload documents (PDF, images, etc.)
- [ ] Organize by category (rules, schedules, forms, etc.)
- [ ] Player: View/download documents
- [ ] Supabase Storage integration

**5.4 Qualifiers** (3 hours)
- [ ] Create `/golf/dashboard/qualifiers/page.tsx`
- [ ] Coach: Create qualifier event
- [ ] Link rounds to qualifier
- [ ] Leaderboard view (live updating)
- [ ] Determine top 5/6 for tournaments

### Phase 6: Player Profile (LOW PRIORITY)
**Estimated: 6 hours**

**6.1 Profile Management** (3 hours)
- [ ] Expand player profile editing
- [ ] Add height, weight fields
- [ ] Profile photo upload (Supabase Storage)
- [ ] Bio/about section

**6.2 Video Upload** (3 hours)
- [ ] Player: Upload highlight videos
- [ ] Store in Supabase Storage
- [ ] Link to player profile
- [ ] Coach can view player videos

### Phase 7: Messages (LOW PRIORITY)
**Estimated: 6 hours**
- [ ] Create `/golf/dashboard/messages/page.tsx`
- [ ] Integrate with existing `conversations`/`messages` tables
- [ ] Coach-to-player DMs
- [ ] Team-wide messages
- [ ] Notification system

---

## 🔧 Technical Fixes Required

### Fix 1: Generate TypeScript Types
**Priority: CRITICAL**
```bash
npm run db:types
```
- Regenerates `database.types.ts` with golf tables
- Removes need for `(supabase as any)` casts
- Prevents runtime errors

### Fix 2: Create Golf Types File
**Priority: HIGH**
```typescript
// /lib/types/golf.ts

import { Tables } from '@/lib/types/database';

export type GolfCoach = Tables<'golf_coaches'>;
export type GolfPlayer = Tables<'golf_players'>;
export type GolfTeam = Tables<'golf_teams'>;
export type GolfOrganization = Tables<'golf_organizations'>;
export type GolfRound = Tables<'golf_rounds'>;
export type GolfHole = Tables<'golf_holes'>;
export type GolfHoleShot = Tables<'golf_hole_shots'>;
export type GolfEvent = Tables<'golf_events'>;
export type GolfQualifier = Tables<'golf_qualifiers'>;

// Enums
export type GolfPlayerYear = 'freshman' | 'sophomore' | 'junior' | 'senior' | 'fifth_year' | 'graduate';
export type GolfPlayerStatus = 'active' | 'injured' | 'redshirt' | 'inactive';
export type GolfRoundType = 'tournament' | 'qualifier' | 'practice' | 'casual';
```

### Fix 3: Remove Type Assertions
**Priority: HIGH**

Replace all instances of:
```typescript
// ❌ Before
const { data } = await (supabase as any)
  .from('golf_players')
  .select('*');

// ✅ After
import { createClient } from '@/lib/supabase/client';
const supabase = createClient();
const { data } = await supabase
  .from('golf_players')
  .select('*');
```

### Fix 4: Invite Link System
**Priority: HIGH**

**Generate Invite Code:**
```typescript
// /app/golf/actions/invite.ts
'use server';

export async function generateTeamInvite(teamId: string) {
  const code = generateUniqueCode(); // e.g., nanoid(10)

  await supabase
    .from('golf_teams')
    .update({ invite_code: code })
    .eq('id', teamId);

  return { code, url: `${process.env.NEXT_PUBLIC_URL}/golf/join/${code}` };
}
```

**Join via Invite:**
```typescript
// /app/golf/join/[code]/page.tsx

export default async function JoinTeamPage({ params }: { params: { code: string } }) {
  const { data: team } = await supabase
    .from('golf_teams')
    .select('*, organization:golf_organizations(*)')
    .eq('invite_code', params.code)
    .single();

  if (!team) return <InvalidInvite />;

  return <JoinTeamFlow team={team} />;
}
```

---

## 📝 Implementation Checklist

### Immediate (Week 1)
- [ ] Run `npm run db:types` to generate golf types
- [ ] Create `/lib/types/golf.ts` with type exports
- [ ] Remove all `(supabase as any)` casts
- [ ] Implement invite link system
- [ ] Move round submission from `/player-golf/` to `/golf/`
- [ ] Create rounds list page
- [ ] Create round detail page

### Short-term (Week 2-3)
- [ ] Implement stats calculations
- [ ] Create stats dashboard (coach & player views)
- [ ] Complete roster management with invite links
- [ ] Implement calendar & events
- [ ] Add player schedule upload
- [ ] Create announcements system

### Mid-term (Week 4-5)
- [ ] Travel planning
- [ ] Task management
- [ ] Document library
- [ ] Qualifiers system
- [ ] Player profile enhancements
- [ ] Video uploads

### Long-term (Week 6+)
- [ ] Messages integration
- [ ] Advanced analytics
- [ ] Mobile app considerations
- [ ] Performance optimizations

---

## 🎨 Brand Integration

### Golf-Helm Logo Usage
```typescript
// Everywhere golf-helm-logo should appear:
<img
  src="/helm-golf-logo.png"
  alt="GolfHelm"
  className="h-16 w-auto" // Adjust size as needed
/>

Locations:
✅ /golf/(auth)/login/page.tsx (line 88)
✅ /golf/(auth)/signup/page.tsx (line 88)
✅ /golf/(onboarding)/coach/page.tsx (line 125)
✅ /golf/(onboarding)/player/page.tsx (line 163)
✅ /golf/(dashboard)/layout.tsx sidebar (line 98)
🔴 Landing page (create /golf/page.tsx)
```

### Color Scheme
```
Primary: #16A34A (green-600) - Kelly Green
Background: #FAF6F1 - Cream
Cards: #FFFFFF - White
Text: #0F172A - Slate 900
```

---

## 🚀 Next Steps

1. **Generate Types** (30 minutes)
   ```bash
   npm run db:types
   ```

2. **Create Golf Types Export** (15 minutes)
   - Create `/lib/types/golf.ts`
   - Export all golf table types

3. **Implement Invite System** (2 hours)
   - Generate invite code function
   - Create `/golf/join/[code]/page.tsx`
   - Test full player join flow

4. **Integrate Round Submission** (4 hours)
   - Move `/player-golf/round/new/` → `/golf/dashboard/rounds/new/`
   - Test shot tracking integration
   - Verify data saves to database

5. **Create Rounds List** (3 hours)
   - Build rounds table view
   - Add filters (date, player, course)
   - Role-based visibility

6. **Stats Dashboard** (6 hours)
   - Build calculation functions
   - Create stats page
   - Add charts

**Total estimated: ~16 hours to complete Phases 2-3 (core features)**

---

**End of Revised Architecture Document**
