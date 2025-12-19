# CLAUDE.md - Helm Sports Labs Master Context

> **Drop this file in your project root. Claude Code and Cursor will read it automatically.**

---

## Project Overview

**Helm Sports Labs** is a baseball recruiting platform connecting high school players with college coaches.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (Auth + DB + Storage), Tailwind CSS

**User Types:** College Coach, HS Coach, JUCO Coach, Showcase Coach, Player

---

## Current Status: 41% Complete

### ✅ Working (Production Ready)
- Authentication (login, signup, logout)
- Onboarding flows (player + coach)
- Dashboard layouts with sidebars
- HS Coach: Roster, Videos, Dev Plans, Calendar, College Interest
- Player: Profile editor, Video upload, Team hub
- Database: 37 tables with RLS policies

### 🟡 Partial (Needs Work)
- College Coach: Dashboard exists, but Discover/Watchlist/Pipeline incomplete
- Player Recruiting: Activation works, but Analytics/Journey need real data
- Messaging: UI exists, send functionality missing

### 🔴 Not Started
- JUCO dual-mode toggle
- Showcase multi-team management
- Subscriptions/payments
- Email notifications

---

## Design System

```
Colors:
- Primary: green-600 (#16A34A)
- Background: #FAF6F1 (cream)
- Cards: white
- Text: slate-900 (dark), slate-500 (medium), slate-400 (light)

Components:
- Cards: rounded-2xl border border-slate-200 shadow-sm
- Buttons: rounded-lg px-4 py-2 (or rounded-xl for larger)
- Inputs: rounded-xl border border-slate-200 px-4 py-2.5
- Badges: rounded-full px-2.5 py-1 text-xs font-medium

Spacing:
- Page padding: px-6 py-8
- Card padding: p-6
- Section gaps: gap-6
```

---

## Database Schema (Key Tables)

```sql
-- Users & Auth
players (id, user_id, first_name, last_name, primary_position, grad_year, recruiting_activated, ...)
coaches (id, user_id, organization_id, coach_type, ...)
organizations (id, name, division, conference, ...)

-- Teams
teams (id, organization_id, head_coach_id, name, team_type, ...)
team_members (id, team_id, player_id, role, jersey_number, ...)

-- Recruiting
recruit_watchlist (id, coach_id, player_id, status, priority, notes, ...)
recruiting_interests (id, player_id, college_program_id, status, interest_level, ...)
player_engagement_events (id, player_id, coach_id, engagement_type, ...)

-- Content
player_videos (id, player_id, title, video_url, video_type, is_primary, ...)
development_plans (id, team_id, player_id, title, goals, ...)

-- Communication
conversations (id, title, updated_at, ...)
messages (id, conversation_id, sender_id, content, ...)
notifications (id, user_id, title, body, is_read, ...)
```

Full schema: See `/docs/SCHEMA.md`

---

## File Structure

```
app/
├── (auth)/login, signup
├── (dashboard)/
│   ├── coach/
│   │   ├── college/        # College coach pages
│   │   ├── high-school/    # HS coach pages
│   │   ├── juco/           # JUCO coach pages
│   │   └── showcase/       # Showcase coach pages
│   └── player/             # Player pages
├── (public)/               # Public profiles
├── actions/                # Server actions
└── api/                    # API routes

components/
├── coach/                  # Coach-specific components
├── player/                 # Player-specific components
├── shared/                 # Reusable components
└── ui/                     # Base UI components

lib/
├── supabase/server.ts, client.ts
└── utils/

types/
└── database.ts             # Generated Supabase types
```

---

## Implementation Phases

| Phase | Feature | Status | Guide |
|-------|---------|--------|-------|
| 0 | Foundation | ✅ Done | FOUNDATION_PHASE.md |
| 1 | College Coach Recruiting | 🟡 20% | PHASE_1_COLLEGE_COACH.md |
| 2 | HS Coach Team Management | ✅ 86% | PHASE_2_HS_COACH.md |
| 3 | Player Core | 🟡 50% | PHASE_3_PLAYER_CORE.md |
| 4 | Player Recruiting | 🟡 30% | PHASE_4_PLAYER_RECRUITING.md |
| 5 | JUCO Coach | 🔴 0% | PHASE_5_JUCO_COACH.md |
| 6 | Showcase Coach | 🔴 0% | PHASE_6_SHOWCASE_COACH.md |
| 7 | Shared Systems | 🟡 40% | SHARED_SYSTEMS.md |

---

## MVP Sprint Plan (Priority Order)

### Sprint 1: College Coach Recruiting (12-15 hours)
1. **Discover Players** - Grid with filters, player cards, detail modal
2. **Watchlist** - Table with status updates, notes
3. **Pipeline** - Kanban drag-drop board

### Sprint 2: Messaging (3 hours)
4. **Send Message** - Complete send functionality

### Sprint 3: Player Recruiting (4 hours)
5. **Analytics** - Real data from engagement events
6. **Journey** - Timeline with school status tracking

### Sprint 4: Polish (2 hours)
7. **Navigation** - All buttons connected
8. **Engagement Tracking** - Log all coach-player interactions

Full plan: See `/docs/MVP_SPRINT_PLAN.md`

---

## Key Patterns

### Server Components (Default)
```tsx
// app/(dashboard)/coach/college/page.tsx
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data } = await supabase.from('players').select('*');
  return <Dashboard data={data} />;
}
```

### Client Components (When Needed)
```tsx
// components/coach/FilterBar.tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
// For interactivity, URL state, etc.
```

### Server Actions
```tsx
// app/actions/watchlist.ts
'use server';
export async function addToWatchlist(playerId: string) {
  const supabase = await createClient();
  // ... insert, revalidatePath
}
```

### URL State for Filters
```tsx
// Filters go in URL for shareability
const params = new URLSearchParams(searchParams);
params.set('position', 'RHP');
router.push(`?${params.toString()}`);
```

---

## Quick Commands

```bash
# Run dev server
npm run dev

# Generate Supabase types
npx supabase gen types typescript --project-id YOUR_ID > types/database.ts

# Check TypeScript
npx tsc --noEmit

# Run Supabase locally
npx supabase start
```

---

## What To Work On Next

**Current Task:** [UPDATE THIS AFTER EACH SESSION]

**To continue development:**
1. Read the relevant PHASE_*.md guide
2. Follow the component code and server actions provided
3. Test the feature manually
4. Run audit prompt to verify completion

---

## Documentation Index

All guides are in `/docs/`:

| File | Purpose |
|------|---------|
| SCHEMA.md | Complete database schema (37 tables) |
| FOUNDATION_PHASE.md | Auth, onboarding, layouts |
| PHASE_1_COLLEGE_COACH.md | Discover, Watchlist, Pipeline, Compare |
| PHASE_2_HS_COACH.md | Roster, Videos, Dev Plans, Interest |
| PHASE_3_PLAYER_CORE.md | Profile, Videos, Team Hub |
| PHASE_4_PLAYER_RECRUITING.md | Activation, Discover, Journey, Analytics |
| PHASE_5_JUCO_COACH.md | Dual-mode toggle, Academics |
| PHASE_6_SHOWCASE_COACH.md | Multi-team, Org dashboard |
| SHARED_SYSTEMS.md | Messaging, Notifications, Calendar, Search |
| MVP_SPRINT_PLAN.md | Prioritized task list with prompts |
| PROFILE_FEATURES_GUIDE.md | Privacy toggles, public profiles |
| SUBSCRIPTIONS.md | Feature gating, Stripe integration |
| CURSOR_AUDIT_PROMPT.md | Audit prompts for verification |

---

**End of CLAUDE.md**
