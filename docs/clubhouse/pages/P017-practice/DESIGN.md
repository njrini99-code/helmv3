# P017 — Practice: design handoff

## Package

```text
Source:  design-refresh/practice-plan/ (redesign/coachhelm-practice.html, scenes 4 and 5;
         05-SCREENS.md S-PRC rows for the screens that page does not draw: home, library, run, print)
Version: 31 Oct 2026 plan, replaced by 05 to 08 (README of the package); redesign package committed 2026-11-04
Status:  review (no owner board in design/handoff; no owner phone board, phone/practice.md is a draft)
```

## What the build is missing against the design

[GAP.md](GAP.md) is the 10 to 11 Nov 2026 comparison of the build with the design,
kept whole: 31 rows, what is closed and what is still open (the helper's
class-time fact, landscape paper for the range board, "Save as PDF" not opened,
two shared-primitive requests).

## Design objective, user goal

A coach plans a practice as blocks, groups and drills, publishes it, runs it on
the day and prints it; a player sees only what to do (PAGE.md, "What a player
gets"). Players never see a Why line, the Aim or another group's stops.

## Components

Reused Clubhouse primitives: `FormSheet`, `Modal`, `SectionBoundary`,
`RefreshNotice`, `EmptyState`, `Segmented`, `DateField`, `TimeField`, `Toast`.
Practice's own: `DayStrip`, `Builder` and its sheets, `PlanRun`, `PrintStudio`,
`CoachPlanBar`, `LibraryPages`, `NewPlanSheet`. The plan sheet and the player's
plan page belong to `screens/coachhelm/plan/**` (P013).

## Motion, haptics, accessibility

Per `.claude/rules/clubhouse.md` and `design-refresh/practice-plan/07-MOTION.md`.
Reduce Motion and the largest Text Size were captured on Home, the builder and
Run (GAP.md, round two). Contract rows: CONTRACT.md categories 11 and 18.

## Data assumptions and existing backend

`golf_practice_plans`, `_plan_versions`, `_plan_lines`, `_plan_opens`,
`_plan_formats`, `golf_practice_groups`, `golf_practice_templates` and
`golf_team_drills`, through `src/lib/golf/practice-db.ts`. No class-time read
exists for the helper's third fact; nothing is invented.

## HELD requirements

None listed. The twelve migrations the build needs are recorded as applied in
`supabase/migrations/HELD.md` (PAGE.md, "Migrations"). Owner decision open:
the CH-17xxx numbering collision (PAGE.md).

## Explicit non-goals

No Fairway presentation or component is used; the shared reuse is non-UI.

```text
[x] No old Fairway presentation is required
[x] No old Fairway component is nested in the new screen
[x] Shared reuse is non-UI/headless infrastructure only
```
