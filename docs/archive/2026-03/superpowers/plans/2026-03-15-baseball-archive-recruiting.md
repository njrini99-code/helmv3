# Baseball: Archive Recruiting + Verify Isolation

**Date:** 2026-03-15

---

## Key Finding

Baseball is **already fully built** with its own:
- 56 database tables (all `baseball_` prefixed)
- 23 server action files
- 97 components
- Complete team management (calendar, roster, messages, announcements, tasks, docs, travel)
- Complete stats system (games, box scores, CSV upload, season aggregates)
- Complete recruiting system (discover, watchlist, pipeline, philosophy)
- Full auth + onboarding with coach types (College/HS/JUCO/Showcase)

**Baseball does NOT need to copy from golf.** It has its own parallel implementation.

---

## What to Do

### Phase 1: Archive Recruiting from Nav (30 min)

**Goal:** Hide recruiting features from the sidebar nav. Keep all code in place for future re-activation. Keep coach types intact.

**File:** `src/components/layout/sidebar.tsx` (the shared sidebar)

Remove or comment out these nav items for ALL coach types:
- Command Center
- Discover
- Pipeline
- Watchlist
- Compare
- Camps (coach side)
- Comparisons

Remove or comment out these nav items for recruiting-activated PLAYERS:
- Colleges
- Journey
- Camps (player side)
- Analytics (recruiting-specific)

**Keep these nav items (team management):**
- Dashboard
- Roster
- Stats
- Videos
- Dev Plans
- Calendar
- Messages
- Announcements
- Tasks
- Documents
- Travel
- Settings
- Academics (JUCO only)

**Keep coach mode toggle** but default to "Team" mode and hide the toggle button (since there's no recruiting mode to switch to). Or remove the toggle UI but keep the state management code.

**DO NOT delete:**
- Any route files
- Any action files
- Any component files
- Any database tables
- Coach type logic
- Player type logic

### Phase 2: Verify Complete Isolation (Critical)

**Goal:** Ensure ZERO crossover between golf and baseball data.

#### 2a. Database Table Isolation
Verify every server action file in `src/app/baseball/actions/` ONLY queries `baseball_*` tables:
- `teams.ts` → `baseball_teams`, `baseball_team_members`, etc.
- `games.ts` → `baseball_games`, `baseball_box_score_*`
- `stats.ts` → `baseball_player_stats`, `baseball_season_stats`
- `calendar.ts` → `baseball_events`, `baseball_event_attendance`
- `messages.ts` → `baseball_messages`, `baseball_conversations`
- `tasks.ts` → `baseball_tasks`, `baseball_task_assignments`
- `documents.ts` → `baseball_documents`
- `travel.ts` → `baseball_travel_itineraries`
- `announcements.ts` → `baseball_announcements`

And vice versa: every golf action ONLY queries `golf_*` tables.

Shared table `users` is OK (auth). Shared table `organizations` is OK.

#### 2b. Component Import Isolation
Verify:
- No file in `src/components/baseball/` imports from `src/components/golf/`
- No file in `src/components/golf/` imports from `src/components/baseball/`
- No file in `src/app/baseball/` imports from `src/app/golf/`
- No file in `src/app/golf/` imports from `src/app/baseball/`

Shared imports from `src/components/ui/`, `src/components/layout/`, `src/lib/`, `src/hooks/` are OK.

#### 2c. Auth Session Isolation
Verify `src/lib/auth/session.ts`:
- `getGolfSessionProfile()` queries `golf_coaches` + `golf_players`
- `getSessionProfile()` (baseball) queries `baseball_coaches` + `baseball_players`
- No cross-sport queries

#### 2d. RLS Policy Check
Verify baseball tables have RLS enabled and policies scoped to:
- Players can only see their own team's data
- Coaches can only see their own team's data
- No golf user can access baseball tables and vice versa

### Phase 3: Fix Any Issues Found

Fix any crossover, missing auth checks, or broken features found during isolation verification.

### Phase 4: Leave Stats & CoachHelm for Later

**Stats system** — Already has:
- Game creation + box score entry
- CSV upload + parsing
- Season stat aggregation
- Player stat history

Leave as-is. Future enhancement: integrate with baseball-specific CoachHelm.

**CoachHelm for baseball** — Future project:
- Reuse V3 engine architecture (orchestrator, mining, trends, anomalies)
- Build baseball-specific benchmarks (batting avg, ERA, OBP, SLG)
- Build baseball-specific patterns ("struggles against lefties", "OBP trending down")
- Wire to `baseball_coach_insights` table (already exists)

---

## Execution

| Phase | Effort | Agent Count |
|-------|--------|-------------|
| 1. Archive nav | 30 min | 1 agent |
| 2. Verify isolation | 1 hour | 2 agents (one for baseball, one for golf) |
| 3. Fix issues | Depends on findings | 1 agent |
| 4. Stats/CoachHelm | Future | — |

**Total: ~2 hours of agent work**
