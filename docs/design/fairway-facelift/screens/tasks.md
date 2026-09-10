<!-- markdownlint-disable MD013 -->
# Tasks — `/golf/dashboard/tasks` (coach)

Files: `src/components/fairway/pages/tasks/FairwayTasks.tsx` (1236), `FairwayTaskTemplateList.tsx`, `FairwayCreateTaskModal.tsx`.

## What the capture shows

Eyebrow, h1 "Team to-dos.", a primary pill, an overdue warning card, a status pill row, a search field, EIGHT category pills wrapping to three rows, then nine task cards (title, description, progress bar, due, category chip, "View details" toggle), a "Templates" card, and a "Quick stats" block of three mini cards at the very bottom — the numbers a coach wants first are last. 8,100px on a phone.

## SCREEN

- Archetype: B (operational board / list).
- Dominant object: the task list (one surface, seam rows).
- Supporting: StatMatrix (Open · Active · Completed · Overdue) under the header; overdue filter.
- Tertiary: templates (a Menu / Sheet from the header's overflow, not a card), category filter.
- Floating: dock; sticky Toolbar.
- Modal: create task (existing modal), task detail Sheet on phone / inline expand on desktop.

## EXISTING FAIRWAY

ViewHeader, StatMatrix, Toolbar (search · status Segmented · category Menu/FilterPill overflow · primary "Create task"), Surface, Progress (Phase 2; until it lands use the existing bar), StatusPill, Chip, Menu, Sheet, DrillPanel, InlineNotice, EmptyState.

## CONTAINERS TO REMOVE

1. Overdue warning card → the Overdue cell of the StatMatrix is the affordance (tone danger, tap filters to overdue). Keep one quiet InlineNotice only when overdue > 0 AND the filter is not already overdue? No — the cell is enough.
2. Eight category pills → a "Category" Menu in the Toolbar filters slot (multi-select, shows count), with the active category as one FilterPill.
3. Nine task cards → seam rows: title (one line) · assignee progress (n/total + slim Progress) · due (tabular, tone by overdue) · category Chip · overflow Menu. Description shows on expand.
4. Templates card → "From template" item in the header overflow Menu (opens the existing FairwayCreateFromTemplateModal / template list in a Sheet).
5. Quick stats mini-cards at the bottom → the StatMatrix at the top.

## COMPOSITION (desktop)

```text
ViewHeader  TASKS / Team to-dos. / 6 open                    [Create task] [⋯ From template]
StatMatrix  9 open · 6 active · 3 completed · 5 overdue (danger, tap → filter)
Toolbar     [🔍 title or description]  [All · Active · Completed]  [Category ▾]
Surface (rows)
  Submit Pre-Season Physical Clearance   7/7 ▮▮▮▮▮  Jul 11  compliance   ⋯
  Review Spring Tournament Schedule      7/7 ▮▮▮▮▮  Jul 16  administrative ⋯
  Update Yardage Book — Home Course      0/7 ▯▯▯▯▯  Jul 22 ⚠ practice     ⋯
  (row click → inline DrillPanel: description, assignees, actions)
```

Phone: StatMatrix 2×2; Toolbar = search + filter Sheet; rows compress to title · progress · due; tap → Sheet.

## STATES

- Empty: EmptyState "No tasks yet" with Create task.
- Loading: 8 row skeletons.

## RISKS

- 1236-line component with template and completion logic; composition only. Tests pin filter labels and the create modal.
