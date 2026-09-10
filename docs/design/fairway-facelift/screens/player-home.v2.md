<!-- markdownlint-disable MD013 -->
# Player home v2 — `/golf/dashboard` (player) · 390 and md+

Spec only. Supersedes the composition half of `player-home.mobile.md` (its container fixes stay landed; this is the next bar). Files: `src/components/fairway/pages/dashboard/FairwayPlayerDashboard.tsx`, `player-dashboard-parts.tsx`. Read-only: `DayScheduleSwipe`, `NotificationsLatestModule`, the legacy `HubInsightSignalCard` and `PlayerFocusAreas` (CoachHelm lane). The player's CoachHelm home (`PlayerHomeBento` at `/coachhelm`) is a sibling, not this screen: nothing here repeats its top insight or its bento.

## The first question

"Am I getting better, and what is on today?" Two halves of one question. The current page answers "what is on today" first (schedule) and "am I getting better" only as a number grid plus a chart 3,000 px down. v2 answers both above the fold: a stage that shows the score line with the last round marked and the delta in words, and the day's schedule directly under it.

## Data the component already receives

- `data.stats`: roundsPlayed, scoringAverage, bestRound, handicap, recentTrend.
- `data.recentRounds[]` (newest first): id, course_name, total_score, total_to_par, round_date. This is the score trajectory series (the page already builds `trendPoints` from it).
- `enhancedData.sparklines.{scoringAvg,girPct,puttsPerRound,handicap}`: value, last five values oldest to newest, trend word.
- `enhancedData.secondaryStats`: firPct, scramblingPct, birdiesPerRound, bestRound.
- `enhancedData.strokesGained`: sg_total, sg_off_tee, sg_approach, sg_around_green, sg_putting (per-facet, signed strokes vs the field average).
- `enhancedData.scoringTrend[]`: label, value (the payload's own longer scoring series; unused by the page today).
- `enhancedData.todayEvents[]`, `upcomingEvents[]`: id, title, event_type, start_time, end_time, location, rsvp counts, my_status.
- `enhancedData.actionItems[]`: type task | announcement | deadline, title, date, overdue.
- `hubData.topInsight`, `hubData.tasks`, `hubData.events` (RSVP invites), `hubData.announcements`.
- `greeting`, `data.team`, `data.player`.

Not received: hole-by-hole scores, team or PGA reference values for the eight KPIs, standing percentiles. Instruments that need those are out of scope here (they live on My Standing and Stats). No new fetches.

## Stage

One `InstrumentPanel` (tone neutral; depth raised at md+, depth base with no bezel on the phone canvas) directly under the ViewHeader, above the schedule. It is the only strong region on the screen.

- Readout: the scoring average as the big mono figure (`Readout` size lg, `delta` from `computeSeriesTrend(sparklines.scoringAvg.sparkline, down)`, "last 5 rounds"), label "Scoring avg".
- Verdict sentence, derived from the same `SeriesTrend` the readout uses (one call, one series): "Down 1.8 over your last five rounds." / "Up 0.9 over your last five rounds." / "Holding around 74.4." Copy from `deriveHeroSignal` folds in here; the glass `InsightCard` hero is retired (its two sentences were the only body copy on a glass surface, BRIEF §6 rule 5).
- Instrument 1, score trajectory (below): the `Ribbon` over `recentRounds` reversed to oldest first (fallback to `scoringTrend` when it is longer), with the LAST round marked: the ribbon's end dot plus a corner readout "Last: 71 at Pine Valley, Aug 31". `benchmark` = scoringAverage as the dashed line, so the last round reads above or below the player's own average. `minPoints` 3; below that the panel shows the readout only and an honest "Two more rounds and the trend draws" line, never a fake flat ribbon.
- Primary action: "New round" stays in the ViewHeader (the one primary for the screen). The stage carries no button.

## Instruments (three real visuals from the data above)

1. Score trajectory: `Ribbon` (stage, above). Series = `recentRounds` scores oldest to newest; marker = last point; benchmark = the player's scoring average; readout labels = last score and course. Reduced motion snaps the draw-on.
2. Strokes-gained facets: `StrokesGainedTornado` with four rows (Off the tee, Approach, Around the green, Putting) from `strokesGained`, x = 0 is the field average the SG vector is already computed against. Replaces the `GenomeFingerprintTeaser` radar (a single-series radar shows a shape; the question here is "which facet leaks", which is a diverging bar). Needs three of four facets finite; otherwise ChartFrame's insufficient-data state with the same copy the teaser uses today. Title "Where your strokes go", takeaway from the existing `best`/`worst` derivation ("Gaining most on approach, leaking on the greens"). Footer link "My Standing" for the team and PGA comparison (that data is not on this page).
3. Form strip: `StatMatrix` (matte, 2×2 on phone, 4 across at md+) of Scoring avg · GIR · Putts / round · Handicap, each with the toned "+1.8 · last 5 rounds" hint that exists today. Under it a second matte row FIR · Scrambling · Birdies / round · Best round with no hints. This replaces the eight MetricCards at every width (the md+ MetricCard grid goes; the phone StatMatrix from the mobile pass becomes the only branch). Each cell keeps `Sparkline` of its five values at md+ only (width 56) so the strip is a visual, not a table, where there is room.
4. Today, as a timeline: `DayScheduleSwipe` stays the schedule instrument (its own wave). The Today card's task/deadline rows come from `actionItems` and `hubData.tasks` as seam rows under the schedule, not a separate card.

Recent rounds become a `TickerStrip` of the last ten `recentRounds` (bar height = score to par, the best round emphasised) over the existing five seam rows; tapping a bar opens the round. That is a fourth visual built from data already here, kept small.

## Composition at 390

```text
ViewHeader (plinth)   Good morning, Cole. · Your game at a glance.   [+ New round]
Stage (bare, canvas)  74.4  ▼1.8 last 5        "Down 1.8 over your last five rounds."
                      ╭────────── Ribbon, last round dotted, avg dashed ──────────╮
                      ╰ Last: 71 · Pine Valley · Aug 31 ───────────────────────────╯
Schedule              DayScheduleSwipe (unchanged)
                      ── seam ── task rows from actionItems (max 3) · Full calendar
Form (StatMatrix)     74.4 avg  · 58% GIR        (2×2, hints)
                      31.2 putts · 4.1 hcp
                      ── seam ── FIR 61% · Scr 44% · Bird 1.2 · Best 68 (2×2, quiet)
Where your strokes go StrokesGainedTornado (4 rows)          My Standing →
Recent rounds         TickerStrip (10 bars) · 5 seam rows · View all →
Latest                NotificationsLatestModule (rows)
Focus areas           PlayerFocusAreas (legacy, unchanged) · My development →
CoachHelm signal      HubInsightSignalCard (legacy, unchanged)
```

Seams (hairlines with eyebrow headings) between regions; the only bordered surfaces are the stage panel at md+ and ChartFrame's own frames. No card inside a card anywhere.

## Composition at md+ (12 col)

```text
ViewHeader ────────────────────────────────────────────────── [+ New round]
┌ Stage (7) InstrumentPanel raised ─────────────┐ ┌ Today (5) ───────────┐
│ 74.4 ▼1.8   "Down 1.8 over your last five…"   │ │ DayScheduleSwipe     │
│ Ribbon (last round marked, avg dashed)        │ │ ── task rows ──      │
└───────────────────────────────────────────────┘ └──────────────────────┘
StatMatrix (12) 4 across, sparklines in cells  ·  second quiet row 4 across
┌ Where your strokes go (6) Tornado ────────────┐ ┌ Recent rounds (6) ───┐
│                                               │ │ TickerStrip · rows   │
└───────────────────────────────────────────────┘ └──────────────────────┘
Latest (6) · Focus areas (6)      CoachHelm signal (12, legacy)
```

Asymmetry 7/5 then 6/6. The stage is the one raised region.

## Primitives

`ViewHeader`, `InstrumentPanel` + `Readout` (`@/components/fairway/instrument`), `Ribbon`, `StrokesGainedTornado`, `StatMatrix`, `Sparkline`, `TickerStrip` (`modules`), `DayScheduleSwipe`, `InsetGroup` (task rows, standing link on phone), `NotificationsLatestModule`, `EmptyState`, `InlineNotice`, `Skeleton`. New primitives: none. `computeSeriesTrend` is the one trend reducer for the readout, the verdict and the cell hints.

## States

- Zero rounds: the stage becomes the existing "Log your first round" empty copy with the same primary; no ribbon, no tornado, StatMatrix cells muted with "—". Schedule and Latest unchanged.
- One or two rounds: readout only, "Two more rounds and the trend draws"; tornado hidden until three facets are finite.
- Loading: the shared `FairwayDashboardSkeleton` gains a stage-shaped block (readout line + ribbon rectangle) in place of the hero card block; the masthead geometry must stay identical to the coach skeleton.
- Error in `enhancedData`: stage readout from `data.stats` only, ribbon from `recentRounds` only; tornado shows ChartFrame's error state.

## Mobile rules

- 44 px: TickerStrip bars are links with a 44 px hit area (row height), StatMatrix cells static, task rows are `InsetGroup.Row` links.
- Haptics: none (no selects on this screen).
- Reduced motion: Ribbon and Tornado snap (their own contract); nothing else animates.
- Hydration: greeting stays server-resolved; ribbon labels use the UTC-pinned date formatter already in `trendPoints`; no `Date.now()`. Phone vs md+ differences are CSS-gated (`md:hidden` / `hidden md:block`), one DOM.
- Perf: Ribbon and Tornado are dynamic imports with `ssr:false` like today's TrendChart, so recharts and visx stay out of first paint; the stage readout and verdict are server-rendered text.

## Implementation plan

1. `player-dashboard-parts.tsx`: add `PlayerStage` (InstrumentPanel + Readout + verdict + Ribbon, props: scoringSeries, recentRounds, scoringAverage, trend) and `RecentRoundsTicker` (TickerStrip over recentRounds). Move `deriveHeroSignal`'s copy into the verdict helper; delete the `InsightCard` hero and `HeroSignal`.
2. `FairwayPlayerDashboard.tsx`: render the stage under the header; replace the md+ MetricCard grid with the StatMatrix (both rows) and delete the phone-only duplicate; replace `GenomeFingerprintTeaser` with a `StrokesGainedTornado` part (`SgFacetsPanel`); move the Today task rows under the schedule; keep PlayerFocusAreas, NotificationsLatestModule and HubInsightSignalCard as they are.
3. Tests: `FairwayPlayerDashboard.scoring-trend-heading.test.tsx` pins one "Scoring trend" heading; the Ribbon panel takes that title so the pin holds. `player-dashboard-parts.test.tsx` pins TodayCard's "Full calendar" link, kept on the task-row footer. Add a test that the stage renders the last round's course and score and that the readout delta and the verdict come from one series.
4. Skeleton: `FairwayDashboardSkeleton` stage block (peer keep-out file; hand the geometry to the peer).
5. Capture at phone and md+, run the dashboard suites and tsc, record in AUDIT (the retired glass hero and the eight MetricCards go in the dead-code table).
