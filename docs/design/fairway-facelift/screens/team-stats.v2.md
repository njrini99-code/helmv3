# Team stats (coach), /golf/dashboard/stats/team v2 spec

<!-- Synthesized by the facelift design panel (three concepts, one judge) on 2026-09-10. -->

# Team Stats (coach), final spec

Route: `/golf/dashboard/stats/team` (the coach-facing Team Stats screen; bare `/golf/dashboard/stats` is the player route and renders `FeatureUnavailable` for a coach). Component: `TeamStatsBoard`. Archetype: B (board) with a C analytical instrument, per `docs/design/fairway-facelift/screens/team-stats.md`.

## Purpose

One page that answers, in this order: how is the team doing against Tour right now, who on the roster needs attention today, and exactly what kind of shot and what kind of hole is costing the team strokes. It is read cold at a desk on a 1440 laptop in the afternoon, and rescanned on a phone at the range. Nothing here is a marketing hero; every region is an instrument a coach reads and moves on from.

## First question

"How is the team doing against Tour right now, and where exactly is it leaking strokes?"

## What ships this week, in one sentence

Five regions, five different visual shapes, one green accent moment, zero new primitives. The masthead gains a data built verdict sentence, the KPI band goes borderless, the roster board keeps its one bordered bezel but gets a real side stripe fix and a richer expand band, the analysis area becomes one accent instrument cluster that now also answers "which kind of hole" (not just "which kind of shot"), and the two leak charts become a hairline diptych instead of bento cells.

## Named hierarchy

Stage (verdict sentence) then Toolbar (ledger) then the dominant object (roster board) then the one Instrument (strokes gained cockpit) then a quiet coda (leak diptych). Every region after the stage is a different container shape on purpose: prose, then borderless seams, then a bordered bezel, then a green accent panel, then a hairline split. That variety is the direct answer to "where is the architecture, where are the visuals."

---

## Region 1, Verdict Stage

**Role:** stage. **Purpose:** replace the generic subtitle with the one sentence a coach actually needs before scrolling.

**Visual:** `ViewHeader` is unchanged (title "Team Stats", existing description, existing freshness `meta` line, existing primary/secondary actions). Immediately below it, a new paragraph in `font-fw-display`, roughly `text-h3` size, semibold, capped at about 54 characters wide so it reads as a pull quote, not a header. The one figure in the sentence is a nested `font-fw-sans tabular-nums font-semibold` span, colored `text-fw-warning-ink` when the sentence names a leak and `text-accent-700` when it names a lead, matching the app's existing green good / amber caution convention rather than making every number green regardless of meaning.

**Three states, not two** (this is the fix for a real gap in the concept this spec is built on):
1. A category is negative: "Putting is the leak. −3.2 strokes below Tour, every round." (worst category by value)
2. No category is negative but at least one exists: "Putting leads the way. +0.8 strokes clear of Tour, every round." (best category by value)
3. No SG data exists at all (`hasSg` false, e.g. a cold roster): reuse the exact cold-start sentence the tornado chart already shows today, "Strokes gained appears once players log rounds with shot-level tracking. Add players to your roster and have them enter rounds shot by shot." so the same honest copy is not authored twice.

**Data mapping:**
- `sgData: SGCategory[]`, existing `useMemo` in `TeamStatsBoard.tsx:276-288`, built from `standingByPlayer.get(p.id)?.get(sg_metric)?.player_value` via `weightedMean`. Unchanged.
- `fmtSg`, existing export from `buildTeamBoardViewModel.ts`. Unchanged.
- New pure function `verdictSentence(sgData, hasSg)` added inline in `TeamStatsBoard.tsx` (same file, same convention as the existing `sgTakeaway` block just above it): finds both the worst and the best category instead of only the worst, and returns one of the three states above.

**Important removal:** the cockpit's own `StrokesGainedTornado` (Region 4) stops passing a `takeaway` prop. Today `sgTakeaway` only ever states the worst category, and once the stage sentence states it first, passing it again to the chart underneath is the exact "SG: Total hero repeats the header SG cell" duplication `REVIEW.md` already killed twice on this screen. The chart still shows its own bars and values; it just stops repeating the sentence.

**Desktop:** full width row inside the existing `max-w-[1536px]` container, sentence capped `max-w-[54ch]`.
**Phone:** `ViewHeader` collapses per its own contract; sentence steps to a smaller size, wraps two to three lines, full width minus the page gutter.

---

## Region 2, Instrument Ledger

**Role:** toolbar. **Purpose:** the persistent team scoreboard strip, unchanged in content, lighter in container.

**Visual:** the exact same `StatMatrix` with the exact same 4 items (Team scoring, Team SG, Trajectory, Rounds · 30d) that exist today at `TeamStatsBoard.tsx:379-397`, with one change: `variant="plain"` instead of the default `inset` sunken well, so the band reads as seams on cream rather than a slab, contrasting with the bordered board directly beneath it. Sticky behavior, offset, and border-b treatment are unchanged (`TeamStatsBoard.tsx:470`).

**Do not add a fifth cell.** An earlier draft of this idea added a "Leak" cell naming the same worst category the stage sentence already states. That is the identical duplication class the stage sentence itself removes from the tornado, and it would also break the clean 2x2 phone reflow `StatMatrix` already gives 4 items. Keep exactly 4.

**Data mapping:** `vm.kpis.teamScoring` / `teamSg` / `trajectory` / `rounds30d` from `buildTeamBoardViewModel.ts` (unchanged), `TeamSgKpi` and `TrajectoryKpi` render helpers unchanged (they already use `font-fw-sans tabular-nums`, not mono; do not revert this).

**Desktop:** sticky at `min-[940px]:top-…`, 4 columns, unchanged.
**Phone:** `StatMatrix`'s own 2x2 grid, not sticky. Unchanged.

---

## Region 3, Roster Board (the dominant object)

**Role:** the board every other region orbits. **Purpose:** who needs attention today, at a glance, unchanged in substance, fixed in two real defects and richer in the one disclosure it already has.

**Visual:** `MatrixBoard` exactly as today (`TeamStatsBoard.tsx:333-486`): identity + rounds/avg, four `RankCell`s, a scoring `RankCell`, a leading composite number beside `Meter size="sm"`, a `Sparkline`, a `SignalChip`. This stays the one deliberately bordered, rounded, shadowed card on the page (`MatrixBoard.tsx`'s own `rounded-card border … bg-surface`), which is exactly why it should stay bordered: against a prose stage, a borderless ledger, a green accent panel, and a hairline diptych, this one bezel is legible as "the roster," not as "another card in a stack."

**Fix 1, real defect, not a nice-to-have:** `MatrixBoard.tsx` currently paints a 3px inset accent stripe on a selected/expanded row (`shadow-[inset_3px_0_0_var(--fw-color-accent-500)]`, line ~245) and on the expand band itself (`shadow-[inset_3px_0_0_var(--fw-color-accent-300)]`, line ~290). That is a side-stripe border, on the hard ban list verbatim. Drop both shadow classes; keep the flat `bg-accent-50` wash and the sunken `bg-surface-sunken` background on the expand band, both of which already carry enough signal on their own. This is a primitive-level fix, so it also changes the selected/expanded row look on Roster and CoachHelm players boards, which reuse the same component. Flag that to the reviewer; it is the correct scope for the fix, not an accident.

**Fix 2, real defect:** `buildTeamBoardViewModel.ts` bakes a literal triangle glyph into a signal label, `'▲ Most improved'` (line ~398). `SignalChip`'s tone color already carries "this is a hot signal"; the glyph is redundant text-as-decoration. Change the string to plain `'Most improved'`.

**Fix 3, real defect (phone):** `MatrixBoard`'s `HIDE_ON_MOBILE` set hides the `signal` column below 940px, and today's `ExpandBand` never renders `row.signal` either, so a coach on a phone currently cannot see Hot / Watch / Quiet for any player at all. Render `row.signal` as a small `SignalChip` inline under the player's name in the identity cell (visible at every width), so the phone board keeps the one triage signal that matters most, without waiting for the row to expand.

**Enrichment (this is the one substantive content upgrade to the board, additive only):** `ExpandBand` currently shows Fairways / GIR / Scrambling / Putts / Birdies as flat percentages with no benchmark, plus a worst-metric callout, SG Putt, last round, and the three triage links. Add, above that unchanged block and inside the same sunken well, four `StandingBars` rows (`frame="bare"`, `size="sm"`) for Off the Tee / Approach / Around the Green / Putting, the exact four categories the board's own rank columns already rank. A coach who taps a row to ask "why is this player ranked 6th in Approach" currently gets nothing about Approach specifically; this answers it with the real You / Team / Tour bars instead of a bare rank number.

**Data mapping for the enrichment (all already fetched, no new query):**
- `standingByPlayer`, already a `TeamStatsBoard` prop, already in scope where rows are built (`TeamStatsBoard.tsx:174`). Thread the one player's map directly into `ExpandBand` at composition time: `expand: <ExpandBand row={row} standing={standingByPlayer.get(row.id)} isWomens={isWomens} />`. This does **not** touch `TeamBoardRowViewModel`'s exported shape, so `buildTeamBoardViewModel.test.ts`, which constructs that shape directly, needs no changes.
- `SG_CATEGORY_BARS`, already exists in `TeamStatsBoard.tsx:106-111` (the same tee/approach/short/putt metric ids and labels used for the board's own rank columns and the cockpit's tornado). Reuse it to build the four `StandingBars` rows.
- `getMetricRenderConfig(metric)` from `@/lib/coachhelm/v3/standing/metric-config`, already imported and used this way in `buildTeamBoardViewModel.ts`; add the same import to `TeamStatsBoard.tsx` to supply `direction`, `unit`, and `scale` (`default_scale`) per metric.
- Per category: `StandingBars` props come straight off the `PlayerStanding` row (`player_value`, `team_avg`, `pga_value`, `pga_omitted`, `team_pct`, `team_n`) plus `is_womens` (the existing page-level `isWomens` flag). When a player has no standing row for that metric, pass `state="empty"` instead of guessing.

**Desktop:** unchanged, full-width bordered board, Composite/Trend/Signal columns visible at 940px and up.
**Phone:** existing column collapse, plus the inline `SignalChip` fix above; tap still opens the same inline expand band, now with the four `StandingBars` rows on top.

---

## Region 4, Strokes Gained Cockpit (the one accent instrument)

**Role:** section, the one green moment on the page. **Purpose:** a real instrument, not a chart in a card, that answers "what kind of shot, and what kind of hole, is costing us strokes."

**Visual:** `InstrumentCluster balance="focal"`.

*Primary (the dominant ~66% column):* one `InstrumentPanel tone="accent" depth="raised"` (the registry's own words: "a rich instrument moment: effectiveness, strokes gained," used on this route for the first time; confirm nothing else on the page also carries `tone="accent"`, since the registry's `avoidFor` is "more than one per screen" and this is the only one). Bezel: `eyebrow="Strokes Gained"`, `header="Team vs Tour"`, `readout` slot holding a small `Readout` (`display={fmtSg(value)}`, `unit="sg/rd"`, `label` = the same worst-or-best category name the stage sentence used, so the panel's own corner readout echoes the headline rather than introducing a third figure). Body: the existing `StrokesGainedTornado` for the four SG categories (no `takeaway` prop, per Region 1), then a hairline divider, then a compact eyebrow "By hole type" and a **second** `StrokesGainedTornado` for Par 3 / Par 4 / Par 5, both charts sharing one accent bezel rather than needing a second panel.

*Secondary (the ~33% flanking rail):* one `InstrumentPanel depth="inset"` holding the existing `RailBars` for Fairways / GIR / Scrambling, with the GIR row now drawing a real Tour reference tick (`tickPct`, which `RailBars` already supports) since `gir_pct` is a real registry metric with a `pga_value`, unlike Fairways and Scrambling which have none. This is the one row in the rail that gets a benchmark it did not have before; the other two stay plain rails, honestly.

*Tertiary (the foot row):* two `InstrumentPanel depth="inset"` cells (the pattern this primitive already uses elsewhere, e.g. `EffectivenessScoreboard.tsx`), each holding a small `Readout`: Putts / 18 and Birdies / 18. Not "Score avg," which would repeat the ledger's Team scoring cell verbatim, the same duplication class fixed twice already on this screen.

**The new "by hole type" chart, made honest (this is the one piece of new arithmetic in the whole spec, and it must be done exactly this way):**
- `scoring_par_3` / `scoring_par_4` / `scoring_par_5` are real registry metrics (`METRIC_IDS`, `metric-config.ts:84-86`), `direction: 'lower_better'`, and `standingByPlayer` already carries every metric for every player (`loadPlayersStandingMap` is called with no metric filter in `page.tsx:473`), so there is no new fetch.
- Do **not** pass the raw team average score (e.g. "4.3") as the chart's signed value; a tornado draws bars from zero, and a raw strokes-to-par number at zero is meaningless, not merely unlabeled. Use the SAME signed-vs-Tour convention the SG categories already use: `weightedMean` (roster-weighted by `roundsPlayed`) over each player's `standingByPlayer.get(id)?.get(metric)?.pga_delta` (already `player_value - pga_value`, present on every `PlayerStanding` row), then flip the sign once (`* -1`) because the metric is `lower_better` and the SG convention is "positive = gained." This mirrors `worstLeakTakeaway`'s existing `direction === 'higher_better' ? raw : -raw` pattern one line away.
- Gender honesty: if **any** player's standing row for `scoring_par_3`, `_4`, or `_5` carries `pga_omitted` (a women's roster with no credible par-type anchor, per `standing/types.ts:37-41`), do not draw the chart at all. Render it as `state="insufficient-data"` with its own message ("Par-type benchmarks aren't available for this roster yet."), the same honest-degrade pattern the leak maps already use two sections down, rather than mixing an omitted and a non-omitted player in one chart.
- New pure logic (`parTypeData`, `parTypeOmitted`, `parTypeTakeaway`) lives inline in `TeamStatsBoard.tsx` next to the existing `sgData`/`sgTakeaway` block, same file, same convention, no new export needed.
- `StrokesGainedTornado` is generically typed (`data: SGCategory[]`, just `{label, value}`); this is a second call to the SAME existing chart component with different data and a shorter axis, not a new primitive.

**No team-level scoring trend chart.** `TeamPlayerStats` only carries per-player `recent_scores`; no team-wide per-round-date series exists server-side today, and building one means new aggregation and gating logic in `page.tsx`, which is the one genuinely new-data idea across all three concepts reviewed for this screen. The trajectory tally already in the ledger (improving / steady / declining counts) is the one honest team-level trend figure available this week; leaving the chart out is a decision, not an oversight.

**Desktop:** `InstrumentCluster`'s own `2fr:1fr` grid, primary about 66%, rail about 33%, tertiary spans full width beneath both.
**Phone:** `InstrumentCluster`'s own stacking, primary first, rail second, tertiary staying in its existing grouped 2-up ledger (never two full-width monolith cards).

---

## Region 5, Leak Diptych

**Role:** section, quiet coda. **Purpose:** where the putting and approach strokes actually live, by distance, unchanged data, lighter container.

**Visual:** one eyebrow, "Where the strokes leak," over the two existing `LeakMap` charts (Putts Made by Distance, Approach Proximity by Distance), each already stripped of `ChartFrame` chrome (`border-0 bg-transparent p-0`, already true in the current code) and now separated by one hairline divider instead of sitting in `BentoCell`s.

**Correction to the rationale, so the reviewer cannot disprove it in one file read:** default `Bento` is not a set of nested or identical cards. It is one bordered container with `gap-px` seams, exactly the "one surface with internal dividers" the primitive's own docblock describes, and it does not violate the nested-card or identical-card-grid bans as written. The reason to drop it here is narrower and more honest: every cell in it renders through the same `BentoCell` grammar (eyebrow, then a chart, repeated four times), so the page's fourth and fifth regions would otherwise look like the same instrument twice. Moving the two leak charts into a plain hairline split, after the tornado/RailBars pair has already moved into the accent cockpit above, is what gives the page five different container shapes instead of four Bento cells plus one card.

**Data mapping:** `puttBuckets` / `approachBuckets` / `puttTakeaway` / `approachTakeaway` / `leakRoundsIncluded`, all from the existing `leakMaps` prop (`TeamStatsBoard.tsx:324-331`). Unchanged.

**Desktop:** two columns, one vertical hairline (`border-l`/`divide-x` on `border-border-subtle`) between them.
**Phone:** stacked, one horizontal hairline between them, no card wrapper at any width.

---

## Desktop grid (1440, container `max-w-[1536px]` unchanged)

```
ViewHeader (title, description, freshness, actions)
Verdict sentence (prose, capped ~54ch)
[InlineNotice on partial load failure, unchanged]
────────────────────────────────────────────────────────
Instrument Ledger, StatMatrix variant="plain", 4 cols, sticky
────────────────────────────────────────────────────────
Roster Board, MatrixBoard, full width, bordered bezel (the one card)
────────────────────────────────────────────────────────
Strokes Gained Cockpit, InstrumentCluster, focal
┌ InstrumentPanel tone="accent" (≈66%) ─────┬ rail (≈33%) ┐
│ Readout · SG-by-category tornado          │ Fundamentals │
│ ── hairline ──                            │ RailBars     │
│ By hole type tornado (Par 3/4/5)          │ (inset)      │
└────────────────────────────────────────────┴─────────────┘
[ Putts / 18 ] [ Birdies / 18 ]  ← tertiary, full width
────────────────────────────────────────────────────────
Leak Diptych, two LeakMap charts, one vertical hairline
```

## Phone flow (390)

1. `ViewHeader` collapses per its own contract.
2. Verdict sentence, smaller size, wraps 2-3 lines.
3. `StatMatrix` 2x2, not sticky.
4. Roster board: identity (now carrying an inline `SignalChip`) + 4 rank cells; tap opens the inline expand band with 4 `StandingBars` rows on top of the existing 8-stat grid and links.
5. Cockpit: primary panel (Readout + both tornados) full width, then the Fundamentals rail panel full width, then the Putts/Birdies tertiary pair as one grouped 2-up ledger.
6. Leak diptych: stacked, one horizontal hairline between the two charts.

No sheets, no drawers, no new mobile surface. Everything reachable by one linear scroll, which is what a coach scanning a roster on a phone actually wants; nothing here is gated behind a tap the way a full workspace/inspector rebuild would gate the team-wide analysis behind a selection.

---

## Primitives

**Existing, reused exactly as documented in the registry, zero new primitives:** `ViewHeader`, `Button`, `IconButton`, `Menu`, `InlineNotice`, `StatMatrix` (`variant="plain"`), `MatrixBoard`, `RankCell`, `Meter`, `Sparkline`, `SignalChip`, `StandingBars` (`frame="bare"`), `InstrumentCluster`, `InstrumentPanel` (`tone="accent"`, `depth="raised"`/`"inset"`), `Readout`, `StrokesGainedTornado` (called twice, generically typed, not SG-specific), `RailBars`, `LeakMap`, `InsufficientData`.

**New primitives:** none. This is inside the "at most two new" budget with room to spare.

## Removals

1. The Bento block (`TeamStatsBoard.tsx:500-566`): tornado 2x2 + fundamentals 2x1 + two 1x1 leak cells. Folded into the accent cockpit (tornados + RailBars) and the hairline diptych (the two leak charts). Not removed because it violates a ban (it does not); removed because it repeats one container grammar four times.
2. The header pills into the primary action + overflow Menu. Already done in the current code; unchanged here.
3. The floating "SG: Total" hero and the "Score avg" duplicate inside the old Fundamentals cell. Already removed / avoided in the current code and this spec's tertiary row respectively.
4. The `StrokesGainedTornado`'s own `takeaway` prop on this screen, now that the stage sentence states the same worst/best category first.
5. `MatrixBoard`'s inset 3px accent-stripe shadow on selected/expanded rows (both the row and the expand band). A real, verified, hard-banned side-stripe pattern; fixed in the primitive.
6. The literal triangle glyph baked into the "Most improved" signal label.

## Implementation plan

**Files to edit:**
- `src/components/golf/stats/team-board/TeamStatsBoard.tsx`, the main rewrite: verdict sentence + its three-state logic, `StatMatrix variant="plain"`, drop the Bento import/usage in favor of the `InstrumentCluster` cockpit and the hairline diptych, new `parTypeData`/`parTypeOmitted`/`parTypeTakeaway` `useMemo`s beside the existing `sgData`, thread `standingByPlayer.get(row.id)` and `isWomens` into `ExpandBand`, add the `getMetricRenderConfig` import, extend `ExpandBand` with the four `StandingBars` rows and the identity-cell `SignalChip`.
- `src/components/golf/stats/team-board/buildTeamBoardViewModel.ts`, one-line fix: drop the triangle glyph from the "Most improved" signal label. Nothing else in this file changes; the exported `TeamBoardRowViewModel` shape is untouched.
- `src/components/fairway/modules/MatrixBoard.tsx`, drop the two inset accent-stripe shadow classes (selected/expanded row, and the expand band). Shared primitive; also changes Roster and CoachHelm players boards' selected-row look, on purpose, per the hard ban.

**Files to create:** none.

**Data plumbing:** none new. Every field used above already reaches `TeamStatsBoard` as a prop today: `standingByPlayer` (covers every `MetricId` for every player, including `gir_pct` and `scoring_par_3/4/5`, per `page.tsx:473`), `players` (`TeamPlayerStats`, including `recent_scores` already oldest to newest), `leakMaps`, `freshness`. No new Supabase query, no new server action.

**Tests:**
- `TeamStatsBoard.freshness.test.tsx`, verified against the exact assertions in the file today (relative freshness line, the "trend signals begin after 8 completed rounds" sentence, the Ask CoachHelm menu navigation, the Freshness details toast). None of those assertions touch the Bento region, the cockpit, or the diptych, so this file needs **no changes** for this spec as written.
- `buildTeamBoardViewModel.test.ts`, verified it does not assert on the triangle glyph string anywhere, and this spec does not touch the exported view-model shape, so this file needs **no changes** either.
- New coverage worth adding, not required to ship: a small test for the new `verdictSentence` three-state function (leak / lead / cold-start), and a render test that the par-type tornado shows its insufficient-data state when any player's `scoring_par_*` row carries `pga_omitted`.
- No `MatrixBoard`-specific test file exists in this branch today, so the stripe removal carries no direct test churn; sanity-check Roster's and CoachHelm players' own capture screenshots after the change since they share the primitive.

**One process note:** the "after" capture at `ui-intelligence/facelift/captures/coach/stats-team__desktop__full.png` is stale against the current source (it still shows the raw multi-timestamp freshness sentence and monospace KPI faces that `teamStatsFreshness.ts` and `TeamStatsBoard.tsx` already fixed in code). This spec is grounded in the source files, not that capture; recapture after landing this change rather than diffing against the current PNG.
