# Stats v2: gap list against the owner's newest design

Date: 2026-11-07. Branch `agent/ch-stats-v2` (from `agent/ch-consolidate`).
Design: `design-refresh/stats/redesign/clubhouse-stats.html` (newest) against `design-refresh/stats-and-home-phone.html` (earlier).

## What is new in the newest design

Nothing. After the export wrapper (doctype, head, `<body>`) is stripped, the two HTML files are identical
byte for byte, and both equal `design-refresh/stats-home/redesign/stats-and-home-phone.html`, the package the
earlier build (`StatsPlayerPhoneShs`, `StatsTeamPhoneShs`, the `.ch-shs-*` layer) was made from. So the
code map below was mostly built already; this list says what is and is not.

## Owner rules that override the design (from the brief)

1. Player Home is untouched (`screens/home/**`, `PlayerGame.tsx`, `home.css` `.ch-ph-*`). The design's "Your game" row and the Home leg tokens are skipped.
2. The Stats window defaults to This season, with an All time option (`SpanSwitch`, commit cc71f4e2dc). Kept.
3. No change to what a round records, how a figure is computed, or the standard-error rule for colouring a change.
4. Desktop keeps production's bento and drills: shared tokens and card language only, the comparison table with every change toned, and the hover readout with arrow-key stepping.

## Later owner decisions that supersede motion rows

The Nov 6 sweep (`design-refresh/redesign-ui-sweep-2026-11-06/lanes/motion.md`, MOT-01, MOT-02) records the owner bar:
no first-paint motion, motion answers the user's action only, Reduce Motion is the 180 ms opacity fade
(`CH_FADE_MS`), and it names the Stats grow-once rows (07 M-STATS-12 to 15) as superseded. Commit 9db3599267
removed grow-on-scroll on that basis, and `.claude/rules/clubhouse.md` (Q-153) still bans first-paint draw-ins. The
three motion rows marked SUPERSEDED below follow that and are not rebuilt. They are an open question in the report.

## Code map

| # | Design row | Status | Evidence |
|---|---|---|---|
| 1 | `styles/tokens.css`: language tokens (grouped bg, card bg, well, text, gain, loss, flag, separator, ring) | DONE | `tokens.css:669-698`, dark `:983-1001` |
| 1a | Chart additions: `--ch-chart-gain-fill/loss-fill` (#1F6B45/#4FA877, #B86F0C/#E09A35), `--ch-chart-flat`, `--ch-chart-track` | DONE | `tokens.css:678-679`, `:992-993`, fills `:1574-1580` (under `data-ch-refresh=on`, set once on the frame, `shell/ClubhouseFrame.tsx:185`) |
| 1b | Feature-card chart tones (ivory, mint, amber, coral) | DONE | `tokens.css:681-698` |
| 1c | `--ch-type-figure-tile` (28/1, 600, wdth 92) | NOT BUILT, by rule 1 | Read only by Home legs (`.leg-main .v`). Stats glance tiles use the 22 step of the 11-size scale (`stats-redesign.css:516-521`) |
| 1d | Page drops `--ch-light-paper` / `--ch-light-canvas` on phone | DONE | No reference in `stats-redesign.css`; `.ch-shs-sheet` sits on `--ch-grouped-bg` |
| 2 | `ui/Section` + `ui/Surface`: head and caption inside the card on phone | PARTIAL, by design | The phone Stats screens render their own `ShsCard` / `SummaryCard` (title row and meta inside the card, `SummaryCard.tsx:103-148`), so no title or caption floats on the page. `Section.tsx` / `Surface.tsx` are shared with every other screen and are not changed (it would restyle Calendar, Roster and the rest). The section names Overview, Your game, Rounds and Development stay on the page: owner call, 31 Oct, "Keep as drawn" |
| 3 | `.ch-stm` cards (16 px radius, ring, soft shadow, hairline header inset 16) | DONE | `.ch-shs-card` `stats-redesign.css:138-153`; embedded legacy panels re-skinned under `.ch-shs-screen .ch-stm-panel` `:1776-1790` |
| 4 | `StatsPlayerPhone` summary: scoring feature card, What changed, Strokes gained, one card per part, Rounds, Goals, each a link | DONE | `StatsPlayerPhoneShs.tsx:262-318` (ScoringCard, WhatChanged, Glance, SgCard, PartCard x4, RoundsCard, GoalsCard); `WindowSwitch` sticky under the bar `:230-240`, `useStuck` `shs-motion.tsx:11` |
| 5 | Phone detail routes, `?area=` like production | **MISSING, built in this change (DONE now)** | Details are `#gm-*` / `#sd-*` hashes (`detail-route.ts:12-29`); `?area=` is read nowhere in `src/clubhouse` (production's `StatsSpineStage` keys: putting, driving, approach, short-game, scoring, standing, rounds). Added: `areaDetail` (`detail-route.ts`), threaded `routes/stats.tsx -> StatsPlayer / StatsTeam -> useStatsDetail`; hash beats `?area=` beats `?tab=`; the arrival strips `area` from the address; desktop opens the tab and scrolls to the part. Tests: `detail-route.test.ts`, `use-stats-detail.test.tsx`, `stats-summary-cards.test.tsx`, `stats-team-summary.test.tsx`, `stats-redesign-route.test.tsx` |
| 5a | Detail built from `detail.tsx` / `GameDetail.tsx` / `GameMore.tsx`; the window carries over | DONE | `GameAreaDetail` `StatsPlayerPhoneShs.tsx:794-914` (`GameDetail only`, `asDetail`); window kept by `summaryUrl` (`detail-route.ts:73-79`) |
| 6 | `RoundTrend`: area under the five-round average, par rule labelled, right axis at 13 px, plot as scrub target, readout while scrubbing | DONE on the phone feature chart; desktop `RoundTrend` unchanged | `ScoringFeatureChart.tsx` area `:81`, par line `:240`, right axis `:235`, pointer scrub `:123-140` + `:243-282`, readout in the card (`StatsPlayerPhoneShs.tsx:391-412`), par named in the legend `:428-432`. Desktop `RoundTrend.tsx` keeps hover + arrow stepping (`useChartPin`, `:48`, role=group `:95-102`) |
| 7 | `SgBars` capsules: track, 3:1 zero rule, total row 600 under a hairline | DONE | `MiniDiverging`/`SgDetail` rows use `.ch-shs-rail` (999 radius, track), `.ch-shs-zero` `stats-redesign.css:612-640`; range on tap kept (`.ch-shs-whisk`) |
| 8 | `GameDetail` split into per-part summary cards and detail pages | DONE | `PartCard` `StatsPlayerPhoneShs.tsx:612`, `GameDetail only/asDetail` `GameDetail.tsx:354-356`, `:596` |
| 9 | `RoundsExtra` rx-compare: dumbbell per row, each toned with `deltaTone` | DONE | Phone: `AgainstBefore` `ShsBlocks.tsx:119-176` (every row `halvesTone`, SE rule kept). Desktop table: `RoundsExtra.tsx:93-100` tones every row, `:166-185`, `:224-246` |
| 10 | `StatsTeamPhone` / `TeamRank`: summary to detail, oversized total and pale mint ring gone | DONE | `StatsTeamPhoneShs.tsx:193` (Team scoring average), `:281-285` (Strokes gained by leg), `:324-329` (Who gains and loses); `TeamRank phone` `:471` |
| 11 | Zone coins and gradient figures removed from phone Stats | DONE | `RoundsExtra` draws `Zone` only for `zones && !phone` (`:101`); phone never mounts `Zone` (`StatsPlayer.tsx:403`, `:565` are desktop branches) |
| 12 | Contrast fixes (amber for losses, visible tracks, 3:1 zero rule/Tour tick, steady line 5.6:1, 13 px captions) | DONE | `tokens.css:676`, `:678-680`; `.ch-shs-*` reads them |
| 13 | "Your game" on Home | NOT BUILT, by rule 1 | Home reverted to the 28 Oct version (dc11bf6b7e) |
| 14 | Desktop: shared tokens and card language on a flat canvas | PARTIAL, left as is | Tokens are global (`tokens.css:669-698`). Desktop keeps production's bento, zones and drills (rule 4); the design has no desktop board to build cards from, so the zone and ledger look is not restyled. Done on desktop: the comparison table with every row toned (`RoundsExtra.tsx:166-185`) and the hover readout with arrow-key stepping (`RoundTrend.tsx`, `useChartPin`) |

## Motion table

| Row | Design | Status | Evidence |
|---|---|---|---|
| M1 | Push: house push, 462 ms `--ch-ease-spring-smooth`, summary drifts `CH_UNDERLAY_SHIFT` under `--ch-push-dim` | DONE | `StatsDetailScreen` wraps `PhoneScreen` (`PhoneScreen.tsx:129`, `phone-chrome.tsx:188`, `tokens.css:1408`) |
| M2 | Window switch thumb 360 ms on `--ch-ease-spring` | PARTIAL, deliberate | The house `Segmented` plate (`ui/Segmented.tsx:23`, settle spring base 260 ms, bounce 0.1) is shared by every segmented control and pinned by `motion-durations-pinned`; the Stats switch uses it unchanged |
| M3 | Content cross-fade 260 ms on `--ch-ease` on a window or section change | DONE | `WindowCrossfade` `shs-motion.tsx:31-75`, 260 ms (`XFADE_MS`, now `CH_DUR.base`); `.ch-shs-xfade-ghost` `stats-redesign.css:1897-1906` |
| M4 | Chart marks grow once, 360 ms, first time in view | SUPERSEDED, not built | Removed 6 Nov by owner decision (9db3599267, MOT-02; Q-153). `data-ch-grow` stays as an inert hook |
| M5 | Goal rings fill once, 360 ms | SUPERSEDED, not built | Same decision; rings are drawn at rest (`StatsPlayerPhoneShs.tsx:1157`, `MiniCharts.tsx`) |
| M6 | Scrub follows the finger, figure becomes that round, selection haptic per round | DONE | `ScoringFeatureChart.tsx:123-140` (`hapticScrub('step')`), card figure swap `StatsPlayerPhoneShs.tsx:393-402` |
| M7 | Press deepens the surface and never scales | **PARTIAL, fixed in this change** | `SummaryCard.tsx` set `data-ch-press-scale=".97"`, which scaled the card, and (no pressable target) never showed the wash. Now `data-ch-pressable`: the wash draws from `data-ch-pressed` (`stats-redesign.css:226-238`), no scale. Test: `stats-summary-cards.test.tsx` |
| M8 | Scoring line morphs on a window change, 360 ms | DONE | `ScoringFeatureChart.tsx` `MORPH_MS` (now the named `CH_MARKS_MS`, mirrors `--ch-dur-marks`); Reduce Motion draws at rest |
| M9 | Reduce Motion: 120 ms cross-fade | SUPERSEDED, 180 ms stands | Owner bar: Reduce Motion is the 180 ms opacity fade (`CH_FADE_MS`, `lib/motion.ts:56`; MOT-01). `WindowCrossfade` uses it (`shs-motion.tsx:55`) |

## Beyond the design language (treated as approved)

| Addition | Status |
|---|---|
| `--ch-chart-gain-fill` / `--ch-chart-loss-fill` | Present (`tokens.css:1574-1580`) |
| `--ch-chart-flat`, `--ch-chart-track` | Present (`tokens.css:678-679`, `:992-993`) |
| Feature-card chart tones | Present (`tokens.css:681-698`) |
| Chip tints as fixed colours | Present (`--ch-feature-*-tint`, `tokens.css:694-696`, dark `:998-1000`) |
| `--ch-type-figure-tile` | Not built: Home only (rule 1) |
| Pushed detail pages, one per card | Present (`detail-route.ts`) |
| Section names on the page | Present (`StatsPlayerPhoneShs.tsx:264`, `:280`, `:296`, `:307`) |
| Small visuals (ribbon, round ticker, mini rails, goal rings) | Present (`MiniCharts.tsx`, `ShsBlocks.tsx`) |
| Scoring line morph | Present (M8) |

## Also fixed on the way

- `stats-redesign.css` `.ch-shs-who h1` took `letter-spacing: -0.015em`, the one off-scale value that put the file one over its recorded holdout (`look-feel-pass-css.test.ts`). It is now `-0.02em`, on the scale.

## Baseline before the first edit (this base)

- `npm run clubhouse:css`: exit 0, 0 findings.
- `npm run clubhouse:check`: exit 1, 73 violations, all "has no test that names it" (catalog `roster`, `messages`, `classes`) and bridge-contract test names (roster, messages, classes, player-home). None is Stats. Unchanged after this work.
- `npm run test:file -- src/clubhouse/screens/stats src/clubhouse/routes`: 260 passed.
- Failing on this base and not touched here (they read the catalog and test titles only): `stats-player.test.tsx` 52401 and `stats-team.test.tsx` 42401, which want Bridge IDs and CH codes named in test titles.
