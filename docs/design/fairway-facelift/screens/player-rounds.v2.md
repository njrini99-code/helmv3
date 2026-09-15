<!-- markdownlint-disable MD013 -->
# My rounds v2 — `/golf/dashboard/rounds` (player) · 390 and md+

Spec only. Builds on `player-rounds.mobile.md` (the In progress group and the StatMatrix are landed) and `rounds-library.md` (coach and player share the component; the coach branch is not changed by this spec). Files: `src/components/fairway/pages/rounds/FairwayRoundsLibrary.tsx` (player branch), `FairwayRoundRow.tsx`, `FairwayUnfinishedBanner.tsx`. Round detail and round review are out of scope (review stays on hold).

## The first question

"How am I scoring lately, and was my last round good or bad for me?" The page today answers with five numbers and a list. The list is right; the numbers are a table. v2 puts the score line at the top with the last round marked against the player's own average, and turns the five numbers into two readouts plus visuals.

## Data the component already receives

- `rounds[]` (`RoundLibraryRound`, completed, newest first): id, course_name, course_city, course_state, round_date (date-only), round_type (practice | qualifier | tournament | null), total_score, score_to_par, total_putts, total_fairways, total_fairways_hit, total_gir, total_gir_possible, holes_played, status.
- `inProgressRounds[]`: the same shape plus current_hole, updated_at, created_at.
- `stats`: totalRounds, avg, best, avgToPar, underParPct, trend (improving | declining | stable | null, gated at six scored rounds).
- `userRole`, `playerId`.
- Already derived in the file: `normalizedScore` (18-hole equivalent), `monthSummary` (scored count, avg, best, spark series), `seriesDelta`.

Not received: hole-by-hole scores. A hole strip (`Filmstrip`) needs `golf_hole_scores`, which the rounds route does not select; it stays on round detail. It is not counted among the instruments below, and the plan's last step names the query change if the owner wants a hole strip here later.

## Stage

One `InstrumentPanel` (tone neutral; depth base with no bezel on the phone canvas, depth raised at md+) under the ViewHeader, replacing the StatMatrix as the first object.

- Readout: scoring average (`Readout` size lg, label "Avg score", delta = `seriesDelta` over the chronological normalized series, direction down is good) beside a second readout "To par" (avgToPar, signed).
- Verdict, from `stats.trend` and the delta: "Trending down 1.4 over the season." / "Holding around 74.4." / "Six scored rounds unlock the trend." (the existing honesty gate, unchanged).
- Instrument 1, score trajectory: `Ribbon` over every scored round oldest to newest (normalized score), benchmark = `stats.avg` dashed, the last round marked with its end dot and a corner readout "Last: 73 (+1) · QA Test Course · Aug 31". `minPoints` 3. Tapping the marked point opens the round (the readout is a link). Reduced motion snaps.
- No button in the stage. "New round" stays the ViewHeader primary.

## Instruments

1. Score trajectory: `Ribbon`, as above. Shared identity with the player home stage (same series rule, same marker, same benchmark rule), so a player reads the same line in both places.
2. Where your scores land: `BandHistogram` of `score_to_par` bands (Under par · Even · +1 to +3 · +4 to +7 · +8 or more), `n` = rounds in the band, `pct` = share; no benchmark line (the histogram's benchmark is a full-width rate line and there is no team distribution on this page); the takeaway line reads "Under par in 19% of rounds" from `stats.underParPct`. This is the player's score distribution: the same visual the coach's team pages use for standing distributions, with rounds instead of players.
3. Practice vs qualifier vs tournament: `SegmentBar` with parts from `round_type` counts (tone neutral), `primary` = the type with the most rounds, `takeaway` = the averages by type computed from the rows ("Tournament avg 76.1 · Practice avg 73.8 · Qualifier avg 74.5"). Answers "do I score worse when it counts". Rounds with null type fold into "Other" only when they exist.
4. By month: `BarCompare` (horizontal, one bar per month with two or more scored rounds, value = month avg, benchmark = season avg, highlight = the newest month) at md+ only. On the phone the existing month seam headers with their `Sparkline` (six or more scored rounds) remain the by-month visual, no second copy.
5. In-round detail per row stays as is (score, to-par pill, Putts / FIR% / GIR%). Putts, FIR and GIR get their own small `Sparkline` in the month header at md+ when the month has six or more rounds with that column logged, next to the score sparkline. Phone keeps the score sparkline only.

## Composition at 390

```text
ViewHeader          Your rounds.   ·   20 rounds · May to Aug 2026        [+ New round]
Stage (bare)        74.4  ▼1.4 season      +2.4 to par
                    "Trending down 1.4 over the season."
                    ╭────────── Ribbon, last round dotted, avg dashed ──────────╮
                    ╰ Last: 73 (+1) · QA Test Course · Aug 31 ─────────────────╯
In progress · 5     matte InsetGroup (landed)
Where your scores land   BandHistogram (5 bands)               ── seam ──
When it counts      SegmentBar practice · qualifier · tournament + takeaway
Toolbar             search / [All types] [Month ▾]   (landed; sticky when stuck)
Library             one matte Surface
                    ── August 2026 · 4 rounds · 74.2 avg · ▁▃▂▅ ──
                    Sun 31  QA Test Course   Qualifier   73  +1   ›
                    …
                    Show 30 more
```

The stage, the histogram and the segment bar are three seam sections on the canvas with eyebrow headings and hairlines; the library is the only bordered Surface (as today).

## Composition at md+ (12 col)

```text
ViewHeader ────────────────────────────────────────────────── [+ New round]
┌ Stage (7) raised ─────────────────────────────┐ ┌ Where your scores land (5) ┐
│ 74.4 ▼1.4   +2.4 to par   "Trending down…"    │ │ BandHistogram              │
│ Ribbon (last round marked, avg dashed)        │ ├────────────────────────────┤
│                                               │ │ When it counts: SegmentBar │
└───────────────────────────────────────────────┘ └────────────────────────────┘
In progress (12, when present)
By month (12): BarCompare, newest month highlighted, season avg dashed
Toolbar (12) · Library Surface (12) with month seam headers carrying score · putts · GIR sparklines
```

## Primitives

`ViewHeader`, `InstrumentPanel` + `Readout`, `Ribbon`, `BandHistogram`, `SegmentBar`, `BarCompare`, `Sparkline`, `InsetGroup` (in progress), `Toolbar`, `Surface` with seam headers, `FairwayRoundRow`, `StatusPill`, `EmptyState`. New primitives: none. The StatMatrix leaves this page (its five figures are the two readouts, the histogram's takeaway (the under-par share) and the SegmentBar takeaway).

## States

- Zero completed rounds: no stage; the existing EmptyState with "New round" and the in-progress group when present.
- One or two scored rounds: readouts only, "Two more rounds and the trend draws"; histogram hidden below three rounds; SegmentBar hidden below two types.
- Trend gate: the verdict says "Six scored rounds unlock the trend" until `stats.trend` is non-null, the same rule the StatMatrix delta used.
- Loading: the route skeleton draws the stage block (readout line + ribbon rectangle), the toolbar line and eight rows in one Surface.
- Coach branch: unchanged (`isCoach` keeps its StatMatrix and player filter; the stage is player-only so the coach page's first object stays the team library).

## Mobile rules

- 44 px: the ribbon's last-round readout is a link row (min-h 44); rows and toolbar controls unchanged.
- Haptics: `selection` on the type filter and month menu (existing behavior).
- Context preservation: search, type filter and grouping live in component state and survive the month Sheet or Menu.
- Reduced motion: Ribbon and SegmentBar snap; nothing else animates.
- Hydration: all dates go through the UTC-pinned date-only helpers already in the file; the in-progress relative time keeps its mounted clock; no `useMediaQuery`, phone and md+ are CSS-gated.
- Perf: Ribbon and BarCompare dynamic-import with `ssr:false`; the histogram and segment bar are plain SVG and render on the server. No framer `layout` on the list.

## Implementation plan

1. `FairwayRoundsLibrary.tsx` (player branch): add `roundsStage` (InstrumentPanel + two Readouts + verdict + Ribbon) fed by a `scoreSeries` memo (normalized, chronological, with the last round's id, course and date); replace the StatMatrix for `!isCoach`.
2. New page-local part file `rounds-instruments.tsx`: `ScoreBandHistogram(rounds, underParPct)`, `RoundTypeSegment(rounds)` (counts and averages by type), `MonthBarCompare(monthGroups, seasonAvg)`. Pure helpers exported for tests (band assignment, type averages).
3. Month seam headers at md+: add putts and GIR sparklines behind the same six-round gate, phone unchanged.
4. Tests: keep the pins in `FairwayRoundsLibrary.test.tsx` (group sparkline, "Filter rounds by player" aria-label, the in-progress heading and count). Add unit tests for band assignment (a +3 lands in "+1 to +3"), type averages ignore null scores, and the stage marks the newest scored round.
5. Skeleton: `rounds/loading.tsx` player branch draws the stage block.
6. Optional, owner's call: a hole strip on this page needs the route to select per-round `golf_hole_scores` (18 rows per round) or a per-round summary (birdies, pars, bogeys, worse). Not in this pass.
7. Capture at 390 and md+, run the rounds suites and tsc, record in AUDIT and `memory/features` for the rounds library.

## RESULT (capture, this branch, player, 390 and 1440)

Built on the coach rounds rewrite (rounds-library.v2.md, 0a1bede1f); the coach branch is byte-for-byte untouched apart from the role fork.

1. Stage: `RoundsStage` in the new `pages/rounds/rounds-instruments.tsx`. Avg score (`Readout` lg, delta = newest five minus the five before, signed, caption "last 5 vs prior 5", shown only when `stats.trend` is non-null) beside To par; the verdict ("Trending down 7.4 over your last five rounds." / "Trending up …" / "Holding around 74.4." / "One|Two more round(s) and the line draws." / "Six scored rounds unlock the trend."); the Ribbon over every scored round (18-hole normalized, x = the round's date, own average dashed, `minPoints` 3, `markLast`, readout below) whose label is the link "Last (+1) · QA Test Course · Aug 31 ›" (`min-h-[44px]`, negative block margin so the panel keeps its height).
2. Deviation, verdict number: the spec paired `stats.trend` with `seriesDelta` (last minus first). The server classifies the trend from the newest five rounds against the five before, so a last-minus-first number can carry the opposite sign from the word. The verdict and the readout delta now use that same split (`recentShift`); the Ribbon's own readout still shows last minus first ("▲ −3 vs May 18"), labelled as such.
3. Deviation, masthead: the verdict H1 the coach rewrite added stays coach-only; the player masthead keeps "Your rounds." and the meta line so the verdict is said once, in the stage.
4. Deviation, stage frame: a seam section (Eyebrow "Scoring", no bezel) with the Ribbon's own depth-base panel, at both widths; not one InstrumentPanel raised at `md`, the same call as the home and development stages.
5. Where your scores land: `ScoreBandHistogram`, five bands from `score_to_par` with honest zero bands, caption "Under par in 30% of rounds." from `stats.underParPct`, hidden below three rounds with a to-par. No `unit` suffix (it wrapped inside the primitive's fixed caption slot at 390).
6. When it counts: `RoundTypeSegment`, one SegmentBar of counts by type (accent on tournament, accent-300 qualifier, warm neutrals for practice and Other), the most-played type as its readout, the averages by type as the section caption and the aria takeaway ("Tournament avg 75.7 · Practice avg 71.2 · Qualifier avg 74.0"), hidden below two types.
7. Deviation, by month: `MonthDeviationBars` (the shared `DivergingBars`, month average minus season average, months with two or more scored rounds, oldest first) instead of `BarCompare`. BarCompare's number axis starts at zero, so 72 against 78 reads as equal bars; the signed deviation is the honest form and, being plain markup, is CSS-gated `hidden md:flex` with no dynamic import and no media query.
8. Seam headers from `md` (player only): Score · Putts · GIR sparklines with captions (`SeamSpark`), each behind the same six-to-twenty gate over the rounds that logged that column; phone keeps the bare score sparkline. `monthSummary` gained `puttsSpark`/`girSpark`.
9. Order at 390: ViewHeader → stage → In progress → histogram → segment bar → toolbar → ledger, and at `md`: stage (7) beside histogram + segment bar (5), In progress full width, By month, toolbar, ledger. One grid with `order-*` classes, `grid-cols-1` on phone (the first capture overflowed the viewport by 78 px because the implicit column was `auto`).
10. Skeleton: `rounds/loading.tsx` draws one stage block (two readout shells, a verdict line, a 200 px rectangle) in place of the five-tile StatStrip; the route cannot know the role, and both roles now open with big numbers over a plotted instrument.
11. Tests: `rounds-instruments.test.tsx` (band assignment, type summary and averages, month deviations, `recentShift`, verdict copy, the stage link, the two gates) and two role-fork cases in `FairwayRoundsLibrary.test.tsx`; the pinned in-progress, single-Surface, pagination, date-only and MicroBar suites pass unchanged (88 tests in `pages/rounds`).
12. Not done: the hole strip (needs `golf_hole_scores` on the route, step 6); haptics on the type pills and month menu are whatever the primitives already do (unchanged).
