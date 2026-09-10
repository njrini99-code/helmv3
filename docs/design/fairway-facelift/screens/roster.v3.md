<!-- markdownlint-disable MD013 -->
# Roster (coach), /golf/dashboard/roster — v3 spec

Supersedes `roster.v2.md`, which predates `docs/design/fairway-facelift/LANGUAGE.md` and
still composes the screen as a header `Surface` (a `StatMatrix` + a list panel), a
`Toolbar`, and a `MatrixBoard` — the "masthead plus rounded boxes" pattern the owner
rejected. This spec follows LANGUAGE.md's field-sheet anatomy and its own per-page
table row for Roster: stage = `ScoreField` sorted by trend with a focus column;
readouts = roster count, needs attention, active focus; ledger = attention actions,
focus areas; table = players, sortable. Reference implementation: `FairwayCoachDashboard.tsx`
(home). Entry point read for this spec: `FairwayCoachRoster.tsx`, its loader
`roster/page.tsx`, `roster-health.ts`, `FairwayPlayerCard.tsx` (the `RosterPlayer`
type + `formatSgTotal`/`sgTone`), and `roster-helpers.ts`.

## The question

Who on the team is trending up or down right now, and who needs the coach's
attention first.

## Masthead

Bare on the canvas, built the same way `FairwayCoachDashboard.tsx:282-338` builds
Home's — not `ViewHeader` (that stays only for the true zero-player state, mirroring
Home's `!team` branch at `FairwayCoachDashboard.tsx:233-266`).

- Eyebrow row: `{teamName}` left (plain, no date — a roster isn't a daily view); an
  overflow `Menu` (Export roster as CSV, reusing `exportRosterCSV` from
  `FairwayCoachRoster.tsx:58,294-296`) and the primary `Button` —
  `FairwayInvitePlayerButton` (`FairwayCoachRoster.tsx:69,408`, unchanged) — right,
  same slot Home gives its overflow `Menu` + "New event" button
  (`FairwayCoachDashboard.tsx:289-326`).
- `h1`, `text-display`: "Your players." (unchanged copy, `FairwayCoachRoster.tsx:402`).
- Verdict, `text-h3` regular, max 64ch, built by a new pure function
  (`buildRosterVerdict`, sibling of `buildVerdict` at `coach-home-logic.ts:158-189`)
  from data every clause below cites:

  **Template:**
  `"{rosterSize} {player|players} on {teamName}. {trendClause} {leadClause} {slideClause} {attentionClause}"`

  - `rosterSize` = `players.length` (`FairwayCoachRoster.tsx:226` counts the same
    array). Always present — the zero-player case never reaches this masthead
    (`FairwayCoachRoster.tsx:414-428` returns a full-page `EmptyState` first).
  - `trendClause`: if any player has a real trend read (`recent_trend != null` for
    at least one row — field at `roster/page.tsx:572`, `FairwayPlayerCard.tsx:41`):
    `"{improvingCount} improving, {decliningCount} sliding."` (both counts are
    `players.filter(p => p.recent_trend === 'improving'|'declining').length`, real,
    client-derivable from the same field). **Missing:** no player has a trend read
    yet → `"Trends appear once players have five rounds to compare against five
    before."` (verbatim, `coach-home-parts.tsx:177` — the exact sentence, not a
    paraphrase; it names the real split, `TREND_WINDOW_SIZE = 5`
    (`src/lib/coachhelm/trend.ts:41`), that `computeScoringTrendFromRounds` uses).
  - `leadClause`: only when `improvingCount > 0`. Names the single biggest improver —
    the same symmetric selection Home's verdict makes on the other side
    (`coach-home-logic.ts:123` `improving` sort, ascending delta so the largest gain
    sorts first) — `"{name} improving the most, {delta} strokes."`, name linking to
    `/golf/dashboard/roster/{id}`. **Missing (delta not yet on the client — see
    Risks):** drop the strokes figure and print `"{name} improving the most."`; if
    `improvingCount === 0`, the clause is omitted entirely.
  - `slideClause`: only when `decliningCount > 0`. Names the single worst decliner —
    `worstSlide` = the declining player with the largest trend delta, the same
    selection Home's own verdict makes (`coach-home-logic.ts:221` `worst`,
    `attentionOrder`'s `sliding` sort at `coach-home-logic.ts:122`) —
    `"{name} sliding the most, {delta} strokes."`, name linking to
    `/golf/dashboard/roster/{id}`. **Missing (delta not yet on the client — see
    Risks):** drop the strokes figure and print `"{name} sliding the most."`; if
    `decliningCount === 0`, the clause is omitted entirely (never "0 sliding").
  - `attentionClause`, from `computeNeedsAttention` (`roster-health.ts:104-122`,
    already called at `FairwayCoachRoster.tsx:264-267`): if `needsAttention.length >
    0` → `"{N} need a look, {topName} first."`, `topName` =
    `playerName(needsAttention[0].row.player)` — `row.player` is a
    `PlayersGridPlayer` (`first_name`/`last_name`, no `name` field,
    `PlayersGridView.tsx:124-133`), so it has to go through the same `playerName()`
    helper this file already uses for every other name on the page
    (`FairwayCoachRoster.tsx:123-125`), not print the object raw. `needsAttention[0]`
    is the list's own top-priority row (`roster-health.ts:117-121`), linked.
    **Missing:** `needsAttention.length === 0` and `rosterHealth.playersWithRounds >
    0` → `"Roster's covered."` — the first clause of the honest branch already at
    `FairwayCoachRoster.tsx:752` (full text: "Roster's covered — everyone with
    rounds has a focus area and no one's trending down."), cut short here because
    the source sentence's em dash is exactly what LANGUAGE.md's copy ban forbids,
    not because the clause is a verbatim quote of the whole line; `playersWithRounds
    === 0` → `"Nothing to assess yet."`, the same cut of the em-dash sentence at
    `FairwayCoachRoster.tsx:751`.

- Facts line, `font-fw-mono text-caption tabular-nums`, same treatment as Home's
  (`FairwayCoachDashboard.tsx:330-337`): `"{activeCount} active"` always,
  `"· {inactiveCount} inactive"` only when `inactiveCount > 0`. Both derived from
  `status` (`FairwayCoachRoster.tsx:226` computes `activeCount`; `inactiveCount =
  players.length - activeCount`).

Join requests: `FairwayJoinRequests` unchanged, same position right under the
masthead (`FairwayCoachRoster.tsx:412`).

## The stage

**Instrument: `ScoreField`** (`src/components/fairway/modules/ScoreField.tsx`,
registry.ts:219) — the same registered primitive Home uses, not a new one. One row
per player, every one of their rounds plotted on a shared date axis; bars rise over
par in amber, drop under par in green, an even round is a neutral tick at the
baseline (`ScoreField.tsx:151-172`); the baseline is par, drawn as the row's
mid-line (`ScoreField.tsx:253`). A round bar links to `/golf/dashboard/rounds/{id}`
(`ScoreField.tsx:177-186`, `round.href`); the row's name links to
`/golf/dashboard/roster/{id}` (`ScoreField.tsx:238-244`, `row.href`).

**Data status — the bars above are not buildable today.** Everything else on this
row (identity, `avg_score`, `recent_trend` direction, the new Focus cell) is a real
field already reaching the client (cited inline below). The per-round marks — bar
position (date), bar height (`toPar`), bar link (round `id`) — are not: the loader
selects `round_date`/`total_score` server-side only (`roster/page.tsx:415-419`) and
collapses them into a dateless, idless `recent_scores: number[]` before the response
leaves the server (`roster/page.tsx:561-565`); `id`, `total_to_par`, `course_name`
are never selected at all. This spec's stage is blocked on the loader change in
Risks — every bar on this page depends on it, not just a plumbing detail.

**`avg_score` is a zero sentinel, not null.** `ScoreFieldRow.avg: number | null`
must not be mapped from the raw field: `page.tsx:548` computes
`totalHoles > 0 ? (totalStrokes / totalHoles) * 18 : 0` — a player with zero
rounds gets `0`, not `null`. `ScoreField.tsx`'s own `formatAvg`
(`ScoreField.tsx:108-110`) only guards `avg == null`, so a raw `0` would print as
`"0.0"` next to a strip reading "No rounds in this window" — a real zero score
is impossible in golf, so this reads as broken, not empty. Map it the same way
the table's own Avg column must (see "the table" below):
`p.avg_score && p.avg_score > 0 ? p.avg_score : null`, the exact guard
`FairwayCoachRoster.tsx:304`'s `hasScore` already applies.

**Rounds shorter than 18 holes**: two different things are true here and an
earlier draft of this spec conflated them. The roster loader's own trend read is
correctly hole-normalized — `computeScoringTrendFromRounds` divides by each
round's real `holes_played` (defaulting to 18 only when the value is missing,
`scoring-trend.ts:36`), and `page.tsx:555` passes it the real per-round value,
not a hardcoded 18; the table's own Avg column is normalized too
(`(totalStrokes / totalHoles) * 18`, `page.tsx:548`). It's Home's client-side
rollup, not the roster loader, that hardcodes the simplification (`holes_played:
18` regardless of the real value, `coach-home-logic.ts:81`). What the stage
actually inherits is Home's `ScoreField` bar convention: `toPar` is plotted as
the round's raw `total_to_par` with no holes-based scaling at all
(`coach-home-logic.ts:92`, `toPar: r.total_to_par`) — bars aren't normalized on
Home either. The roster stage keeps that same convention (raw `total_to_par`,
9-hole included) for consistency with the one instrument it's reusing, not with
this page's own Avg column, which — unlike the bars — really is normalized. This
still slightly understates how bad a 9-hole blowup looks next to an 18-hole one
at the same `to_par`; flagged, not fixed, since normalizing bars here would put
the stage out of step with `ScoreField` everywhere else it's used.

**Row order — sorted by trend, not standing** (this is what LANGUAGE.md's per-page
table means by "ScoreField sorted by trend"; Home's stage sorts by average instead,
`sortByStanding`, `coach-home-logic.ts:111-118`). Decliners first (largest delta
first, worst on top), then stable (alphabetical), then improvers (largest
improvement first), then players with no trend read yet (alphabetical, sunk to the
bottom). **New function required (`newFields`):** `attentionOrder`
(`coach-home-logic.ts:120-125`) cannot supply this directly — its own docblock
says so ("Flat and unread players are left out.", line 120) — and it drops the
`stable` and no-signal rows before its `limit` slice ever runs, so calling it with
`rows.length` still returns only sliders and improvers, silently omitting every
flat or unread player from a stage where every player needs a row. A sibling
function is needed (e.g. `rosterTrendOrder`, next to `attentionOrder` or beside
`buildRosterVerdict`): reuse `attentionOrder`'s two real sub-sorts verbatim for the
declining/improving buckets, then append
`rows.filter(r => r.trend?.direction === 'stable').sort(byName)` and
`rows.filter(r => r.trend == null).sort(byName)` — both real states already on
`ScoreFieldTrend`/`PlayerRollup` (`coach-home-logic.ts:45`, `types.ts:285-288`), no
new field, just a function nobody has written yet.

**Window control**, in the stage's header row at the right (LANGUAGE.md: "the view
control at the right"), same CSS-gated `Segmented`/`Menu` pair Home's range control
uses (`FairwayCoachDashboard.tsx:375-394`): `30D` / `90D` / `All`, default `90D`
(not `All` — see below). No `Season` option — unlike Home, roster's loader has no
season-boundary concept to borrow, and inventing one here would be exactly the
fabrication the honesty rule forbids. All three windows are a pure client-side
filter of the same real, already-fully-fetched round history (`page.tsx:410-420`
fetches every round for every player, unpaginated) — no new query for the window
control itself. Default is `90D`, not `All`: unlike Home (which windows
server-side via `dateRange` and only defaults to `all` because that request is
already scoped), roster's `page.tsx:412-420` fetches every round any player has
ever logged, unpaginated. A 20-player roster (`rosterFull`'s own ceiling,
`FairwayCoachDashboard.tsx:270`) with multi-season players on `All` by default
would put dozens of bars on some rows at first paint; `90D` keeps the stage
legible on load, and `All` stays one click away in the same control.

**Cap**: `scoreFieldCap(rows)`, reused verbatim (`ScoreField.tsx:49-53`).

**Focus column — the one additive, backward-compatible extension** ("with a focus
column" per LANGUAGE.md's per-page table; nothing like it exists in `ScoreField`
today, `types.ts:290-310`):
- `ScoreFieldRow.focus?: number | null` — active focus-area count for that player,
  already a real field (`active_focus_areas`, `roster/page.tsx:575`,
  `FairwayPlayerCard.tsx:47-49`). Optional and unset by Home's existing rows, so
  Home is untouched.
- `ScoreFieldProps.showFocusColumn?: boolean` (default `false`) — when `true`,
  `ScoreField.tsx` renders one more trailing column, width `3.25rem` (matching
  `AVG_COL`, `ScoreField.tsx:196`), header label "Focus" in the same eyebrow style
  as the existing header cells (`ScoreField.tsx:221-226`), added to the grid via a
  new `--sf-focus` custom property alongside `--sf-identity`/`--sf-avg`/`--sf-trend`
  (`ScoreField.tsx:219`). Cell: `row.focus ? row.focus : '–'` (en dash, matching
  `ScoreField`'s own null-avg glyph at `ScoreField.tsx:109` and `FieldReadouts`'
  at `coach-home-parts.tsx:112` — not an em dash), `font-fw-mono
  text-body-sm tabular-nums`, `text-accent-700` when `> 0` else `text-text-tertiary`
  — the same tone convention the file already uses for Avg/Trend.

**Degrade, a metrics read failed (not just empty) — `newFields`, see Risks**:
checked first, the same order Home uses (`FairwayCoachDashboard.tsx:398-401`
checks `teamStatsUnavailable` before its own zero-rows/zero-rounds branches).
Today `page.tsx:443-458` already detects this exact case — the rounds,
stats-cache and focus-area reads are each checked and logged — but folds every
failure to `?? []` before the response ever reaches the client
(`FairwayCoachRosterProps`, `FairwayCoachRoster.tsx:76-88`, carries no such
field), so a broken read and a genuinely quiet roster render identically. Once
forwarded (see Risks), the stage shows the same `InlineNotice` Home's stage shows
for the analogous case — "Couldn't load the team's rounds"
(`FairwayCoachDashboard.tsx:398-401`) — replacing the bars, not layered under
them. **Degrade, one row**: unchanged — `ScoreField` already renders one row
correctly (ticks depend only on `domain`, not row count). **Degrade, zero rows**:
never reached here — the page's own `empty` branch
(`FairwayCoachRoster.tsx:414-428`) returns a full-page `EmptyState` before any
player exists. **Degrade, players exist but none have a round in the selected
window** (reads succeeded, honestly empty): reuse Home's exact branch
(`FairwayCoachDashboard.tsx:409-422`) — "No rounds in this window" with a "Show all
time" action when the window isn't `All`, else "No rounds logged yet."

**Why this instrument, not a table**: the question is a comparison of many
players' trajectories over the *same* calendar. A sorted table of numbers can rank
who's up or down, but it can't show *when* — whether three declines cluster around
the same week (a tournament, a swing change rolled out to the whole team) or are
unrelated. Only a shared date axis makes that visible in one glance; the dense
table below still exists for the exhaustive, sortable list, but it cannot carry
shape over time.

Motion: unchanged, `ScoreField`'s own entrance stagger (`EASE_CINEMATIC`,
`DURATION.short`, reduced-motion guarded, `ScoreField.tsx:19-22,157-173`).

## Readouts

At most four, in the stage's right-hand column (`FieldReadouts`,
`coach-home-parts.tsx:102-134` — generic over `ReadoutItem[]`, reused verbatim, no
new component). None carries a sparkline: unlike Home's `enhancedData.sparklines`,
roster's loader has no per-metric historical series, and inventing one would be a
fabricated series.

1. **Roster** — value: `rosterHealth.totalPlayers` (`roster-health.ts:19-21,47`).
   No note: the active/inactive breakdown already runs once, in the masthead's
   facts line (`"{activeCount} active"` / `"{inactiveCount} inactive"` above);
   repeating it here would be the same-number-twice-in-adjacent-regions Home's
   own facts line and readouts avoid (roster size/events/qualifiers vs.
   scoring/GIR/putts/rounds share no figure, `FairwayCoachDashboard.tsx:272-276`
   vs. `:177-217`). No delta: a headcount, not a trend.
2. **Needs attention** — value: `needsAttention.length` (`roster-health.ts:104-122`).
   Note: a reason breakdown built from `NeedRow.priority`
   (`roster-health.ts:110-114`) — `"{n3} down & uncoached, {n2} down, {n1}
   uncoached"` for whichever buckets are non-zero. No delta: no historical snapshot
   of this count exists to compare against.
3. **With focus area** — value: `"{rosterHealth.playersWithActive} of
   {rosterHealth.totalPlayers}"` (`roster-health.ts:21,50-54`). No delta: same
   reason as above.
4. **With rounds** — value: `"{rosterHealth.playersWithRounds} of
   {rosterHealth.totalPlayers}"` (`roster-health.ts:25,62-64`). No delta.

## The ledger row

Two bare columns, `divide-x divide-border-subtle` on `lg`, unequal widths **7/5** on
a 12-column grid — the exact layout Home's ledger row uses
(`FairwayCoachDashboard.tsx:434-449`), just two columns instead of three, per
LANGUAGE.md's own per-page table for Roster ("Attention actions, Focus areas").
Neither column repeats a number the stage shows (the stage shows each player's own
trend chip and focus count, never a team-wide tally).

**Column 1 — Attention (7/12).** Header: plain "Attention" caption, no repeated
count in the heading itself — `needsAttention.length` already appears once, in
readout #2, and the rows below enumerate the same players; a third render of the
same number would be the kind of overlap Home's readouts and ledger avoid. Rows: the
same ranked list `computeNeedsAttention` already produces
(`roster-health.ts:104-122`, currently rendered by the `AttentionPanel` local
component being retired — see What this deletes), capped at 6, `"+N more
player{s}. Filter the board."` below the cap — the exact pattern already at
`FairwayCoachRoster.tsx:737` (`+{remaining} more player{remaining === 1 ? '' :
's'}. Filter the board.`), not the shorter "+N more." an earlier draft of this
spec misquoted it as. Each row: player name + the real reason text
(`NeedRow.reason`, e.g. "Trending down · no focus area", `roster-health.ts:111-114`).
Row link: player name → `/golf/dashboard/roster/{id}`. Each row also carries the
existing "Add focus area" action button (`FairwayCoachRoster.tsx:287-292`,
unchanged target). Degrade, a metrics read failed (`newFields`, see Risks — the
SAME flag the stage checks, not a second one): the same `InlineNotice` shape
Home's `AttentionLedger` shows, "Couldn't load team trends"
(`coach-home-parts.tsx:171-174`), in place of the list. Empty
(`needsAttention.length === 0`, reads succeeded): the same two honest branches
already at `FairwayCoachRoster.tsx:750-751`.

**Column 2 — Focus outcomes (5/12).** This is the one number the stage genuinely
cannot show: not how many focus areas are open (the stage's Focus column already
does that per player), but what happened to the ones that closed. Source: the
`outcomeTally`/`totalOutcomes` roster-health already computes
(`roster-health.ts:19,26-28,66-96`) from `focusAreasForHealth`
(`player_id`, `outcome_status`, `roster/page.tsx:523-530`, already passed into
`FairwayCoachRoster` as the `focusAreas` prop, `FairwayCoachRoster.tsx:87`) — today
computed and thrown away, since `RosterHealthHeader.tsx`'s "did the coaching land"
band was deleted with no replacement render site (`FairwayCoachRoster.tsx:20,431-440`
comment). Header count: `totalOutcomes`. Rows: each focus area with a recorded
`outcome_status` — in practice this means a focus area created *from a coaching
insight that itself carries an outcome* (`from_insight_id` set and that insight's
outcome present, `roster/page.tsx:468-492,529`), not every closed focus area; a
manually authored area marked done by other means will not appear here. Joined
against `players` (already a sibling prop, `FairwayCoachRoster.tsx:77`) for the
name — player name (link →
`/golf/dashboard/roster/{id}`) plus a tone-colored word: Improved (green), No
change (neutral), Worsened (amber). Capped at 6; beyond that, plain caption text
`"+N more outcomes recorded"` (no link — no destination page exists for the full
list, and inventing one is out of scope). Empty (`totalOutcomes === 0`): "No focus
areas have a recorded outcome yet." — likely the common case; see Risks.

## The table

Dense, full-width `<table>`, uppercase caption header over a `border-strong` rule,
hairline rows (LANGUAGE.md's general table shape, matching
`RoundsLedgerTable`'s construction, `coach-home-parts.tsx:243-289`).

**Toolbar above it** (not a separate top-level region — it is this table's header
strip): `SearchField` (search by name, `FairwayCoachRoster.tsx:203-207`,
unchanged), the "Needs attention" `FilterPill` with its count
(`FairwayCoachRoster.tsx:507-513`, unchanged, now the same filter the ledger's "+N
more" link sets), export `IconButton` (`exportRosterCSV`, unchanged). Sort:
`Segmented` on desktop / `Menu` on phone (Home's exact CSS-gated pattern,
`FairwayCoachDashboard.tsx:375-394`, `hidden md:flex` / `flex md:hidden` — not the
current `useMediaQuery`-driven Sort `Sheet`, which is JS-branched; see What this
deletes), same four options: Name / Avg score / Handicap / Rounds
(`FairwayCoachRoster.tsx:91-96`, unchanged).

**Columns** (left to right), all mono numerals right-aligned, signed values colored
as ink (green under, amber over):

| Column | Align | Source | Hidden below |
|---|---|---|---|
| Player | left | name + avatar (`PlayerIdentity`) + `FairwayYearBadge` (`FairwayCoachRoster.tsx:318`) + `FairwayIntentControl` pill inline (`FairwayCoachRoster.tsx:804-810`, moved out of the retired expand band into the row itself) | always visible |
| Avg | right | `avg_score` (`roster/page.tsx:570`) | always visible |
| Trend | right | `recent_trend` direction + magnitude once available (see Risks); arrow only until then | always visible |
| Rounds | right | `rounds_count` (`roster/page.tsx:569`) | `md` |
| SG:Total | right | `sg_total`, toned via `sgTone`/`formatSgTotal` (`FairwayPlayerCard.tsx:69-77`) | `md` |
| Focus | right | `active_focus_areas` (`roster/page.tsx:575`) | `md` |
| Handicap | right | `handicap`, via `formatHandicap` (`roster-helpers.ts:48-54`) | `lg` |
| (actions) | right, icon-only | `FairwayPlayerActionsMenu` (`FairwayCoachRoster.tsx:382-384`), `stopPropagation` so it doesn't trigger the row link | always visible |

**Null cells, three columns.** Avg: the same zero-sentinel guard as the stage
(see "the stage" above) — `p.avg_score && p.avg_score > 0 ? p.avg_score.toFixed(1)
: '–'`, not the raw field, so a roundless player reads "–" instead of a
golf-impossible "0.0". SG:Total: `sg_total` is `null` until the stats cache has a
row for that player (`roster/page.tsx:56-58`); render `'–'` in that case — the
guard the code being replaced already applies (`FairwayCoachRoster.tsx:360`,
`p.sg_total != null ? formatSgTotal(p.sg_total) : '—'`), using this table's own en
dash convention there, not that line's em dash. `sgTone`'s green
(`text-fw-success-ink` → `--fw-color-accent-800`, `design-tokens.css:196`) is the
same accent-green family as every other green ink on the page, not a third data
color — confirmed, not changed. Handicap: `formatHandicap(null)` returns an em
dash (`'—'`, `roster-helpers.ts:49`), the one character LANGUAGE.md's copy ban
forbids and the only glyph on this table that would break its own "–" convention;
since the helper itself can't be edited from this spec, guard at the call site
instead — render `'–'` directly when `handicap == null` and call `formatHandicap`
only for the non-null branch, where it never emits the dash at all.

**Row link**: the whole `<tr>` navigates to `/golf/dashboard/roster/{id}` on click,
with the name also wrapped in a real `<Link>` for keyboard/no-JS access — the exact
pattern `RoundsLedgerTable` already uses (`coach-home-parts.tsx:265-273`).

**Row count**: all `N` players, no cap, no "View all" link. This is a deliberate
deviation from LANGUAGE.md's general "ten rows and a View all N" table convention:
that convention fits a recent-activity feed (Home's rounds), where showing the
latest 10 of an unbounded history is the point. A roster is not a feed — it is a
bounded, complete list (a team caps at 20 players, the same ceiling
`FairwayCoachDashboard.tsx:270` already enforces as `rosterFull`), and the whole
point of this table is that every player is in it.

## Phone

Same order, one column, per LANGUAGE.md's phone rule.

1. Masthead: eyebrow row wraps (invite button stays the one primary action, menu
   collapses into it same as desktop); verdict wraps at the phone width; facts line
   unchanged.
2. Join requests banner, conditional, full width.
3. Stage: `ScoreField` becomes identity-above-strip per row, 44px bars
   (`ScoreField.tsx`'s own existing mobile layout, unchanged — this is the same
   component Home already ships responsively). The Focus column (new) stays: it's
   one more narrow mono cell, not a layout change. Window control: `Segmented`
   hidden, `Menu` shown (`hidden md:flex` / `flex md:hidden`, no JS state).
   Readouts become a 2x2 typographic grid above the stage (`FieldReadouts`'s own
   existing `grid-cols-2` phone layout, `coach-home-parts.tsx:104`, unchanged).
4. Ledger row: the two columns stack, horizontal hairline between them instead of
   the desktop's vertical one (`grid-cols-1` / `lg:grid-cols-12`, same mechanism as
   `FairwayCoachDashboard.tsx:434`).
5. Toolbar: search full width on its own line; "Needs attention" pill and the sort
   `Menu` trigger button on the next line (unchanged from today's already-fixed
   phone toolbar row, `FairwayCoachRoster.tsx:505-527`, minus the Sheet).
6. Table: `Player`, `Avg`, `Trend`, and the actions icon stay; `Rounds`,
   `SG:Total`, `Focus`, `Handicap` hide via `hidden md:table-cell` /
   `hidden lg:table-cell` (plain CSS classes on the `<th>`/`<td>`, exactly
   `RoundsLedgerTable`'s own mechanism, `coach-home-parts.tsx:250-257`). Row tap
   still navigates — no Sheet, no inline expand.

Every phone/desktop branch above is a CSS class (`hidden md:...`, `md:flex`
`hidden`, `lg:table-cell`) or the `ScoreField`/`FieldReadouts` components' own
built-in responsive CSS. The one exception in the *current* code —
`useMediaQuery(DESKTOP_QUERY)` driving `expandedRowId` vs. a phone `Sheet`
(`FairwayCoachRoster.tsx:184-198`) — is retired along with `MatrixBoard`'s expand
band (see below), so no client-only breakpoint state remains on this screen.

## What this deletes

- The header `Surface` (`FairwayCoachRoster.tsx:441-470`) and everything inside it:
  `StatMatrix` (lines 452-461) and the local `AttentionPanel` component (lines
  672-759) as a bespoke panel-with-list — a banned "panel whose only content is a
  list." Their real underlying data (`rosterHealth`, `needsAttention`) survives,
  now feeding the readouts and the ledger's Attention column instead of a card.
- `MatrixBoard` entirely (`FairwayCoachRoster.tsx:51-52,568-579`) — its `columns`,
  `kpis={[]}`, per-row `expand` band, `expandedRowId`/`onExpandedRowChange` — and
  the `COLUMNS` constant (lines 156-163). Replaced by the dense table.
- `useMediaQuery(DESKTOP_QUERY)` / `isDesktop` and the desktop-inline-expand vs.
  phone-`Sheet` split it drives (`FairwayCoachRoster.tsx:98-101,184-198`) — a
  client-only breakpoint branch, explicitly banned by LANGUAGE.md. Rows now
  navigate instead of expanding, so there is nothing left to branch on.
- The phone player-detail `Sheet` and the local `RowDetail` component
  (`FairwayCoachRoster.tsx:587-614,780-819`). Its "Open profile" CTA is redundant
  with the row's own link; its Goals readout is dropped from the list (it belongs
  on the player detail page, out of this screen's scope); its
  `FairwayIntentControl` call moves inline into the table's Player cell instead.
- The phone Sort `Sheet` (`FairwayCoachRoster.tsx:616-657`) — replaced by a `Menu`,
  matching Home's window-control idiom, so the phone sort affordance is CSS-gated
  rather than another JS-driven overlay.
- The per-row `SignalChip`/`deriveSignal` "Trending down / No intent / On track"
  chip (`FairwayCoachRoster.tsx:133-140,365-368`) — a derived paraphrase of two
  facts (trend, intent) that are now directly visible on the row itself (the real
  trend cell, the real intent pill), not summarized into a third badge.
- `PlayerIdentity`'s `meta={pluralize(rounds_count, 'round')}` caption under the
  name (`FairwayCoachRoster.tsx:319`) — rounds gets its own table column instead.
- `TrendGlyph` riding beside the Avg cell for the pre-940px board row
  (`FairwayCoachRoster.tsx:333-339`) — the table's own Trend column, kept visible
  at every width, replaces it.
- `FairwayPlayerCard.tsx` stays exactly as it is today: still not rendered on this
  page (`FairwayCoachRoster.tsx:61-66`'s own comment already says so), only its
  `RosterPlayer` type and `formatSgTotal`/`sgTone` helpers are reused, unchanged.

## Risks

- **`newFields`** — the identity/Avg/Trend-direction/Focus columns render today;
  **every bar on the stage is blocked** until this loader change ships, because no
  per-round date, score, or id reaches the client at all. Today
  `roster/page.tsx`'s `RoundStatRow` (lines 372-379) selects only `player_id,
  total_score, holes_played, round_date`, and the client never receives a
  per-round list at all — only aggregates (`avg_score`, `rounds_count`) and a
  scores-only array with no dates or ids (`recent_scores: number[]`, last 10,
  lines 561-565). The stage needs each round's `id`, `round_date`, `total_score`,
  `total_to_par` (and ideally `course_name`, for the bar's spoken label, matching
  `ScoreFieldRound.label`'s format at `coach-home-logic.ts:93`). Loader change:
  widen the `.select(...)` at `page.tsx:415-419` to add `id, total_to_par,
  course_name`, and forward each player's full round array to `RosterPlayer`
  instead of collapsing it — mirroring `dashboard-data.ts`'s richer
  `recentRounds` shape that Home's `rollupPlayers` already consumes
  (`coach-home-logic.ts:57-108`). This same change resolves the trend-delta gap
  too: `computeScoringTrendFromRounds` (`@/lib/golf/scoring-trend`) already runs
  server-side today (`page.tsx:555`) and returns a real `delta`, but only
  `.trend` (the direction string) is kept (`page.tsx:572`) — once full rounds
  reach the client, the same classifier can be re-run there (as Home does) and
  the magnitude survives, powering both the stage's trend chip and the verdict's
  "sliding the most, N strokes" clause. Until this ships, the stage's Trend
  column and the masthead's slide clause must use the direction-only fallbacks
  described above — they are two call sites of the same gap, not two separate
  risks.
- **`newFields`, second gap: read failures render as an empty roster, not a
  broken one.** `page.tsx:443-458` already detects and logs three independent
  read failures (rounds, stats-cache, focus areas) but folds each to `?? []`
  before `playersWithStats` is built, and `FairwayCoachRosterProps`
  (`FairwayCoachRoster.tsx:76-88`) has no field carrying that failure forward —
  so today a broken read and a genuinely quiet team render identically: every
  player shows 0 rounds, a blank/zero average, "no read" trend, either way. Home
  guards the identical case with `teamStatsUnavailable`
  (`dashboard-data.ts:110`, computed at `:844` as `rosterFetchError ||
  roundsFetchError`), consumed by the stage's `InlineNotice`
  (`FairwayCoachDashboard.tsx:398-401`) and the ledger's `AttentionLedger`
  `unavailable` prop (`coach-home-parts.tsx:171-174`). Loader change: `page.tsx`
  should fold its three existing `.error` checks (already read individually at
  lines 444-446) into one `metricsUnavailable: boolean`, add it to
  `FairwayCoachRosterProps`, and pass it through to both the stage's degrade
  branch and the ledger's Attention column (see both sections above) — one
  flag, two consumers, the same shape Home already threads its single
  `teamStatsUnavailable` through to two places.
- `VerdictLine`, `FieldReadouts`, and `SectionHead` (`coach-home-parts.tsx`) are
  generic over their own prop types and have no dashboard-specific coupling, but
  they physically live under `pages/dashboard/`. Importing them cross-page for
  roster works today; a follow-up may want to promote them to a shared module
  (e.g. alongside `ScoreField` itself) so "dashboard" isn't importing from
  "roster" isn't importing from "dashboard." Not a blocker for this spec.
- The Focus-outcomes ledger column (Column 2) surfaces data
  (`golf_coach_insights.outcome_status`) that was silently dropped when
  `RosterHealthHeader.tsx`'s "did the coaching land" band was deleted with no
  replacement render site. If `outcome_status` is sparsely populated in
  production, this column will often render its empty state — honest, but worth
  confirming against real data before shipping so it isn't a mostly-dead column.
- Retiring `MatrixBoard`'s inline expand band and the phone `Sheet` means every
  drill into a player's Goals count or "Open profile" now costs a full page
  navigation instead of an in-place expand. The one exception is intent-setting,
  which stays a same-page action via the inline `FairwayIntentControl` pill. This
  is a deliberate trade for a denser, table-shaped overview; flag it in review as
  a real (not free) UX change.
- The table's row carries 7 informational slots plus an actions icon at `lg`
  width. Verify against the longest real player name and a full 20-player roster
  before shipping, so the Player cell's name + year badge + intent pill doesn't
  crowd the numeric columns off a standard laptop width.
- **`All`-window density, resolved above, not left open**: with the loader
  change landed, a multi-season player on the `All` window still plots every
  round they have ever logged on one row at a fixed row height — a player with,
  say, 40+ rounds on file packs that many bars into one row at only a few
  pixels each. This spec decides it rather than deferring it: the stage
  defaults to `90D`, not `All` (see "Window control"), so this density only
  appears once a coach explicitly opts into `All`; no separate per-row cap is
  layered on top of that default.
- **This redesign breaks pinned test strings.** `roster.v2.md:102` lists
  assertions the current `FairwayCoachRoster.test.tsx` suite pins: "Who needs your
  attention" (this spec's ledger heading is "Attention," not that phrase), and
  the `", expandable row"` aria-label pattern (the expand band is deleted, so no
  row is ever "expandable" again). "Add focus area" and "Needs attention" survive
  verbatim. "Roster's covered" survives as copy but the test asserting it may
  need to move from wherever it currently renders (the deleted `AttentionPanel`)
  to the new ledger/masthead render site. Whoever builds this should update or
  delete those specific assertions rather than discover the breakage blind.
