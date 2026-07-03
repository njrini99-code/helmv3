# CoachHelm UI Redesign — Consolidated UX Architecture Spec

**Date:** 2026-03-14
**Source:** 3 parallel UX architect agents (player, coach, data flow)

---

## The Problem

The V3 engine computes 30+ data types. The UI shows 5 of them. **60% of computed intelligence never reaches the screen.**

### Current Pipeline Gaps

| Data Type | Engine | Action | UI | Status |
|-----------|--------|--------|----|--------|
| Composed Insights | Yes | Yes | Yes | COMPLETE |
| Performance Predictions | Yes | Yes | Partial | Missing sensitivities, scenarios |
| Shot Patterns | Yes | Yes | Partial | No dispersion, dead zones |
| Z-Score Composites | Yes | No | No | **NEW - needs action + component** |
| Category Ratings | Yes | No | No | **NEW** |
| EWMA Baselines | Yes | No | No | **NEW** |
| Percentile Rankings | Yes | No | No | **NEW** |
| Anomaly Detection | Yes | No | No | **NEW** |
| Multi-Window Trends | Yes | No | No | **NEW** |
| Streak Detection | Yes | No | No | **NEW** |
| Regression to Mean | Yes | No | No | **NEW** |
| Yardage Curves | Yes | No | No | **NEW** |
| Dead Zones | Yes | No | No | **NEW** |
| Shot Sequence/Resilience | Yes | No | No | **NEW** |
| Scoring Opportunities | Yes | No | No | **NEW** |
| Tournament Simulation | Yes | No | No | **NEW** |
| Lineup Optimization | Yes | No | No | **NEW** |
| What-If Scenarios | Yes | No | No | **NEW** |
| Improvement Projections | Yes | No | No | **NEW** |
| Confidence Calibration | Yes | No | No | **NEW** |
| Coach Preferences | Yes | No | No | **NEW** |

---

## Architecture Decisions

### 1. Consolidate Coach Pages: 6 → 3

**Current (fragmented):**
- Intelligence, Alerts, Insights, Patterns, Analytics, Development = 6 separate pages

**Proposed:**
- `/dashboard/intelligence` — Team overview (health, urgent alerts, player grid)
- `/dashboard/players/[playerId]` — **NEW** Per-player deep-dive (all AI data in one place)
- `/dashboard/tournament` — **NEW** Simulation, lineup optimization, what-if

### 2. Per-Player Insight Page (Critical Missing Piece)

Currently coaches must jump across 5+ pages to understand one player. Alert "View Player" links 404.

**New page sections:**
1. Player header + composite rating (0-100) + category breakdown
2. Multi-window trend chart (fast/medium/slow) + streak status
3. Active patterns (stroke impact, lifecycle state)
4. Predictions + what-if scenario sliders
5. AI insights (filtered to this player, with evidence metrics)
6. Focus areas (with linked insights)
7. Shot analysis (yardage curves, dead zones, resilience)
8. Quick actions (message, schedule, create focus area — 1 click)

### 3. Player Dashboard Upgrade

**New components to add:**
1. `CompositeRatingCard` — Game strength 0-100 with category breakdown
2. `TrendDashboard` — Multi-window sparklines + streak indicator
3. `ShotAnalysisBreakdown` — Yardage curves, dead zones, weakness contexts
4. `WhatIfScenarioPanel` — Interactive improvement sliders
5. Evidence metrics rendered inside existing insight cards (currently hidden)
6. Focus area drill-down with composition breakdown

### 4. Server Actions Needed

| Action | Input | Output |
|--------|-------|--------|
| `getPlayerProfile()` | playerId | Z-scores, percentiles, baselines, composite |
| `getPlayerTrendAnalysis()` | playerId | Multi-window, streaks, regression |
| `getPlayerShotContext()` | playerId | Shot SG by situation, yardage curves, dead zones |
| `getCoachingOpportunities()` | playerId | Ranked improvements by impact/difficulty |
| `getTeamSimulation()` | teamId, config | Tournament sim, lineup optimization |

---

## Build Priority

### Phase 1: Per-Player Page + Actions (highest impact)
- Create `/dashboard/players/[playerId]` route
- Build `getPlayerProfile()` action (Z-scores, percentiles, baselines)
- Build `getPlayerTrendAnalysis()` action
- Build player header, composite rating, category breakdown, trend chart
- Fix broken "View Player" links in alerts

### Phase 2: Player Dashboard Upgrade
- Add CompositeRatingCard to player CoachHelm tab
- Add TrendDashboard (multi-window + streaks)
- Render evidence metrics in existing insight cards
- Add focus area drill-down with composition

### Phase 3: Shot Analysis + Scenarios
- Build `getPlayerShotContext()` action
- Build ShotAnalysisBreakdown component (yardage curves, dead zones)
- Build WhatIfScenarioPanel (interactive sliders)
- Build `getCoachingOpportunities()` action

### Phase 4: Tournament Simulation
- Build `/dashboard/tournament` page
- Build `getTeamSimulation()` action
- Lineup optimizer UI
- What-if team scenarios

### Phase 5: Feedback Loop UI
- Insight feedback buttons (helpful/not helpful)
- Prediction accuracy transparency
- Coach preference learning
- Confidence calibration display
