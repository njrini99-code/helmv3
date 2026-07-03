# JUCO Player Dashboard — Implementation Plan

## Overview

JUCO players are **unique** — they have both:
1. **Team management** (like college players) — calendar, announcements, stats, dev plan
2. **Recruiting** (like HS/Showcase) — can be discovered by D1/D2/D3/NAIA coaches

They need a **premium experience in both modes**.

---

## Current State

### Sidebar Mode Toggle (Already Working)
```typescript
if (player?.player_type === 'college' || !player?.recruiting_activated) {
  return playerTeamNav;
} else {
  // JUCO/HS/Showcase with recruiting_activated = true
  return currentMode === 'recruiting' ? playerRecruitingNav : playerTeamNav;
}
```

### Existing Routes

| Mode | Route | Status |
|------|-------|--------|
| **Recruiting** | `/dashboard` | ✅ Basic player dashboard |
| **Recruiting** | `/dashboard/colleges` | ✅ Discover colleges (filters, cards) |
| **Recruiting** | `/dashboard/journey` | ✅ Track recruiting progress |
| **Recruiting** | `/dashboard/camps` | ❓ Needs verification |
| **Recruiting** | `/dashboard/analytics` | ❓ Needs verification |
| **Team** | `/dashboard/team` | ✅ College player dashboard |
| **Team** | `/dashboard/my-stats` | ✅ Just built |
| **Team** | `/dashboard/dev-plan` | ✅ Just built |
| **Team** | `/dashboard/videos` | ✅ Just built |
| **Team** | `/dashboard/profile` | ✅ Just built |

---

## What's Needed

### 1. JUCO-Specific Team Dashboard Enhancements

The team dashboard (`/dashboard/team`) for JUCO players needs:

| Feature | Description |
|---------|-------------|
| **Who's Looking** | Which college coaches viewed their profile (engagement events) |
| **Watchlist Status** | How many coaches have them on their watchlist |
| **Transfer Visibility** | "Your profile is visible to X coaches" |
| **Quick Recruiting Stats** | Profile views, watchlist adds, messages (even in team mode) |

### 2. College Discovery Enhancements (Recruiting Mode)

The `/dashboard/colleges` page exists but needs:

| Feature | Description |
|---------|-------------|
| **Division filtering** | Filter by D1, D2, D3, NAIA, JUCO (already works) |
| **Geographic sorting** | Sort by distance from player |
| **Interest indicators** | Show if coach has viewed player / added to watchlist |
| **"They're looking at you"** | Highlight schools that have engaged |

### 3. Player Profile for Coaches

When coaches view a JUCO player, they see:

| Section | Description |
|---------|-------------|
| **Header** | Photo, name, position, school, grad year |
| **Stats** | AVG, OBP, SLG, Exit Velo, etc. |
| **Videos** | Highlight reels |
| **Academic** | GPA (important for JUCO transfers) |
| **Contact** | Message button (if recruiting_activated) |

This likely already exists — need to verify.

---

## Implementation Plan

### Phase 1: Enhance JUCO Player Team Dashboard (1.5hr)

Create `JucoPlayerTeamDashboard.tsx` with:
- All college player features (stats, dev plan, announcements, calendar)
- PLUS: "Recruiting Snapshot" card showing:
  - Profile views this week
  - Watchlist count
  - Schools looking at you (top 3)
- PLUS: Link to switch to recruiting mode

### Phase 2: Enhance Recruiting Dashboard (1hr)

Add to the main `/dashboard` player page:
- "Schools Interested in You" section
- Engagement summary card
- Quick link to team features

### Phase 3: Verify/Enhance College Discovery (30min)

Check `/dashboard/colleges`:
- Sorting options (add distance)
- "Interested in You" badges
- Coach engagement indicators

### Phase 4: Verify Player Public Profile (30min)

Check what coaches see when viewing a JUCO player profile.

---

## File Structure

```
src/app/baseball/(dashboard)/dashboard/
├── page.tsx                          # Player recruiting dashboard
├── team/
│   ├── page.tsx                      # Routes to TeamDashboardClient
│   ├── TeamDashboardClient.tsx       # College + JUCO player team dashboard
│   └── JucoPlayerDashboard.tsx       # NEW: JUCO-specific team dashboard
├── colleges/
│   └── page.tsx                      # Discover colleges
├── journey/
│   └── page.tsx                      # Recruiting journey tracker
├── analytics/
│   └── page.tsx                      # Player analytics (views, engagement)
├── my-stats/
│   └── page.tsx                      # Player's own stats
├── dev-plan/
│   └── page.tsx                      # Player's development plan
├── profile/
│   └── page.tsx                      # Player profile editor
└── videos/
    └── page.tsx                      # Player videos
```

---

## Server Actions Needed

```typescript
// src/app/baseball/actions/player-dashboard.ts

export async function getJucoPlayerDashboardData() {
  // Team features
  const teamData = await getPlayerTeamData();
  
  // Recruiting snapshot (even in team mode)
  const recruitingSnapshot = {
    profileViews: number,
    profileViewsChange: number,
    watchlistCount: number,
    schoolsInterested: CollegeInterestItem[],
    unreadMessages: number,
  };
  
  return { ...teamData, recruitingSnapshot };
}

export async function getCollegesLookingAtMe(playerId: string) {
  // Query baseball_player_engagement_events
  // Join with baseball_coaches for school info
  // Return schools with their engagement level
}
```

---

## Execution Order

1. **Create server action** `player-dashboard.ts` (30 min)
2. **Create JucoPlayerDashboard** with recruiting snapshot (45 min)
3. **Update TeamDashboardClient** to route JUCO players (15 min)
4. **Enhance colleges page** with "interested" badges (30 min)
5. **Verify analytics page** works (15 min)
6. **Test mode toggle** (15 min)

**Total: ~2.5 hours**

---

## Definition of Done

- [ ] JUCO player in team mode sees recruiting snapshot
- [ ] JUCO player in recruiting mode sees full recruiting dashboard
- [ ] Mode toggle works smoothly
- [ ] Colleges page shows which schools are interested
- [ ] All existing team features work (stats, dev plan, etc.)
- [ ] `pnpm build` passes
