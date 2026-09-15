# Roster player — v3 (field sheet)

Route: `/golf/dashboard/roster/[id]`. Replaces `FairwayPlayerProfile.tsx` in full.
This is the LANGUAGE.md anatomy — masthead, one stage, one bare ledger row, one
table — applied to a single player instead of the whole roster. There is no
"Roster player" row in LANGUAGE.md's per-page table; this document is that row,
written to the same discipline.

Every field cited below is `path:line` against `agent/frost-facelift` at the
time of writing. Nothing here is a tile: the stage is one Surface holding one
instrument, the ledger is bare hairline rows on a 12-col grid, the table is a
real table. No nested cards, no same-size grid, no panel that is only a list.

## The question

**"Is this player getting better, and where's my next conversation with
them?"** Everything on the page answers one half of that: the masthead
verdict states the direction and the biggest leak in one sentence, the stage
shows the round-by-round evidence for the direction claim, the readouts give
the four numbers a coach checks before a 1:1, the ledger surfaces the
strokes-gained breakdown and open focus areas that the stage's score-to-par
bars cannot show, and the table is the paper trail underneath all of it.

## Masthead

Unboxed identity, exactly the LANGUAGE.md masthead — no card, no chrome.

- **Identity row**: `Avatar` (`src/components/fairway/controls/avatar.tsx:101`,
  imported the same way `ScoreField.tsx:23` does — `import { Avatar } from
  '../controls/avatar'`) at `size="md"`, replacing the hand-rolled
  `<span style={{backgroundColor:...}}>{initials}</span>` block at
  `FairwayPlayerProfile.tsx:233-242`. Name as `<h1>` (`FairwayPlayerProfile.tsx:245-247`,
  unchanged). Class-year badge (`FairwayYearBadge`) and status badge
  (`FairwayPlayerStatusBadge`) stay, unchanged (`FairwayPlayerProfile.tsx:249-255`).
  Hometown/state stays as trailing plain text (`FairwayPlayerProfile.tsx:169`, `:256-258`).
- **Verdict sentence** — a `VerdictPart[]` rendered through a page-local copy
  of `VerdictLine` (`coach-home-parts.tsx:26-42`: same `text-h3 md:text-h2`
  display type, same underlined-link treatment), not the plain `<p>{verdict}</p>`
  string at `FairwayPlayerProfile.tsx:260`. Built by a new page-local
  `buildDossierVerdict()` (mirrors the composition pattern of
  `coach-home-logic.ts:158-189`'s `buildVerdict`, not the single-string
  `buildStatsViewModel.ts:262-273` version FairwayPlayerProfile currently
  calls at line 203-206 — that version returns a bare string with no link
  slots, which is why today's verdict has no links at all).

  Template, in order:

  1. **SG headline.** Source: `standingRows.find(r => r.metric_id === 'sg_total')`
     (`FairwayPlayerProfile.tsx:195-198`, from `standingRows` prop, itself
     `getPlayerStandingRows(id)` at `page.tsx:141`). Three branches, checked
     in this order, and each one stops the sentence — nothing after this
     item ever runs unless the first branch below fires:
     - `standingUnavailable` (new loader flag — see newFields in Risks; the
       fetch itself failed): `"Strokes-gained standing couldn't load."` and
       stop. Deliberately not the same string as the next branch: a request
       that failed is not the same story as a real player who doesn't have
       5 rounds yet, and the current loader collapses both into the same
       empty array today (see Risks) — this page does not repeat that.
     - `player_value != null` (fetch succeeded, row exists): `"Gaining
       {formatSgSigned} strokes per round on the field."` when ≥ 0, else
       `"{formatSgSigned} strokes per round vs the field."` — the exact sign
       branch and copy already written at `buildStatsViewModel.ts:268-271`,
       using `formatSgSigned` (`buildStatsViewModel.ts:198-203`).
     - Otherwise (fetch succeeded, `player_value == null` — this player
       genuinely has under 5 rounds with shot detail): fall back to the
       exact string already in the codebase for this case —
       `"Strokes-gained standing fills in after 5+ rounds with shot
       detail."` (`buildStatsViewModel.ts:267`).
  2. **Leak clause**, appended only when (1) resolved to a real value. Find
     the worst of the four SG sub-metric rows by `team_pct` — `standingRows
     .filter(r => ['sg_ott','sg_approach','sg_around_green','sg_putting']
     .includes(r.metric_id) && r.team_pct != null).sort((a,b) => a.team_pct -
     b.team_pct)[0]` (same "worst by team_pct" shape as
     `buildPlayerHomeViewModel.ts:204-216`'s `pickBestWorstStandingIds`,
     applied to the sub-metric set instead of the full metric list). When one
     exists: `" Leaking most in {display_label.toLowerCase()}."` with
     `display_label` from `metric-config.ts:36-39` (`SG: Off the Tee` / `SG:
     Approach` / `SG: Around the Green` / `SG: Putting`) as a **link to
     `/golf/dashboard/players/{id}/game`** (the Game Fingerprint report,
     which walks Tee → Approach → Short Game → Putting in that order per its
     own docstring, `game/page.tsx:11-13`). When none of the four rows has a
     `team_pct`: omit the clause — honest silence, not a forced claim.

     This is worth calling out: `buildVerdict` at `buildStatsViewModel.ts:262-273`
     already accepts a `leakLabel` parameter and already has the "Leaking
     most in X" branch (`:271-272`) — but every call site passes `null`
     (`FairwayPlayerProfile.tsx:204`), so this sentence-half exists in the
     codebase today and has never once rendered. This spec's new
     `buildDossierVerdict()` is a different function (it needs link slots
     `buildVerdict` doesn't have), but the "worst sub-metric" input it needs
     is the same shape that dead parameter was always meant to receive.
  3. **Trend clause**, appended only when a scoring trend has signal (see
     Readouts §1 for the exact computation — same `computeScoringTrendFromRounds`
     call, so the verdict and the readout can never disagree, and so the
     verdict never restates a number the readout already owns). When
     `hasSignal`: `" Trending {better|worse} over the last 5 rounds"` — plain
     words, no dash and no glyph, direction only. The magnitude
     (`{|delta|.toFixed(1)}` strokes) is deliberately left out of this
     sentence: Readout §1's caption already states it in mono (`"▲/▼
     {|delta|.toFixed(1)} last 5 vs prior 5"`), so one region owns that
     number and the masthead only points at where to find it. With **"the
     last 5 rounds" linking to `#rounds`** (an in-page anchor on the table
     below — see The table). When `!hasSignal` (fewer than 5-vs-3 rounds on
     file): omit the clause entirely, matching the honest-omission pattern
     `rollupPlayers` (`coach-home-logic.ts:83-85`) already uses for the same
     trend function. (The readouts' own trend caption, §1 below, keeps the
     ▲/▼ glyph — that is a mono data glyph in a data column, the same
     precedent `TrendMark` sets at `ScoreField.tsx:112-134`, not prose; this
     display-type sentence is prose and stays glyph-free and, now, number-
     free too.)

  No part of this sentence links the player's own name to
  `/golf/dashboard/roster/{id}` — that is the page already open, and a
  self-link is a dead click. The two links that exist (leak category → Game
  Fingerprint, round span → the table anchor) are the two places a coach can
  actually go to act on the sentence.

- **Deletes**: the Message button, overflow Menu, and back-to-Roster link
  stay (they are actions, not cards). The link text is already plain
  `"Roster"` (`FairwayPlayerProfile.tsx:226`) — no wording change needed.
  What changes is the icon: the `leftIcon={<ArrowLeft className="h-4
  w-4" />}` prop at `FairwayPlayerProfile.tsx:223` is dropped, so the
  control carries no arrow at all. (Arrows in copy were already absent; this
  removes the one arrow the control had in chrome.)

## The stage

One `Surface`, one instrument: a full-width, single-row score strip —
**RoundStrip** — beside the readouts column, exactly the two-region stage
`FairwayCoachDashboard.tsx:379-444` uses for `ScoreField` + `FieldReadouts`,
just with one row instead of the roster's many.

**Rhythm.** `mt-10` (40px) from the masthead's verdict down to this stage,
`mt-12` (48px) from this stage down to the ledger row, `mt-10` (40px) from
the ledger down to the table — LANGUAGE.md's documented page rhythm
(masthead→stage 40, stage→ledger 48, ledger→table 40), not a uniform
24px grid.

**Header row.** Per LANGUAGE.md's stage anatomy — overline, title, one-line
legend, view control at the right — mirroring
`FairwayCoachDashboard.tsx:380-388`'s header block exactly, minus the view
control: this page has no range picker, so nothing sits at the right.
  - Overline (`OVERLINE` class): `"Round history · last {n} rounds"`, where
    `{n}` is the live count returned by the widened fetch (`rounds.length`,
    capped at 12 by the query below) — not a hardcoded "12," so a player
    with fewer rounds on file shows their true count.
  - Title (`font-fw-display text-h2 text-text-primary`, same classes as
    `FairwayCoachDashboard.tsx:383`): `"Round strip"` — names the
    instrument, the same way the reference stage's title names its own
    (`"Score field"`).
  - Legend (`font-fw-sans text-caption text-text-tertiary`, same slot as
    `FairwayCoachDashboard.tsx:384-386`): `"Each bar is one round against
    par, oldest to today. Amber rises over par, green drops under; par is
    the line, scale ±{cap}."` — `{cap}` is the live return of
    `scoreFieldCap([thisPlayerRow])` (see Geometry below), the same
    interpolation `FairwayCoachDashboard.tsx:385` already does for its own
    legend.

**What it plots.** Every fetched round (see newFields — the query widens from
4 to 12 rows) as one mark on a shared date axis. Baseline is par
(`score_to_par = 0`), not zero strokes — a mark rises above the baseline for
an over-par round, drops below for under-par, and sits as a flat tick exactly
on the baseline for an even round. This is the same encoding `ScoreField`
already uses per-row (`ScoreField.tsx:151-155, 167-172`), just drawn as one
row at a larger scale.

**Why a strip and not a table.** A coach opens this page to see *shape* —
whether a player went quiet, then came back worse, whether a bad week was one
outlier round or a slide — and a table of numbers makes that read take
minutes of mental arithmetic instead of one glance. Twelve numbers in a
column say nothing about spacing; twelve marks on a date axis show a five-day
gap sitting right next to a three-week one, which is exactly the shape LANGUAGE.md's
stage instrument exists to carry. The table below still exists for exact
numbers per round — the strip is for the trend the numbers don't announce on
their own.

**Why this is a new page-local instrument, not `ScoreField` or `Ribbon`
directly.** `registry.ts`'s `ScoreField` entry lists `avoidFor: ['a single
player (use Ribbon)', 'fewer than two rounds per row']` — correct for
`ScoreField` itself, which is built to compare *many* players' rows against
each other and pays for that with per-row chrome (identity column, avg
column, trend column) this page doesn't need for one player. But `Ribbon`
(`src/components/fairway/charts/Ribbon.tsx`) is disqualified on different
grounds: its x-axis is ordinal by point index, not temporal —
`xAt(i) = PAD.left + (i / (points.length - 1)) * innerW`
(`Ribbon.tsx:188-192`) — so a round played yesterday and one played five
weeks ago plot at evenly-spaced positions regardless of the actual gap
between them. That erases exactly the read this page opens for: a player who
went quiet and came back worse looks, on a Ribbon, identical to one who
played every week. `Ribbon` also has no per-point `href` (its interactivity
is a shared crosshair, not a link per mark — confirmed by reading the full
file), which fails the "what does a mark link to" requirement below outright.
The fix is to reuse `ScoreField`'s own exported pure geometry — real,
already-shipped functions, not new invented math — at single-row scale with
per-mark links added:
  - `dateFraction(date, domain)` (`ScoreField.tsx:40-46`) — unchanged, for x position.
  - `scoreFieldCap(rows)` (`ScoreField.tsx:49-53`) — called with a one-row
    array `[thisPlayerRow]`, so the cap is this player's own largest
    round-to-par swing (clamped 4–12 strokes), not diluted by a roster.
  - `scoreFieldTicks(domain)` (`ScoreField.tsx:67-106`) — unchanged: weekly
    ticks under a 45-day span, monthly beyond, thinned past eight.
  - The `Bar` component's over/under/even color and height logic
    (`ScoreField.tsx:151-172`) and its `Link`-when-`href`-present hit-target
    pattern (`ScoreField.tsx:177-192`) — unchanged, just laid out along one
    row instead of nested inside `ScoreField`'s per-player grid row.
  - The Today marker (`ScoreField.tsx:292-295`) — unchanged.

  This is a registry deviation worth logging as such (see Risks): `ScoreField`
  says avoid single-player use, and the honest reading of that guidance is
  "avoid `ScoreField`'s own multi-row-comparison shell for one player," not
  "never reuse its geometry." Ribbon's ordinal axis is the reason a straight
  swap to the registry's suggested replacement would have made the page
  worse, not better.

**Geometry** (page-local `RoundStrip`, new file):
  - Full width, single row, `h-20` (80px) — taller than `ScoreField`'s
    per-row `h-11` (`ScoreField.tsx:252`) since this row *is* the instrument,
    not one of many.
  - Baseline: a full-width hairline at vertical center (`top-1/2`), styled
    exactly as `ScoreField.tsx:253`'s `absolute inset-x-0 top-1/2 h-px
    bg-border-strong`.
  - Bar half-height: 32px (up from `ScoreField`'s `HALF_HEIGHT_PX = 19`,
    `ScoreField.tsx:27`) — scaled up for the single-instrument size; same
    `MIN_BAR_PX = 2` floor (`ScoreField.tsx:28`) for even/tiny rounds, same
    `SAME_DAY_NUDGE_PX = 4` offset (`ScoreField.tsx:29`) for two rounds
    logged the same day.
  - Domain: `{ start: oldest fetched round's date, end: today }` — the
    one-row case of the `fieldDomain` pattern (`coach-home-logic.ts:127-140`)
    with no `windowStart` override, since this page has no range picker.
  - Color: amber (`bg-fw-warning`) over par, green (`bg-accent-500`) under
    par, neutral (`bg-text-tertiary/70`) even — unchanged from
    `ScoreField.tsx:169-171`, i.e. amber is the only non-green/canvas hue on
    the page, matching LANGUAGE.md's material rule.
  - Entrance motion: same stagger as `ScoreField.tsx:159-161`
    (`STAGGER_STEP = 0.012`, `STAGGER_CAP = 16`, `DURATION.short`,
    `EASE_CINEMATIC`), gated by the same `useReducedMotionGuard`
    (`ScoreField.tsx:207`).

**What a mark links to.** Each bar is a `Link` to `/golf/dashboard/rounds/{round.id}`
(the round detail route — the exact href pattern already used for round
marks at `coach-home-logic.ts:94` and for table rows inside
`RoundsLedgerTable` (`coach-home-parts.tsx:265`), with the
same `title`/`aria-label` round summary line ScoreField's `Bar` already
builds (`ScoreField.tsx:177-186`). A round with no `href` case does not
arise here — every plotted round has an `id`.

**Degrade behavior.**
  - **Rounds fetch failed** (`roundsUnavailable`, a new loader flag — see
    newFields in Risks): render `InlineNotice tone="warning" title="Couldn't
    load this player's rounds"` with body "Something went wrong reading
    their rounds. Refresh to try again; nothing has been lost." — the same
    component and tone `FairwayCoachDashboard.tsx:412-413` already uses for
    the equivalent team-wide failure, reworded for one player. This is a
    distinct state from Zero rounds below on purpose: a failure must never
    render as the same empty-state shape as an honestly-empty player, or a
    coach reads "no data" as "this kid hasn't played" when the real story is
    "the page broke."
  - **Zero rounds** (fetch succeeded, `rounds.length === 0`): do not render
    the strip at all. Render `InsufficientData`
    (already imported in `FairwayPlayerProfile.tsx:44`) with title "No scored
    rounds yet" in the stage's instrument slot — the same component this page
    already uses for the cold-start Standing case
    (`FairwayPlayerProfile.tsx:291-296`), so a coach sees one consistent
    empty-state shape rather than a broken zero-width axis.
  - **One round**: no special-casing needed. `dateFraction`'s own clamp —
    `end = Math.max(dayMs(domain.end), start + DAY_MS)` (`ScoreField.tsx:42`,
    reused verbatim by `scoreFieldTicks` at `ScoreField.tsx:69`) — already
    guarantees a minimum one-day domain, so a single round plots correctly at
    its true position between its date and today without a divide-by-zero or
    a degenerate axis. The readouts' trend delta (below) independently
    reports "not enough rounds yet" under this condition — the strip and the
    trend number are allowed to disagree on "is there enough to plot" vs "is
    there enough to call a trend," and they do, honestly.

## Readouts

Four, in a `<dl>` in the stage's right column — hairline rows, not tiles:
`FieldReadouts`'s own structure (`coach-home-parts.tsx:111`, the
`FieldReadouts` function) — a `<dl>` with `xl:divide-y
xl:divide-border-subtle` between items, no per-item border, no box. Each
item is one block with three children in order: a `dt` styled as the
`OVERLINE` eyebrow (the label), a first `dd` holding the large tabular-mono
value, and a second `dd` holding one caption line for delta or note. This
page reuses that exact three-line structural pattern rather than inventing
a tile — four numbers with small labels and no shared rule between them is
the named "big number with a small label as a tile" failure; a divided
`<dl>` sharing one rule and one column is not.

**Missing values share one glyph.** Every item below treats a null, failed,
or not-yet-available number as `item.value = null` so `FieldReadouts`' own
`value ?? '–'` fallback (an en dash) renders it — never
`formatOne`/`formatPct`'s own native `'—'` em-dash fallback
(`FairwayPlayerProfile.tsx:136-142`), which would put a banned em dash on
the page and would disagree with the GIR% readout's own missing-row dash
two lines below it. `formatOne`/`formatPct` are used here only to stringify
a number that is actually present.

1. **Scoring avg · career** — value: `detailedStats.scoringAverage`
   (`golf-stats-calculator-shots.ts:94`, from `getDetailedStats(id,'overall')`
   at `page.tsx:133` — this call already returns career totals despite the
   *current* code mislabeling the whole block "Season" at
   `FairwayPlayerProfile.tsx:279`; that mislabel does not carry forward here).
   Formatted 1 decimal (`formatOne`, `FairwayPlayerProfile.tsx:140-142`). When
   `detailedStats` is `null` — the exact failure case `page.tsx:133-139`'s
   `.catch` already returns and logs today (`headline stats read failed`):
   value is `null` (renders as `'–'` per the glyph rule above), never `0`, so
   a failed request never displays as a real zero.
   Delta: `computeScoringTrendFromRounds` (`src/lib/golf/scoring-trend.ts:31-45`)
   over the widened round fetch (12 rows, newest-first, each `{total_score,
   holes_played}` — `holes_played` is a newField, see below), same call
   shape `rollupPlayers` already uses (`coach-home-logic.ts:80-82`). This is
   the canonical 5-vs-5-with-≥3-previous scoring classifier
   (`src/lib/coachhelm/trend.ts:39-46`, threshold `0.3`), **not** the
   split-half `computeSeriesTrend` sparkline readout the coach home dashboard
   uses for its own scoring-avg delta — a different algorithm, not
   interchangeable, and this route has no sparkline series to feed it
   anyway. When `hasSignal`: `"▲/▼ {|delta|.toFixed(1)} last 5 vs prior 5"`
   (the arrow convention from `TrendMark`, `ScoreField.tsx:112-134`, spelled
   out in words here since this is a caption line, not a column with a
   labeled header next to it). When `!hasSignal` because the fetch itself
   returned fewer rounds than the window needs: `"not enough rounds yet"`.
   When `roundsUnavailable` (the fetch failed — see The stage): `"couldn't
   load"` instead — a different caption for a different cause, so a failed
   request is never read as a short career. Note
   explicitly: the **value** above is career-wide; the **delta** is a
   5-vs-5-round window — the two are not the same span, and the label
   distinguishes them ("career" on the value, "last 5 vs prior 5" on the
   delta) so nobody reads them as one number.
2. **GIR%** — value AND delta both come from the *same* row,
   `standingRows.find(r => r.metric_id === 'gir_pct')` (`gir_pct` is a real
   canonical metric, `metric-config.ts:89`; the row itself already loaded via
   `getPlayerStandingRows(id)`, `page.tsx:141`) — deliberately not
   `detailedStats.girPercentage` (`golf-stats-calculator-shots.ts:173`),
   because that figure comes from a different calculator pipeline and mixing
   one pipeline's value with another pipeline's team comparison would be
   gluing two numbers that were never verified to agree. Value:
   `formatPct(row.player_value)` (`FairwayPlayerProfile.tsx:136-138`). Delta:
   `teamRelativeText(row.player_value, row.team_avg, 'higher_better')`
   (`src/components/golf/coachhelm/v3/StandingBar/utils.ts:171-186`) —
   `"Above team average"` / `"Below team average"` / `"Matches team
   average"`, or empty when `team_avg` is null (cold-start team, handled
   inside that function already). **When `standingUnavailable`** (the
   `getPlayerStandingRows(id)` fetch itself failed — see newFields in
   Risks): value `null` (renders `'–'` per the glyph rule above), caption
   `"couldn't load"` — the same failure wording the masthead's SG headline
   uses, so the two regions reading `standingRows` agree on what a broken
   fetch looks like. **Missing-row path** (fetch succeeded, row genuinely
   absent): `standingRows` gates
   on "5+ rounds with shot detail" the same way the masthead's SG headline
   does — a less-tracked player on the roster will have no `gir_pct` row at
   all. When absent (and not `standingUnavailable`), this readout renders
   `value = null` (per the glyph rule above) with an empty
   caption — it does not fall
   back to `detailedStats.girPercentage`, for the same pipeline-mixing reason
   given above.
3. **Putts/rd · career** — value: `detailedStats.puttsPerRound`
   (`golf-stats-calculator-shots.ts:233`), `formatOne` — `null` when
   `detailedStats` is `null` (same failure case as Scoring avg above).
   Delta: **none** —
   there is no canonical `putts_per_round` metric id in the 28-id registry
   (`src/lib/coachhelm/v3/metrics/registry.ts:35-81`), so there is no team
   comparison to draw honestly. Caption is blank rather than a fabricated
   comparison.
4. **Rounds · career** — value: `detailedStats.roundsPlayed`
   (`golf-stats-calculator-shots.ts:90`), plain integer, no unit — `null`
   when `detailedStats` is `null` (same failure case as Scoring avg above,
   caption reads "couldn't load" instead of the strip note below). Caption:
   `"strip shows the last {n plotted}"` (a static clarifying note, not a
   delta) — this is the one place the readouts intentionally show a number
   the stage does *not*: the strip only plots the widened-but-still-bounded
   fetch window (12 rows), while this is every round on file. Genuinely
   additive, not a restatement of the stage.

## The ledger row

Two bare columns, unequal width (7 / 5), divided by a vertical hairline at
`xl` and up — no card, no box. Grid classes mirror
`FairwayCoachDashboard.tsx:452`'s own ledger wrapper: `grid-cols-1
md:grid-cols-2 md:gap-x-8 xl:grid-cols-12 xl:gap-x-0 xl:divide-x
xl:divide-border-subtle` on the row, each column heading carrying
`SectionHead`'s own green ruling (`coach-home-parts.tsx:48`, the
`SectionHead` function — a 1px `bg-accent-300` rule under the heading).
Below `xl` the two columns run side by side at plain `md:grid-cols-2` (even
halves — LANGUAGE.md's documented intermediate state); the unequal 7/5 split
and the vertical divider both start at `xl` (1280), the breakpoint
LANGUAGE.md reserves for side-by-side splits, never `lg` — verified at 1024
(still even 2-up, nothing squeezed) and 1280 (unequal, divided). Neither
column repeats a number the stage or readouts
already show — the stage is score-to-par by date, the readouts are four
scalar career/window numbers; this row is strokes-gained *shape* and open
coaching work, both currently loaded and currently unused past the masthead.

- **Standing** (`xl:col-span-7 xl:pr-8`): one bare row per SG sub-metric
  — `sg_ott`, `sg_approach`, `sg_around_green`, `sg_putting`, in that order
  — from the *same* `standingRows` array the masthead's leak clause reads
  (`page.tsx:141`, `PlayerStandingRow[]`). Today only `sg_total` is ever
  picked out of this array (`FairwayPlayerProfile.tsx:195-198`); the other
  four rows are fetched and thrown away. Each row: `display_label`
  (`metric-config.ts:36-39`) left, `formatSgSigned(player_value)`
  (`buildStatsViewModel.ts:198-203`) right in tabular mono, and
  `teamCohortText(team_pct, team_n)` (`StandingBar/utils.ts:139-160`,
  e.g. "Top quartile on your team" / "Below team average") as a caption
  line under the label. The whole row links to
  `/golf/dashboard/players/{id}/game` (see Risks — all four currently
  resolve to the same URL, no per-category anchor exists yet). **When
  `standingUnavailable`** (see newFields in Risks): this column renders one
  `InlineNotice tone="warning"` in place of the four rows — "Couldn't load
  strokes-gained standing. Refresh to try again." — rather than a column
  that quietly shows nothing, which would read as "no data exists" instead
  of "this failed."
- **Focus** (`xl:col-span-5 xl:pl-8`): the `focusAreas` prop, already
  loaded (`page.tsx:149-155`, up to 3 non-completed, newest first) — one bare
  row per area, title left (`fa.title ?? fa.area_type`,
  `FairwayPlayerProfile.tsx:317`), status chip right
  (`FairwayPlayerProfile.tsx:311-315`, unchanged). Column header "Focus"
  links to `/golf/dashboard/players/{id}/genome` (the Genome tab, which the
  current empty-state copy already names as where a focus area is added —
  `FairwayPlayerProfile.tsx:322-324`). Zero-row case keeps that same copy,
  bare, not boxed: "No open focus areas. Add one from the Genome tab." If
  the focus-areas query itself fails, today's loader already collapses that
  into the same empty array a real zero-focus-areas player gets
  (`focusAreasResult.data ?? []`, `page.tsx:189`, only the error is logged,
  `page.tsx:165-171`) — this spec keeps that existing behavior unchanged
  rather than adding a third flag for a pre-existing, low-stakes gap; the
  zero-row copy above honestly covers both cases with the same words.

## The table

Rounds, in a real `<table>` — mirrors `RoundsLedgerTable`'s structure
(`coach-home-parts.tsx:265`, the `RoundsLedgerTable` function) with the
**Player column dropped** (a single-player page has no use for it) and
everything else kept:

| Column | Align | Below md | Below lg | Source |
|---|---|---|---|---|
| Date | left | shown | shown | `round_date`, `shortDay()` (`coach-home-logic.ts:20-24`) |
| Course | left | **hidden** | shown | `course_name`, `titleCase()` (`coach-home-logic.ts:26-38`) |
| Type | left | **hidden** | **hidden** | `round_type` (newField), `roundTypeLabel()` (`coach-home-parts.tsx:256`) |
| Score | right, mono | shown | shown | `total_score` |
| To par | right, mono, toned | shown | shown | `score_to_par`, `formatToPar` (`src/lib/golf/format-to-par.ts:14`), green/amber tone by sign (inside `RoundsLedgerTable`, `coach-home-parts.tsx:265`) |
| Putts | right, mono | **hidden** | shown | `total_putts` (newField) |
| GIR | right, mono | **hidden** | shown | `total_gir`/`total_gir_possible` (newFields), `"{gir}/{possible}"` |

Row: whole `<tr>` clickable to `/golf/dashboard/rounds/{id}` (the pattern
`RoundsLedgerTable` already uses, `coach-home-parts.tsx:265` —
`router.push` on row click, `Link` on the primary cell for
keyboard/middle-click), `hover:bg-surface-hover`.
Row count: all 12 fetched rounds — a deliberate departure from
LANGUAGE.md's default "ten rows and a View all N link," because this table
is not sliced independently the way `RoundsLedgerTable rounds=
{recentRounds.slice(0, 10)}` is on the coach home dashboard
(`FairwayCoachDashboard.tsx:481`). Here the stage, the readouts, and the
table all read the *same* fetch (one fetch, three consumers, per newFields
below); truncating the table to ten while the stage plots up to twelve
would desync what the two regions show for the same window. Twelve stays
the shared number; the "View all" link below still exists for anything
past it. When `roundsUnavailable`: the table body is replaced by the same
`InlineNotice` the stage uses, not an empty `<table>` with a header and no
rows — an empty table reads as "no rounds," not "this failed to load."
`id="rounds"` on the section
wrapper is the anchor the masthead's trend clause links to.

**View all** action (`SectionHead`-style `action={{label:'View all', href}}`,
`coach-home-parts.tsx:60-66`) → `/golf/dashboard/rounds?player={encodeURIComponent(name)}`.
Flagged in Risks: this is not yet a working filter — see below.

## Phone

CSS-only breakpoint gating throughout, no client-only measurement:
- Readouts run three bands, exactly `FieldReadouts`' existing responsive
  classes on its `<dl>` (`coach-home-parts.tsx:111`) reused unchanged:
  `grid-cols-2` (two-up)
  below `md`, `md:grid-cols-4` (one row of four) from `md` to `xl`, then
  `xl:flex xl:flex-col` — a single divided column beside the RoundStrip — from
  `xl` up.
- The RoundStrip stays full-width and single-row at every size (it has no
  identity/avg/trend side-columns to collapse — that complexity was
  `ScoreField`'s multi-player problem, not this page's).
- Ledger columns run `grid-cols-1` on mobile, `md:grid-cols-2` (even halves)
  from `md`, then `xl:grid-cols-12` with `xl:col-span-7`/`xl:col-span-5` and
  a vertical `xl:divide-x` hairline from `xl` up (see The ledger row) —
  plain Tailwind grid classes, no `useMediaQuery`, no `window.innerWidth`
  read.
- Table: Type hidden below `lg`, Course/Putts/GIR hidden below `md`, matching
  `RoundsLedgerTable`'s existing `hidden md:table-cell` / `hidden
  lg:table-cell` classes (`coach-home-parts.tsx:265`, the
  `RoundsLedgerTable` function) — `[hidden]` is a
  CSS attribute selector, resolved at paint, never a hook.
- There is no view-control (no range picker, no tab switcher) on this page to
  collapse into a Menu at narrow width — unlike the coach home dashboard,
  nothing here needs an overflow affordance for phone.

## What this deletes

- `StatMatrix` and its `label="Season"` mislabel (`FairwayPlayerProfile.tsx:208-214, 279`)
  — replaced by the four hairline readouts, with the career/window labeling
  corrected in the process.
- The standalone Standing `Surface` (`FairwayPlayerProfile.tsx:282-298`) —
  its `sg_total` bar becomes the masthead's SG headline number; its four
  unused sibling rows become the Ledger's Standing column.
- The two-`Surface` Focus areas / Recent rounds grid
  (`FairwayPlayerProfile.tsx:300-364`) — Focus areas becomes the Ledger's
  Focus column; Recent rounds (4-row `InsetGroup` preview) is replaced by the
  real Rounds table.
- The `Segmented` Game/Genome/Rounds tab row and its `StatsSpineStage` mount
  (`FairwayPlayerProfile.tsx:366-375`) — Game and Genome were already plain
  route pushes (`FairwayPlayerProfile.tsx:183-190`), now just direct links
  from the masthead's leak clause and the Ledger's Focus header; Rounds was
  the only tab that stayed on-page, and it becomes this document's Stage +
  Ledger + Table instead of a `StatsSpineStage` mount. See Risks — this is a
  real capability loss, not a pure simplification.
- The hand-rolled avatar `<span>` (`FairwayPlayerProfile.tsx:233-242`) —
  replaced by the shared `Avatar` control.
- The `←` glyph on the back-to-Roster button — the `leftIcon={<ArrowLeft
  className="h-4 w-4" />}` prop at `FairwayPlayerProfile.tsx:223` is
  dropped; the link text was already plain "Roster"
  (`FairwayPlayerProfile.tsx:226`) and is unchanged.
- The plain-string verdict paragraph and its non-linking `buildVerdict` call
  (`FairwayPlayerProfile.tsx:203-206, 260`) — replaced by the linked
  `VerdictPart[]` sentence above.

## Risks

- **`?area=` deep-linking does not exist on the Game Fingerprint page.**
  Confirmed by reading `game/page.tsx` in full: it renders
  `<PlayerDeepDiveTabs>` with a `?tab=scouting` switch only, no `?area=`
  handling and no per-section `id` anchors (`grep` for `id="tee"` /
  `id="putting"` / similar across the coachhelm and players pages returned
  nothing). All four Standing-column rows and the masthead's leak-clause link
  therefore resolve to the **same** URL today — a coach clicking "SG:
  Putting" and one clicking "SG: Off the Tee" land on the same top-of-page
  scroll position, not a scoped section. The Game Fingerprint report does
  walk Tee → Approach → Short Game → Putting in one long scroll
  (`game/page.tsx:11-13`), so the content is there, just not anchored — a
  coach has to scroll to find it. Real per-category anchoring needs either a
  `?area=` query param wired into that page or `id` attributes added to its
  section headings; neither exists yet, and this spec does not fabricate
  either.
- **Deleting `StatsSpineStage` is a functional loss, not just a visual
  cleanup.** `StatsSpineStage` (mounted today at
  `FairwayPlayerProfile.tsx:374`) carries its own internal `StageRouter`
  keyed on the **same page's** `?area=` param
  (`src/components/golf/stats/spine-stage/StatsSpineStage.tsx:658`,
  `param="area"`) — meaning a coach can currently open
  `/golf/dashboard/roster/{id}?area=putting` and get an in-page drill view
  for that one category, without leaving the roster page. This document
  removes that mount entirely in favor of the Ledger's plain SG rows, so that
  in-page per-category drill is gone, not relocated — a coach who wants the
  deeper putting breakdown now has to leave this page (and today, land
  un-anchored on Game Fingerprint, per the risk above). This is a real
  regression the redesign is trading against the "no nested cards / no
  always-on StatsSpineStage block" mandate; it should be a conscious call,
  not a side effect discovered later.
- **`registry.ts`'s `ScoreField` entry is being read narrowly on purpose.**
  Its `avoidFor` includes "a single player (use Ribbon)." This spec follows
  the letter (does not mount `ScoreField`'s multi-row shell for one player)
  but not the suggested replacement, for the ordinal-vs-temporal reason
  documented under The stage. Flagging so this isn't read as an oversight.
  Separately, `registry.ts:60-64`'s `Spine` entry lists `examples: ['Player
  dossier', 'CoachHelm home']` — stale against this document and against LANGUAGE.md, which
  this spec follows instead; the registry entry should be updated when this
  ships, not before.
- **The Rounds table's "View all" link is not yet a working filter.**
  Confirmed by reading `FairwayRoundsLibrary.tsx`: `playerFilter` is a plain
  `useState<string>('all')` (`FairwayRoundsLibrary.tsx:356`), matched by
  display name (`playerName(r) !== playerFilter`, `:437`), with no
  `useSearchParams` read anywhere in the file — so a
  `?player={name}` query param on the incoming link is silently ignored
  today. The one-line fix is seeding that `useState`'s initial value from
  `useSearchParams().get('player')` in `FairwayRoundsLibrary.tsx` — a change
  to that file, out of scope for this document, which touches only the
  roster-player screen.
- **`newFields`** — none of these require a schema change; all are existing
  `golf_rounds` columns not currently selected by this route's query
  (`page.tsx:156-162` selects only `id, round_date, course_name, total_score,
  score_to_par` and caps at `.limit(4)`). The loader change is: widen that
  `.select()` and raise the limit.
  - `holes_played` — needed by the Scoring avg readout's trend delta
    (`computeScoringTrendFromRounds` normalizes by hole count,
    `scoring-trend.ts:37-39`). Confirmed a real column, already selected by
    the sibling `game/page.tsx:221` query and by
    `dashboard-data.ts:499`.
  - `round_type` — needed by the table's Type column. Confirmed at
    `dashboard-data.ts:484`, already labeled by the reusable
    `roundTypeLabel()` (`coach-home-parts.tsx:256`).
  - `total_putts`, `total_gir`, `total_gir_possible` — needed by the table's
    Putts/GIR columns. Confirmed at `dashboard-data.ts:484, 499`, already
    selected and rendered identically at `game/page.tsx:221` and inside
    `RoundsLedgerTable` (`coach-home-parts.tsx:265`).
  - The query's `.limit(4)` (`page.tsx:162`) needs to rise to `12` — enough
    rows for the stage's date-axis shape, the trend delta's 5-vs-5-with-≥3-previous
    minimum, and a table worth calling a table, in one fetch.
  - `roundsUnavailable` / `standingUnavailable` — two boolean flags this
    page needs and does not have today. Confirmed by reading `page.tsx` in
    full: when the rounds query errors, that error is only logged
    (`page.tsx:172-177`) and the result then collapses into the same empty
    array a legitimate zero-rounds player gets (`recentRounds=
    {roundsResult.data ?? []}`, `page.tsx:190`). The same collapse happens
    for standing: `getPlayerStandingRows(id)` failing is caught into `null`
    (`page.tsx:141-148`) and then folded into the same `[]` a real
    cold-start player gets (`const standingRows = standingResult?.success ?
    (standingResult.data ?? []) : [];`, `page.tsx:180`). That means, today,
    a broken request and an honestly-empty player reach the component
    looking identical — but this spec's stage, Readout §1, the table, the
    masthead's SG headline, the GIR% readout, and the Standing ledger
    column all need to tell those two states apart (see Degrade behavior,
    and the Masthead/Readouts/Ledger sections above). The fix is the same
    shape the coach home dashboard already ships as `teamStatsUnavailable`
    (`FairwayCoachDashboard.tsx:93`): carry
    `roundsUnavailable = Boolean(roundsResult.error)` and
    `standingUnavailable = standingResult == null` as their own booleans
    alongside the arrays, instead of folding the failure away, and pass
    both down to this page's replacement component.
- **Two SG pipelines are not assumed to agree.** The GIR% readout
  deliberately sources both its value and its delta from the same
  `standingRows` row rather than pairing `detailedStats.girPercentage` (a
  different calculator, `golf-stats-calculator-shots.ts:173`) with a
  `standingRows`-based team comparison. If a future pass wants the
  `detailedStats` figure specifically, it needs its own team-average source
  verified against the same pipeline first — not assumed compatible with
  `standingRows`.
