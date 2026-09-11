<!-- markdownlint-disable MD013 -->
# Player development v3 — `/golf/dashboard/coachhelm?view=development`

Spec only. Written against `LANGUAGE.md` (the composition contract) and
`IMPLEMENTING.md` (the mechanics). Supersedes `player-development.v2.md`,
whose RESULT section is the record of what is being replaced. Synthesized
from a three-concept design panel (The Ladder, Coach's Read, ProgressField),
data-truth checked against the code and judged by three lenses; the panel
split 2 to 1 for Coach's Read, and this spec takes it as the base with the
grafts and kills recorded at the end.

## The first question

"What am I working on, and is it moving?"

## The host inversion (read this before anything else)

The live route is `host="stage"`: `PlayerCoachHelmHome` mounts
`FairwayMyDevelopmentStage`, which wraps the whole body in `DrillPanel`
(`FairwayMyDevelopment.tsx:573-581`). `DrillPanel` is itself a bordered,
shadowed Surface with its own title row (`modules/DrillPanel.tsx:28-53`:
`rounded-fw-lg border border-border-subtle bg-surface` plus
`--fw-shadow-card`, printing `title="Development"` and the actions chip).

So on the route a player actually uses, **DrillPanel is the page's one
Surface**. The language's "one stage Surface" is therefore already spent
before this component renders a single node. Two consequences, both binding:

- The stage instrument renders **bare** under `host="stage"` (no border, no
  background, no shadow). A Surface there is a nested card, the first ban on
  the list. Under `host="page"` (the preview shell, `CoachHelmShell`) the
  stage takes its own Surface, because nothing else on that route is one.
  The `frame` prop that switches this carries a loud comment: a future edit
  that "restores" a missing border on the stage host silently reintroduces
  the violation.
- The masthead does **not** print an eyebrow or a title. DrillPanel already
  prints "Development" one line above, and `CoachHelmShell` prints "My
  Development / Your focus areas" on the preview host. A second title is
  duplication, not anatomy. The masthead here is the verdict sentence and a
  facts line, nothing else.

This is the one place this screen deviates from `LANGUAGE.md`'s literal
anatomy, and it deviates in order to obey the ban it would otherwise break.

**Re-scoping DrillPanel to wrap only the instrument was considered and
rejected on evidence.** The question was whether DrillPanel is mis-scoped
here or is shared chrome. It is shared chrome: all four sibling drills wrap
their entire view in it with the same shape (`ProfileDrill.tsx:251`
`title="Game profile"`, `StandingDrill.tsx:70` `title="Standing"`,
`InsightsDrill.tsx:121` `title="Insights"`, `DeepDiveDrill.tsx:30`
`title="Deep dive"`), and `StageRouter.tsx:92` names the DrillPanel back chip
as a `useStage()` consumer by design. Narrowing it for development alone would
put the back affordance in a different place on one of five sibling views.
The bare-stage solution above stands.

## Data (every field verified in the tree, nothing new fetched)

Props are `FairwayMyDevelopmentProps` (`FairwayMyDevelopment.tsx:113-160`),
passed from `PlayerCoachHelmHome.tsx:357-369`.

| Field | Source | Used for |
| --- | --- | --- |
| `activeAreas: FocusAreaCardData[]` | `FairwayMyDevelopment.tsx:115` | the stage's rows |
| `completedAreas` | `:117` | the facts line count, and their readings in the table |
| `proposedAreas` | `:119` | Decisions column (accept/decline a focus area) |
| `goals: FairwayGoalCardData[]` | `:131` | Goals column. **`{goal, standing}`**, so every read goes through `.goal.` |
| `achievedGoals` | `:151` | Goals column, recent wins |
| `suggestions: GoalSuggestionView[]` | `:133` | Decisions column (accept/dismiss a **goal suggestion**, a different action pair) |
| `causalRelationships` | `:145` | Why column |
| `standingByMetric` | `:138` | the area Sheet, unchanged |
| `playerId`, `playerStats`, `loadError` | `:121,:123,:125` | create flow and the failed-read state, unchanged |

Per focus area (`FocusAreaCardData`, `FocusAreaCard.tsx:130-193`):
`title`, `target_metric`, `current_value`, `target_value`, `baseline_value`,
`started_at`, `completed_at`, `snapshots[{date,value}]`, and
`progressHistory: FocusAreaProgressEntry[]` where an entry is
`{at, value, note?}` (`FocusAreaCard.tsx:117-123`). The route builds
`progressHistory` from the `progress_notes` jsonb
(`coachhelm/page.tsx:152-156`, `:379`), so **`note` is populated and is real
copy a player wrote**. That is what makes the table below evidence rather
than a restatement.

Derivations that already exist and are reused verbatim, never re-derived:
`getProgressPercent(current, target, targetMetric, baseline)`
(`areaTypes.ts:361-387`), `resolveMetricDirection` (`areaTypes.ts:308`),
`getMetricRenderConfig` / `formatValue` for units,
`focusAreaTrendEntries(fa)` (`FocusAreaCard.tsx:375-390`) for the merged
per-day reading series, `ladderOrder` and `pickLeadArea`
(`development-parts.tsx:501-514`, `:693-718`), and `progressPct(goal)`
(`FairwayGoalCard.tsx:169-177`) for goals.

**Not available, do not design against it.** `outcome_status` is a real
column on `golf_coach_insights` and a real field on `FocusAreaCardData`, but
this route's select (`coachhelm/page.tsx:341-347`) does not read it: grep
returns zero occurrences in that file. Any completed-area "outcome" word is
a fabrication here. Deferred follow-up, named and not built.

**Two progress derivations exist and they are not the same function.**
`getProgressPercent` consults metric direction and returns `null` in four
distinct cases; `progressPct(goal)` does not consult direction and clamps to
0-100. Focus areas use the first, goals use the second, and the two
populations are never plotted on one axis. That is why the stage is focus
areas only: co-plotting them would put two different definitions of "percent"
on one scale, and the goal number here would disagree with the number that
goal's own Sheet already prints.

## Composition

### 1. Masthead (bare, no eyebrow, no title)

The **verdict**, `text-h3` regular, `max-w-[64ch]`, built by a pure
`buildDevelopmentVerdict()` in `development-logic.ts` returning a clause
array in the style of `buildVerdict` (`coach-home-logic.ts:158-189`). Each
clause renders only when its input exists; an unmet clause is omitted, never
guessed. No clause reads a clock.

1. `{n} in progress.` from `activeAreas.length`. Zero: `Nothing in progress yet.`
2. `{leadArea.title} needs it most.` from `pickLeadArea(activeAreas, causalRelationships)`, the title a link to that row on the stage. Omitted when there are no active areas.
3. `{improving} moving, {declining} sliding.` counted **only** over areas that have at least two readings AND a resolved metric direction. When that subset is empty the clause becomes `Not enough readings yet to call direction.`, stated rather than dropped, because silently omitting it hides how thin the data is.
4. `{decisions} waiting on you.` from `proposedAreas.length + suggestions.length`, linked to the Decisions column. Omitted at zero.

Then a facts line, `text-caption text-text-tertiary`: active count, completed
count, goals count. Mono numerals.

`loadError` replaces the verdict with an `InlineNotice` saying the read
failed and offering a refresh. A failed read is never the empty state.

### 2. The stage: `FocusField`

Page-local, in `focus-field.tsx`. It is not registered, not exported from
`modules/`, and not added to any barrel: `modules/index.ts`, `modules/types.ts`
and `registry.ts` are lead-only. It joins them when a second screen needs it.

One row per active focus area, ordered by `ladderOrder` (least progressed
first, unknown-progress rows last).

**Geometry.** x is a **shared date axis** across every row, from the earliest
reading or `started_at` to today. y is **percent of that area's own journey**,
`getProgressPercent(reading.value, target_value, target_metric, baseline_value)`
computed per reading: 0 is the baseline rule at the foot of the track, 100 is
the target rule at its head. Every reading in `focusAreaTrendEntries(fa)` is a
mark at (its day, its percent). This is the honest transposition of
`ScoreField`: same shared-axis idea, but the vertical meaning is fraction of
the player's own journey covered, which is the one quantity that IS comparable
across a strokes area, a yards area and a percent area. The app already treats
that fraction as comparable everywhere `getProgressPercent` is called; this
instrument is the first to let a player see it across rows at once.

**AS BUILT: the row does not split, at any width.** A three-column row
(identity, track, reading) was built first and measured inside the shell this
page actually renders in:

| width | track, split | track, stacked |
| --- | --- | --- |
| 768 | 281px | 594px |
| 1024 | 167px | 366px |
| 1280 | 285px | 602px |
| 1440 | 365px | 762px |

The split lost at every size and was non-monotonic besides: a reader widening
from 1024 to 1280 watched the chart shrink from 285 to 167 and back. The cause
is the shell's rail, not the viewport, so no breakpoint fixes it. The row is
one column: identity and reading share a line, the track runs full width
beneath them, and the thin-row caption sits under that.

**The marks are not links.** The spec first copied ScoreField's link-per-mark,
but every mark in a row shares one destination, so sixteen identical links is
noise, not access. Every reading is also a dated row in the readings log
below, which is the accessible equivalent of the plot.

**Mechanics, copied from `ScoreField` rather than imported** (percentage
geometry, no measurement pass, no SVG scaling): `dayMs`/`dateFraction` for x,
a one-day floor on the domain, a link per mark to that area's Sheet, an axis
that thins its own labels and yields the right edge to a "Today" marker, a
stagger capped at 16 marks, and `useReducedMotionGuard`.

**Ink.** A mark is coloured against the **baseline rule**, a fixed reference,
never against its predecessor: green above the rule, amber below it, neutral
on it (`markTone` in `development-logic.ts`). The target rule is a green
hairline at 100, the baseline a neutral rule at 0. No third hue.

Colouring each mark against the reading before it would turn any noisy series
into alternating confetti and would make the hue mean "the last step" rather
than "where you are". The step-to-step story is already carried by slope,
which is what slope is for.

**The un-floored mark.** `getProgressPercent` ends in `Math.max(0, ...)`
(`areaTypes.ts:386`), so a player who has slipped past their own starting
point reads as 0, pixel-identical to a player who has not moved at all. The
mark's *position* drops that floor and plots below the baseline rule in amber;
the *printed number* stays the unmodified `getProgressPercent` return, so this
page can never disagree with any other screen that prints the same figure.
Only the geometry is refined, never the number.

**But the two are never printed side by side.** A row whose latest reading is
below its starting value prints no percent at all: a point sitting visibly
under the baseline rule, labelled `0%`, forces the reader to decide which of
the two is lying. Neither is, and they cannot know that. Such a row prints its
current value in its own unit followed by the phrase `Below where you
started.` (`BELOW_START_PHRASE`). `rowReadout` in `development-logic.ts` makes
that choice once, so no component re-derives it. The clamped figure still
exists for any consumer that needs the shared number; it just never shares an
eyeline with the mark that contradicts it.

**Row end**: the current value in its own unit via
`formatValue(value, getMetricRenderConfig(target_metric).unit)`, mono; then
the percent, or `Below where you started.` when the latest reading is under
the baseline, or the row's honest caption when there is nothing to plot (the
three arms of `rowReadout`); then a trend triangle **only** when the
row has two or more readings and a resolved direction. The triangle is data
ink beside a number, which the ban list allows; it never appears inside a
sentence.

**Honest states, one per real cause** (the four map onto
`getProgressPercent`'s four `null` branches, and each names the field that is
actually missing rather than defaulting to a baseline-shaped excuse):

| Cause | Branch | Row reads |
| --- | --- | --- |
| no readings | none | `No readings yet. Log one to start the line.` |
| one reading | none | the single mark, no connecting line, `One reading. Log a second to see movement.` |
| direction unknown | `areaTypes.ts:370` | `No direction known for this metric.` |
| no target | `:367` (`target == null`) | `No target set.` |
| no starting value | `:367` (`baseline == null`) | `No starting value on record.` |
| target equals start | `:381` (`span === 0`) | `Target is where you started.` |
| target points away from start | `:382-383` | `Target points away from the starting value.` |

Both malformed-target branches sit **after** the met check, so they are
unreachable for a reader who has already passed their target: that reader
reads 100, which is the honest answer. Pinned in `development-logic.test.ts`.

The caption sits **under the track**, not inside the plot. Inside the plot it
rendered only for rows with ZERO marks, so the one-reading state, the state it
was written for, never showed it: a single-reading row drew one dot and said
nothing. A caption positioned on the baseline also collides with a mark
sitting on that same baseline, which is exactly where a reader at their
starting value is.

A row in any of those states still renders its identity, its current value and
its caption. It never renders a track at a guessed position, and it never
renders 0 for a value that was simply never logged. **Never a trend through
one point.**

Zero active areas: the stage renders one line, `Nothing in progress.`, plus a
second line naming the waiting proposals and linking to Decisions when any
exist. No empty track at 0 percent.

### 3. The ledger row (bare columns, vertical hairlines)

`divide-x divide-border-subtle` from the width at which every column still
holds its content whole, stacked with horizontal hairlines below it. Per the
amended breakpoint rule, the split point is decided by the 768/1024/1280/1440
captures, not by a breakpoint name; these are fractional columns, so the loss
is shared. Only non-empty columns render, and the grid takes the shape of the
count present. Both empty: no ledger row.

**AS BUILT: two columns, not three.** The stage content tops out near 762px
even at 1440, because the shell keeps a right rail that widens with the
viewport. A third of that will not hold a sentence, so **Why** leaves the
ledger and takes the full width below it; it is prose and it wants the width.
Decisions and Goals run 7/5.

**Nothing on this page truncates.** `truncate` gives a row a hard minimum
width equal to its longest unbroken line, which is what actually caused the
clipping the captures found: a suggestion row wanted 262px inside a 92px cell
and pushed 4px of horizontal overflow up through DrillPanel at every width,
1440 included. Rows wrap. A column that wraps holds its content whole at any
width, which is what the breakpoint rule asks for.

**Decision rows put their actions on their own line.** Two 44px buttons beside
a sentence do not fit a third of this page at any width it renders at, so
there is no breakpoint at which the inline arrangement is right.

- **Decisions** (widest). `proposedAreas` and `suggestions` as hairline rows. These are **two different action pairs** and must not share one blind shape: a proposed area accepts/declines through the focus-area actions, a `GoalSuggestionView` accepts/dismisses through `acceptGoalSuggestion`/`dismissGoalSuggestion`. Each row's own label says which it is.
- **Goals**. Active goals as hairline rows: name, `now / target` in mono (two columns, no glyph between them), and the percent from `progressPct(g.goal)`, the shipped function, so the number here can never disagree with the goal's own Sheet. `achievedGoals` follow under a `Recent wins` subhead. The `pending_baseline` state is not designed for: `loadActiveGoals` filters to `state === 'active'` before this prop is populated, so that branch cannot fire.
- **Why**. The strongest causal relationships as short rows, `cause tracks with effect`, the mechanism sentence clamped to two lines. `dose_response` is marked with a plain text tag, **not** accent ink: green on this page means improving or under par, and a relationship property is not a performance signal. `CausalWhyPanel`'s own docstring notes this is empty for most players, so the honest empty line here is the designed state, not a fallback, and the column simply does not render when the array is empty.

Each section head is `h2` in `text-h3` over a 1px `bg-accent-300` rule, the
green ruling from `SectionHead` (`coach-home-parts.tsx:48-76`); the markup is
reproduced page-locally rather than imported, because `coach-home-parts.tsx`
is another engineer's file.

### 4. The table: the readings log

A dense, full-width `<table>`: the dated evidence behind the stage, which is
the language's table idiom (the stage plots, the table is the rows it plotted).
One row is **one dated reading**, newest first, across active and completed
areas: `Date | Area | Value | Change | Note`. Ten rows and a `View all N` link.

- `Date` mono, UTC-pinned through the date-only helpers.
- `Area` the title, the row's link target, opening that area's Sheet.
- `Value` mono in the area's own unit.
- `Change` the signed delta from the previous reading of the same area, green toward the target and amber away, blank for an area's first reading. Never 0 for "no previous reading".
- `Note` the player's own `note` from the entry, truncated to one line; blank when absent.
- Phone hides `Change` and `Note` with `hidden md:table-cell`; the row link stays 44px.

This is also why `useFocusAreaSheet` must be instantiated with
`[...activeAreas, ...completedAreas]` and not `activeAreas` alone
(`FairwayMyDevelopment.tsx:195`): a completed area's row is tappable here, and
today that hook resolves by `activeAreas.find(...)`, so such a row would hang
on the loading skeleton forever.

## Phone (390)

Same order, one column. Stage rows become the area title over its strip, with
the value and percent on the line under it. Ledger columns stack, divided by
horizontal hairlines. The table keeps `Date | Area | Value`. Every row link is
44px. No `useMediaQuery` decides markup; every phone layout is CSS gated.

## Bans, checked

One Surface (DrillPanel on the live host, the stage on the preview host, never
both). No nested cards. No identical card grids. No big-number-with-small-label
tile: the stage's numbers sit at the end of a row of real data, and the facts
line is a sentence. No chart in a card: the instrument is typeset as part of the
page, bare on the live host. No side stripes, no gradient text, no glass. No em
dashes and no arrows inside sentences; triangles beside numbers and an arrow icon
in a link affordance are data ink and chrome respectively, per the lead's
clarification. No fabricated series and no fabricated zero. No client-only
breakpoint branch.

## Files

- `pages/coachhelm/development-logic.ts` (new): `buildDevelopmentVerdict`, the per-reading percent series, the readings-log rollup, the direction-resolved moving/sliding counts. Pure, unit tested.
- `pages/coachhelm/focus-field.tsx` (new): the `FocusField` instrument, page-local.
- `pages/coachhelm/development-parts.tsx`: the ledger columns and the readings table replace the v2 parts. `LeadAreaStage`, `PlanSegmentBar` and the v2 `FocusAreaRow` ladder retire.
- `pages/coachhelm/FairwayMyDevelopment.tsx`: composes the four regions, threads `frame` by host, merges the sheet array.
- `pages/coachhelm/GoalsSection.tsx`: the `variant="inline"` branch is replaced by the Goals ledger column. **`variant="default"` is untouched** (coach board, vizlab).
- `pages/coachhelm/CausalWhyPanel.tsx`: its rows become the Why column; the shared-file surface stays additive.

Nothing under `pages/dashboard/**`, `modules/ScoreField.tsx`, `modules/index.ts`,
`modules/types.ts`, `registry.ts` or `LANGUAGE.md` is touched.

## Tests

Unit: verdict clause assembly including every omission and the
not-enough-readings case; the four null captions each naming the right missing
field; the un-floored mark position versus the printed number for a backslid
area; readings-log ordering and the blank first `Change`; moving/sliding counts
excluding unknown-direction areas. Component: the stage renders bare under
`host="stage"` and framed under `host="page"`; a one-reading row renders no
trend and no line; a completed area's table row opens its Sheet. The existing
coachhelm suites stay green, and coach development coverage is untouched.

## Verification

`tsc`, `eslint` on every changed file, one vitest runner at a time, then
captures at 390, 768, 1024, 1280 and 1440 behind `/tmp/helm-capture.lock`,
each viewed before reporting. The 768 and 1024 shots decide the ledger's split
point: a column that clips an area title, a goal name or an axis label has
failed whatever breakpoint it sits at.

## Panel record

**Base**: Coach's Read (2 of 3 judges), for its verdict discipline and its
four reason-specific null captions.

**Grafted from ProgressField** (the third judge's winner, and the only concept
that caught it): the host-conditional frame, which is the structural fact this
whole spec now turns on; and the literal reuse of `ScoreField`'s mechanics.

**Grafted from The Ladder**: the dated readings log as the table, which is the
correct reading of the language's table idiom, and the un-floored backslide
mark.

**Killed before build**, each for a verified reason: `outcome_status` anywhere
(not selected on this route); co-plotting goals with focus areas on one axis
(two different percent derivations); the `pending_baseline` branch (cannot
fire); `isLowerIsBetter`'s boolean in place of three-state
`resolveMetricDirection`; a second goal-progress derivation beside
`progressPct`; a dynamic masthead title from `pickLeadArea` (the page's own
name would change day to day as ranking shifts, and DrillPanel already names
the page); the `Now → Target` glyph; `dose_response` in accent ink.

**Deferred, named not built**: a completed-area outcome word, which needs
`outcome_status` joined from `golf_coach_insights` by `from_insight_id`, a new
query this pass does not make.
