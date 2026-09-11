<!-- markdownlint-disable MD013 -->
# Team stats (coach), /golf/dashboard/stats/team — v3 spec

Supersedes `team-stats.v2.md`. That spec was written before
`docs/design/fairway-facelift/LANGUAGE.md` and it composes the page as a
`ViewHeader`, a sticky four-cell `StatMatrix` band, a bordered `MatrixBoard`
bezel, and a four-cell `Bento` of charts. That is the masthead-plus-deck-of-
boxes pattern LANGUAGE.md exists to kill. Its region names give it away:
"KPI band", "bento cells", "one bordered bezel". None of that survives.

File of record: `src/components/golf/stats/team-board/TeamStatsBoard.tsx`
(646 lines) and its pure view model
`src/components/golf/stats/team-board/buildTeamBoardViewModel.ts` (528
lines). Route: `src/app/golf/(dashboard)/dashboard/stats/team/page.tsx`.
Bare `/golf/dashboard/stats` is the PLAYER route and renders
`FeatureUnavailable` for a coach — out of scope, do not touch it.

Reference implementation for rhythm, masthead, ledger and breakpoints:
`src/components/fairway/pages/dashboard/FairwayCoachDashboard.tsx` with
`coach-home-logic.ts` and `coach-home-parts.tsx`.

LANGUAGE.md's own row for this page reads: stage = category matrix (players
by category, ramp colored); readouts = team averages; ledger = leaders per
category; table = category detail. This spec is that row, made concrete.

## The question

Where is this team leaking strokes against Tour, and which players are
carrying the leak.

Everything on the page serves that sentence, in that order: the leak first,
the names second. The v2 layout answered them in the wrong order — the
roster board came before the strokes-gained chart, so the coach had to read
nine rank columns before learning which column mattered.

---

## The one idea

**One instrument, two registers, one grid.**

The stage is a single Category Field: five columns (Off the tee, Approach,
Around the green, Putting, Scoring) shared by two registers stacked in the
same column grid.

- **Top register, the team.** One signed bar per column, drawn off a shared
  zero rule: the team's strokes gained in that category against the Tour
  baseline. Amber below zero, green above. This is where the leak announces
  itself.
- **Bottom register, the players.** One row per player, one ramp-colored
  rank swatch per column. Because the columns are the same columns, the eye
  falls straight down the amber column and lands on the players who own it.

The v2 spec put the team's strokes gained in a `Bento` cell two screens
below the roster board and made the coach hold the leak in their head while
scrolling. Sharing one column grid removes that memory step entirely. That
relationship IS the architecture of this page; do not break the shared grid
to make either register prettier on its own.

Scoring has no strokes-gained figure, so its team cell holds the team
scoring average as a plain number, not a bar. Say so in the column, do not
draw a bar off a baseline that does not exist.

---

## Masthead

Bare on the canvas. Built the way Home builds its own
(`FairwayCoachDashboard.tsx:282-338`), NOT `ViewHeader`. `ViewHeader`
(currently `TeamStatsBoard.tsx:402-455`) stays only for the true
zero-player state, mirroring Home's `!team` branch
(`FairwayCoachDashboard.tsx:233-266`).

- **Eyebrow row.** `{teamName}` left, plain. Right: the existing export
  `IconButton` and the existing overflow `Menu` (Ask CoachHelm, Export as
  CSV, Freshness details — `TeamStatsBoard.tsx:414-453`, all three items
  unchanged, including the `Menu.Item onSelect` + `router.push` idiom and
  the comment explaining why `asChild` cannot be used there), then the
  primary `Button` "Open team intelligence"
  (`TeamStatsBoard.tsx:409-413`, unchanged).
- **`h1`, `text-display`:** "Team Stats."
- **Verdict**, `text-h3` regular weight, max 64ch, built by a new pure
  `buildTeamStatsVerdict` in a new `team-stats-logic.ts`, sibling of
  `buildVerdict` (`coach-home-logic.ts:158-189`) and returning the same
  `VerdictPart[]` shape so `VerdictLine` (`coach-home-parts.tsx`) renders
  it. Every clause below names the field it reads.

  **Template:** `"{leakClause} {ownerClause} {trajectoryClause}"`

  - `leakClause`, from `sgData` (`TeamStatsBoard.tsx:276-288`, weighted by
    `roundsPlayed` via `weightedMean`, `buildTeamBoardViewModel.ts:115`).
    `worstLabel`/`bestLabel` are `sgData`'s own `label` strings, sourced
    verbatim from `SG_CATEGORY_BARS` (`TeamStatsBoard.tsx:106-111`):
    `'Off the Tee'`, `'Approach'`, `'Around the Green'`, `'Putting'`. Two of
    those are title-cased for a column heading, not mid-sentence prose —
    lowercase them to `'Off the tee'`/`'Around the green'` before
    interpolating, matching this page's own naming everywhere else (The one
    idea, the Column headers' full-word spans below).
    - Some category is negative → `"{worstLabel} is the leak, {fmtSg(value)}
      strokes a round against {tourLabel}."` This is the existing
      `sgTakeaway` sentence (`TeamStatsBoard.tsx:316-322`) promoted from a
      chart caption to the page's verdict; delete the caption rather than
      print the same sentence twice.
    - No category is negative but `hasSg` → `"{bestLabel} leads the way,
      {fmtSg(value)} strokes clear of {tourLabel}."`
    - **Missing (`hasSg === false`, `TeamStatsBoard.tsx:289`):** reuse the
      shipped cold-start line verbatim — `"Strokes gained appears once
      players log rounds with shot-level tracking."`
      (`TeamStatsBoard.tsx:509`, trimmed of its second sentence, which
      belongs in the stage's empty state, not the verdict).
  - `ownerClause`, only when `leakClause` named a negative category. The
    worst-ranked player in that column, read off `vm.rows[].ranks`
    (`buildTeamBoardViewModel.ts:278-284`): `"{name} is furthest back in it."`
    Name links to `/golf/dashboard/roster/{id}`. **Missing:** every rank in
    that column is `null` → omit the clause entirely. Never write "no one".
  - `trajectoryClause`, from `vm.kpis.trajectory`
    (`buildTeamBoardViewModel.ts:307`): `"{improving} climbing, {declining}
    sliding."` **Missing:** `hasTrajectorySignal === false`
    (`TeamStatsBoard.tsx:377`) → `"Trend signals begin after
    {TREND_SIGNAL_MIN_ROUNDS} completed rounds."`
    (`buildTeamBoardViewModel.ts:139`). The v2 layout hid that gate inside
    a `StatMatrix` cell as an `InsufficientData` block
    (`TeamStatsBoard.tsx:386-394`); it reads better as a sentence and the
    block goes away.
- **Facts line**, `font-fw-mono text-caption tabular-nums`, same treatment
  as Home's (`FairwayCoachDashboard.tsx:330-337`):
  `"{rows.length} players · {freshness}"`, where freshness is
  `formatTeamStatsFreshnessHeadline(freshness)` (`teamStatsFreshness.ts:35`),
  unchanged. `rounds30d` (`vm.kpis.rounds30d`, `buildTeamBoardViewModel.ts:308`)
  is dropped from this line on purpose: it already has a home in the
  Readouts below ("Rounds · 30d"), and a count printed here and again a few
  inches down is the same reading typeset twice, not two facts.

The three-flag `InlineNotice` (`TeamStatsBoard.tsx:457-461` with
`statsLoadErrorMessage` at `:148-158`) stays exactly as it is, directly
below the facts line, apart from one glyph: its template literal at `:157`
renders an em dash ("...may be incomplete — reload to try again.") and
joins the sweep in Risk 6. Nothing else about the notice changes; do not
weaken it and do not fold it into the verdict.

---

## Stage — the Category Field

ONE `Surface`. It is the only bordered container above the fold.

New page-local component `CategoryField` in
`src/components/golf/stats/team-board/CategoryField.tsx`, with
review-agnostic props (`cols`, `teamRow`, `playerRows`, `sort`,
`onSortChange`) so it can be promoted to `modules/` later. Do NOT add it to
`modules/index.ts`, `modules/types.ts` or `registry.ts` — those are
lead-only. Say in your report that it is a promotion candidate.

### Grid

One CSS grid, shared by both registers, so a column line runs unbroken from
the team bar to the last player:

```
grid-cols-[minmax(0,1fr)_repeat(5,3.25rem)]          /* below md   */
md:grid-cols-[minmax(0,1fr)_repeat(5,4.5rem)]        /* md and up  */
```

The identity column is the only flexible one. Category columns are fixed so
the swatches line up as a field, not as a table that reflows.

### Column headers

Each header is a sort control, not decoration. Clicking a category sorts the
player register by that column's rank, ascending, ties broken by name.
Default sort: the category with the lowest strokes-gained value, whether or
not it is negative — the same minimum `sgData` already computes for
`sgTakeaway` today (`TeamStatsBoard.tsx:318-319`), not a new "leaking"
filter. On a roster with no true leak (every category positive) this still
opens on the team's weakest column, which is the honest reading of "what to
work on" even when nothing is technically over par. Where `hasSg` is false,
default to scoring rank; where that is also absent, default to name.

Header text follows the existing 940px switch (`TeamStatsBoard.tsx:182-196`)
but not its mechanism, and corrects one naming split along the way. Render
both label spans in every header cell —
`<span className="hidden min-[940px]:inline">Approach</span><span
className="min-[940px]:hidden">App</span>` — for Approach/App, Putting/Putt
and Scoring/Scor, unchanged from today's strings. The third category is
`'Around the Green'` in the data itself (`SG_CATEGORY_BARS`,
`TeamStatsBoard.tsx:109`) and `'Around the green'` everywhere else in this
spec (The one idea, the verdict's `worstLabel`/`bestLabel` above); the
current header alone calls it `'Short game'`/`'Shrt'`
(`TeamStatsBoard.tsx:188`) — rename that pair to Around the green/Grn so the
column header agrees with its own column's data label instead of
contradicting it. The Tee column's header stays exactly `'Tee'`
(`TeamStatsBoard.tsx:186`) at every width — it is already short enough that
it never had a wide-form switch in the source, and it does not gain one
here; "Off the tee" is this page's name for the category in prose (The one
idea, the verdict), not a second header string to build.

Let the stylesheet pick, the same arbitrary-variant idiom
`TeamStatsBoard.tsx:470` already uses for its own sticky band.
`useMediaQuery('(min-width: 940px)')` (`TeamStatsBoard.tsx:182`) and
`isBoardWide` are retired by this change —
LANGUAGE.md's Bans list names this exact pattern outright ("a client-only
breakpoint branch"), and the header text still changes at the same width as
the columns it labels, because both spans key off one CSS breakpoint rather
than two independently-updated states. See What this deletes and Risks.

Sort state is client state and must not leak into the server render. Render
the default sort on the server, and derive the sorted order in the same
`useMemo` that already builds `vm` (`TeamStatsBoard.tsx:237`).

### Team register

One row above the grid rule, aligned to the category columns.

- Four `MicroBar`s (`modules/MicroBar.tsx`, registered `registry.ts:216`),
  one per SG category — not `DivergingBars`. `DivergingBars`' exported row
  is a fixed `grid-cols-[40px_1fr_42px]` layout (label, rail, value —
  `DivergingBars.tsx:25`) built to be its own ledger row, not a `3.25rem`
  grid track, and its tone is hardcoded backwards for this data: `over =
  row.delta > 0` colored `bg-fw-warning`, the negative case colored
  `bg-accent-500` (`DivergingBars.tsx:23,37`) is correct for a metric where
  positive is worse — the opposite of strokes gained, where positive is
  good. `MicroBar` sizes in px (`width`/`height` props, default 40×6,
  `MicroBar.tsx:41-44`), so it drops into a `3.25rem`/`4.5rem` cell cleanly,
  and its fill color already follows a `goodDirection` prop rather than a
  hardcoded sign (`MicroBar.tsx:63,83-88`). Props: `value={category's SG
  value}`; `domain={Math.max(1, ...sgData.map(d => Math.abs(d.value)))}`,
  one figure shared across all four so a −0.1 leak never renders the same
  size as a −3.2 leak; `goodDirection="high"` (positive strokes gained is
  the good side, `MicroBar.tsx:38-39`); `label` stating the reading in
  words, e.g. `` `${label}: ${fmtSg(value)} strokes a round versus Tour` ``.
  Keep `DivergingRow`'s data shape as the row type feeding this list,
  `{ label, delta, display }` (`modules/types.ts:153`), but do not reach for
  `DivergingBarsProps`' `max` (`:154`) — that types the row component this
  section does not use; `MicroBar`'s scale prop is `domain`.
- `display` next to the bar is still `fmtSg(value)`
  (`buildTeamBoardViewModel.ts:36`), as mono text, unchanged.
- Tone comes from `MicroBar` itself once `goodDirection="high"` is set:
  positive renders `bg-accent-500` (green, gaining strokes on Tour),
  negative renders `bg-fw-warning` (amber, the leak) —
  `MicroBar.tsx:63,83-88`. Do not read LANGUAGE.md's "amber below zero"
  materials rule as license to copy `DivergingBars`' own polarity; that
  component's hardcoded tone is inverted for SG and must not be reused here.
  `value === 0` is a real measured reading — exactly at Tour, not a missing
  one — and `MicroBar` already renders it correctly with no extra work: its
  `value !== 0` guard (`MicroBar.tsx:79`) leaves the fill out, showing only
  the sunken rail and center zero tick, never a colored bar and never this
  section's missing-category en dash below.
- The zero line is the Tour baseline, not an assumption: every `sg_*` row
  seeded into `golf_pga_standards` carries `pga_tour_value = 0`
  (`supabase/migrations/20260610040300_seed_golf_pga_standards.sql:35-39`),
  so a rounds-weighted mean of `player_value` across the roster is already
  "strokes gained vs Tour" by construction, with no separate baseline
  subtraction to get right or get wrong.
- Scoring column: `vm.kpis.teamScoring` (`buildTeamBoardViewModel.ts:304`)
  as a plain `font-fw-mono tabular-nums` number, no bar, no baseline.
- **Missing:** a category absent from `sgData` (it is `.filter`ed out at
  `TeamStatsBoard.tsx:286` when `weightedMean` returns null) renders an
  en dash ("–", matching `ScoreField.tsx:109`'s convention — not the em
  dash `fmtSg` itself renders for the same null case,
  `buildTeamBoardViewModel.ts:38`, see Risk 6) in `text-text-tertiary`. Never
  a zero-length bar — a zero-length bar reads as "exactly at Tour", which is
  a fabricated measurement.

### Player register

One row per player, `vm.rows` (`buildTeamBoardViewModel.ts:317`), in the
current sort.

- Identity cell: name in `text-body-sm font-semibold`, then
  `{classYear} · {roundsPlayed} rds · {scoringAverage}` in `text-caption
  text-text-tertiary` — the same content the current `who` cell renders
  (`TeamStatsBoard.tsx:337-343`).
- Five `RankCell`s (`modules/RankCell.tsx:19`, green ramp, darker is
  stronger), from `row.ranks.{tee,app,short,putt,scoring}`. A `null` rank
  renders `RankOrDash` (`TeamStatsBoard.tsx:571-576`), corrected to an en
  dash ("–") to match the team register above and `ScoreField.tsx:109` —
  see Risk 6; the em dash it renders today (`TeamStatsBoard.tsx:573`) is
  one of the several call sites this rewrite fixes, not a convention it
  keeps.
- The whole row links to `/golf/dashboard/roster/{id}`. The current
  `MatrixBoard` expand-in-place band (`TeamStatsBoard.tsx:366`, `:605-629`)
  moves to the table below, where a dense row can afford to open. The stage
  is for reading, not for operating.
- Cap the stage at 12 players with a "Show all {n}" control that reveals the
  rest in place. A 40-player roster must not push the ledger off the page.
  If you cap, say so in the control's label; silent truncation is a lie.

### Empty and cold states

- Zero players (`vm.rows.length === 0`): the whole page falls back to the
  `ViewHeader` masthead plus the existing `InstrumentPanel` empty message
  (`TeamStatsBoard.tsx:480-484`). No stage, no ledger, no table.
- Players but no SG anywhere (`hasSg === false`): the stage still renders —
  the player register and the scoring column are real. The team register
  shows the full cold-start sentence
  (`TeamStatsBoard.tsx:509`) once, spanning the four SG columns.
- Fetch failed (`roundsError === true`, `TeamStatsBoard.tsx:98`, one of the
  three independent flags the masthead's `InlineNotice` already surfaces
  above the facts line — see Masthead): `vm.rows` does not go empty when a
  fetch fails, only the values inside it do, which makes this branch render
  identically to the cold-start branch above unless it is named separately.
  It is not the same state. Follow `FairwayCoachDashboard.tsx:411-414`'s
  precedent of surfacing the warning ahead of the empty-state branch, and
  gate the cold-start sentence strictly on `hasSg === false && !roundsError`.
  When `roundsError` is true, the team register's SG cells render the same
  en dash as an absent category (Missing, above) but never the "Strokes
  gained appears once players log rounds..." sentence — that sentence
  asserts a data-collection gap that did not happen here, and printing it
  anyway is exactly the failure-rendered-as-empty-state the Honesty rules
  forbid.

---

## Readouts

Bare, no box. Same component and same responsive behaviour as
`FieldReadouts` (`coach-home-parts.tsx`): a 2-up grid on phone, 4-up at
`md`, and a vertical hairline-divided stack in the stage's right rail at
`xl`. Reuse `FieldReadouts` if its props fit; otherwise copy its class
string exactly rather than inventing a second rhythm.

This page renders three of the four `statItems` the sticky band shows today
(`TeamStatsBoard.tsx:379-397`), with their containers removed. Team scoring
is not one of them: `vm.kpis.teamScoring` already has a home in the stage's
team register (Scoring column, above), and printing it a second time here
would be the same figure typeset twice, not two readings. Three items in the
4-up `md` grid leave one track empty; three items in the 2-up phone grid
leave a trailing single on its own row — both are `FieldReadouts`'
existing behaviour with fewer children, not a new rhythm to build.

| Readout | Source | Missing |
|---|---|---|
| Team SG / rd | `vm.kpis.teamSg` (`buildTeamBoardViewModel.ts:305`) | en dash (see Risk 6: the null case is `teamSg`'s own inline ternary at `:514`, not `fmtSg`'s null branch at `:38` — `fmtSg` only formats the non-null half of that ternary) |
| Trajectory | `vm.kpis.trajectory` (`:307`), rendered by the existing `TrajectoryKpi` (`TeamStatsBoard.tsx:586-603`) | `hasTrajectorySignal === false` → "Not yet" in `text-text-tertiary`; the verdict already carries the explanation, so do NOT repeat the `InsufficientData` block here |
| Rounds · 30d | `vm.kpis.rounds30d` (`:308`) | `0` is a real count here and prints as `0` |

The sticky wrapper (`TeamStatsBoard.tsx:470-472`) is deleted. A sticky
readout band fights the stage for the top of the viewport and was only
sticky because it was a box that scrolled away.

---

## Ledger row

Bare, directly on the canvas, `mt-12`. Unequal hairline-divided columns, the
same construction as Home's
(`FairwayCoachDashboard.tsx`, ledger grid: `grid-cols-1` → `md:grid-cols-2`
→ `xl:grid-cols-12` with `xl:divide-x`). Three columns, spans 5 / 3 / 4.

**Column 1 (span 5), "Where it leaks."** The four SG categories as a
sorted list, worst first: category name, `fmtSg` value, and a `MicroBar`
(`modules/MicroBar.tsx`, registered `registry.ts:216`) with
`value={that category's SG value}`, `domain={the same shared
Math.max(1, ...sgData.map(d => Math.abs(d.value))) the Team register
computes above — one scale, not a second one}`, `goodDirection="high"`
(positive strokes gained is the good side, `MicroBar.tsx:38-39`), and
`label` stating the reading in words. This is the tornado's information
without the tornado's box; the
`StrokesGainedTornado` in `BentoCell` (`TeamStatsBoard.tsx:502-512`) is
deleted, and with it the duplicate `takeaway` caption. **Missing:**
`hasSg === false` → the column renders only the cold-start sentence.

**Column 2 (span 3), "Who leads each."** One line per category: category
name, then the player holding rank 1 in that column with their name linked
to `/golf/dashboard/roster/{id}`. Read straight off `vm.rows[].ranks`; no
new query. **Missing:** a category with no ranked player is omitted from the
list, not printed with a dash.

**Column 3 (span 4, `md:col-span-2`), "Fundamentals."** Fairways, GIR,
Scrambling, Putts / 18, Birdies / 18 from `vm.fundamentals`
(`buildTeamBoardViewModel.ts:310-316`) as a dense label/value list with a
hairline between rows. `RailBars` and the nested `StatMatrix`
(`TeamStatsBoard.tsx:519-535`) both go away — a percentage next to a label
does not need a bar to be read, and a `StatMatrix` inside a `BentoCell`
inside a `Bento` was three containers deep. Keep the existing honest
sentence as the column's one caption, rephrased without its em dash —
"Pooled from every recorded opportunity, not averaged player
percentages." (source at `TeamStatsBoard.tsx:517`; see Risks).
**Missing:** `hasFundamentals === false` (`TeamStatsBoard.tsx:314`) → the
existing line "Fairways, GIR, and scrambling appear once hole outcomes are
recorded." (`TeamStatsBoard.tsx:523`), verbatim.

---

## Table — category detail

A dense `DataTable`, full width, `mt-12`, `<caption class="sr-only">`
naming it. This is where the numbers behind the stage live, and where a row
opens.

Columns: Player · Rounds · Scoring avg · SG off the tee · SG approach ·
SG around green · SG putting · Composite · Trend · Signal.

- The SG columns are the player's own `player_value` from
  `standingByPlayer.get(id).get(metric)` — the same map the stage's ranks
  and `sgData` are built from (`TeamStatsBoard.tsx:282`). The stage shows
  rank, the table shows the value; that is the whole reason both exist.
- Composite: keep the leading tabular number plus `Meter size="sm"`
  (`TeamStatsBoard.tsx:349-360`). It replaced an unreadable 16px ring arc
  for a documented reason; do not regress it to a gauge. Its null-case
  fallback (`:358`) is one of the em-dash sites this rewrite fixes; see
  Risks.
- Trend: the existing `Sparkline` with `goodDirection="down"`
  (`TeamStatsBoard.tsx:361`).
- Signal: the existing `SignalChip` and `row.signal`
  (`TeamStatsBoard.tsx:362-364`, tone rules at
  `buildTeamBoardViewModel.ts:163-170`), with one glyph fix: the
  most-improved label is built as `` `▲ ${...}` `` today
  (`buildTeamBoardViewModel.ts:398`) — drop the arrow, keep the words
  ("Most improved"). `SignalChip`'s tone color already carries the
  direction; the arrow is copy, and arrows in copy are banned. See Risks.
- Row expand: the current `ExpandBand` (`TeamStatsBoard.tsx:605-629`) moves
  here with its three triage links intact (Full stats, Fingerprint,
  Prescribe focus area). Restyle its cells to the ledger's typography —
  `text-eyebrow` label over `font-fw-mono` value — and drop the
  `font-fw-display uppercase tracking-[0.09em]` label treatment
  (`TeamStatsBoard.tsx:642`), which is a heading style doing a label's job.
- Below `md`, Composite, Trend and Signal are `hidden md:table-cell` —
  genuinely removed from layout, not scrolled to, since the same three
  values are already reachable through the row expand. The remaining seven
  columns (Player, Rounds, Scoring avg, four SG) stay visible at every
  width; on a phone narrow enough that even those seven do not fit, the
  table's own `overflow-x-auto` lets them scroll horizontally. The page
  body itself never scrolls sideways.

---

## Coda — the leak maps

`LeakMap` putts-by-distance and approach-proximity
(`TeamStatsBoard.tsx:538-564`) are a genuinely different subject: distance
bands, not players. They keep their charts and their honest cold-start
message (`leakColdStartMessage`, `TeamStatsBoard.tsx:331`) and their
`worstLeakTakeaway` captions (`:127-140`), but they lose `Bento`,
`BentoCell`, and their borders.

They render as a bare two-column hairline diptych below the table:
`grid-cols-1` → `xl:grid-cols-2 xl:divide-x`, each half with its title as a
`SectionHead` (`coach-home-parts.tsx`), `xl:pr-8` / `xl:pl-8`. No card, no
label chip, no second heading. `BentoCell`'s `label` prop currently carries
a context tag ("Putting", "Approach") that duplicates the chart title
("Putts Made by Distance") — the tag goes, the title stays.

---

## Phone

Splits at `xl` (1280), never `lg`. LANGUAGE.md's rule, and it is
load-bearing: an earlier build of Home split at `lg` and collapsed at 1024,
starving a 15rem rail and clipping player names to one character.

| Width | Stage | Readouts | Ledger | Diptych |
|---|---|---|---|---|
| < 640 | Field, abbreviated headers, horizontal scroll inside the Surface only | 2-up grid below the stage, three items, third alone on its own row | stacked | stacked |
| 640–939 | same, abbreviated headers | 2-up, third item alone on its own row | stacked | stacked |
| 940–1279 | full-word headers (CSS, see Stage above) | 4-up row below the stage, three of four tracks populated | 2-up (`md:grid-cols-2`) | stacked |
| ≥ 1280 | Field + right rail `xl:grid-cols-[minmax(0,1fr)_15rem] xl:divide-x` | vertical hairline stack in the rail, three items | 12-col, spans 5/3/4, `xl:divide-x` | 2-up, `xl:divide-x` |

No interpolated Tailwind classes. `xl:col-span-5` as a literal string, never
`` `xl:col-span-${n}` ``.

Below 640, everything runs in the one column of the table above, top to
bottom: masthead, stage, readouts, ledger, table, diptych. Nothing
reorders between phone and desktop; only column counts and header text
change.

- **The stage becomes** the same `CategoryField`, unchanged in kind:
  identity column plus five fixed category columns, horizontal scroll
  inside the Surface's own `overflow-x-auto` so the page body never scrolls
  sideways. Column headers show the abbreviated span (App, Grn, Putt,
  Scor) — see Stage above.
- **The table drops** Composite, Trend and Signal below `md`
  (`hidden md:table-cell` — removed from layout, not scrolled to), keeping
  Player, Rounds, Scoring avg and the four SG columns visible at every
  width. The three dropped values are not lost: they still open in the row
  expand's triage links. The surviving seven columns get the table's own
  `overflow-x-auto` for phones too narrow to fit them without scrolling —
  see Table above.
- **Every branch here is CSS-gated.** The header-label switch is the dual
  `hidden min-[940px]:inline` / `min-[940px]:hidden` span pair from Stage
  above, not a `useMediaQuery` hook; the readout, ledger and diptych
  reflows are plain `md:`/`xl:` grid classes; the dropped table columns are
  `hidden md:table-cell`. No client-only breakpoint state and no
  hydration flip anywhere on this page — see What this deletes.

---

## What this deletes

Delete, do not restyle:

1. `ViewHeader` from the populated path (`TeamStatsBoard.tsx:402-455`) —
   kept only for the zero-player branch.
2. The sticky `StatMatrix` band wrapper (`:470-472`).
3. `MatrixBoard` (`:485`) — the stage and the table together replace it.
4. `Bento` + all four `BentoCell`s (`:501-565`).
5. `InstrumentPanel` around the leak charts and the `RailBars` +
   nested `StatMatrix` pair (`:519-535`).
6. The duplicate `sgTakeaway` caption, promoted to the verdict.
7. The `useMediaQuery('(min-width: 940px)')` hook and its `isBoardWide`
   state (`TeamStatsBoard.tsx:182`) — a client-only breakpoint branch,
   named outright in LANGUAGE.md's Bans list. Replaced by the dual-span
   CSS header labels described under Stage and Phone above, which reuse
   the arbitrary-variant idiom already at `TeamStatsBoard.tsx:470`.

If the finished page still reads as a masthead over a deck of bordered
boxes, it has failed the brief and must be recomposed, not tweaked.

---

## Honesty rules for this page

These are not style notes. The existing file already gets them right and a
rewrite is the easiest place to lose them.

- A trend count of zero must never render as an authoritative "0▲ 0→ 0▼".
  The gate is `hasTrajectorySignal` (`TeamStatsBoard.tsx:377`) and the
  reasoning is in the comment at `:369-376`. Preserve both.
- `roundsError`, `intelligenceError` and `leakError` are three independent
  flags and the notice distinguishes them (`:148-158`). A failed fetch must
  never be presented as a cold start.
- A missing strokes-gained value renders an en dash ("–"), never a zero
  bar. Every null-value formatter in both files renders an em dash ("—")
  for this case today; all of them are glyph fixes for this rewrite, not
  the honesty rule itself, which is unchanged. See Risk 6 for the full
  list.
- `TREND_SIGNAL_MIN_ROUNDS` is 8 (`buildTeamBoardViewModel.ts:139`). Quote
  the constant, never the literal.

---

## Risks

1. **Sort state and hydration.** The stage's sort is client state. Render
   the server default, derive the order in `useMemo`, and never read
   `Date.now()` or `new Date()` in a render path. `freshness` timestamps
   arrive as props from the route (`TeamStatsBoard.tsx:103`) and stay props.
2. **Do not "simplify" the dual header spans to `sr-only`.** The pair must
   stay `hidden`/`inline` (`display:none` toggling, as specified under
   Stage), not `sr-only`/`not-sr-only` (clip-based visibility toggling). A
   `display:none` span is removed from the accessibility tree, so exactly
   one of the two labels is ever announced at any width, with no
   `aria-hidden` needed. `sr-only` keeps both spans in the tree and would
   make a screen reader read "Approach App" together — a regression a
   later edit could introduce by mistake if someone reaches for the more
   familiar `sr-only` idiom instead of rereading Stage.
3. **`CategoryField` is a promotion candidate, not a promotion.** Build it
   page-local. Do not edit `modules/index.ts`, `modules/types.ts` or
   `registry.ts`; the ratchet test
   `src/test/static/fairway-facelift-ratchets.test.ts` requires every barrel
   export to appear in `registry.ts`, and only the lead adds entries there.
4. **No loader change is needed.** Every field this spec cites is already
   resolved by `stats/team/page.tsx` and passed as props
   (`TeamStatsBoard.tsx:83-104`). If you believe you need a new query, stop
   and report it rather than adding one.
5. **`buildTeamBoardViewModel.ts` is pure and tested**
   (`__tests__/buildTeamBoardViewModel.test.ts`). Extend it rather than
   duplicating ranking or formatting logic in the component. New page-level
   pure logic goes in a new `team-stats-logic.ts` with its own test.
6. **The em dash for "missing" is systemic, not one function.** Every
   null-value formatter this spec relies on shares the same literal
   `'—'` (U+2014): `fmtSg`'s null branch (`buildTeamBoardViewModel.ts:38`,
   function at `:36`) and its four
   siblings `fmtScoringAvg`/`fmtScore`/`fmtPercent`/`fmtPerRound`
   (`:47,52,57,62` — the last three feed the table's row-expand fields via
   `:425-430`), plus two bare `'—'` ternaries that are NOT inside any of
   those named functions — `teamScoring` (`:462`, backing the Team register's
   Scoring column above) and `teamSg` (`:514`, backing the Readouts' Team
   SG / rd item above) each null-check inline in the main view-model body,
   so fixing `fmtScoringAvg` or `fmtSg` alone leaves both of those readings
   showing an em dash — this is exactly the gap the Readouts table above
   corrects its own citations for. Continue the sweep with
   `TeamStatsBoard.tsx`'s own `fmtPct`/`fmtOneDecimal`
   (`:632,636`, feeding the Fundamentals ledger column via `:296-308` and
   `:531-532`), the Composite column's null fallback (`:358`),
   `ExpandStat`'s `?? '—'` (`:613`), `RankOrDash` (`:573`), and the
   `InlineNotice` error copy's template literal (`:157`, kept per Masthead
   above apart from this one glyph). Change every one of these to an en
   dash ("–", U+2013), matching `ScoreField.tsx:109`'s existing convention
   for the same case — one glyph, swapped everywhere it appears, not a
   rewrite of the functions. Update each function's existing
   unit-test expected strings alongside it; do not add new test cases to
   cover the rewrite. Separately, the Fundamentals caption
   (`TeamStatsBoard.tsx:517`, kept verbatim by the Ledger row above) uses an
   em dash as sentence punctuation, not as a null glyph — rephrase it with a
   comma ("Pooled from every recorded opportunity, not averaged player
   percentages.") rather than swap the glyph in place. And the most-improved
   signal label is built as `` `▲ ${...}` `` (`buildTeamBoardViewModel.ts:398`);
   drop the arrow glyph, keep the words.
7. **No new field.** Every number, bar, row and sentence in this spec
   traces to a field `buildTeamBoardViewModel.ts` or `stats/team/page.tsx`
   already computes today; `newFields` is empty. The only source changes
   this spec requires are the glyph fixes in Risk 6 and the CSS-only header
   labels replacing `useMediaQuery` (What this deletes, item 7) — neither
   touches the loader or the view-model's field shape.

---

## Result

Built on `agent/frost-facelift`. Files:

- `src/components/golf/stats/team-board/TeamStatsBoard.tsx` — rewritten as the
  composition (masthead, stage, ledger, table, diptych).
- `src/components/golf/stats/team-board/CategoryField.tsx` — new, page-local.
- `src/components/golf/stats/team-board/team-stats-logic.ts` — new, pure.
- `src/components/golf/stats/team-board/team-stats-parts.tsx` — new.
- `src/components/golf/stats/team-board/buildTeamBoardViewModel.ts` — extended
  and glyph-swept.
- `src/components/golf/stats/team-board/__tests__/team-stats-logic.test.ts` — new.
- `TeamStatsBoard.freshness.test.tsx` and `__tests__/buildTeamBoardViewModel.test.ts`
  — updated to the new composition and the en dash.

`modules/index.ts`, `modules/types.ts` and `registry.ts` are untouched.
`CategoryField` is a promotion candidate and nothing else imports it.
No loader change; `newFields` stayed empty.

### Deviations, and why

1. **The third column's wide header is "Green", not "Around the green".** A
   4.5rem category track cannot hold "AROUND THE GREEN" on one line at ANY
   viewport width, and the first capture at 1440 showed it wrapped over three
   lines — the clipping failure LANGUAGE.md's breakpoint floor exists to
   prevent. The header carries the head noun; the full name is on the page in
   the verdict, in the leak ledger, and as the sort control's accessible name.
   The "Short game"/"Shrt" contradiction the spec set out to fix is gone.

2. **Phone category tracks are 2.5rem, not 3.25rem, and the identity floor is
   7.5rem.** With the specified 3.25rem the field opened on a 390px phone with
   the Scoring column off-screen and the active sort column cut in half, which
   reads as broken rather than as "scroll for more". 7.5rem + 5 × 2.5rem is
   320px, inside the 326px a 390px phone leaves after the page gutter and the
   Surface's padding, so all five columns and a whole player name fit with no
   scrolling at all. A 2.5rem track still clears the 34px rank swatch and the
   36px team bar. `overflow-x-auto` stays for phones narrower than 390.

3. **The `md:grid-cols-[minmax(0,1fr)...]` identity track keeps a floor below
   `md`.** Same measurement as above: `minmax(0,1fr)` on a phone leaves roughly
   66px for a name.

4. **A local `TeamReadouts`, not `FieldReadouts`.** `ReadoutItem.value` is
   `string | null` (`coach-home-parts.tsx:83`) and the Trajectory readout is
   three counts with direction glyphs. The spec's own escape hatch applies:
   the class strings are copied, not reinvented. Two changes to the copy:
   `xl:justify-between` became `xl:justify-start` and `xl:h-full` was dropped,
   because three items spread across a rail as tall as a nine-row field made
   the column read as empty rather than as a stack. `coach-home-parts.tsx` was
   not modified.

5. **A hand-rolled `<table>`, not the `DataTable` primitive.** `DataTable`
   renders `rounded-card border border-border-subtle bg-surface` — a box, and
   this table lives bare on the canvas. The construction matches
   `qualifiers-parts.tsx`, including the `<caption class="sr-only">` the spec
   itself specifies.

6. **The phone table is a stacked list, not seven scrolling columns.** The
   team lead's standing rule for this pass: a `md:hidden` stacked list beside a
   `hidden md:block` table, both always in the DOM with CSS choosing. The
   stacked row carries name, signal, rounds, scoring average and all four SG
   values. The stage keeps its shared grid, which stacking would destroy.

7. **Composite / Trend / Signal drop at `lg`, not `md`.** The table branch only
   exists from `md` up, so `hidden md:table-cell` would have shown all ten
   columns at 768px. Dropping at `lg` renders exactly the seven columns the
   spec names for narrow widths.

8. **The sorted order is its own `useMemo`, not the one that builds `vm`.**
   Same hydration property — the default sort is derived from the data, so the
   server render and the first client paint agree — without rebuilding the
   whole view model on every sort click.

9. **"Who leads each" lists all five columns, including Scoring.** The spec
   scopes column 1 to the four SG categories but leaves column 2 unqualified
   and points it at `vm.rows[].ranks`, which carries five. Scoring is the one
   column a cold-start roster has, so including it keeps the column from
   rendering empty exactly when the other two have nothing to say.

10. **The leak maps print their takeaway.** `ChartFrame` accepts `takeaway`
    and uses it only for the chart's spoken label; it never renders it. The
    sentence is now printed above each plot as well as passed through.

11. **Each diptych half has one heading.** `LeakMap` defaults its title to the
    component's own name ("Leak Map"), which printed a second heading under
    every `SectionHead`. Both halves pass their real title, kept in the DOM as
    the chart's accessible name and hidden visually.

12. **The verdict's cold-start clause is gated on `!roundsError` too.** The
    spec gates the stage's copy of that sentence; the same sentence in the
    verdict would otherwise assert a data-collection gap on a failed fetch.

13. **`buildTeamBoardViewModel` gained two derived fields**, both read from
    data it already had: `rows[].sg` (the player's own per-category strokes
    gained, for the table's value columns) and `kpis.teamScoringRaw` (so a
    caller can tell an absent reading from a real one without string-matching
    the dash). No new query, no new column.

### Not done, and reported instead

- `worstCategoryLabel` in `buildTeamBoardViewModel.ts` still builds the signal
  chip "Short game slump" while every other surface on this page now says
  "Around the green". That is the same naming contradiction the spec's header
  rename fixes, one file over, but it is signal copy the spec did not scope and
  it has its own tested behaviour. Flagged to the lead rather than widened into.
- `formatTeamStatsFreshnessHeadline` reads a clock. The spec keeps it
  unchanged and its test fakes `Date` to assert "Updated 2h ago". Pre-existing,
  not introduced here — the page has no other clock read.
