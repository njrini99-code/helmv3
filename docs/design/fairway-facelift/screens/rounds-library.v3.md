# Rounds library (coach), v3 field-sheet spec

`/golf/dashboard/rounds`, `userRole === 'coach'` only. File of record:
`src/components/fairway/pages/rounds/FairwayRoundsLibrary.tsx` (coach branch,
currently lines 769-1290) plus `FairwayRoundRow.tsx` and
`rounds-instruments.tsx`. The player branch of this shared file
(`RoundsStage`/`ScoreBandHistogram`/`RoundTypeSegment`/`MonthDeviationBars`,
`rounds-instruments.tsx:252-491`) is **out of scope** — untouched by this
spec.

This replaces `rounds-library.v2.md`'s "Cockpit" (`InstrumentCluster` +
`RadialGauge` + four tertiary `InstrumentPanel` tiles) and "Leaders rail"
(`Elevated` spotlight card). That composition is exactly the pattern
LANGUAGE.md was written to kill: a masthead, then a deck of same-shape bordered
tiles each holding a number and a label. v3 follows LANGUAGE.md's binding page
anatomy instead — bare masthead, one Surface stage holding one real
instrument, a bare two-column ledger, a dense table — using only fields that
exist in the code today (cited `file:line` throughout) plus one loader change
called out explicitly in Risks.

## The question

What has been played this season, and is the team's scoring settling,
drifting, or scattered, and who is actually leading it right now.

## Masthead

Eyebrow: `"Team Rounds"` (unchanged, `FairwayRoundsLibrary.tsx:676`).

Title, `text-display`, unchanged static string: `"The library."`
(`FairwayRoundsLibrary.tsx:677`). Per LANGUAGE.md item 1 the title and the
verdict are two separate elements — this corrects v2, which fused them into
one H1. The reference implementation (`FairwayCoachDashboard.tsx:328-329`)
keeps a static title and a separate verdict paragraph below it; v3 does the
same here.

No primary action for the coach role (unchanged — `primaryAction` is
`undefined` for `!isCoach === false`, `FairwayRoundsLibrary.tsx:689-693`). No
overflow menu; there is nothing to add one for on this page today.

**Verdict**, `text-h3` font-normal, max 64ch, directly under the title (same
slot/typography as `VerdictLine`, `coach-home-parts.tsx:26-44`). It always
describes the **whole roster**, independent of any player-scope control set
on the stage below (the stage's own scope is a drill-down the coach opts
into; the masthead stays the constant, zoomed-out headline).

Template (full data):

> "Since {firstMonth} the team is {absShots} shot{s} {better|worse|even} than where the season started, led by {LeaderName} at {avgToParSigned}."

This deliberately never states a round count: Readout 1 below
(`scopedSummary.count`) already owns that number, and in the default,
untouched-Select state `scopedSummary.count === rounds.length` — the exact
digit the verdict would otherwise be repeating one region below itself. That
is the same "no region repeats a number another region already shows" rule
this spec applies to the ledger and table elsewhere (see "The table"'s
grouping note); LANGUAGE.md:90 mandates a round count as a *readout* for this
page, not as part of the verdict sentence, so the readout wins and the
verdict yields.

Field substitution, every one an existing computation:
- `firstMonth` = `firstMonthLabel(rounds)` (existing function, `FairwayRoundsLibrary.tsx:285-293`).
- `absShots` / `better|worse|even` = `Math.abs(Math.round(scoreDelta))` and its sign, exactly the phrase already assembled at `FairwayRoundsLibrary.tsx:733-737` (`scoreDelta` computed `FairwayRoundsLibrary.tsx:644-652`, oldest-vs-newest normalized score over the full team).
- `LeaderName` / `avgToParSigned` = the top entry of `playerSeasonStats` **unscoped** — the same sort `leaderboardEntries` already performs (`FairwayRoundsLibrary.tsx:521-526`) but without its player-select pre-filter (`FairwayRoundsLibrary.tsx:523-524`), i.e. `Array.from(playerSeasonStats.entries()).sort((a,b) => a[1].avgToPar - b[1].avgToPar)[0]`. `playerSeasonStats` itself is the existing per-player avg-`score_to_par` memo, min 2 scored rounds to qualify (`FairwayRoundsLibrary.tsx:407-426`). `avgToParSigned` uses the exact `+`/plain-decimal format already defined at `FairwayRoundsLibrary.tsx:710-715`, applied to this player's `avgToPar` instead of `stats.avgToPar`.

Missing-fact fallbacks, applied in order — each keeps whichever clauses still
have data, giving the surviving clause its own subject so the sentence never
reads as a dangling fragment:
- `rounds.length === 0` — the verdict line does not render at all; the page is already in its top-level `EmptyState` branch (`FairwayRoundsLibrary.tsx:934-951`). Title stays "The library." alone, exactly today's fallback.
- `scoreDelta === null` (fewer than 2 scored rounds team-wide, `seriesDelta`'s own gate, `FairwayRoundsLibrary.tsx:330-333`) — drop the shots clause, giving the remainder its own subject: `"The season started {firstMonth}."`, then append the leader clause (`", led by {LeaderName} at {avgToParSigned}"`) if one exists.
- `firstMonth === null` (no parseable date, an edge case) — drop the "since {firstMonth}" framing only, keeping the shots clause with its own subject: `"The team is {absShots} shot{s} {better|worse|even} than where the season started."`, then the leader clause if present.
- No qualifying leader (every player has fewer than 2 scored rounds — `playerSeasonStats` empty) — drop `", led by … at …"` entirely; the sentence ends after whichever clause above survived.
- Every clause above unavailable at once (`scoreDelta === null` AND `firstMonth === null` AND no qualifying leader, with `rounds.length > 0`) — the verdict line does not render; title stays alone, same fallback as the zero-rounds case.

**Names/links**: `LeaderName` is styled `font-fw-mono` today, **not a link** —
`RoundLibraryRound.player` carries only `first_name`/`last_name`/`avatar_url`
(`FairwayRoundsLibrary.tsx:169-173`), no `id`, so there is no roster route to
point at. LANGUAGE.md's own rule allows "links **or** mono" for names
(`LANGUAGE.md:30`); once the `player.id` field exists (see Risks/newFields)
this becomes a `Link` to `/golf/dashboard/roster/{id}`, matching how
`VerdictLine` already links names on Home (`coach-home-logic.ts:170,178`).
Numbers (`absShots`, `avgToParSigned`) are always `font-fw-mono tabular-nums`,
never links.

## The stage

**One instrument, `RoundField`**: every **scored** round in view plotted as a
mark on a shared date axis, height and color encoding its score to par, with
the scoped average drawn as a line across it. (A round with no recorded
`score_to_par` has no y-position to plot and is excluded from the marks — see
the first Geometry bullet below for exactly what still counts it.) New
page-local component
(`src/components/fairway/pages/rounds/RoundField.tsx`) — no registered
primitive matches "every round as its own event on a date axis with a
benchmark line" (`ScoreField` plots per-*player* rows, not per-*round*
marks; `Ribbon`/`TrendChart` are single continuous series, one number per
point, with no per-mark type/size distinction; `TickerStrip` positions items
by index slot, not by real date — none of the three can hold LANGUAGE.md's
literal Rounds-row instrument, "Round scatter over time (score to par per
round, team average line)," `LANGUAGE.md:90`). Page-local rather than
registered, the same precedent `rounds-instruments.tsx`'s own components
already set (`RoundsStage`, `ScoreBandHistogram`, etc. are real instruments
used on exactly one screen and are not in `registry.ts`).

**Scope**: the instrument and its readouts operate over `playerScopedRounds`
— `rounds` filtered by the coach's player Select only (`playerFilter`,
`FairwayRoundsLibrary.tsx:356`), mirroring the exact predicate
`leaderboardEntries` already uses for "current scope" (deliberately
player-select-only, not search — the code's own documented rationale,
`FairwayRoundsLibrary.tsx:515-520`). Free-text search and the round-type
pills (the Toolbar, described under "The table") narrow the table below but
not the stage — the stage is the season-wide picture, the table is the
searched/typed slice of it.

**Header row** (inside the one stage `Surface`, matching
`FairwayCoachDashboard.tsx:366-395`'s pattern exactly):
- Overline: `"THE SEASON · {scope}"` where `scope` is `"every player"` when
  `playerFilter === 'all'`, else the selected player's name.
- Title, `text-h2`: `"Round scatter"`.
- One-line legend, `text-caption text-text-tertiary`: `"Every scored round in
  view, plotted by date. Dots rise over par in amber and drop under in
  green; bigger dots are qualifiers and tournaments; the dashed line is the
  average to par."`
- View control, right: the existing coach player `Select`
  (`FairwayRoundsLibrary.tsx:984-994`), relocated from the Toolbar into this
  header — rendered only when `playerOptions.length > 1`
  (`FairwayRoundsLibrary.tsx:984`, unchanged gate). Phone: becomes a `Menu`
  (LANGUAGE.md's global phone rule), same trigger pattern the Month/Week
  control already uses at `FairwayRoundsLibrary.tsx:1027-1049`.

**Geometry** (percentage-based, no SVG scaling, no per-breakpoint JS number —
same approach `ScoreField.tsx:12-13` documents, and the same reason
`ScoreField` itself never branches a size constant on viewport width: a
`HALF_HEIGHT_PX`-style split would be a client-only breakpoint read):

- **Null `score_to_par`**: a round with no recorded `score_to_par` is
  excluded from the plotted marks entirely — there is no y-position to place
  it at, and no `round.score_to_par` value for the color/height rules below
  to read. It is still counted in `scopedSummary.count` and in the
  Qualifier-share readout (both depend on the round existing and its
  `round_type`, never on having a score), so "Rounds" and "{n} scored" are
  two different, independently honest numbers whenever any round in scope is
  missing a score — never silently reconciled to look the same.
- Container height: `h-[168px] md:h-[208px]` (CSS only — no JS reads a
  breakpoint anywhere in this instrument). Baseline (par, `score_to_par ===
  0`) is a `border-strong` hairline at `top: 50%` — identical treatment to
  `ScoreField.tsx:253`.
- Max mark travel from baseline: **`40%` of the container's own height**,
  fixed in one place regardless of which breakpoint's height applies (at
  `208px` that's `~83px`; at `168px` that's `~67px` — both follow from the
  same `40%` automatically, so the CSS height class is the only thing that
  changes at the breakpoint, never a JS pixel figure).
- Domain: `{ start, end }` = the earliest and latest `round_date` in
  `rounds` (the full, unscoped set — see cap note below for why the axis
  itself does not follow the player-scope Select), sorted chronologically
  the same way `chronoScored` already is (`FairwayRoundsLibrary.tsx:633-643`).
  No live "Today" marker — this page reads the past, not a live window, so
  there is no `end = today` concept to draw (unlike `ScoreField.tsx:292-295`'s
  Today mark on Home).
- **Position (x)**: `dateFraction(round.round_date, domain)`, reused
  verbatim, unmodified, from `ScoreField.tsx:40-46` (already exported;
  already returns a `0–100` percentage, not a pixel value).
- **Height (y-offset from baseline)**: `top: calc(50% ${sign} ${pct}%)`
  where `pct = Math.min(1, Math.abs(score_to_par) / cap) * 40`, `sign` is
  `-` for under par (rises above the baseline) and `+` for over (drops
  below) — a single percentage number computed once per mark, so the exact
  same style works unmodified inside either the `168px` or `208px` container.
  No minimum clamp (a dot at `score_to_par = 0` sits exactly on the
  baseline; unlike `ScoreField`'s bars a dot needs no minimum nub to stay
  visible — its fixed diameter already is one). `cap = roundFieldCap(rounds)
  = Math.min(12, Math.max(4, max(|score_to_par|) over the full, unscoped
  `rounds` prop with a non-null `score_to_par`))` — the identical formula
  `scoreFieldCap` already uses (`ScoreField.tsx:49-53`, itself computed over
  the whole roster's rows, never a per-row/per-player subset), re-expressed
  over individual rounds instead of nested per-player rows. Deliberately
  computed over the full team, not `playerScopedRounds`: the axis scale
  stays fixed while the coach changes the player-scope Select, so switching
  players changes which dots appear without ever re-scaling the y-axis
  underneath them — the same "one shared axis" guarantee `ScoreField` gives
  a whole roster, held here across a single season's scope changes.
- **Color**: under par (`score_to_par < 0`) → `bg-accent-500`; over par
  (`score_to_par > 0`) → `bg-fw-warning`; exactly even → `bg-text-tertiary/70`
  — the same three-way rule `ScoreField.tsx:151,167-172` already encodes.
- **Size**: `5px` diameter for `practice`/untyped rounds, `8px` for
  `qualifier`/`tournament` rounds — a real encoding of `round_type`
  (`FairwayRoundsLibrary.tsx:155`), so a coach sees at a glance which marks
  are the rounds that count.
- **Same-day nudge**: multiple rounds landing on one date offset by `+4px`
  each, the identical `SAME_DAY_NUDGE_PX` pattern `ScoreField.tsx:29,260-261`
  already implements via a running `Map<date, count>` while rendering.
- **Axis ticks**: `scoreFieldTicks(domain)`, reused verbatim from
  `ScoreField.tsx:67-106` (weekly under 45 days, monthly beyond, thinned past
  eight ticks), rendered along the bottom edge exactly as
  `ScoreField.tsx:280-296` does, minus the Today span.
- **Average line**: a `1px` dashed `border-accent-300` line at `top: calc(50%
  - ${Math.min(1, Math.abs(scopedSummary.avgToPar) / cap) * 40}%)` (sign
  flipped the same way a mark's does), right-edge label `"Season avg
  {avgToPar}"` in `text-accent-700 font-fw-mono text-eyebrow` (same treatment
  as the Today label, `ScoreField.tsx:294`). Rendered only when
  `scopedSummary.toParCount >= 3` — **not** the same denominator as
  `starved` (`FairwayRoundsLibrary.tsx:696`, which counts rounds with a
  usable `total_score`): the line draws `avgToPar`, so its own honesty gate
  counts non-null `score_to_par` values specifically, mirroring the exact
  asymmetry `page.tsx:195` (`scoredRounds`, filtered on `total_score`) and
  `page.tsx:196,212` (`toParScores`, filtered on `score_to_par`) already
  keep as two separate arrays with two separate counts, never one shared
  denominator.

  `scopedSummary` is a new client memo over `playerScopedRounds`, modeled
  directly on `page.tsx:192-227`'s own `roundStats` computation (same three
  denominators, same nulls-excluded reductions, just re-run over the scoped
  subset instead of the full team):
  - `count` = `playerScopedRounds.length` — every round in scope, regardless
    of whether it carries a score.
  - `scoredCount` = rounds in scope with a usable `total_score` (mirrors
    `page.tsx:195`'s `scoredRounds` filter) — the denominator for `avg` and
    `best`.
  - `toParCount` = rounds in scope with a non-null `score_to_par` (mirrors
    `page.tsx:196`'s `toParScores` filter) — the denominator for `avgToPar`
    and this average line.
  - `avg` = mean of `normalizedScore()` (reused verbatim from
    `rounds-instruments.tsx:52-58`) over the `scoredCount` rounds, `null` if
    `scoredCount === 0`.
  - `avgToPar` = mean `score_to_par` over the `toParCount` rounds, `null` if
    `toParCount === 0` (mirrors `page.tsx:212`).
  - `best` = min `normalizedScore()` over the `scoredCount` rounds, `null` if
    `scoredCount === 0`.
  - `qualifierCount` = rounds in scope typed `qualifier`/`tournament` —
    independent of score, since `round_type` is always known.

  This three-denominator split matters concretely: a player with 4 rounds
  logged but no `score_to_par` recorded on any of them has `count = 4` but
  `toParCount = 0` — under the old single-`count` gate this would have drawn
  the average line at `avgToPar = NaN`; under `toParCount >= 3` it correctly
  stays hidden.
- **Link**: each mark is a `Link` to `/golf/dashboard/rounds/{round.id}`
  (existing field, `FairwayRoundsLibrary.tsx:150`), `aria-label` built from
  player name + course + score + to-par + date — the same convention
  `ScoreField`'s own bars use (`ScoreField.tsx:177-186`, label assembled the
  way `coach-home-logic.ts:93` already does it for player rounds).
- **Entrance motion**: same timing and guard as `ScoreField`'s bars, one
  deliberate divergence in which transform property animates —
  `initial={reduced ? false : { scale: 0, opacity: 0 }}`, `animate={{ scale:
  1, opacity: 1 }}`, `transition={{ duration: DURATION.short, delay:
  Math.min(index, 16) * 0.012, ease: EASE_CINEMATIC }}`, guarded by the same
  `useReducedMotionGuard()` hook. `ScoreField.tsx:158-160` animates `scaleY`
  (a bar growing from its baseline edge, `transformOrigin: 'bottom'`/`'top'`)
  — a dot has no baseline edge to grow from, so `RoundField` uses uniform
  `scale` instead (popping from its own center). The duration/delay/easing
  constants and the reduced-motion guard itself are the exact values reused
  verbatim from `ScoreField.tsx:207` (guard) and its stagger constants.
- **Trend gate for the readouts' delta arrows** (not the average line):
  `scopedSummary.scoredCount >= 6`, re-deriving the same `>= 6` rule that
  produces `stats.trend` (`page.tsx:218`, itself gated on
  `normalizedScores.length`, i.e. scored count) but over the scoped subset
  instead of the unscoped one — necessary because `stats.trend` itself never
  responds to the player-scope control. This mirrors an existing
  dual-threshold precedent already in this file: `starved` gates at 3
  scored rounds (`FairwayRoundsLibrary.tsx:696`), `hasScoreTrend`/
  `hasToParTrend` gate at 6 scored rounds (`FairwayRoundsLibrary.tsx:702-704`)
  — two different honesty bars for two different claims, both keyed to
  scored count, carried forward unchanged; the average line above is the one
  exception, keyed to `toParCount` instead because it draws a to-par number,
  not a score number.

**Degradation**:
- Zero rounds in `playerScopedRounds` (a selected player with no completed
  rounds — an edge case since `playerOptions` are derived from names present
  in `rounds`, `FairwayRoundsLibrary.tsx:379-389`): `EmptyState
  variant="subtle"`, same component/variant this page's ledger already uses
  at its own empty branch (`FairwayRoundsLibrary.tsx:1093-1111`), title "No
  rounds for this player."
- One round: `dateFraction`'s own min-one-day-span guard
  (`ScoreField.tsx:41-42`) places the single dot at the left edge with no
  division-by-zero. No average line (`toParCount < 3`). Caption under the
  legend: `"One round logged. Two more and the pattern starts to show."`
- Two rounds: both dots render normally; still no average line (still
  `toParCount < 3` unless one round lacks a `score_to_par`, in which case
  the line stays hidden even sooner). Caption: `"One more round and the
  average line draws."`

**Why a scatter beats a table here**: the table below already lists every
round's to-par as text; reading it for "is this settling or scattered"
means holding forty rows of numbers in your head. Position, color and size
turn that same data into a shape read in one glance — a run of green dots
tightening toward the average line, or a cluster of amber around a gap in
play, or a big dot (a qualifier) sitting right where the trend broke. That
is exactly the failure LANGUAGE.md names: a coach should not need to
out-read the numbers to get the page's answer.

Note on the "dot slider" ban (`LANGUAGE.md:82`): that targets an interactive
carousel-style page-indicator control, a UI element, not a data
visualization mark. `RoundField`'s dots are data points positioned by real
fields, structurally the same idea as `ScoreField`'s own bars (LANGUAGE.md's
cited reference instrument) — not the banned pattern.

## Readouts

Up to four, right column inside the stage `Surface` (desktop), matching
`FieldReadouts`'s slot (`coach-home-parts.tsx:102-134`) — all four sourced
from the same new `scopedSummary` memo described above, so they always agree
with what `RoundField` is plotting.

1. **Rounds** — `scopedSummary.count` (= `playerScopedRounds.length`). No
   delta (a count has no "better"). Caption: `"since {firstMonthLabel(
   playerScopedRounds)}"`, reusing `firstMonthLabel` (`FairwayRoundsLibrary.tsx:285-293`)
   against the scoped array instead of the full one.
2. **Avg** — `scopedSummary.avg` (one decimal), shown whenever
   `scopedSummary.scoredCount >= 1`; below that (a scoped player with rounds
   logged but none of them scored) the readout falls back to `"—"` with the
   caption `"No scored rounds in view."` — the same shape of honest-empty
   fallback this page already uses elsewhere (`EmptyState variant="subtle"`
   pattern). Delta = last-minus-first over the scoped chronological
   normalized series, the same `seriesDelta` computation
   (`FairwayRoundsLibrary.tsx:330-333`) re-run on the scored subset of
   `playerScopedRounds`, shown only when `scopedSummary.scoredCount >= 6`
   (the trend gate above). "Better" = a **negative** delta (a falling
   average) — lower scores are the good direction, the same convention
   `hasScoreTrend` already encodes (`FairwayRoundsLibrary.tsx:808`).
3. **Best** — `scopedSummary.best` (min normalized score in scope), same
   `scoredCount >= 1` gate and `"—"` fallback as Avg. No delta. Caption names
   the record round on the **same basis as the number itself**: the round in
   `playerScopedRounds` whose `normalizedScore()` equals `scopedSummary.best`
   (ties broken by earliest date). This is deliberately **not**
   `bestOfScope`'s tie-break (`FairwayRoundsLibrary.tsx:503-513`, which picks
   by lowest `score_to_par`) — par varies round to round, so the
   lowest-normalized-score round and the lowest-to-par round can be two
   different rounds (e.g. a 71 at par 70 beats a 73 at par 74 on score but
   loses on to-par). Naming the to-par pick here while printing the
   normalized-score number would caption the readout with a round that isn't
   the one the number describes. Rendered `"{name}, {course}"`, linked to
   `/golf/dashboard/rounds/{id}` — a real link today, `round.id` already
   exists (`FairwayRoundsLibrary.tsx:150`).
4. **Qualifier share** — `scopedSummary.qualifierCount / scopedSummary.count`
   as a percent. No delta (a share, not a trend — there is no historical
   qualifier-share series to compare against). Caption:
   `"{qualifierCount} of {count}"`. This is LANGUAGE.md's own listed fourth
   readout for this page (`LANGUAGE.md:90`), fully derivable today from the
   round-type counting this file already does (`filterCounts`,
   `FairwayRoundsLibrary.tsx:447-461` — `scopedSummary` counts the same way,
   just over `playerScopedRounds` rather than `scopedRounds`).

## The ledger row

Two bare columns inside a `grid-cols-12 lg:divide-x lg:divide-border-subtle`
row (LANGUAGE.md item 3), **7 / 5** — the exact unequal split LANGUAGE.md
itself lists as an example (`LANGUAGE.md:42`). Both columns use the existing
`SectionHead` primitive for their heading + green rule
(`coach-home-parts.tsx:48-76`), matching Home's ledger exactly. `SectionHead
title="Leaders" count={playerSeasonStats.size}` (no `action`) — the count is
the total number of qualifying players team-wide, so a coach can tell the
5 rows below are a top-5 slice rather than the whole roster whenever
`playerSeasonStats.size > 5`. `SectionHead title="Score bands"` with neither
`count` nor `action` — five fixed bands are always fully listed, there is
nothing to truncate or link onward to.

**Leaders** (`col-span-7 lg:pr-8`) — the page's own listed ledger content for
Rounds (`LANGUAGE.md:90`). Rows are the **unscoped** top 5 of
`playerSeasonStats` sorted ascending by `avgToPar` — the exact same
derivation already introduced above for the masthead's `LeaderName`
(`Array.from(playerSeasonStats.entries()).sort((a,b) => a[1].avgToPar -
b[1].avgToPar)`, sliced to 5), sourced from `playerSeasonStats`
(`FairwayRoundsLibrary.tsx:407-426`). **Deliberately not**
`leaderboardEntries` (`FairwayRoundsLibrary.tsx:521-526`): that memo is
itself pre-filtered by `playerFilter`, so once a row's click sets
`playerFilter` the list would collapse to the one selected player and trip
`LeadersRailPanel`'s own "Only one player in this view" fallback
(`FairwayRoundsLibrary.tsx:1366`) — the leaderboard a coach just clicked
would visibly destroy itself. Using the unscoped sort keeps all qualifying
players listed regardless of which one is currently selected. Each row:
`RankCell` + `Avatar` + name + right-aligned mono `avgToPar` — the same row
markup `LeadersRailPanel` already renders (`FairwayRoundsLibrary.tsx:1369-1380`),
stripped of its enclosing `Elevated` card, with the currently-selected
player's row given a persistent `bg-surface-hover` highlight so the click's
effect is still visible somewhere. **Link**: clicking a row calls the
existing `setPlayerFilter(name)` (`FairwayRoundsLibrary.tsx:356`), scoping
the stage above and the table below to that player — an in-page focus
action today, not cross-page navigation, because `player.id` doesn't exist
on this data yet (see Risks). Clicking the already-selected player's row
calls `setPlayerFilter('all')`, clearing the scope back out. This column
states a fact the stage cannot: the stage plots individual round events,
never a ranked-by-season-average player list.

**Score bands** (`col-span-5 lg:pl-8`) — the page's other listed ledger
content (`LANGUAGE.md:90`). Rows are `scoreBands(filteredRounds)`, reusing
the existing pure function verbatim (`rounds-instruments.tsx:80-95`,
currently called only from the player branch's `ScoreBandHistogram`,
`rounds-instruments.tsx:359-378`) — five fixed bands (Under par, Even, +1 to
+3, +4 to +7, +8 or more, `rounds-instruments.tsx:65`), computed here over
`filteredRounds` (player + search + type — the same scope the table below
uses, `FairwayRoundsLibrary.tsx:490-497`) rather than the stage's
player-only scope, since this column is meant to describe "what's in the
table right now," including a type-pill narrowing (e.g. "just qualifiers").
Each row: label, `RailBars`-style unsigned rail (registered primitive,
`registry.ts` `RailBars`, "rate vs benchmark, several rows," `replaces:
['percent text rows']`) filled to `pct`, then `"{n} ({pct}%)"` right-aligned
mono. **Link**: clicking a row sets a new local `bandFilter` client state
(mirroring the existing `filter`/`playerFilter` pattern,
`FairwayRoundsLibrary.tsx:350-357`) that narrows the table below to rounds
in that band — new page-local state, not a data/loader change (listed under
Risks as a build item). Clicking the already-selected band's row calls
`setBandFilter(null)`, clearing it back out — the same toggle-off behavior
the Leaders column's row click gets above, so the two ledger columns behave
identically as filters. `bandFilter` is wired into the existing
`isNarrowed`/`resetFilters` pair (`FairwayRoundsLibrary.tsx:528-534`) exactly
like `filter`/`playerFilter`/`search` already are: `isNarrowed` becomes
`filter !== 'all' || playerFilter !== 'all' || search.trim() !== '' ||
bandFilter !== null`, and `resetFilters` additionally calls
`setBandFilter(null)`. Without this, a band click that empties the table
would render the table's *non*-narrowed empty copy ("No rounds to show.")
with no "Clear filters" action — a dead end a coach can only escape by
re-clicking the same band row. This column states a fact the stage cannot:
the scatter shows continuous position and color, never a discrete binned
count with a share.

Phone: the two columns stack, `divide-x` becomes a horizontal hairline
between them (LANGUAGE.md item 3's phone rule), Leaders first, Score bands
second.

## The table

A dense `<table>` — replacing the current `<div role="table">`
pseudo-markup (`FairwayRoundRow.tsx`, `FairwayRoundsLibrary.tsx:1119-1263`)
with a real table, per LANGUAGE.md item 4. Column set and typography mirror
the reference table on Home exactly (`RoundsLedgerTable`,
`coach-home-parts.tsx:239-289`).

**Bare on the canvas, no `Surface`.** Today's implementation wraps the
grouped rows in one ledger `Surface` (`FairwayRoundsLibrary.tsx:1113-1118`);
v3 drops that wrapper. LANGUAGE.md is explicit that the stage is "**the one**
`Surface` on the page" (`LANGUAGE.md:32`) and "Canvas is the ground. Only the
stage is a `Surface`" (`LANGUAGE.md:60`); item 4's table description carries
no `Surface` at all. The reference table confirms the pattern:
`RoundsLedgerTable` itself is a bare `<div className="overflow-x-clip">`
wrapping a plain `<table>` (`coach-home-parts.tsx:246-247`) — zero Surfaces.
This table keeps that same bare `<div className="overflow-x-clip">` wrapper
for the identical reason the current code documents
(`FairwayRoundsLibrary.tsx:1113-1118`): `overflow-clip` clips rounded corners
without making the div its own scroll container, which would break the
group header `<td>`'s `position: sticky` (see "Grouping stays" below) — it
just does that clipping on bare canvas instead of inside a `Surface`. With
this change the stage is the page's only `Surface`; see Risks for the two
existing tests this rewrites as a result.

| Column | Source | Align | Hidden |
|---|---|---|---|
| Date | `round_date` (`FairwayRoundsLibrary.tsx:153`), rendered weekday over "Mon D" via the existing `dateParts()` helper (`FairwayRoundRow.tsx:67-72`) | left | always shown |
| Player | `player.first_name`/`last_name`/`avatar_url` (`FairwayRoundsLibrary.tsx:169-173`), `Avatar` + `Link` to the round | left | always shown |
| Course | `course_name` via `cleanCourseName()` (`FairwayRoundsLibrary.tsx:132-133`) | left | `hidden md:table-cell` |
| Type | `round_type` via `getRoundTypeLabel()` (`FairwayRoundRow.tsx:45`) | left | `hidden lg:table-cell` |
| Score | `total_score` (`FairwayRoundsLibrary.tsx:156`), plain `text-text-primary`, no color — matching the reference table's own choice to color only the to-par column (`coach-home-parts.tsx:276-277`), not the raw score | right, mono | always shown |
| To par | `score_to_par` via `formatToPar()`, colored `text-accent-700` under / `text-fw-warning-ink` over (`coach-home-parts.tsx:263,277`) | right, mono | always shown |
| Putts | `total_putts` (`FairwayRoundsLibrary.tsx:159`) | right, mono | `hidden md:table-cell` |
| GIR | `total_gir`/`total_gir_possible` (`FairwayRoundsLibrary.tsx:161-162`) | right, mono | `hidden md:table-cell` |

Row scope: `filteredRounds` (`FairwayRoundsLibrary.tsx:490-497` — player
Select + search + round-type pills), further narrowed by the ledger row's
new `bandFilter` when set. Above the table, unchanged from today: the
`Toolbar` (`FairwayRoundsLibrary.tsx:956-1051`) carries search and the
round-type `FilterPill`s (the player Select has moved into the stage header
above, so it is not duplicated here) plus the Month/Week grouping
`Segmented`/`Menu`.

**Zero matching rows**: when `filteredRounds` narrowed by `bandFilter`
renders no groups, a bare `EmptyState variant="search"` renders directly on
the canvas in the table's place — no `Surface` around it either, consistent
with the table having none. Same copy and behavior the current code already
has (`FairwayRoundsLibrary.tsx:1093-1111`): title "No rounds in this view,"
description `"No rounds match the current filters."` when `isNarrowed`
(now inclusive of `bandFilter`, see "The ledger row") else `"No rounds to
show."`, with a `"Clear filters"` action calling `resetFilters()` only in
the narrowed case. A fetch failure never reaches this branch — the loader
throws on any Supabase error (`page.tsx`'s route-level error boundary), so
an empty table always means zero rows matched, never a masked failure.

Grouping stays: each month or week renders as one spanning header `<tr>`
containing a single `<td colSpan={8}>` carrying the group's label and its
full round count only (`visibleGroups`, `FairwayRoundsLibrary.tsx:568-615`
— avg/best are dropped from this header; the stage's own Avg and Best
readouts already own those two numbers at the scope level, and printing
them a third time here is the same "one instrument owns a number" violation
the ledger-row rule elsewhere in this spec exists to prevent) followed by
that group's round `<tr>`s — a real `<table>` with spanning header rows
rather than the current `<div>`-based seam header
(`FairwayRoundsLibrary.tsx:1131-1224`). `position: sticky` is set on that
`<td>`, not the `<tr>` — `<tr>`-level sticky is the more fragile of the two
across engines (see Risks), and stickying the cell is the safer default.
The table uses `border-separate` (not the reference table's plain
`border-collapse`, `coach-home-parts.tsx:247`): collapsed borders are the
known-fragile combination with a sticky cell in some engines, and this
table is the one case on the page that needs the sticky behavior the
reference table does not. This grouping is the one elaboration on
LANGUAGE.md's base table pattern this page keeps, because chronological
navigation across a whole season is this page's specific job (the same kind
of per-page differentiation LANGUAGE.md already grants Round review's
18-hole strip versus Home's `ScoreField`).

**Row link**: the whole `<tr>` (`onClick`, `router.push`) plus the Player
cell's own `Link`, to `/golf/dashboard/rounds/{round.id}` — the exact
dual-target pattern `RoundsLedgerTable` already uses
(`coach-home-parts.tsx:265-273`). Exactly one `<a href="/golf/dashboard/
rounds/{id}">` per row (the Player cell's `Link`) — no second anchor
anywhere else in the row. This preserves the pagination test's counting
method *within the table*, but not container-wide: the stage's own
`RoundField` marks are themselves `Link`s to the same `/golf/dashboard/
rounds/{id}` pattern (see "The stage" → Link), so the existing
`FairwayRoundsLibrary.test.tsx:248` assertion — which counts
`a[href^="/golf/dashboard/rounds/"]` across the whole rendered container —
now also counts every scored mark in the stage, not just table rows. That
test needs a rewrite, not a pass-through; see Risks.

**Row count / "view all"**: this page has no external "view all" target —
it already is the full library, unlike Home's 10-row preview that points
here. Its equivalent is the existing manual pagination: `ROWS_PAGE_SIZE = 30`
rows across all groups on first paint (`FairwayRoundsLibrary.tsx:339`, a
deliberate, already-measured perf choice — a season's 90+ rounds rendered
eagerly was real, measured scroll/paint jank, per this file's own comment at
`FairwayRoundsLibrary.tsx:335-339`), grown by 30 per "Show 30 more" click
(`FairwayRoundsLibrary.tsx:1249-1262`), with the honest running footnote
`"Showing {renderedRowCount} of {totalGroupedRounds}"`
(`FairwayRoundsLibrary.tsx:617-628`). This is a deliberate deviation from
LANGUAGE.md's illustrative "ten rows and a View all N link" default,
justified because that default describes a *preview* pointing elsewhere;
this page is the destination itself.

## Phone

Same order, one column:
1. Masthead — collapsed title/verdict, unchanged `ViewHeader`-equivalent
   behavior.
2. Stage — `RoundField` at full width (percentage geometry needs no
   layout change, `ScoreField.tsx:12-13`'s own claim carried over), container
   height `168px`. Readouts collapse to a 2×2 typographic grid **above** the
   instrument (LANGUAGE.md's global phone rule), the player-scope Select
   becomes a `Menu` trigger in the header row.
3. Ledger row — Leaders then Score bands, stacked, one horizontal hairline
   between them.
4. Toolbar — search + type pills stay visible; Month/Week folds into the
   existing overflow `Menu` (`FairwayRoundsLibrary.tsx:1027-1049`, unchanged).
5. Table — Course, Type, Putts, GIR columns hidden (`hidden md:table-cell` /
   `hidden lg:table-cell`, same breakpoints as today); row link stays a
   full-row tap target, 44px minimum row height.

Every branch above is a Tailwind responsive class (`hidden md:table-cell`,
`md:hidden`, `hidden lg:block`, etc.), matching how this file already gates
every phone/desktop split (e.g. `FairwayRoundsLibrary.tsx:1015-1049`'s
Segmented/Menu split). None of it is `useMediaQuery`/`matchMedia` state — no
client-only breakpoint branch, no hydration flip.

## What this deletes

- The Cockpit: `InstrumentCluster` + `RadialGauge` + two secondary
  `InstrumentPanel`/`Readout` panels + four tertiary `InstrumentPanel`
  panels (`FairwayRoundsLibrary.tsx:769-858` in the current file) — replaced
  by the stage (`RoundField` + its four readouts).
- The Spread: the borderless `DivergingBars`-by-round-type footnote
  (`FairwayRoundsLibrary.tsx:860-893`). LANGUAGE.md's fixed anatomy has no
  third analytical region beyond the two-column ledger row; its
  "which round type costs us strokes" signal is not reproduced 1:1 — see
  Risks. Its backing memo, `typeAvgToPar` (`FairwayRoundsLibrary.tsx:467-487`),
  is retired with it — the same "no remaining caller" treatment this list
  already gives `leaderboardEntries` below.
- The Leaders rail: the coach-only sticky `Elevated` spotlight card +
  `RankCell` leaderboard sidebar, and its phone `Sheet` trigger
  (`LeadersRailPanel`, `FairwayRoundsLibrary.tsx:1298-1386`, mounted at
  `FairwayRoundsLibrary.tsx:1062-1090` and `1267-1285`) — its leaderboard
  content moves into the ledger row's bare Leaders column; its "best of
  scope" spotlight content moves into the stage's Best readout. Its
  `leaderboardEntries` memo (`FairwayRoundsLibrary.tsx:521-526`) is retired
  with it — the new Leaders column reads the unscoped `playerSeasonStats`
  sort instead (see "The ledger row") — and with no remaining caller its
  "Only one player in this view" fallback string
  (`FairwayRoundsLibrary.tsx:1366`) goes with it too.
- `FairwayRoundRow.tsx` in its entirety — the div/flex "row as one big Link"
  markup, its per-row `MicroBar`, and the sticky `<div>`-based month seam
  header (`FairwayRoundsLibrary.tsx:1131-1224`) — replaced by real `<table>`
  rows and spanning header `<tr>`s. Its dedicated test file,
  `FairwayRoundRow.test.tsx` (220 lines — mobile pill-flow width, `#139`
  date-only display, and `MicroBar` honesty-gate coverage), is retired
  wholesale along with it: every test in that file renders
  `FairwayRoundRow` directly, and there is no successor component to point
  those tests at (the new table rows are plain `<tr>`/`<td>` markup, not a
  reusable row component).
- The player-branch-only `SeamSpark` putts/GIR sparklines inside seam
  headers are unaffected (they live in the player branch, out of scope), but
  the coach branch's own group-header `Sparkline` call
  (`FairwayRoundsLibrary.tsx:1173-1184`) is deleted along with the seam
  header markup it lived in — `RoundField`'s own line is now the page's one
  trend visual for the coach, matching the file's existing rule that a page
  gets exactly one trend chart.

## Risks

- **newField** — `player.id` does not exist on `RoundLibraryRound.player`
  (`FairwayRoundsLibrary.tsx:169-173`), nor is it selected by
  `playerSelectFields` (`page.tsx:57-76`, `player:golf_players(first_name,
  last_name, avatar_url)`). Adding `id` to that select and to the type is
  required to turn the masthead's leader name and the Leaders column's rows
  into real links to `/golf/dashboard/roster/{id}`, instead of today's mono
  text (masthead) and in-page filter action (Leaders column). Loader touched:
  `src/app/golf/(dashboard)/dashboard/rounds/page.tsx:75`.
- **newField-adjacent correctness gap** — `playerSeasonStats` and the
  masthead's unscoped leader lookup both key by display **name**
  (`FairwayRoundsLibrary.tsx:407-426`), not id. Two players sharing a first
  and last name would silently merge into one leaderboard entry. This bug
  predates v3, but naming a person in the masthead and making Leaders rows
  the primary click target makes it more visible; the same `player.id`
  field above is the real fix (aggregate by id, display by name).
- **Dropped signal** — the by-round-type average-to-par "Spread" is not
  reproduced anywhere in v3's fixed two-column ledger row. The Qualifier
  share readout and the scatter's dot-size-by-type encoding are the only
  surviving traces of "does round type matter here"; a coach who relied on
  the exact avg-to-par-per-type numbers loses that specific pre-computed
  view (still reconstructable by hand via the type filter + table, just not
  shown as a number on the page).
- **New client state, not a data risk** — the Score-bands column's row click
  needs a new `bandFilter` piece of local state (mirroring the existing
  `filter`/`playerFilter` pattern at `FairwayRoundsLibrary.tsx:350-357`).
  Pure UI state over already-loaded data, no schema or fetch change.
- **Orphaned primitive** — `MicroBar`'s only current call site is
  `FairwayRoundRow.tsx` (`registry.ts` lists `examples: ['Rounds library']`
  for it). Deleting that row markup leaves `MicroBar` registered with zero
  callers; worth a follow-up decision (keep for a future dense-row use,
  repoint the registry example, or retire it) — not blocking this spec.
- **Soft coupling** — `RoundField` imports `dateFraction`/`scoreFieldTicks`
  directly from `ScoreField.tsx` (`ScoreField.tsx:40-46,67-106`) rather than
  duplicating the math. If those signatures change to bind more tightly to
  `ScoreFieldRow`, this file's import needs to follow.
- **Cross-browser** — sticky positioning on a table cell inside a
  `border-separate` table is broadly supported in every evergreen browser
  this app targets, but sticky-table-anything has historically been the
  more fragile corner of layout support in older engines; verify in the
  actual build rather than assuming from this spec alone.
- **Three existing tests need rewriting, not just one, and not "no changes"**
  — `FairwayRoundsLibrary.test.tsx` has three assertions this spec breaks,
  none of which survive as a pass-through:
  - The `"coach: the cockpit cluster renders and the stage does not"` case
    (lines 307-313) asserts `getByLabelText('Round summary instrument
    cluster')` (the Cockpit's own `aria-label`) is present for
    `userRole="coach"`. Deleting the Cockpit makes that assertion fail
    outright; rewrite it to assert the new stage's own labelling instead
    (e.g. a `region` named for `RoundField`, mirroring how the adjacent
    player-branch case in the same test already asserts `getByRole('region',
    { name: 'Scoring' })`).
  - The single-Surface invariant (lines 190-214) asserts exactly one
    `[data-slot="surface"]` node and that it contains both rendered month
    labels. Today that one Surface is the table's ledger wrapper
    (`FairwayRoundsLibrary.tsx:1119`); this spec moves the page's only
    Surface to the stage (see "The table" → "Bare on the canvas") and the
    stage renders unconditionally (it reads `scopedSummary`, not the
    `stats` prop the test passes as `null`). The count assertion still
    passes by coincidence — one Surface either way — but "`surfaces[0]`
    contains both month labels" does not: those labels now live in the bare
    table, not in the stage. Rewrite it to assert the one Surface is the
    stage (e.g. by its `RoundField`/`region` labelling) and check the month
    labels directly in the document instead of inside `surfaces[0]`.
  - The pagination test (line 248) counts
    `a[href^="/golf/dashboard/rounds/"]` across the whole container and
    expects exactly 30, then 60, rows' worth. `RoundField`'s marks are
    themselves `Link`s to that same href pattern (see "The stage" → Link),
    and its own fixture, `makeManyRounds` (line 228), builds every round
    from `makeRound`'s default `score_to_par: 2` — every one of the 100
    rounds is scored and therefore plotted as a mark. This test breaks
    outright, not subtly: with the stage rendering ~100 additional matching
    anchors on top of the table's paginated 30, the very first assertion
    (`toHaveLength(30)`) fails. Rewrite it to scope the selector to the
    table body specifically (e.g. a `data-slot` on the table, or querying
    within a `role="table"`/`<tbody>` boundary) so it counts table rows only,
    independent of how many marks the stage renders.

  `rounds-instruments.test.tsx` covers only player-branch functions and
  components and remains entirely unaffected.
