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
    `roundsPlayed` via `weightedMean`, `buildTeamBoardViewModel.ts:115`):
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
  `"{rows.length} players · {rounds30d} rounds in 30 days · {freshness}"`,
  where freshness is `formatTeamStatsFreshnessHeadline(freshness)`
  (`teamStatsFreshness.ts:35`), unchanged.

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
Default sort: the leaking category from the verdict, so the page opens
already showing who owns the problem. Where `hasSg` is false, default to
scoring rank; where that is also absent, default to name.

Header text follows the existing 940px switch (`TeamStatsBoard.tsx:182-196`)
but not its mechanism: render both label spans in every header cell —
`<span className="hidden min-[940px]:inline">Approach</span><span
className="min-[940px]:hidden">App</span>` (and the same pair for
Short game/Shrt, Putting/Putt, Scoring/Scor) — and let the stylesheet pick,
the same arbitrary-variant idiom `TeamStatsBoard.tsx:470` already uses for
its own sticky band. `useMediaQuery('(min-width: 940px)')`
(`TeamStatsBoard.tsx:182`) and `isBoardWide` are retired by this change —
LANGUAGE.md's Bans list names this exact pattern outright ("a client-only
breakpoint branch"), and the header text still changes at the same width as
the columns it labels, because both spans key off one CSS breakpoint rather
than two independently-updated states. See What this deletes and Risks.

Sort state is client state and must not leak into the server render. Render
the default sort on the server, and derive the sorted order in the same
`useMemo` that already builds `vm` (`TeamStatsBoard.tsx:237`).

### Team register

One row above the grid rule, aligned to the category columns.

- Four `DivergingBars`-style signed bars, one per SG category. `DivergingRow`
  is `{ label, delta, display }` (`modules/types.ts:153`) and
  `DivergingBarsProps` needs a shared `max` (`:154`) — use
  `Math.max(1, ...sgData.map(d => Math.abs(d.value)))` so all four bars share
  one scale. Do NOT give each column its own scale; a −0.1 leak must not
  render the same size as a −3.2 leak.
- `display` is `fmtSg(value)` (`buildTeamBoardViewModel.ts:36`), unchanged.
- Tone: `bg-fw-warning` below zero, `bg-accent-500` above. Green is ink,
  amber means over par — LANGUAGE.md's materials rule.
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

---

## Readouts

Bare, no box. Same component and same responsive behaviour as
`FieldReadouts` (`coach-home-parts.tsx`): a 2-up grid on phone, 4-up at
`md`, and a vertical hairline-divided stack in the stage's right rail at
`xl`. Reuse `FieldReadouts` if its props fit; otherwise copy its class
string exactly rather than inventing a second rhythm.

Four items, the same four `statItems` the sticky band shows today
(`TeamStatsBoard.tsx:379-397`), with their containers removed:

| Readout | Source | Missing |
|---|---|---|
| Team scoring | `vm.kpis.teamScoring` (`buildTeamBoardViewModel.ts:304`) | en dash (see Risks: `fmtScoringAvg` renders an em dash today) |
| Team SG / rd | `vm.kpis.teamSg` (`:305`) | en dash (see Risks: `fmtSg` renders an em dash today) |
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
(`registry.ts:216`) showing the signed magnitude on the shared `max` from
the stage. This is the tornado's information without the tornado's box; the
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
| < 640 | Field, abbreviated headers, horizontal scroll inside the Surface only | 2-up grid below the stage | stacked | stacked |
| 640–939 | same, abbreviated headers | 2-up | stacked | stacked |
| 940–1279 | full-word headers (CSS, see Stage above) | 4-up row below the stage | 2-up (`md:grid-cols-2`) | stacked |
| ≥ 1280 | Field + right rail `xl:grid-cols-[minmax(0,1fr)_15rem] xl:divide-x` | vertical hairline stack in the rail | 12-col, spans 5/3/4, `xl:divide-x` | 2-up, `xl:divide-x` |

No interpolated Tailwind classes. `xl:col-span-5` as a literal string, never
`` `xl:col-span-${n}` ``.

Below 640, everything runs in the one column of the table above, top to
bottom: masthead, stage, readouts, ledger, table, diptych. Nothing
reorders between phone and desktop; only column counts and header text
change.

- **The stage becomes** the same `CategoryField`, unchanged in kind:
  identity column plus five fixed category columns, horizontal scroll
  inside the Surface's own `overflow-x-auto` so the page body never scrolls
  sideways. Column headers show the abbreviated span (App, Shrt, Putt,
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
   `:425-430`), plus `TeamStatsBoard.tsx`'s own `fmtPct`/`fmtOneDecimal`
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
