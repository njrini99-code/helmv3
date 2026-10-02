# P004 — Stats (team): changelog

## 2026-10-02 — Intuitive improvement: easier phone filter activation

```text
Design package: owner's mobile boards; Intuitive Software Design IMPROVE mode
PR/commit:      codex/clubhouse-design-fidelity (working tree after cca081c)
Contract IDs:   none changed
Actions:        existing event reply, acknowledgment and task state; none added
Data impact:    no endpoint or schema changes; local fixtures and mocked writes for verification
Held items:     intended-user validation, physical Safari and real-account read-back
```

The phone filter now has an explicit 44×44px target, keeping the existing
control, label and window choices. WebKit measured the target at 375, 390 and
430 with zero horizontal overflow. Window-change, empty and failed data behavior
is unchanged.

Evidence and practical limits: `VERIFY.md` and the scoped intuitive
secondary-screen report.

## 2026-10-02 — Team stats: clearer card spacing and material depth

```text
Design package: design/handoff/ (owner's mobile boards and depth.css)
PR/commit:      codex/clubhouse-design-fidelity (working tree)
Contract IDs:   none changed
Actions:        none changed
Data impact:    none
Held items:     physical iPhone Safari and signed-in production data verification
```

Phone stats now use the shared layered sheet surface, 16px section spacing and
card padding. Figure captions have a readable line height and can wrap when a
narrow screen needs it. All values, filters, chart data and missing-data states
are unchanged.

Verification: WebKit iPhone 13 populated layouts at 375, 390 and 430, plus
empty/failed states at 390. Before/after screenshots and practical limits are
recorded in VERIFY.md.

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification log and decisions).

## 2026-10-01 — Page performance: fewer round trips, a page that keeps its shape across windows

```text
PR/commit:      agent/swap-audit (09870b6d6, 26cf82b2c, 2b3e64862, 169f17833, a5cc23b30, 9000315b7, 6e78c0dc3)
Design package: none (no new element; the held cards and the caption line add a little height in some windows)
Contract IDs:   none new (CH-4402, CH-4401 behaviour unchanged)
Actions:        none
Data impact:    none; same figures, same reads, in fewer round trips (`loadTeamStats`, `loadLongestPutt`)
Held items:     none
```

- **Issue.** (1) The loader read in three round trips, but the shot reads paged
  a thousand rows at a time one after another, and the season's longest putt
  read every putt of the season to find one. (2) Choosing a window moved the
  page: the figure cards were 213, 183 or 172 px tall, the hole-coverage line
  came and went, and the trend plot was 302 px tall, or 263 when fewer players
  had rounds in the window. (3) The route skeleton's cards were 179 px and its
  trend card 313 px against 213 and 419 loaded, so the page moved when it
  landed.
- **Fix.** The round figures, the window's putts and the longest putt are read
  together after the rounds, and a long read asks for its pages in growing
  batches after the first (2, then 4, then 8 at a time: a three-page read is two
  round trips instead of three, a six-page one three instead of six;
  `fetchAllRowsTogether`, same contract; asking for the row count with the first
  page measured slower, so it is not asked). The longest putt is one row
  from the database (made, 0 to 120 ft, the longest), asked in chunks of 200
  rounds and compared across them. The cards hold the height of their fullest
  layout in every window (the change chip with its words wrapped under it, the
  strokes gained note on two lines; two across, the narrow layout), the caption
  line is always there (empty when no note is shared), and the trend plot is as
  tall as the team's players whichever have rounds, the empty window included
  (its list keeps its top when it shortens). On the phone the empty trend keeps
  its chart frame, an empty strokes gained panel the height of the bars, and
  the putting reading holds two lines. The skeleton draws the same heights
  (the card has one height variable per layout, shared with the held card; one
  more band at a 901 to 940 px canvas, where two cards' words take a third
  line), the caption line and the trend card's head, plot and note. Tapping a
  player row shows the page's hairline while the profile loads
  (`LinkPending`).
- **Not done, on purpose.** Nothing is cached across requests, users or teams,
  and other windows are not prefetched: a window is a heavy server render and
  a stale figure is worse than a 250 ms wait. The phone's figure strip still
  drops its change line in a window with no earlier window (F-43), so the page
  below moves 16 px between Last 10 and Season; that is an owner decision (the
  line held blank undoes F-43's "no empty band").
- **Checked.** `stats-team-reads.test.ts` (waves; the longest putt is one row,
  chunks of 200 across 450 rounds; a failed longest-putt read leaves the best
  out), `paging.test.ts`, `stats-geometry.test.tsx`, `stats-team.test.tsx` 47/47;
  measured with `npm run clubhouse:perf` (PROGRESS.md, "Page performance
  (2026-10-01)"). Server time at 1280, median of three alternating passes: cold
  395 to 305 ms, a tap from Home 425 to 292, the Qualifiers window 190 to 119,
  Last 10 318 to 211; Season did not move (180 to 188, inside the spread; 168
  to 193 at 390). Cards, strokes gained table and head land within 1 px of the
  skeleton (the table landed 79 px lower than drawn). Raw layout shift on a
  switch at 1280 was 0.023 to 0.026 and is 0.001 to 0.003; at 390 Qualifiers
  went 0.110 to 0 and Last 10 0.128 to 0.042, with Season still 0.042 (the
  coverage caption, 54 px).

## 2026-10-01 — "vs. previous 10" compares the same players (Q-112)

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none (no visual change)
Contract IDs:   none new
Actions:        none
Data impact:    none; `loadTeamStats` (scoring, greens, putts, scrambling, birdies, strokes gained)
Held items:     none
```

- **Issue.** The team's change pooled every player's newest ten against the
  previous ten of only the players who had one, so a player with no earlier
  rounds moved the trend by joining.
- **Fix.** Each change compares the window's rounds of the players who also
  have a previous ten against that ten; the figure itself still reads the
  whole window (owner, 2026-10-01).
- **Checked.** `stats-team.test.tsx` 47/47, including the Q-112 case.

## 2026-10-01 — Phone to the board; smooth window changes (F-54, F-55)

```text
PR/commit:      agent/swap-audit
Contract IDs:   CH-4402 (behaviour refined, row unchanged)
Data impact:    none
```

- **Fix.** Changing the window no longer flashes twice and jumps: a live page
  that goes busy keeps its content (the skeleton fade-in applied to it too), and
  the first-paint reveal plays once per page instead of again when the busy
  state ends. The window switch moves on the tap; only the figures dim, and the
  header and switch stay crisp.
- **Fix (phone).** The board's figure strip, panel titles, green notes and bar
  colours; captions no longer drawn at figure size; a change that rounds to zero
  is neutral.

## 2026-09-30 — Last 10 across seasons; total-only rounds count (Q-122, Q-123)

```text
PR/commit:      agent/swap-audit
Contract IDs:   none new (the contract's intro states the rule)
Data impact:    none (reads only; no migration)
```

- **Issue.** Last 10 stopped at the season start (1 August), so Demo's Cole,
  with 3 rounds this season and 13 tournaments before it, read as 3 rounds. And
  his two qualifiers posted as totals (25 and 26 September) were in no figure at
  all.
- **Fix.** Last 10 is each player's ten newest countable rounds in any season,
  with "vs. previous 10" the ten before them, read from a rolling 12 months back
  (`lastTenFloor`); Season and Qualifiers stay this season. A round posted as a
  total only counts in the scoring and in no hole-level figure; each hole-level
  card says "Hole stats from 8 of 10 rounds" when that is fewer than the
  window's (a note under the card; under the figures on the phone), and its own
  count replaces the window's.
- **Checked.** Cole's real rounds: Last 10 is 10 rounds (was 3), Season 5 (was
  3), Qualifiers 2 (was 0), hole stats from 8, 3 and 0 of them. A zeroed cache
  row of a total-only round cannot dilute putts, penalties or birdies (its id is
  never read).

## 2026-09-30 — A team with only 9-hole rounds this season is not a first run (D-71)

```text
PR/commit:      agent/clubhouse
Contract IDs:   none new (CH-4301, CH-4310 and CH-4319 change their words)
Data impact:    none
```

- **Issue.** With Holes at its default of 18, a team whose only rounds this season were 9-hole ones saw "No stats yet. Team and player stats fill in as players post rounds", which is false: the rounds exist, they are just not 18-hole ones.
- **Fix.** D-71's first-run page is for no round of either length. A team with a 9-hole round in the window gets CH-4301 with the CH-4319 hint ("choose 9 holes or Both in Filter") instead, desktop and phone. The same check (`nineRoundsInWindow`) drives the hint, so it never points at an empty page.
- **Also.** Game detail's make-rate curve, when the putt read fails, no longer sets the 15-20 ft band against the Tour's 15-25 ft value (P005).
- **Checked.** Tests for the nine-only team (desktop and phone), the no-round team (still the first run) and a 9-hole round from before the season (still the first run); the 15-20 ft mark; mutations of each caught.

## 2026-09-30 — Round filter with a Holes control: the same filter on every player and the team's figures (owner: "make it 9 or 18")

```text
PR/commit:      agent/clubhouse
Contract IDs:   none new (catalog CH-4101, CH-4313 to CH-4319; CH-4314 changes its words)
Data impact:    none (reads only; no migration)
```

- **Issue.** Team stats read only its three fixed windows and 18-hole rounds. A coach could not look at tournaments alone, a stretch of dates, a course or chosen rounds, or bring the team's 9-hole rounds in.
- **Fix.** The filter of the player profile (P005), applied to each player's own rounds ("Last 10" is each player's ten newest matching rounds) and to the team's figures pooled from them: the six cards and their changes, the trend, the leg cards, the grid, the putting rings and the phone's lists. Holes (18 holes by default, 9 holes, Both): Scoring average, putts and birdies a round, Team SG per round, the weekly lines and each player's average and strokes gained are per 18 holes (a nine-hole round counts as half); greens, scrambling and the putting rings pool the holes; floors count whole rounds. Season bests stay the season's 18-hole rounds and say so while a filter is on (CH-4317). A grid row, a Season best and a phone row open the player with the filter kept; the CSV is named for the filter.
- **Also.** The grid's late-against-early change is per 18 and needs four whole rounds. With no 18-hole round but 9-hole ones in the window, the page says where they are (CH-4319).
- **Checked.** The data and screen tests of P005's entry (per-player cut, pooled figures, range before the season, the whole-round floors), mutations, axe and native-feel clean at 1280, 390 and 430px.

## 2026-09-30 — The Tour is the only benchmark (Q-88): no D1 anywhere

```text
PR/commit:      agent/clubhouse
Contract IDs:   none new (CH-4209's words change; its number doesn't)
Data impact:    none (reads the existing `pga_tour_value` column; no migration)
```

- **Issue.** Greens in regulation read "D1 averages 67%", the putting rings and their note graded the team against the D1 make rates, and `loadD1` also filled a women's team's gaps with the men's values. The owner's answer (Q-88): never a D1 benchmark, always the Tour.
- **Fix.** `loadTourBenchmarks` reads `golf_pga_standards.pga_tour_value` for the team's own tour only (the LPGA row for a women's team); a metric the tour has no value for has no benchmark, never the men's. The GIR card reads "Tour averages 66%", the rings' marks and the note grade against the Tour ("3 to 5 feet is the only band below the Tour make rate"). The loader's field is `bench` and the read is logged as `tourBenchmarks`.
- **Checked.** strokes-gained.test (no Team stats screen, desktop or phone, renders D1, a division or college; the loader reads the Tour value of the team's tour and never falls back; the note in every branch); 11 mutations caught.

## 2026-09-30 — Strokes gained on Team stats: a headline, the window mean, bars that mean what they show

```text
PR/commit:      agent/clubhouse
Contract IDs:   none new (catalog CH-4311, CH-4312)
Data impact:    none (reads only; no migration)
```

### One baseline label

- **Issue.** Stored strokes gained is measured against the Tour (Broadie expected strokes; the women's curve is the men's scaled by 1.083), but each screen worded it its own way ("the women's baseline", nothing at all, and "vs D1" on Home and the phone profile).
- **Fix.** One helper, `lib/sg.ts` `sgBaseline(tour)`: "vs Tour" or "vs the women's Tour baseline" for a caption, "the Tour baseline" inside a sentence; an unknown tour claims none (CH-4210). The trend header, the leg note and the new headline use it.
- **Checked.** strokes-gained.test (57 cases); 2 mutations caught (men's label reading D1, women's reading Tour).

### Team SG per round, the headline (CH-4311, CH-4312)

- **Issue.** The page's first row had no strokes gained figure, though it is the number the owner reads first.
- **Fix.** A sixth card leads the row: the window's mean per round over its rounds with strokes gained, signed, green for a gain and amber for a loss, with its change against the previous 10 and "vs Tour · N rounds with shots" under it. No rounds with shots reads "—" and "Needs rounds with shots" (CH-4311); last 10 with nothing to compare reads "No earlier rounds", or "Too few earlier rounds with shots" when there are one or two (CH-4312). Season and Qualifiers have no previous window by design and claim nothing. The row is six columns (`--ch-fg-n`) and the loading skeleton draws six cards as tall as the loaded ones.
- **Checked.** strokes-gained.test; mutations caught: headline taken from the newest round, headline renamed, previous window ignored.

### The leg cards, the player list and the notes read the window, not the last week

- **Issue.** Each leg card's headline was the latest week's value, the SG-lens player list was sorted by (and showed) the last week, and the trend note said "The team has gained 1.0 a round from Aug 30 to Oct 12", a level where a change was meant.
- **Fix.** The card headline is the window's mean (`legTotals`); the list beside the trend shows and sorts by each player's window mean (`sgMean`, `scoreMean`, three rounds with strokes gained as in the grid), and says so in its caption; the note reads "The team's strokes gained are up about 1.0 a round since Aug 30, a weekly average from −1.0 to 0.0" (flat under 0.15).
- **Checked.** strokes-gained.test; mutations caught: card headline back to the last week, sort back to the last week, list value back to the last week, note back to a level.

### Bars scaled to the data

- **Issue.** The phone's leg bars were clamped at 1.4 and the grid's tint at 1.2, so against the Tour (approach about −2.7, putting about −1.9 for a college team) every big leg drew the same full bar.
- **Fix.** `sgScale` is the largest value shown, rounded up to a whole stroke, never under 1; bars are symmetric about zero and a bar's length is its value. The phone's Strokes gained by leg panel also draws the team total on the same scale. Colour stays gain green and loss amber.
- **Checked.** strokes-gained.test (a −2.6 leg is 43% of the track on a scale of 3); mutations caught: a fixed 1.4 in the bars, a fixed 1.2 in the grid, no rounding up, a clamp in the share.

## 2026-09-30 — Page docs, permission proven, the export's names written as text

```text
Contract IDs:   13 new behaviour contracts: 40101, 40102, 40501, 40801, 40802, 40901, 41201, 41401, 41901,
                42001, 42101, 42301, 42401 (each named by a test title)
Actions:        5 (ACT-P004-*)
Data impact:    none
```

### Changed

- The six page docs, the manifest's actions, and CONTRACT.md answering all 25 categories, with Permission
  (08) written from the route and the loader rather than assumed.
- The CSV export writes a player's name that starts with =, +, - or @ (or a tab or a return) as text. Players
  type their own names, and the export is opened in a spreadsheet (found while reading the export for
  the contract; Roster fixed the same thing as 30502).
- Tests: 12 added (the route's permission and address, the export's cells and its landing, the choices kept
  across a window change, the keyboard path, the loader's one pass and its logged reads, the busy state
  CH-4402) and five retitled to carry the IDs they prove; the meta test 42401 keeps the file honest. Each new
  test was mutation-checked.
- The catalog's CH-4402 and CH-4702 now name their tests (they said preview).

### Found and not fixed

- v2 draws Stats with no rounds ever as a whole-page empty (D-71). The loader reads only this season's
  rounds, so it cannot say "ever"; owner decision.
- The phone's scoring trend and the player profile's scoring trend draw nothing with fewer than two weeks or
  rounds, and say nothing (desktop says "The trend needs rounds in at least two weeks").
- `createFocusArea` (shared action): stores the coach id the browser sends and skips its roster check when
  the coach has no organisation or no team (see P005).
- The old address /golf/dashboard/stats/team is a Fairway page that redirects a non-coach with a conditional
  `redirect()`, the pattern that crashed /stats with React #310 (the note in stats/page.tsx). Players are not
  linked there.

### Verification

- `npx vitest run src/clubhouse/__tests__/stats-team.test.tsx` 42/42; `npm run -s typecheck:fast` exit 0;
  eslint exit 0 on the changed files. Not run in this pass: clubhouse:check, docs:check, build, a11y.

## 2026-09-30 — v2 phone built

- `StatsTeamPhone`, placed by the page frame so the window change and its notices are the desktop's: four
  figures, the scoring line with its mean, strokes gained by leg (new loader field `legTotals`), players
  sorted by Avg or SG (new grid field `avg`) opening their stats, and team putting. New catalog rows CH-4703
  and CH-4805; the gaps against the board are Q-68. Seven tests, each mutation-checked.

## 2026-09-29 — Offline and slow window changes, a crash on the server render, the island split

- The window switch refuses to request anything offline (CH-4901) and says so once after 5 seconds
  (CH-4902). A section that crashes on the server render no longer fails the whole page: a Suspense inside
  each SectionBoundary (D-24). `StatsTeam` renders on the server and only the islands ship as client code
  (17.7 to 11.8 KB minified); the shell's animation features load lazily (D-25). One round-cache read serves
  the window, the previous window and the bests. CH-4209 and CH-4210: no benchmark of a guessed tour.

## 2026-09-29 — Fidelity pass and old address

- The prototype and the preview rendered box by box at 924 and 1280px against stats-team-01..05; the
  trend note margins, the players column, the leg cards' area fill, the putting rings and the grid subtitle
  were fixed. The old address /stats/team renders this page in place for a coach (D-23). D-26 keeps four
  copy choices as built.

## 2026-09-29 — Desktop build

- Team stats on the RLS-scoped client in one server pass, with trends and strokes gained first (the owner
  removed the team stat sheet), and the state catalog CH-40xx to CH-48xx.
