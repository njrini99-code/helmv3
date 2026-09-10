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
