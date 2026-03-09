# Pencil Layer Annotation Conventions — GolfHelm

> When annotating layers in Pencil before sending to Claude Code, use these conventions.
> Annotations travel with the MCP data and give Claude context beyond what's visually apparent.

---

## How Annotations Work

In Pencil, you can add annotations to any layer by selecting it and adding a note. When Claude Code reads the design via `batch_get`, these annotations arrive as metadata alongside the node structure. This bridges the gap between "what it looks like" and "what it means."

---

## Naming Conventions

### Screens / Frames
Use this pattern: `[Product] / [Role] / [Page] / [State]`

```
GolfHelm / Coach / Dashboard / Default
GolfHelm / Coach / Intelligence / Loading
GolfHelm / Player / Hub / Empty State
GolfHelm / Player / Round Review / With Data
GolfHelm / Marketing / IG Feed / CoachHelm Feature
GolfHelm / Marketing / IG Story / Stats Showcase
```

### Components
Use this pattern: `[Feature] - [Component Type] - [Variant]`

```
CoachHelm - Insight Card - High Confidence
CoachHelm - Score Prediction - With Range
Stats - Scoring Average - Trend Up
Calendar - Event Card - Practice
Roster - Player Card - With Avatar
Round Review - Scorecard Strip - 18 Holes
```

### Annotation Text Patterns

When annotating layers for Claude Code, use structured notes:

#### For Implementation Guidance
```
@implement: Generate as a standalone React server component.
Uses Supabase query on golf_coach_insights table.
Props: coachId, dateRange.
```

#### For Design Intent
```
@intent: This card shows the top insight for the day.
Should feel urgent but not alarming — warm amber accent, not red.
Confidence bar uses green gradient proportional to accuracy.
```

#### For Data Binding
```
@data: golf_player_stats_cache
Fields: scoring_avg, rounds_played, gir_percentage, fairway_percentage
Refresh: On page load + after new round entry
```

#### For Interaction
```
@interaction: Click → navigates to /dashboard/insights/[id]
Hover → subtle lift (shadow-glass-lg) + border brightens
Long press (mobile) → shows quick preview tooltip
```

#### For Responsive Behavior
```
@responsive:
Desktop (1440+): 3-column grid, full sidebar
Tablet (768-1024): 2-column grid, collapsed sidebar
Mobile (<768): Single column, bottom nav replaces sidebar
```

---

## Annotation Tags Quick Reference

| Tag | Purpose | Example |
|-----|---------|---------|
| `@implement` | Code generation guidance | `@implement: Server component, query golf_rounds` |
| `@intent` | Design reasoning | `@intent: Premium feel, not corporate` |
| `@data` | Database binding | `@data: golf_predictions.predicted_score` |
| `@interaction` | Click/hover/gesture behavior | `@interaction: Click opens modal` |
| `@responsive` | Breakpoint rules | `@responsive: Hide on mobile` |
| `@state` | State variations | `@state: loading, empty, error, populated` |
| `@a11y` | Accessibility notes | `@a11y: role=navigation, aria-label="Main"` |
| `@animation` | Motion specification | `@animation: Enter from bottom, 300ms spring` |
| `@priority` | Build priority | `@priority: P0 — ship this week` |
| `@skip` | Don't implement | `@skip: Placeholder for future feature` |

---

## Example: Annotated CoachHelm Dashboard

```
Frame: "GolfHelm / Coach / Intelligence / Default"
├── Sidebar (ref: d5ZTS)
│   @implement: Reuse existing Sidebar component from src/components/golf/layout/
│   @responsive: Collapse to hamburger < 1024px
│
├── Main Content Area
│   @implement: Server component, fetch via intelligence-dashboard.ts action
│
│   ├── Header Row
│   │   @intent: Show AI status + quick actions, not decorative
│   │   ├── "CoachHelm Active" badge
│   │   │   @data: Real-time check — if V2 engine has run in last 24h
│   │   └── Quick Action Buttons
│   │       @interaction: "Generate Insights" → triggers V2 pipeline
│   │
│   ├── Insight Cards Grid (3-column)
│   │   @implement: Map over golf_coach_insights, sort by confidence DESC
│   │   @state: loading (3 skeleton cards), empty ("No insights yet"), populated
│   │   ├── Insight Card
│   │   │   @data: golf_coach_insights {title, description, confidence, category, players}
│   │   │   @interaction: Click → /dashboard/insights/[id]
│   │   │   @animation: Stagger enter, 50ms delay between cards
│   │   └── ...
│   │
│   └── Patterns Section
│       @implement: Query golf_patterns_v2, group by category
│       @intent: Coach sees team-wide patterns at a glance
│       @priority: P1 — enhance after insights are stable
```

---

## Workflow: Annotate → Send → Build

1. **Design in Pencil** using Lunaris components
2. **Name layers** using the conventions above
3. **Add @annotations** to key layers
4. **Send to Claude Code** via Pencil MCP — annotations arrive as node metadata
5. **Claude reads annotations** and generates implementation-ready code
6. **Review** — annotations serve as acceptance criteria

This turns your Pencil designs into living specs, not just pictures.
