<!-- markdownlint-disable MD013 -->
# Tasks — `/golf/dashboard/tasks` (coach) · PHONE

Files: `src/components/fairway/pages/tasks/FairwayTasks.tsx` (phone branches only). Desktop (`tasks.md`) is in place: ViewHeader + overflow Menu, StatMatrix, Toolbar (search · status Segmented · Category FilterMenu), one Surface of seam rows, inline DrillPanel on desktop / Sheet on phone.

## What the phone capture shows (this branch, coach, 393×852)

StatMatrix 2×2 (Overdue in danger ink, tappable) ✓. The Toolbar is THREE lines: search; a lone "Category" pill; then the All/Active/Completed Segmented alone on a third line, pushed right (`viewToggle` = trailing cluster). Rows are title · due only — `tasks.md` asks for title · progress · due on phone (the n/total + Progress cell is `hidden sm:block`). Row tap → Sheet ✓.

## SCREEN (phone)

- Archetype: B, phone reading. Dominant: the task list. Supporting: StatMatrix. Tertiary: search, status, category.
- Floating: the dock only.
- Modal: task detail Sheet (existing); a matte status Sheet behind one "Status · {label}" control (new); the Category FilterMenu's PopoverPanel (existing).
- EXISTING FAIRWAY: ViewHeader, StatMatrix, Toolbar (+ViewToggle, FilterMenu), SearchField, Button, Sheet (+Body), InsetGroup, Progress, Chip, StatusPill.
- NEW FAIRWAY NEEDED: none.

## CONTAINERS TO CHANGE (phone)

1. Toolbar below `sm`: line 1 search; line 2 [Category] [Status · All]. The Segmented stays in the DOM in a `hidden sm:contents` wrapper (desktop, tests). The Status button opens a matte Sheet: one InsetGroup of All / Active / Completed rows (`aria-pressed`, check trailing, `selection` haptic, closes on pick) — the same pattern as the roster's sort Sheet.
2. Row below `sm`: a second line under the title with a slim `Progress` and "n/total", only when the task has assignment rows (never a fake 0/0). Due stays right-aligned on the first line.

## MOBILE

- 44 px: rows are ≥44 px PressTargets; Sort/Status/Category are `size="sm"` controls that clear 44 px under a coarse pointer via the recipe.
- Haptics: `selection` on status change from the Sheet.
- Context preservation: search, status, category live in FairwayTasks state; the detail Sheet and status Sheet leave them alone.
- Reduced motion: nothing added animates.
- Hydration: due labels already use `suppressHydrationWarning` with a mounted `now`.

## RISKS

- `FairwayTasks.render.test.tsx` pins the kebab "Manage task: …" buttons and "View overdue tasks"; not the toolbar. `FairwayTasks.logic.test.ts` is pure logic.
