<!-- markdownlint-disable MD013 -->
# Tasks, v3 (the field-sheet pass)

Supersedes `tasks.md` / `tasks.mobile.md`. Those specs replaced eight category
pills and nine task cards with a `StatMatrix` of four stat cells, a `Toolbar`,
and one `Surface` of seam rows, a cleaner grid of the same idiom the owner
rejected: a masthead, then rounded boxes holding a number or a list. Read
`LANGUAGE.md` first; this spec applies it. Every field cited below is read
from the files listed, at the lines given, on this branch today.

## The question

Who is behind on the work I assigned, how late are they, and what has no
due date or no owner at all.

## Masthead

Bare on the canvas, no plinth. Two role variants share one shape; the coach
variant is normative, the player variant is noted inline.

- **Eyebrow**: `TASKS`. `FairwayTasksProps` carries no team name or date
  (`FairwayTasks.tsx:154-188`: only `role`, `teamId`, `tasks`, `stats`,
  `players`, `error`), so unlike Home's `{date} · {team.name}` this is a bare
  section label per the anatomy's "eyebrow (date **or** section)" allowance.
- **Title**, `text-display`: `Team to-dos.` (coach) / `Your to-dos.` (player),
  unchanged copy (`FairwayTasks.tsx:411`).
- **Verdict**, `text-h3` regular, max 64ch, built only from `tasks` and
  `stats`:

  > `{overdueCount} {overdueCount===1 ? 'task' : 'tasks'} overdue.
  > {worstPlayer.name} is furthest behind, {worstDays} {worstDays===1 ?
  > 'day' : 'days'} late on "{worstTask.title}." {activeCount} still open,
  > {stats.completion_rate}% of all tasks done.`

  Where:
  - `overdueCount = stats.overdue_tasks` (`use-task-realtime.ts:124`, mirrors
    the existing `overdueCount` at `FairwayTasks.tsx:327`).
  - `worstPlayer`/`worstDays`/`worstTask` are the single worst offender: among
    every task whose `due_date` is before `now` and `status !== 'completed'`
    (the same predicate as the existing per-row `isOverdue`,
    `FairwayTasks.tsx:771-781`, built on `parseDueDate`,
    `FairwayTasks.tsx:679-686`), for each incomplete
    (`assignment.status !== 'completed'`) assignment
    (`TaskAssignment.status`/`.player`, `FairwayTasks.tsx:108-117`), compute
    `daysLate = floor((now - due_date) / day)` and keep the single largest.
    This is the exact same computation the stage uses for its "Worst late"
    column (below): one function, two call sites, so the masthead can never
    disagree with the instrument under it.
  - `activeCount` = count of `tasks` where `status === 'active'`
    (`FairwayTasks.tsx:275`, already the normalized value `page.tsx:69` sets).
  - `stats.completion_rate` (`use-task-realtime.ts:117-124`) is completed
    over **every task the team has ever had**, not a windowed or "this
    cycle" figure; the verdict must not claim a period the field doesn't
    carry. "Done" alone, qualified by "of all tasks," is the honest reading.
  - Player names are `Link`s to `/golf/dashboard/roster/{assignment.player.id}`
    (route confirmed at `src/app/golf/(dashboard)/dashboard/roster/[id]`),
    mirroring `buildVerdict`'s pattern (`coach-home-logic.ts:170,178`). Task
    titles and counts are plain mono, not links; the rule only binds names.
  - **Missing facts, in order of precedence:**
    - `tasksError` set renders `Couldn't load tasks.` (echoes the existing
      `InlineNotice` copy, `FairwayTasks.tsx:425-434`) so the verdict never
      quotes a number the page is simultaneously reporting as unreliable.
    - `tasks.length === 0` renders `No tasks yet.`
    - `overdueCount === 0` renders `Nothing overdue. {activeCount} open,
      {stats.completion_rate}% of all tasks done.`
    - `overdueCount > 0` but every overdue task has `assignments.length === 0`
      (a real, common shape: `createTask` only inserts assignment rows when
      `assignToPlayerIds` is non-empty, `tasks.ts:347`, so a team-wide task
      has none) leaves no player to name, so the verdict falls back to:
      `{overdueCount} {tasks/task} overdue, all team-wide with no single
      assignee to flag. {activeCount} still open,
      {stats.completion_rate}% of all tasks done.` Never invent a name.
  - **Player role**: same shape, first person, no third-party name to link
    (there is none to name): `{overdueCount} of yours {is/are} overdue,
    worst is {worstDays} days late on "{worstTask.title}." {activeCount}
    left, {stats.completion_rate}% done.` `0` tasks renders
    `Nothing assigned yet.`
- **Facts line**, mono caption (pattern: `FairwayCoachDashboard.tsx:330-337`):
  `{tasks.length} total · {categories.length} categories`, both real
  (`categories`, `FairwayTasks.tsx:289-295`).
- Actions on the eyebrow row unchanged: primary `Create task`
  (`FairwayTasks.tsx:354-367`), overflow `Menu` with `From template`
  (`FairwayTasks.tsx:369-384`).

## The stage

The one `Surface`. Its instrument is **Due field**, a new page-local
instrument (`pages/tasks/DueField.tsx`) built on the same percentage-geometry,
motion and token vocabulary as `ScoreField.tsx`: one row per lane on a shared
date axis, marks with position/height/color, its own axis, not a reuse of
`ScoreField` itself, because the axis anchor differs (see below).

**Why not `MatrixBoard`** (registry-listed for "who needs attention" /
"triage", `registry.ts:83-84`): it ranks rows by severity but carries no time
axis. This page's question is not just *who* is behind, it's *by when*:
whether the next crunch is tomorrow or in three weeks, which only a date
axis answers.

**Lanes.** One lane per roster player (`players: FairwayTaskPlayer[]`,
`FairwayTasks.tsx:140-144`) who has **at least one open, dated** assignment:
`assignment.status !== 'completed'` on a task with a non-null `due_date`.
Players with none get no lane: a 20-player roster where six players carry
outstanding work shows six lanes, not twenty empty strips. Lanes sort worst
day-late first, then by open count, then alphabetically (the same ordering
rule as `attentionOrder`, `coach-home-logic.ts:121-125`), and, unlike
`attentionOrder`'s own default `limit = 5` (`coach-home-logic.ts:121`), carry
**no cap**: this stage is the whole point of the page, not a secondary read.

One **terminal lane, "Team-wide, no assignee,"** always last, below a
`border-border-strong` hairline, holding every open dated task with
`assignments.length === 0`. This lane follows the same existence rule as a
player lane above: it renders only when at least one open, dated,
no-assignee task exists to plot. An undated team-wide task does not summon
an empty strip on its own; it is fully accounted for by the "No due date"
ledger column and readout instead, never lost, only never drawn as a lane
with nothing in it. This is real, common data (`tasks.ts:347`, cited
above) and, once it renders, it can never be silently empty while dated team-wide tasks exist:
"six overdue tasks nobody owns" is exactly the pattern a per-player-only
view would hide. Its identity cell is plain bold text, no `Link`, no `Avatar`
(mirrors `ScoreField`'s `row.href ?  <Link>… : <span>…` fallback,
`ScoreField.tsx:238-244`, for a row with no page to point to).

**Axis.** Domain = earliest through latest `due_date` among every open, dated
task across every lane (player and team-wide), floored to at least one day
wide (the same `DAY_MS` floor as `dateFraction`, `ScoreField.tsx:40-46`).
Weekly ticks under 45 days, monthly beyond, with the same crowding-thinning
rule as `scoreFieldTicks` (`ScoreField.tsx:67-106`). Unlike `ScoreField`,
**Today is not pinned to the right edge**: due dates run into the future, so
Today is a vertical tick + label positioned by the same fraction function
wherever it actually falls in the domain, which is the one geometric reason
this needs a new instrument rather than reusing `ScoreField` outright.

**Marks.** Only open (incomplete) assignments are plotted; no fabricated
"on schedule" credit is invented for tasks not yet due beyond a plain tick,
and completed tasks are left off entirely to keep the strip about current
exposure, not history. Baseline sits at the row's vertical center, full
width, and is asymmetric on purpose (there is no honest "how far ahead"
magnitude the way a golf score has an under-par value):
- **Overdue** (`due_date < now`): a `bg-fw-warning` bar rising from the
  baseline, height `= min(daysLate, cap) / cap * 19px` (`HALF_HEIGHT_PX`,
  `ScoreField.tsx:27`), `MIN_BAR_PX = 2` floor. `cap = clamp(maxDaysLateAcrossAllMarks, 3, 21)`,
  the same clamp-to-readable-bounds pattern as `scoreFieldCap`
  (`ScoreField.tsx:49-53`), chosen so one 90-day-stale outlier doesn't flatten
  every other bar to a hairline and one 1-day-late task still reads as a real
  bar.
- **Not yet due**: a fixed `MIN_BAR_PX` neutral tick (`bg-text-tertiary/70`,
  `ScoreField.tsx:171`) sitting on the baseline at the due date's position;
  no magnitude, since "how far ahead" isn't a real quantity here; position
  alone (distance from the Today marker) carries the urgency.
- Same-day collisions nudge by `SAME_DAY_NUDGE_PX` (`ScoreField.tsx:29`).
- Colors are tokens only: `bg-fw-warning`, `bg-text-tertiary/70`,
  `bg-border-strong` baseline (`ScoreField.tsx:253`), `bg-accent-500` /
  `text-accent-700` Today marker (`ScoreField.tsx:293-294`).
- **Entrance motion**: the same `LazyMotion`/`m.span` scale-from-baseline,
  `EASE_CINEMATIC`, `DURATION.short`, staggered by a running index across
  every lane capped at 16 steps, gated by `useReducedMotionGuard()`
  (motion import, `ScoreField.tsx:22`; entrance block, `ScoreField.tsx:157-173`;
  `STAGGER_STEP`/`STAGGER_CAP`, `ScoreField.tsx:30-31`).
- **`now` is `null` for one tick after the page's loading gate clears**
  (`FairwayTasks.tsx:268-272`), and both the overdue classification and the
  bar height need it. Rather than a visible neutral-to-amber flip: every mark
  renders at its axis position in the neutral tick style on first paint, and
  once `now` resolves the marks that are actually overdue grow into their
  amber bar height through the same staggered entrance transition described
  above, so it reads as the instrument arriving, not correcting itself. The
  ledger's "Overdue now" column and the stage's "Worst late" numeral
  (below) read the same component `now`, so those two can never disagree
  with the marks or with each other. The Overdue **readout** (above) is the
  one exception, not covered by this tick: it reads `stats.overdue_tasks`,
  sourced from the hook's own fetch-time `now`
  (`use-task-realtime.ts:227,346`) and already resolved on first paint, so
  for that one tick the readout can show a nonzero overdue count while every
  mark on the stage is still drawn neutral. This is the "Two different
  `now`s" risk (below), visible here specifically at page load; see
  `newFields` for the `is_overdue` threading change that would let the stage
  classify overdue on first paint too, matching the readout instead of
  trailing it.

**Row-end columns** (mirrors `ScoreField`'s Avg/Trend pair,
`ScoreField.tsx:246-251`), mono tabular, no arrow glyphs (banned; the
existing `▲`/`▼` at `coach-home-parts.tsx:97-99` and `ScoreField.tsx:120-131`
are not to be repeated here):
- **Open.** Every incomplete assignment for that lane, dated or not. This
  can legitimately exceed the number of marks shown (e.g. "5 open" with only
  3 marks, because 2 of those 5 have no due date): the numeral is the true
  workload, the strip is only the dated slice of it.
- **Worst late.** That lane's single largest `daysLate` among currently
  overdue assignments, in `bg-fw-warning`-toned mono text (e.g. `9d late`);
  `on schedule` in `text-tertiary` when none are overdue. This is what keeps
  the read honest once the cap saturates a bar at 21 days: the exact number
  always sits beside it, the same division of labor as `TrendMark` carrying
  the delta next to `ScoreField`'s bars.

Both figures read `assignment` rows, which the terminal "Team-wide, no
assignee" lane by definition has none of (`assignments.length === 0`). For
that lane only, both are read off its own tasks directly instead: **Open**
is the count of open team-wide tasks in view, dated or not (the same
workload-vs-dated-slice distinction as a player lane: an undated team-wide
task still counts here even though it draws no mark), and **Worst late** is
the largest `daysLate` among that lane's own currently-overdue tasks,
computed from each task's own `due_date`/`status` rather than a nonexistent
assignment row.

**What a mark links to.** There is no `/golf/dashboard/tasks/[id]` route
(confirmed: no such directory exists under `src/app/golf/(dashboard)/dashboard/tasks`).
A mark is a real button, not a routed `Link`: clicking it opens the exact
same inline detail (`DrillPanel` on desktop, `Sheet` on phone; see Phone,
below, for how the desktop/phone choice itself is fixed) that a table row
opens for that task, with the same body (description, assignees, due,
category, `FairwayTasks.tsx:895-962`). Not every task clears that bar:
`canExpand` (`FairwayTasks.tsx:790`, `!!task.description || !!task.reminder_at
|| (role === 'coach' && hasAssignments)`) is false for a bare task with only
a title and a due date, and a team-wide task is `hasAssignments === false`
by definition, so this is the *default* state for the terminal lane above,
not a rare edge case. The existing row already disables its own affordance
rather than opening an empty panel in that case; a mark for such a task
follows the same rule and renders as a plain, non-interactive tick with only
a `title` tooltip (mirrors `ScoreField`'s own non-`Link` fallback for a round
with no `href`, `ScoreField.tsx:187-192`), never a button that opens nothing.
Every mark, expandable or not, carries a composed label string built the
same way `rollupPlayers` builds `plotted[].label` (`coach-home-logic.ts:93`:
date, title, due-date reading, days late), so the tooltip and screen-reader
text still deliver the fact even when no panel opens.

**Degrade.**
- **One lane.** Renders exactly like any other lane, nothing special:
  `ScoreField` already proves a single row needs no branch.
- **Open tasks exist, none are dated.** The axis and ticks still render (for
  shell consistency with the rest of the page) but carry zero marks in every
  lane; the stage body adds one honest line under the header, `No open
  tasks have a due date yet. See "No due date," right.`, pointing at the
  ledger column that actually lists them. No fabricated placement.
- **No open tasks at all** (everything completed, `tasks.length > 0`): same
  empty-axis shell, different honest line: `Nothing open right now.
  {stats.completed_tasks} completed.` (`stats.completed_tasks`,
  `use-task-realtime.ts:74,120`), a positive state, not phrased like a gap.
- **`players` is empty and no team-wide dated task exists either** (no
  roster loaded, true for every player-role viewer, `page.tsx:96-103`, or a
  coach with `teamId === null`): the stage swaps to the page-level
  `EmptyState` already used for `tasks.length === 0`
  (`FairwayTasks.tsx:440-459`).
- **`tasks.length === 0`**: the whole page swaps to the existing full-page
  `EmptyState` (`FairwayTasks.tsx:437-460`), unchanged; the masthead still
  renders with its `No tasks yet.` verdict.

**Player role.** Same instrument, one lane: the viewer's own tasks (`players`
is `[]` for a player viewer, so the roster-lanes model doesn't apply; the
hook already returns only their own assignment rows scoped by
`assignedToPlayerOnly`, `use-task-realtime.ts:213,230-283`). Labelled `You`,
not their own name (the synthetic assignment row the hook builds for a
player view carries empty `first_name`/`last_name` anyway,
`use-task-realtime.ts:279`). No team-wide lane on this variant: a team-wide
task the player is not individually assigned to isn't theirs to be "behind"
on.

**Why this instrument beats a table.** The table below already lists every
task; scanning it to notice a pattern is exactly the failure mode `ScoreField`
was built to fix on Home (`ScoreField.tsx:9-15`, "a coach reads the whole
roster's shape in one pass"). Here, a coach sees in one glance which bars are
tall and amber (badly overdue), which lanes carry only neutral ticks
(scheduled, not yet a problem), and which single lane at the bottom is real
work nobody owns, a read no amount of scrolling a task list delivers as
fast.

## Readouts

At most four, in the stage's right column on desktop. The stage's outer
container is Home's own split, reused verbatim, never a new breakpoint: `grid
grid-cols-1 xl:grid-cols-[minmax(0,1fr)_15rem] xl:divide-x
xl:divide-border-subtle` (`FairwayCoachDashboard.tsx:396`), so the instrument
never shares a row with a starved 15rem column below `xl`. `FieldReadouts`
itself (`coach-home-parts.tsx:102-134`, reused verbatim) already carries the
anatomy's own fallback inside that one component: `grid-cols-2` below `md`,
a `md:grid-cols-4` four-across band from `md` to `xl`, and the right-column
`xl:flex xl:flex-col xl:divide-y` stack at `xl` and above
(`coach-home-parts.tsx:113`). Its `note`-only branch, already exercised by
Home's `Rounds` readout with no series, `FairwayCoachDashboard.tsx:210-216`,
is exactly the shape every readout below needs, since none has a historical
series to sparkline.

| Readout | Source field | Delta |
|---|---|---|
| Open | `tasks.filter(t => t.status === 'active').length` (`FairwayTasks.tsx:275`) | None. No historical snapshot of this count exists; showing a trend would fabricate one. |
| Overdue | `stats.overdue_tasks` (`use-task-realtime.ts:124`) | None, same reason. Amber-toned value when `> 0`. |
| Completed | `stats.completion_rate` (`use-task-realtime.ts:117-124`), `%` unit | None. Note reads "of all tasks": the field is lifetime, not windowed; never say "this week/cycle." |
| No due date | new pure count: `tasks.filter(t => t.status !== 'completed' && !t.due_date).length`, derived entirely from the existing, already-nullable `FairwayTask.due_date` (`FairwayTasks.tsx:123`); no loader change | None. Note: "excluded from the stage"; this readout exists specifically so the stage's exclusion is never silent. |

## The ledger row

Three bare columns, `5 / 4 / 3` of a 12-column grid at rest, built on the same
breakpoint shape as Home's own ledger row (`FairwayCoachDashboard.tsx:434`:
`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 xl:divide-x
xl:divide-border-subtle`), never `lg:`: at 1024 a three-column split this
narrow would squeeze "By category" and "No due date" down to a character or
two, exactly the failure `LANGUAGE.md:47-52` names for this width. Below
`md`: one column, stacked, hairlines run horizontal (see Phone). From `md` to
`xl`: two columns, "Overdue now" and "By category" side by side, "No due
date" spanning both beneath them (`md:col-span-2`, the same
third-column-spans-both shape as Home's own `NotificationsLatestModule`,
`FairwayCoachDashboard.tsx:446`). At `xl` and above: the true `5 / 4 / 3`
split (`xl:col-span-5` / `xl:col-span-4` / `xl:col-span-3`), vertical
hairlines return. Filters (search, status, category; see The table) do not
narrow these columns; they always reflect the full current dataset, the same
way the stage does.

1. **Overdue now** (5). Every task where `isOverdue` (the shared predicate,
   `FairwayTasks.tsx:771-781`), sorted worst-first. Each row: title (button,
   opens the same inline detail as a stage mark/table row, see above), days
   late as a plain mono amber numeral (e.g. `9d`), category as plain trailing
   text when present. No bar widget in this row: `MicroBar` (`registry.ts:216`)
   is a zero-centered, bidirectional comparison primitive, fill growing left
   or right of a real zero baseline depending on sign. "Days late" is a
   one-sided magnitude with no such baseline; every value here would push the
   bar the same direction and its left half would never fill, a mechanism
   doing nothing, which is the "decoration wearing an instrument's name"
   failure this pass exists to remove. The numeral alone is the honest,
   sufficient read. This is the one place the specific overdue *tasks* are
   named; the stage only shows aggregate bar height per lane, never a title.
2. **By category** (4). `tasks` filtered to `status !== 'completed'`, grouped
   by `category` (including the `UNCATEGORIZED` sentinel bucket,
   `FairwayTasks.tsx:221,281-296`, recomputed here on the open subset rather
   than all tasks). Each row: category name, open count in mono, a link that
   sets the table's category filter to just that value. The stage has no
   category dimension at all; this is the only place it exists.
3. **No due date** (3). `tasks` where `status !== 'completed' && !due_date`,
   the same set the readout counts. Each row: title (opens the same inline
   detail), assignee count. These tasks are structurally excluded from the
   stage's axis; this column is where they live instead.

No column repeats a stage number except by construction: a task's own days
late in column 1 coincides with its lane's stage "Worst late" figure only
when that task happens to be its lane's worst, because both are the same
`daysLate` computation read at two grains (per task here, per lane on the
stage). The two can never quietly disagree; they are never a second,
independent count of the same thing.

## The table

`Open tasks`, dense `<table>` per the anatomy: uppercase caption header over
a `border-strong` rule, hairline rows, mono numerals right aligned. Its own
control row above it carries the existing search field, status `Segmented`,
and category `Toolbar.FilterMenu` (`FairwayTasks.tsx:466-505`, unchanged
logic); these narrow the table only, not the stage or ledger.

Columns: **Title** (left), **Assignees** (`n/total`, mono, right, hidden
below `md`), **Due** (mono, right, `text-fw-warning-ink` when overdue via the
shared predicate), **Category** (left, plain text, hidden below `md`),
**Actions** (right, hidden below `md`: coach's reminder/delete `Menu`
[`PopoverPanel.Item`s, `FairwayTasks.tsx:1076-1093`] or player's `Mark
complete` button [`FairwayTasks.tsx:1096-1109`]). No embedded `Progress`
bar widget in the Assignees cell; the stage already visualizes load and
urgency, so the table's job is the plain numeral (`Progress`'s current use at
`FairwayTasks.tsx:987-994,1010-1016` is retired, see below).

**Row link.** The whole row opens the same inline detail a stage mark opens;
there is no per-task page to navigate to (confirmed above), so "one row is
one link" means one shared detail affordance, not a URL.

**Row count.** Every task matching the current search/status/category
filter: no ten-row cap and **no "View all N" link**. Unlike Home's
recent-rounds preview, this table already is the canonical full list of the
team's tasks, and no `/tasks/[id]` or an all-tasks route exists to send a
"view all" link to (confirmed by directory search). Search, status and
category are the narrowing mechanism in place of pagination.

## Phone

Same order, one column.

- Masthead: verdict wraps naturally at 64ch's mobile width; unchanged.
- Stage: lane identity sits above its strip (the same stacking `ScoreField`
  uses on phone), strips stay a 44px touch target. Readouts become a 2×2
  typographic grid above the instrument (`FieldReadouts`'s own
  `grid-cols-2` branch, `coach-home-parts.tsx:104`, already does this, no
  new markup). The Today marker and ticks keep their positions; nothing about
  the axis changes shape, only the identity/strip stacking.
- Ledger: the three columns stack with horizontal hairlines
  (`divide-y`/`border-t` in place of `divide-x`), same row order.
- Table: hides Assignees, Category and Actions below `md`
  (`hidden md:table-cell`). Today's row cells fold at `sm` instead
  (`FairwayTasks.tsx:1005,1039,1063`); this table widens that threshold to
  `md` to match the anatomy's table breakpoint used everywhere else in this
  pass. A coach's manage `Menu` folds into the row's own detail affordance
  exactly as it does today (kebab hidden below `sm`,
  `FairwayTasks.tsx:1062-1063`), and a player's `Mark complete` button stays
  visible at every width, also unchanged (`FairwayTasks.tsx:1096-1109`,
  documented at the file's own "ROLE FORK" comment, lines 27-37).
- **Every branch above is CSS-gated: `hidden`/`md:table-cell`/`sm:block`
  classes only.** This is a real change from today's code, not a
  continuation of it: see the first item under "What this deletes."

## What this deletes

- **The `useMediaQuery`-driven desktop/phone branch:** `DESKTOP_QUERY`
  (`FairwayTasks.tsx:226-227`), `isDesktop`
  (`FairwayTasks.tsx:737`), `handleRowActivate`'s `if (isDesktop)`
  (`FairwayTasks.tsx:792-798`), and the two mutually-exclusive render
  branches `{isDesktop && …}` / `{!isDesktop && …}`
  (`FairwayTasks.tsx:1113,1133`). This is a live violation of the language's
  own rule ("a client-only breakpoint branch," banned,
  `LANGUAGE.md:85-88`), and it predates this pass. Fix: one `expanded`
  boolean, no media query, with **both** render targets always in the tree:
  the inline detail wrapped in `hidden md:block`, the `Sheet` wrapped in
  `md:hidden`, so CSS alone decides which one is visible, exactly the
  pattern the table and stage already need for their own responsive splits.
- `StatMatrix` and its four stat cells (`FairwayTasks.tsx:79,328-352`),
  replaced by `FieldReadouts` inside the stage, matching Home's own choice
  not to use `StatMatrix` for exactly this kind of number
  (`FairwayCoachDashboard.tsx` imports `Surface`/`Segmented`/etc. but never
  `StatMatrix`).
- The `Surface`-of-seam-rows task list (`FairwayTasks.tsx:544-558`,
  `<Surface … className="divide-y …">` wrapping `FairwayTaskRow`), replaced
  by the dense `<table>` per the anatomy's fourth region.
- The per-row `Progress` bar widget (`FairwayTasks.tsx:987-994,1010-1016`),
  replaced by the plain `n/total` numeral in the table's Assignees column;
  load and urgency are now the stage's job.
- The standalone `Toolbar` block sitting between `StatMatrix` and the list
  (`FairwayTasks.tsx:467-505`) as an independent page region: its search/
  status/category controls survive verbatim but move to sit directly above
  the table as its control row, since they now scope only the table.
- The existing `ViewHeader` meta string `{tasks.length} open`
  (`FairwayTasks.tsx:417`): `tasks.length` is every task regardless of
  `status`, so that copy has always overclaimed. Do not carry the string
  forward; the facts line above already gets the label right (`{tasks.length}
  total`), and the Open readout separately gets the true open count
  (`tasks.filter(t => t.status === 'active').length`).

Unchanged: the create-task modal, the templates `Sheet`, the header overflow
`Menu`, the reminder/delete actions, the player `Mark complete` flow, and the
detail body's description/assignees/message-deep-link content; none of that
was part of the card problem.

## Risks

- **Two different `now`s.** `use-task-realtime.ts` computes its own
  `now = new Date()` inside `fetchTasks` (`use-task-realtime.ts:227`, reused
  at `249,346`) to produce `stats.overdue_tasks` and each task's
  `is_overdue`, while the component keeps a separate `now` state set once on
  mount (`FairwayTasks.tsx:268-272`) for row-level display. The stage,
  ledger and table specified here all read the **component's** `now` for
  internal consistency with each other, but that value can drift from the
  hook's fetch-time `now` if the page is left open across a day boundary
  before the next realtime refetch; the readout's `stats.overdue_tasks`
  and the stage's own overdue marks could disagree for that window. Worth a
  short-lived clock refresh (e.g. re-run the `now` effect on an interval) if
  this proves visible in practice; not fixed by this spec.
- **`FairwayTaskPlayer` has no `avatar_url`** (`FairwayTasks.tsx:140-144`,
  `loadPlayers`'s select at `page.tsx:126` only pulls `id, first_name,
  last_name`), so every lane's `Avatar` renders initials only, unlike Home's
  roster rows which do carry a photo. Cosmetic, not a defect; see
  `newFields` if a photo is wanted later.
- **Lane population depends on `assignments`, which is per-task, not
  per-player-cached**: a large team with many tasks re-derives lanes from
  scratch on every `tasks` change (already the shape of `rollupPlayers` on
  Home, `coach-home-logic.ts:57-108`; same cost profile, not new).
- **The verdict's "every task the team has ever had" is an overclaim today.**
  The coach-view `golf_tasks` query (`use-task-realtime.ts:289-293`) is a
  plain `.select(TASK_COLUMNS)` with no row cap handling, while the sibling
  `golf_task_assignments` query right next to it explicitly wraps itself in
  `fetchAllRowsResult` (`use-task-realtime.ts:306-310`) to get past Supabase's
  default row cap. A team old enough to clear that cap on tasks alone would
  have `stats.completion_rate` silently computed over a truncated set, not
  the lifetime total the masthead and readout both claim. Not a rendering
  change this spec makes; the honest fix is giving `golf_tasks` the same
  `fetchAllRowsResult` treatment its sibling query already has.
- **`newFields`**, both genuinely absent today and neither a blocker: the
  composition above is complete without them.
  - `FairwayTaskPlayer.avatar_url` (not required by this spec): would need
    `avatar_url` added to `loadPlayers`'s `.select(...)` (`page.tsx:126`) and
    to the `FairwayTaskPlayer` interface (`FairwayTasks.tsx:140-144`);
    `golf_players.avatar_url` already exists and is read elsewhere
    (`RosterEntry`, `coach-home-logic.ts:14,99`), so this is a query/type
    change only, not a schema change.
  - **A stored daily snapshot of task stats** (not required by this spec):
    the only way any readout above could honestly carry a delta/trend.
    `computeTaskStats` (`use-task-realtime.ts:103-126`) produces a live
    snapshot every fetch but nothing persists it; without a new stored
    series, every readout here stays a bare number, which is the correct,
    honest choice made in this spec rather than a gap to route around.
