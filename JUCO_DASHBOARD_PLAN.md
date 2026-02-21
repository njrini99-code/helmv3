# JUCO Coach Dashboard — Implementation Plan

**Goal:** Bring JUCO team dashboard to same premium quality as college recruiting dashboard, with unified messaging/calendar experience.

---

## Architecture Overview

JUCO coaches have a **mode toggle** — they need premium experiences in BOTH modes:

```
JUCO Coach
    │
    ├─► RECRUITING MODE (coachMode = 'recruiting')
    │   └─► /baseball/dashboard (EXISTING — college-quality)
    │       └─► Pipeline, Discover, Compare, Command Center, Camps
    │
    └─► TEAM MODE (coachMode = 'team')
        └─► /baseball/dashboard/team (NEEDS UPGRADE)
            └─► Team Health, Dev Plans, Academics, College Interest, Stats
    
    ├─► SHARED (both modes)
    │   ├─► /baseball/dashboard/messages (messaging hub)
    │   └─► /baseball/dashboard/calendar (unified calendar)
```

---

## Phase 1: JUCO Team Dashboard Hero Section

**File:** `src/components/baseball/dashboard/TeamHealthHero.tsx`

### Design

```
┌─────────────────────────────────────────────────────────────────┐
│  TEAM HEALTH                                        │ 2-col span│
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │ │
│  │  │ ROSTER  │  │ELIGIBLE │  │TEAM GPA │  │TRANSFER │       │ │
│  │  │   24    │  │   92%   │  │  3.21   │  │  Ready  │       │ │
│  │  │ players │  │ cleared │  │ average │  │    8    │       │ │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │ │
│  │                                                            │ │
│  │  [Progress bar: Roster capacity 24/30]                     │ │
│  │  [Quick: Add Player] [View Eligibility] [Academics]        │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Data Sources

```typescript
interface TeamHealthData {
  rosterCount: number;
  rosterCapacity: number;  // JUCO typically 30-35
  eligibleCount: number;
  eligibilityPct: number;
  teamGpa: number;
  transferReadyCount: number;  // recruiting_activated = true
  recentJoins: number;  // last 7 days
}

// Query from:
// - baseball_team_members (roster count, recent joins)
// - baseball_player_aggregates + classes (GPA calculation)
// - baseball_players.recruiting_activated (transfer ready)
```

---

## Phase 2: Secondary Stat Cards

**Layout:** 2 cards next to hero (like Profile Views + Messages in recruiting)

### Card 1: Academics Overview

```typescript
interface AcademicsStatCard {
  teamGpa: number;
  atRiskCount: number;  // GPA < 2.0
  ineligibleCount: number;
  trend: 'up' | 'down' | 'stable';
}
```

### Card 2: Messages

```typescript
interface MessagesStatCard {
  unreadCount: number;
  recentConversations: number;  // active in last 7 days
}
```

---

## Phase 3: Player Development Row

**File:** `src/components/baseball/dashboard/TeamDevProgress.tsx`

### Left: Dev Plan Progress (like Hot Leads)

```
┌──────────────────────────────────────────┐
│  DEV PLAN PROGRESS                       │
│  ┌────────────────────────────────────┐  │
│  │ [Avatar] John Smith         78% ██ │  │
│  │          3/4 goals complete        │  │
│  ├────────────────────────────────────┤  │
│  │ [Avatar] Mike Johnson       45% ██ │  │
│  │          2/5 goals complete        │  │
│  ├────────────────────────────────────┤  │
│  │ [Avatar] Chris Davis        20% █  │  │
│  │          1/5 goals • OVERDUE       │  │
│  └────────────────────────────────────┘  │
│  [View All Dev Plans →]                  │
└──────────────────────────────────────────┘
```

### Right: Players Needing Attention (like Position Needs)

```
┌──────────────────────────────────────────┐
│  NEEDS ATTENTION                         │
│  ┌────────────────────────────────────┐  │
│  │ 🔴 Academic Risk (3)               │  │
│  │    GPA below 2.0 threshold         │  │
│  ├────────────────────────────────────┤  │
│  │ 🟡 Declining Stats (2)             │  │
│  │    AVG dropped >15% last 2 weeks   │  │
│  ├────────────────────────────────────┤  │
│  │ 🟠 Overdue Goals (4)               │  │
│  │    Dev plan goals past due date    │  │
│  ├────────────────────────────────────┤  │
│  │ ⚪ No Video (5)                    │  │
│  │    Players without highlight video │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

---

## Phase 4: Performance Row

**File:** `src/components/baseball/dashboard/TeamStatsChart.tsx`

### Left: Team Stats Trend (2-col, like Engagement Chart)

```
┌─────────────────────────────────────────────────────────────┐
│  TEAM PERFORMANCE (Last 14 Days)            [Filter: All ▼]│
│  ┌───────────────────────────────────────────────────────┐  │
│  │         📈 Line chart                                 │  │
│  │         • Team AVG (blue line)                        │  │
│  │         • Exit Velo (green line)                      │  │
│  │         • Practice vs Game toggle                     │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌─────────┬─────────┬─────────┬─────────┐                  │
│  │Team AVG │ Exit V  │ OBP     │ Strike% │  ← Summary row  │
│  │  .287   │  84.2   │  .352   │  18.2%  │                  │
│  └─────────┴─────────┴─────────┴─────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

### Right: Recent Activity (like Activity Feed)

```
┌─────────────────────────────┐
│  RECENT ACTIVITY            │
│  ┌───────────────────────┐  │
│  │ John uploaded video   │  │
│  │ 2 hours ago           │  │
│  ├───────────────────────┤  │
│  │ Mike completed goal   │  │
│  │ 5 hours ago           │  │
│  ├───────────────────────┤  │
│  │ Stats uploaded (12)   │  │
│  │ Yesterday             │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

---

## Phase 5: College Interest Row (JUCO Unique!)

**File:** `src/components/baseball/dashboard/CollegeInterestSummary.tsx`

This is the killer feature for JUCO — tracking which colleges are looking at your players for transfer.

```
┌─────────────────────────────────────────────────────────────────┐
│  WHO'S LOOKING AT YOUR PLAYERS                    [Last 30 Days]│
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐           │  │
│  │  │    127     │  │     8      │  │     3      │           │  │
│  │  │Profile View│  │ Schools    │  │ Watchlist  │           │  │
│  │  │   +23%     │  │ Interested │  │   Adds     │           │  │
│  │  └────────────┘  └────────────┘  └────────────┘           │  │
│  │                                                            │  │
│  │  TOP INTEREST:                                             │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │ [Logo] Texas State    →  John Smith (3 views)       │   │  │
│  │  │ [Logo] LSU            →  Mike Johnson (watchlisted) │   │  │
│  │  │ [Logo] Arkansas       →  Chris Davis (2 views)      │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  │                                                            │  │
│  │  [View Full College Interest Report →]                     │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Source

```sql
-- From baseball_player_engagement_events
SELECT 
  p.id as player_id,
  p.first_name,
  p.last_name,
  c.school_name,
  COUNT(*) as view_count,
  MAX(e.engagement_date) as last_viewed
FROM baseball_player_engagement_events e
JOIN baseball_players p ON e.player_id = p.id
JOIN baseball_team_members tm ON p.id = tm.player_id
JOIN coaches c ON e.coach_id = c.id
WHERE tm.team_id = $teamId
  AND e.engagement_date > NOW() - INTERVAL '30 days'
GROUP BY p.id, c.school_name
ORDER BY view_count DESC
LIMIT 10;
```

---

## Phase 6: Bottom Row — Events, Tasks, Announcements

**3-column layout:**

```
┌──────────────────┬──────────────────┬─────────────────────┐
│ UPCOMING EVENTS  │ TASKS DUE        │ ANNOUNCEMENTS       │
│ ┌──────────────┐ │ ┌──────────────┐ │ ┌─────────────────┐ │
│ │ 🟢 Practice  │ │ │ □ Film review│ │ │ 📌 Bus leaves   │ │
│ │ Tomorrow 3pm │ │ │   Due today  │ │ │ at 6am sharp!   │ │
│ ├──────────────┤ │ ├──────────────┤ │ ├─────────────────┤ │
│ │ 🔵 Game vs   │ │ │ □ Complete   │ │ │ Practice moved  │ │
│ │ State - Sat  │ │ │   profile    │ │ │ to indoor       │ │
│ └──────────────┘ │ │   Due Fri    │ │ └─────────────────┘ │
│ [View Calendar]  │ └──────────────┘ │ [All Announcements] │
│                  │ [View All Tasks] │                     │
└──────────────────┴──────────────────┴─────────────────────┘
```

---

## Phase 7: Shared Features — Messaging

**Current state:** Messaging works but needs mode-aware context.

### Enhancements for JUCO:

1. **Recruiting mode messages:** Player conversations (recruiting)
2. **Team mode messages:** Team-wide announcements, player 1:1s (coaching)
3. **Unified inbox:** Both in one place with filters

```typescript
// In MessagesContent, add mode awareness:
const { coachMode } = useAuth();

// Filter conversations based on mode
const filteredConversations = useMemo(() => {
  if (coachMode === 'recruiting') {
    // Show conversations with recruits (non-team players)
    return conversations.filter(c => !isTeamMember(c.participant));
  } else {
    // Show conversations with team members
    return conversations.filter(c => isTeamMember(c.participant));
  }
}, [conversations, coachMode]);
```

---

## Phase 8: Shared Features — Calendar

**Current state:** Calendar is server-rendered, good foundation.

### Enhancements for JUCO:

1. **Mode-aware event types:**
   - Recruiting: Camps, unofficial visits, recruiting calls
   - Team: Practice, games, team meetings, travel

2. **Event creation aware of mode:**
   ```typescript
   const eventTypes = coachMode === 'recruiting' 
     ? ['camp', 'unofficial_visit', 'recruiting_call', 'signing_day']
     : ['practice', 'game', 'scrimmage', 'team_meeting', 'travel', 'film_session'];
   ```

3. **Combined view option:** See both recruiting and team events together

---

## File Structure

```
src/components/baseball/dashboard/
├── index.ts                      # exports
├── HotLeadsSection.tsx           # EXISTING (recruiting)
├── PositionNeedsMatrix.tsx       # EXISTING (recruiting)
├── TeamHealthHero.tsx            # NEW (team)
├── TeamDevProgress.tsx           # NEW (team)
├── PlayersNeedingAttention.tsx   # NEW (team)
├── TeamStatsChart.tsx            # NEW (team)
├── TeamActivityFeed.tsx          # NEW (team)
├── CollegeInterestSummary.tsx    # NEW (team - JUCO unique)
├── UpcomingSection.tsx           # NEW (shared - events/tasks/announcements)
```

---

## Server Actions Needed

```
src/app/baseball/actions/
├── team-dashboard.ts             # NEW - consolidated team dashboard data
│   ├── getTeamHealthData()       # roster, eligibility, GPA
│   ├── getDevPlanProgress()      # aggregated dev plan stats
│   ├── getPlayersNeedingAttention() # alerts
│   ├── getTeamStatsTrend()       # 14-day performance
│   ├── getCollegeInterestSummary() # engagement for team players
│   └── getTeamDashboardData()    # consolidated fetch
```

---

## Implementation Order

| Phase | Component | Time | Dependencies |
|-------|-----------|------|--------------|
| 1 | `team-dashboard.ts` actions | 1.5hr | Database queries |
| 2 | `TeamHealthHero.tsx` | 1hr | Phase 1 |
| 3 | `TeamDevProgress.tsx` | 1hr | Phase 1 |
| 4 | `PlayersNeedingAttention.tsx` | 1hr | Phase 1 |
| 5 | `TeamStatsChart.tsx` | 1.5hr | Phase 1, Recharts |
| 6 | `CollegeInterestSummary.tsx` | 1.5hr | Phase 1 |
| 7 | `UpcomingSection.tsx` | 45min | Existing components |
| 8 | Integrate into `TeamDashboardClient.tsx` | 1hr | All above |
| 9 | Messaging mode awareness | 45min | Auth store |
| 10 | Calendar mode awareness | 30min | Auth store |
| **Total** | | **~10hr** | Parallelizable to ~4hr |

---

## Execution Strategy

### Option A: Sequential (me)
~10 hours, methodical

### Option B: Parallel (sub-agents)
```
┌─ Agent 1: Server Actions ───────────────────┐
│  team-dashboard.ts with all queries         │ 1.5hr
└─────────────────────────────────────────────┘

┌─ Agent 2: Hero + Stats Cards ───────────────┐
│  TeamHealthHero.tsx                         │ 1hr
└─────────────────────────────────────────────┘

┌─ Agent 3: Dev Progress Section ─────────────┐
│  TeamDevProgress.tsx + PlayersNeedingAttn   │ 2hr
└─────────────────────────────────────────────┘

┌─ Agent 4: Charts + Activity ────────────────┐
│  TeamStatsChart.tsx + TeamActivityFeed      │ 2hr
└─────────────────────────────────────────────┘

┌─ Agent 5: College Interest ─────────────────┐
│  CollegeInterestSummary.tsx                 │ 1.5hr
└─────────────────────────────────────────────┘

┌─ Agent 6: Integration ──────────────────────┐
│  Update TeamDashboardClient.tsx             │ 1hr
│  + Messaging/Calendar mode awareness        │
└─────────────────────────────────────────────┘

Wall time: ~4 hours
```

---

## Definition of Done

- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm build` passes
- [ ] JUCO coach in team mode sees premium dashboard
- [ ] College Interest section shows real engagement data
- [ ] Messaging filters by mode (recruiting vs team)
- [ ] Calendar shows mode-appropriate event types
- [ ] Mobile responsive (matches college dashboard)
- [ ] All commits use conventional format
- [ ] Components match existing glass card styling

---

Ready to execute?
