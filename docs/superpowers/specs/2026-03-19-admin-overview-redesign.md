# Admin Overview Tab Redesign: "The Morning Briefing"

**Date:** 2026-03-19

---

## Goal

Replace the current cluttered admin Overview tab with a clean, narrative-style daily/weekly briefing that a developer/business owner can glance at and know exactly where their platform stands.

## Design Principles

1. **Resolved = gone.** No dismissed alerts, no resolved incidents, no "all clear" banners.
2. **Numbers are real.** Every metric queries live data.
3. **Narrative over cards.** One cohesive briefing, not 8 separate card components.
4. **Action items are separate.** "Needs Attention" only shows actionable items. 0 = hidden.
5. **Activity is chronological.** Grouped by day. Scores shown. Errors highlighted.

---

## Architecture

### Zone 1: Status Bar (compact, always visible)

Single row showing 4-5 key metrics inline:
- Health status dot (green/amber/red) with label
- Open incidents count
- Active users (this week)
- Rounds this week
- Last updated timestamp

No cards. No padding. Just a clean horizontal bar with `glass-premium` background.

### Zone 2: The Briefing (main scrollable content)

A single `OverviewBriefing` component that renders topic sections as clean typographic blocks:

**Section: Platform Summary**
- Health score (X/100) with color
- Total users with role breakdown
- Weekly active count with WoW trend
- Stuck onboarding count (if > 0)
- Inactive users count (if > 0)

**Section: Rounds**
- Rounds submitted this week
- Stuck in-progress rounds (player name, hole, idle time) — only if > 0
- Average score with trend

**Section: Errors**
- Unresolved incidents count — only if > 0
- Total errors logged (7d) as context
- Top affected route — only if errors exist

**Section: Growth**
- Signup → Active conversion rate
- Biggest funnel dropoff point
- Round volume trend

**Section: CoachHelm AI**
- Insights generated
- Round reviews count
- Players receiving insights

Each section: clean heading, indented stats, minimal decoration. No card borders — just typography and spacing.

### Zone 3: Needs Attention (only if items exist)

Red-tinted section showing actionable items only:
- Each item: description + [View →] button
- Items come from `needsAttention` array filtered to exclude resolved/dismissed
- Section completely hidden when empty

### Zone 4: Recent Activity

Chronological feed grouped by day:
- Date headers: "Today", "Yesterday", "Mar 17"
- Round submissions: show player name + score + course
- Errors: red-tinted with route
- Logins: de-emphasized (smaller, muted)
- Stuck rounds: amber warning with idle time

### Zone 5: Deep Dives (collapsed)

Expandable sections for detailed views:
- User Funnel (the conversion visualization)
- Daily Charts (sparklines)
- Platform Health Details (infra metrics)

Each collapsed by default. Click to expand. Not critical for the morning glance.

---

## Components

### New Components
- `StatusBar.tsx` — compact horizontal status row
- `OverviewBriefing.tsx` — the main narrative briefing
- `NeedsAttentionSection.tsx` — actionable items only
- `RecentActivityFeed.tsx` — chronological grouped feed
- `DeepDiveAccordion.tsx` — collapsible detail sections

### Existing Components to Keep (moved into DeepDives)
- `UserFunnelViz.tsx` — inside accordion
- `DailyCharts.tsx` — inside accordion
- `PlatformHealthCard.tsx` — inside accordion

### Components to Remove/Replace
- `CriticalAlertsBanner.tsx` — replaced by NeedsAttentionSection
- `AdminStatCard.tsx` — replaced by StatusBar + Briefing inline stats
- `ErrorSpotlight.tsx` — replaced by Errors section in Briefing
- `UserBreakdownCard.tsx` — replaced by inline stats in Briefing

---

## Data Flow

All data comes from existing `AdminDashboardData` — no new server actions needed.

```
getAdminDashboardData()
  ├── StatusBar: health, incidents, users, rounds
  ├── Briefing: users, rounds, errors, growth, CoachHelm
  ├── NeedsAttention: needsAttention[] filtered
  ├── ActivityFeed: activityFeed[]
  └── DeepDives: funnel, charts, health details
```

---

## Styling

- Status bar: `glass-premium rounded-2xl px-6 py-3`
- Briefing sections: no card borders, just `space-y-8` with section headings
- Section headings: `text-sm font-semibold uppercase tracking-wider text-warm-400`
- Stat values: `text-warm-900 font-semibold tabular-nums`
- Stat labels: `text-warm-500 text-sm`
- Needs Attention: `bg-red-50/50 border border-red-200/30 rounded-2xl`
- Activity feed: same grouped-by-day pattern with date pills
- Deep dives: `glass-premium rounded-2xl` with chevron toggle
