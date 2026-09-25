# GolfHelm UI/UX audit ledger (rebuilt 2026-09-24)

Branch `agent/ui-ux-audit-fa093f`, PR #2069 (draft). Graded at HEAD `ab1bfd32a`.

The original `MASTER-LEDGER.md` lived in the session scratchpad and was lost. This file rebuilds it from:

- the ledger agent transcript (all 364 finding rows, recovered from its write calls);
- the fix-agent result files (W1, W3, W4, W5, W6, W13, W15) and the 12:20 regrade reports (W2, W7-W8, W9-W10, W11-W12-W14);
- the lead's later work (session summaries, commits on the branch, the PR body) and the lead's authoritative status list;
- spot checks against the code at `ab1bfd32a`.

Evidence column: "verified in code" means a grep or read at `ab1bfd32a` confirmed the status. "per transcript" means the status comes from an agent report, the regrade, or the lead, and was not re-checked here.

Status meanings:

- **done**: fixed, or decided and applied.
- **partial**: some of the finding is fixed and the rest is open.
- **residual**: not done and actionable now, including approved follow-up PRs that have not started.
- **blocked**: the remaining work waits on something outside the code: a held migration, PR #1933, a device or live check, or an owner flag.
- **not-a-bug**: closed with no change, by owner or lead decision.
- **unknown**: no status could be determined.

Work the lead listed that has no ledger ID: the Stats Flight crash fix (`f3ef34de2`), the frosted Stats hero and avatar-as-More button (`d4731c864`, `603a7f48e`), the W11 JSDoc on the z-score composite fields (per lead; no commit identified), and standing bars fitting off-range values (`ab1bfd32a`).

## Summary (364 ledger findings)

Recounted after the 2026-09-24 afternoon pass (PR #2069).

| Status | Count |
|---|---|
| done | 302 |
| partial | 13 |
| residual | 8 |
| blocked | 26 |
| not-a-bug | 15 |
| unknown | 0 |
| **total** | **364** |

Owner decisions (OD-01 to OD-24) and workstreams (W1 to W15) have their own tables below and are not in these counts.

## Findings by prefix

### DASH (22)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| DASH-01 | [P1] Player Home: 8 KPI tiles (~150px each, dead space, trophy icon with an empty body) about 4 phone screens ... | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W9) | per transcript |
| DASH-02 | [P2] Home: focus areas numbered 1,1,2; orphaned chevron; cards nested in cards; "Today" task and course names ... | done: Numbering by position fixed; truncation not re-checked | FairwayPlayerDashboard.tsx | per transcript |
| DASH-03 | [P2] Home: CoachHelm insight card nested 3 deep, values truncated, 4 stacked actions; duplicate feed item ×2; SG ... | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W9) | per transcript |
| DASH-04 | [P1] Scrolled content shows through/over the "Dashboard" top bar (InsightCard z-20 without isolate) | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W9) | per transcript |
| DASH-05 | [P2] Bar says "Dashboard" while the h1 says "Good afternoon, Cole" (two titles) | done: Large-title fade | 3e2b51b77; FairwayTopBar.tsx | per transcript |
| DASH-06 | [P2] Stats: single-tab "Overview" segmented control | done: No strip under 2 tabs | CoachHelmSubNav.tsx:270 | verified in code |
| DASH-07 | [P2] Stats: three filter controls before any data; combobox double focus ring, blank first row, "(real)" suffix, a ... | blocked: One scope control and clean names done; QA qualifier preset hiding waits on OD-03 (is_test absent in prod 2026-09-25, migration HELD) | StatsSpineStage.tsx:505; supabase/migrations/20260924130000_golf_is_test_flag.sql | verified in code |
| DASH-08 | [P2] Stats skeleton is one grey slab (not shape-matched); sections blank mid-scroll | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W9) | per transcript |
| DASH-09 | [P3] Lowercased metric in prose (leakLabel.toLowerCase) | done: Registry labels printed as-is; only prose is lowercased | buildStatsViewModel.ts:272-275 | verified in code |
| DASH-10 | [P1] Rounds: triple title (bar + "YOUR ROUNDS" eyebrow + "Your rounds." h1); KPI strip + orphan "Scoring trend • ... | done: Unfinished list capped at 2 with Show N more | FairwayUnfinishedBanner.tsx:54 | verified in code |
| DASH-11 | [P2] Rounds: Pebble Beach ×3 same day with GIR 100% and 37-39 putts (implausible seed data); QA rounds show "No ... | blocked: OD-03 is_test flag held; read paths do not filter yet (follow-up) | supabase/migrations/20260924130000_golf_is_test_flag.sql | per transcript |
| DASH-12 | [P1] Stats server fetch + putting benchmark module + Stats field sheet (spec §3.2/§5, plan #7) | partial: putting.ts (golf_pga_standards, cited) and the Putting benchmark Sheet built; (B) the page-language field-sheet rebuild stays open: the cited spec (spec-dashboard-shell §3.2/§5) is not in the repo | caf753eef, 03a21a4c1; lib/golf/benchmarks/putting.ts; spine-stage/PuttingBenchmarkSheet.tsx | verified in code |
| DASH-13 | [P2] Titles in 6 variants and an in-shell 404: unknown /dashboard/* drops the shell and offers "Baseball ... | done: Golf 404 inside the shell | dashboard/[...missing]/page.tsx | verified in code |
| DASH-14 | [P2] Player "Round not found" offers "Back to roster" (players have no roster) | done: Role-aware back link | dashboard/not-found.tsx:29-30 | verified in code |
| DASH-15 | [P2] More sheet: "Sign out" is the loudest control (filled rose pill) | done: Regrade upgraded to DONE | cd01022e2 / 397587774 | per transcript |
| DASH-16 | [P2] Calendar: badge "6" matches nothing visible; agenda one event then a void; overdue task not on the calendar | done: Agenda ends with "That's everything for …" (4eb357472); pinned "N overdue tasks" row per owner decision (7a9ce3700) | 4eb357472, 7a9ce3700 | this session |
| DASH-17 | [P2] Team sub-nav clipped with no affordance; CoachHelm 6 tabs with "Standing" clipped; insights chips clipped | done: Edge-fade scroll affordance on both sub-navs | FairwayHubSubNav.tsx, CoachHelmSubNav.tsx | per transcript |
| DASH-18 | [P2] Messages uses its own header (large title + compose FAB, no bar/bell) | done: Route actions portal into the shared top bar; the bar hides only in an open thread (3c823e8bb) | 3c823e8bb | this session |
| DASH-19 | [P3] Courses h1 "Course library." period tell (also "The library.", "Your rounds.") | done: No trailing periods | FairwayRoundsLibrary.tsx:384 | verified in code |
| DASH-20 | [P2] Settings "Save changes" disabled-green reads as enabled | done: W5 results file, with tests | 397587774 (W5) | per transcript |
| DASH-21 | [P3] Delete the old page bodies after #1933 merges (FairwayPlayerDashboard, FairwayRoundsLibrary, StatsSpineStage) | blocked: PR #1933 still open (OD-16) | FairwayPlayerDashboard / FairwayRoundsLibrary / StatsSpineStage | per transcript |
| DASH-22 | [P3] Unverified list: S1 stacking cause, S6 blank band, S5 provider remount, server-action serialization, 19 vs 21 ... | blocked: Live-only verification list | dev server :3217 | per transcript |

### HUB (23)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| HUB-01 | [P1] Player CoachHelm hub IA: 6 horizontal tabs + 9 hub cards duplicating them + "← Home" chip + category chips ... | done: Tabs are the only navigation; hub cards and the Home chip removed (894cfab86) | 894cfab86 | this session |
| HUB-02 | [P1] hub/buildPlayerHubViewModel.ts: one source per number, read-quality buckets, prediction-band guard, standing ... | done: buildPlayerHubViewModel: one source per number, stats cache for round count (894cfab86) | 894cfab86 | this session |
| HUB-03 | [P1] Instruments SignedLadder (themes, leak, standing) and NextRoundWindow | done: Scoring windows, SG slopes and evidence rails as hub instruments (894cfab86) | 894cfab86 | this session |
| HUB-04 | [P1] Insight anatomy: takeaway-first row/sheet/EvidenceLine; one primary + Menu; word band instead of percent ... | done: Word band, ghost actions, and one visible action per insight sheet with Acknowledge/Dismiss under More (521903c8c) | 521903c8c | this session |
| HUB-05 | [P2] Green gradient hero with a mixed pill cloud; jargon "Practice Frequency 0.3 opportunity"; mono pills | done: No green gradient hero | PlayerSpine.tsx | verified in code |
| HUB-06 | [P2] Hover-lifting bento (hover:-translate-y-1 on every cell); big-number tiles "6 active/6 themes/6 signals" ... | done: No hover lift | Bento.tsx | verified in code |
| HUB-07 | [P2] Percentile shown as a value ("SG: Total 100%" from team_pct) | done: Regrade DONE | PlayerHomeBento.tsx; player-hub deleted | per transcript |
| HUB-08 | [P2] DrillPanel border + shadow; cards nested three deep | done: No card chrome; title is an h2 | DrillPanel.tsx:47 | verified in code |
| HUB-09 | [P2] Banned tokens: EvidencePanel amber/violet/warm/cream glass; DivergingBars bg-warm-400; StandingBar Inline ... | done: No violet or glass | EvidencePanel.tsx:276 | verified in code |
| HUB-10 | [P3] Regex voice rewrite in the client | done: Regrade DONE | PlayerHomeBento.tsx; player-hub deleted | per transcript |
| HUB-11 | [P3] Arrows in copy ("More insights →", "↗ Improving", "←") | done: Chevron icon instead of arrow glyphs | PlayerHomeBento.tsx | verified in code |
| HUB-12 | [P2] Contradictory signals side by side ("Improving" next to a danger badge) | done: One better/worse value drives word, colour and sign on the Overview (894cfab86) and Standing (a36244990) | 894cfab86, a36244990 | this session |
| HUB-13 | [P2] Causal cards repeat one disclaimer; jargon "Weakest link, confidence/strength" | done: "Weakest link" jargon gone | CausalWhyPanel.tsx | verified in code |
| HUB-14 | [P1] Development: terminology soup (focus areas / goals / target / New focus area / Set a goal) and three primary ... | done: One primary; targets named as targets | 54599c478 | per transcript |
| HUB-15 | [P1] Dashboard focus-area "Set a target" chip navigates to development without the focus area (dead end) | done: ?focus= lands on the card | DevelopmentDrill.tsx:371 | verified in code |
| HUB-16 | [P1] Dashboard insight → /coachhelm?focus=<id> dead deep link | done: Already DONE in the ledger | before ledger stamp | per transcript |
| HUB-17 | [P2] Top insight filtered out of the insights list | not-a-bug: Lead: keep the top insight out of the library | PlayerCoachHelmHome.tsx | per transcript |
| HUB-18 | [P2] StandingView: ladder, row sheet, a gap line only when honest; person named in chrome ("Mark Broadie") | done: No person named; plain SG description | StandingDrill.tsx | verified in code |
| HUB-19 | [P2] PlanView / PlanBoard / CausalLedger reusing the focus-area writes | done: Overview plan edits in place (log a value, mark complete with Undo) through the existing focus-area actions, optimistic with rollback and a danger toast | HubPlanBoard.tsx | verified in code (HubPlanBoard.test.tsx) |
| HUB-20 | [P2] coachhelm/loading.tsx rewritten to the new first paint | done: coachhelm/loading.tsx matches the new first paint (894cfab86) | 894cfab86 | this session |
| HUB-21 | [P3] Delete orphaned home/* drills, PlayerSpine, PlayerHomeBento after #1933 | done: PlayerSpine, PlayerHomeBento and buildPlayerHomeViewModel deleted; #1933 does not touch them (894cfab86) | 894cfab86 | this session |
| HUB-22 | [P2] Game Profile and Deep dive leave the tab strip (overflow Menu) | not-a-bug: OD-11: keep Game Profile and Deep dive in the strip | - | per transcript |
| HUB-23 | [P2] Trend "Shifting, changed direction recently" (no direction/magnitude); "AWAITING DATA · Around the Green" ... | done: Shifting now explains direction | buildPlayerHomeViewModel.ts | per transcript |

### NUM (42)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| NUM-01 | [P0] No countable-round rule. Sep 17 round 91301a75 (37 strokes, SG +34.51) poisons Best 37, the trend plunge ... | blocked: TS side done; DB side is the OD-01 migration, held for owner apply | round-countable.ts; held migration 20260924120000 | per transcript |
| NUM-02 | [P1] Dashboard "last 5 rounds" labels sit on all-time values (72.8 not reproducible) | done: Labels, putts per 18, axis clamp, 9-hole normalising | numbers agent a6494e (in cd01022e2/397587774) | per transcript |
| NUM-03 | [P1] Putts/rd denominator includes hole-less rounds (29.7 shown vs 32.9 true) | done: Labels, putts per 18, axis clamp, 9-hole normalising | numbers agent a6494e (in cd01022e2/397587774) | per transcript |
| NUM-04 | [P2] Birdies per round labelled "per 18"; 9-hole rounds counted as full | done: Already DONE in the ledger | before ledger stamp | per transcript |
| NUM-05 | [P1] Sparkline/trend read raw total_score (seed drift ±1) while the Rounds list uses hole sums | done: Already DONE in the ledger | before ledger stamp | per transcript |
| NUM-06 | [P1] "↑ −39.0" = newest vs first-ever round; delta chips absurd (Fairways −79%, Putts improvement red/green ... | done: Already DONE in the ledger | before ledger stamp | per transcript |
| NUM-07 | [P1] Prediction: 80% interval labelled 60%, centred on the mean, "+" missing; 25-stroke band "−11.8-13.6" | done: Signed range, bands over 8 strokes hidden (OD-09), confidence as a word | insight-composer.ts:23,341 | verified in code |
| NUM-08 | [P1] "100% confidence" = min(n/30,1) shown on nearly every insight; "conf 100%" in a mono box | done: Word bands, no percent confidence in golf UI | confidence-label.ts; CausalWhyPanel.tsx | verified in code |
| NUM-09 | [P1] "53% 3-putt" product estimate (true 14%); ~2.3 strokes/rd overstated | not-a-bug: 53% 3-putt is a projection in an owner-settled rule; measured is about 9-10% | - | per transcript |
| NUM-10 | [P2] 3-5ft band missing from the stats bento | done: Already DONE in the ledger | before ledger stamp | per transcript |
| NUM-11 | [P2] "Every completed round is included" is false (19 of 21) | done: Already DONE in the ledger | before ledger stamp | per transcript |
| NUM-12 | [P2] Insight window text frozen at generation ("Data through 2026-05-31" stale; 15 rounds/54 days vs 21/123) | done: Data-through date and "Built before your last round" computed at display time on the Overview; coach evidence shows the real window dates | 894cfab86 | this session |
| NUM-13 | [P2] Sign conventions differ across CoachHelm pills; "Putting ↗ Improving" next to a red "↘ 0.2" | done: Standing deltaVsTeam arrow now means better/worse (a36244990); Overview uses one convention (894cfab86) | a36244990, 894cfab86 | this session |
| NUM-14 | [P3] No same-date tiebreak ordering | done: Already DONE in the ledger | before ledger stamp | per transcript |
| NUM-15 | [P2] Standing: "SG: Total" twice; axis to 104% | done: Labels, putts per 18, axis clamp, 9-hole normalising | numbers agent a6494e (in cd01022e2/397587774) | per transcript |
| NUM-16 | [P2] "6 signals · 13 to work on · 1 strengths" mixes three row sets; hard-coded label; "6 themes" with only one bar | done: Counts come from one themeCauseCounts object | PlayerHomeBento.tsx:124 | verified in code |
| NUM-17 | [P3] BEST badge = best per month, never said so; shown on several rounds | done: Already DONE in the ledger | before ledger stamp | per transcript |
| NUM-18 | [P0] Two composites one tab apart: Fingerprint "Overall game 100" vs Genome "Game strength 57" | done: One Form score on Fingerprint and Genome (OD-02) | f287a182c; form-score.ts | per transcript |
| NUM-19 | [P2] Rounds page avgToPar is an unnormalized mean for 9-hole rounds | done: Labels, putts per 18, axis clamp, 9-hole normalising | numbers agent a6494e (in cd01022e2/397587774) | per transcript |
| NUM-20 | [P1] Scrambling 27 vs 34: 90-day live window vs lifetime cache, same name | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W11/W12 agents) | per transcript |
| NUM-21 | [P1] Putting bands: Fingerprint reads legacy 15_20/20_plus; everything else 15_25/25_plus (43% vs 19%) | done: Already DONE in the ledger | before ledger stamp | per transcript |
| NUM-22 | [P1] Hero pills "Fairways 7% · Greens 100% · Putts 18.0" contradict the Performance Snapshot (62/72/29.7) on the ... | done: Overview no longer shows the 30-day stat pills; round count from the stats cache (894cfab86) | 894cfab86 | this session |
| NUM-23 | [P1] Dashboard SG table labelled "Strokes gained" shows 0-100 scores (83/36/53/1); radar axis 0-100 | done: Already DONE in the ledger | before ledger stamp | per transcript |
| NUM-24 | [P2] Pressure gap 15.75 (Standing) vs +17.4 (Fingerprint); "Pressure delta 0" hero vs "Tightens up" | blocked: Label and format unified (f07c0cdee). Standing SQL now follows the shared rule (18-hole basis, legacy 'qualifying') and so does the v3 generator (7dc04fe5b); the migration 20260924140000 is HELD and applies after OD-01 | f07c0cdee, 7dc04fe5b | this session |
| NUM-25 | [P2] Scoring avg to par: +0.9 (FP) vs +0.44/18 (Stats) vs +0.7 (Rounds); stats 72.3 vs dash 72.8 vs rounds 72.5 ... | blocked: TS sources unified; cached averages change only after OD-01 | countable rule in TS | per transcript |
| NUM-26 | [P2] Putting make% non-monotonic (10-15ft 16% < 15-20ft 43%; 5-10 28% < 15-20 43%) | blocked: Still open; re-check putt make% after OD-01 is applied | - | per transcript |
| NUM-27 | [P2] "3-5 ft putts · 15 shots" (deep dive) vs 44 attempts elsewhere | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W11/W12 agents) | per transcript |
| NUM-28 | [P2] Deep dive yardage table mixes tee shots with approaches ("Dead zone 275-300y" is driving); contradicts SG Tee ... | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W11/W12 agents) | per transcript |
| NUM-29 | [P2] Miss direction as 4 text chips (L26/R43/S52/Long30) whose pairs don't sum; no denominator | done: Miss compass replaces chips; n denominator not live-verified | fingerprint/instruments.tsx | per transcript |
| NUM-30 | [P2] Unitless numbers: "14.2 vs 9.2 typical", "Resilience 1.1", "1.0 from Tour", Form "% of what?" | done: Units on deep-dive trend and insight gaps (lead) | 9ad388a88 | per transcript |
| NUM-31 | [P3] Duplicate display: Par 3 3.27 (+0.27), then "Averages Par 3 3.3" | done: Duplicate Par 3/4/5 chart removed | 2b43716a4 | per transcript |
| NUM-32 | [P2] Focus-area context strip shows raw 2-decimal mono ("Avg 72.75 · FW 61.96%") | done: Focus-area strip uses formatMetricText (9dd89a443) | 9dd89a443 | this session |
| NUM-33 | [P2] Standing: arrow semantics contradict labels ("↓ vs team" + "Above team average" where lower is better) | not-a-bug: Lead: arrow semantics are deliberate and test-locked | StandingBar/utils.ts | per transcript |
| NUM-34 | [P2] Standing counterfactual "72.8 → 70.3 (≈4 wks)" repeated identically and shown on metrics already better than ... | done: Regrade: real per-metric inputs | counterfactual/compute.ts | per transcript |
| NUM-35 | [P2] Standing overview shows percentiles (SG Total 100%) while the page shows raw SG (−1.61): two scales, same ... | done: Standing prints strokes, never percentiles (test); Form-card team %ile needs 5 teammates, fake platform percentile removed (cc9d96e83) | cc9d96e83 | this session |
| NUM-36 | [P2] Suggested target "Scrambling % Sand → 28%" from 5% (1/20), with no baseline | done: Goal targets capped at the catalog improveStep (sand 5% → 10%, not 28%) (baed36e1b). Pending suggestions keep old targets until expiry; accepted goals keep theirs | baed36e1b | this session |
| NUM-37 | [P3] Lowercased metric names in prose ("strongest in sg: off the tee") | done: Registry labels printed as-is; only prose is lowercased | buildStatsViewModel.ts:272-275 | verified in code |
| NUM-38 | [P2] Insight bar axis "42% … 104%"; Team/You/PGA values truncated "TE… 5…" | done: Percent axes pinned 0–100 (tested); Standing comparison cells wrap instead of truncating (5501e422e) | 5501e422e | this session |
| NUM-39 | [P1] DB-side countable-round and stats-cache migrations (stats cache trigger ... | blocked: Written and HELD; owner applies, then cache refresh | supabase/migrations/20260924120000_golf_countable_round_stats_cache.sql | per transcript |
| NUM-40 | [P1] Demo/QA data pollution visible to prospects: round 91301a75, 4 QA Test Course rounds, QA Hell Enum, Progress ... | blocked: OD-03 is_test flag held; read paths do not filter yet (follow-up) | supabase/migrations/20260924130000_golf_is_test_flag.sql | per transcript |
| NUM-41 | [P2] Debug suffix leaks into course names ("Poplar Grove (real)") on fingerprint/stats filters | done: Stats and rounds clean names; Fingerprint no longer renders course names | StatsSpineStage.tsx; course-name.ts | verified in code |
| NUM-R1 | [P3] ShotAnalysisCard: team scramble % printed raw (61.666666%) | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W11/W12 agents) | per transcript |

### NUMC (9)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| NUMC-01 | [P0] Coach dashboard: Top Performers, Team Pulse, Top mover, Scoring/GIR/Putts KPIs, "98 rounds", Recent Rounds ... | done: Junk rounds excluded on the coach dashboard; QA-course hiding waits on OD-03 | dashboard-data.ts (numbers agent a6494e) | per transcript |
| NUMC-02 | [P1] Roster: avg, trend chips, rounds count wrong (junk rounds); method Σtotal/Σholes with no status filter | done: W13 results file | 397587774 (W13) | per transcript |
| NUMC-03 | [P1] Team Stats: score avg, TEAM SG (rounds-weighted mean of lifetime cache), SG categories, trajectory ... | done: W13 results file | 397587774 (W13) | per transcript |
| NUMC-04 | [P2] Team Stats label honesty: "ranked" is alphabetical, "with shot tracking" counts scored rounds, "season to ... | done: W13 results file | 397587774 (W13) | per transcript |
| NUMC-05 | [P2] No tie handling: Top Performers plain sort; rank columns; qualifier positions sequential (should show T1) | done: W13 results file | 397587774 (W13) | per transcript |
| NUMC-06 | [P1] Brief Players: team health putting 31.6 and scoring +3.6 are unweighted means of cached per-player values ... | done: W13 results file | 397587774 (W13) | per transcript |
| NUMC-07 | [P1] Qualifiers: "3 active" counts a QA qualifier and MOMENTIC dated year 60824 (no date sanity) | done: W13 results file | 397587774 (W13) | per transcript |
| NUMC-08 | [P1] Qualifier standings contract missing: Σ to-par with unequal round counts, no completion rule, promised ... | not-a-bug: OD-04: owner keeps the current qualifier rule | - | per transcript |
| NUMC-09 | [P1] Coach vs player: Cole's average is 72.6/72.8 everywhere vs clean 74.4; the composite shows 57 on coach Team ... | done: W13 results file | 397587774 (W13) | per transcript |

### RE (39)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| RE-D1 | [P1] D-HOLESWIPE: swipe between holes with a selection haptic; 20pt edge reserved; swipe-back disabled mid-round | residual: Owner decision: hole-swipe pager ships in its own PR with a device test | owner decision | this session |
| RE-D2 | [P1] D-SUBMIT: signature success haptic plus ~400ms checkmark on round submit | done: Checkmark draw plus one success haptic | FairwayRoundSubmitOverlay.tsx | verified in code |
| RE-F1 | [P0] Holes-step Start failure is silent (no submitError/submitting on the manual path) | done: Already DONE in the ledger | before ledger stamp (cd01022e2) | per transcript |
| RE-F2 | [P1] Quick-pick confirm jumps straight to tracking with no validateBeforeStart and no persistRoundStart | done: W6 results file, with tests | 397587774 (W6) | per transcript |
| RE-F3 | [P1] Every non-holed shot opens a numeric pad with no Done key (accessory bar hidden) | blocked: Needs a live round past setup (DB writes) or a device | round entry on device | per transcript |
| RE-F4 | [P1] Offline: a completed hole can't advance until the server acks | not-a-bug: Owner: keep wait-for-save before advancing holes | - | per transcript |
| RE-F5 | [P1] Setup primary "Next: configure holes" is about 1400px down and not sticky | done: Already DONE in the ledger | before ledger stamp (cd01022e2) | per transcript |
| RE-F6 | [P1] Setup shows two green primaries plus two exits | done: W6 results file, with tests | 397587774 (W6) | per transcript |
| RE-F7 | [P1] No quick score mode (about 20 taps per par-4 hole) | residual: Owner said yes; separate PR, not started | follow-up PR (OD-05 quick score) | per transcript |
| RE-F8 | [P2] Keyboard covers Course name/Rating/Slope/yardage fields | blocked: Needs a live round past setup (DB writes) or a device | round entry on device | per transcript |
| RE-F9 | [P2] Tap targets under 44pt: 9/18 segmented 140x36, par buttons 36x36, yardage 84x40 | done: W6 results file, with tests | 397587774 (W6) | per transcript |
| RE-F10 | [P2] Par 6 can't be entered (buttons 3/4/5 only; validation allows 3-6) | done: W6 results file, with tests | 397587774 (W6) | per transcript |
| RE-F11 | [P2] A tee with no yardage is silently filled with template yardages | done: W6 results file, with tests | 397587774 (W6) | per transcript |
| RE-F12 | [P2] Clipping at 320/390: round type select, date, "Save for quick access" | blocked: Needs a live round past setup (DB writes) or a device | round entry on device | per transcript |
| RE-F13 | [P2] Putt break required on every putt, including tap-ins | done: W6 results file, with tests | 397587774 (W6) | per transcript |
| RE-F14 | [P2] Double haptic per shot (fwHaptic in onClick + triggerHaptic in tracking) | done: One semantic haptic per shot | 3e2b51b77; FairwayShotEntry.tsx | per transcript |
| RE-F15 | [P2] Raw useReducedMotion in round-entry components | done: No raw framer useReducedMotion left in golf paths | 397587774 (W6) | verified in code |
| RE-F16 | [P3] relTime() calls Date.now() in render | done: W6 results file, with tests | 397587774 (W6) | per transcript |
| RE-F17 | [P3] Step spine says SETUP while the scorecard is inline | done: W6 results file, with tests | 397587774 (W6) | per transcript |
| RE-F18 | [P3] Undo asks for confirmation (two taps); offline sync status indicator removed | done: Owner kept the undo confirm; sync chip back as "Not synced · retrying" | FairwayScorecardHeader.tsx:130 | verified in code |
| RE-G1 | [P1] Guards G1-G5 plus the round-level tripwire (score = shots + penalties, putts = putting shots, monotonic ... | done: validateShotContinuity, validateHoleSequence, validateHolesPlayed, deriveHoleCounts present | round-entry-validation.ts | verified in code |
| RE-P1 | [P0] Course picker flicker: the picker resets on close before vaul's exit ends; the parent restructures under the ... | done: Already DONE in the ledger | before ledger stamp (cd01022e2) | per transcript |
| RE-P2 | [P0] D-PICKER: course picker becomes a full-screen push stack (search in the nav bar, tees as the next screen) | done: W6 results file, with tests | 397587774 (W6) | per transcript |
| RE-P3 | [P1] Library load failure shows "No courses yet" (lenient listCourses; toast only when all 3 feeds fail) | done: W6 results file, with tests | 397587774 (W6) | per transcript |
| RE-P4 | [P2] "Change tees" reopens at the course list behind a skeleton | blocked: Needs a live round past setup (DB writes) or a device | round entry on device | per transcript |
| RE-P5 | [P2] Escape on the tee stage closes the whole picker (no back one level); focus lands on BODY after close | done: W6 results file, with tests | 397587774 (W6) | per transcript |
| RE-P6 | [P2] A single-tee course still needs a tee tap after a 390ms skeleton→card pop | done: Single-tee course auto-picks its tee | 3e2b51b77; FairwayCoursePicker.tsx | per transcript |
| RE-P7 | [P2] Course library shelf is a 65-card horizontal carousel duplicated across Recent/Library | done: W6 results file, with tests | 397587774 (W6) | per transcript |
| RE-P8 | [P3] Search field lacks enterKeyHint="search"; autocorrect/autocapitalize on | done: W6 results file, with tests | 397587774 (W6) | per transcript |
| RE-S1 | [P0] Tee shot on a par 4/5 can be recorded as holed or on-green | done: Already DONE in the ledger | before ledger stamp (cd01022e2) | per transcript |
| RE-S2 | [P0] Server trusts the client's score/putts (score ≥ putts+1 etc. not checked) | done: Already DONE in the ledger | before ledger stamp (cd01022e2) | per transcript |
| RE-S3 | [P1] Client-supplied puttDistanceFeet is unclamped | done: Already DONE in the ledger | before ledger stamp (cd01022e2) | per transcript |
| RE-S4 | [P1] holes_played comes from payload length; its assert is self-referential, so a 5-hole payload is saved as ... | done: W6 results file, with tests | 397587774 (W6) | per transcript |
| RE-S5 | [P2] Edit-shot modal: distances unvalidated (negative, after > before) | done: W6 results file, with tests | 397587774 (W6) | per transcript |
| RE-V1 | [P1] Validation gaps left by the fix agent: shot starts where the last ended (±5 yd); holes exactly 9/18 numbered ... | done: W6 results file, with tests | 397587774 (W6) | per transcript |
| RE-V2 | [P2] Yardage-0 holes on the one-tap path mean the tee-shot rule can't judge the drive | done: W6 results file, with tests | 397587774 (W6) | per transcript |
| RE-V3 | [P2] Plausibility thresholds (confirm >400yd, block >500yd, score cap max(par+10, 15)) were chosen by the agent | not-a-bug: Thresholds kept as recommended (OD-19); owner sign-off not recorded, confirm with owner | round-entry-validation.ts | per transcript |
| RE-V4 | [P3] shot-helpers.ts and the validator each compute score/putts (duplicate logic) | done: W6 results file, with tests | 397587774 (W6) | per transcript |
| RE-X1 | [P2] Three raw window.location.reload() calls in new-round-client become the shared stale-action recovery | done: W6 results file, with tests | 397587774 (W6) | per transcript |

### MOT (30)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| MOT-01 | [P1] No motion tokens: springs (snappy/sheet/push/gentle), durations and press values are undefined; duration ... | done: Regrade DONE; tokens re-exported later | cd01022e2 / 397587774 (W2) | per transcript |
| MOT-02 | [P1] No semantic haptic() API over fwHaptic (last-wins throttle; commit/select/checkpoint/roundSubmitted); no ... | done: Regrade DONE; tokens re-exported later | cd01022e2 / 397587774 (W2) | per transcript |
| MOT-03 | [P1] Fairway Button fires fwHaptic('light') on every click; PressTarget fires selection on every tap; legacy ... | done: Regrade DONE; tokens re-exported later | cd01022e2 / 397587774 (W2) | per transcript |
| MOT-04 | [P2] Double haptics: FairwayRecentCourses tile (light + medium on top of Button), confirm-dialog warning on OPEN ... | done: Semantic haptic(); open haptic off on golf | FairwayRecentCourses.tsx:87,96; confirm-dialog.tsx | verified in code |
| MOT-05 | [P1] usePress/Pressable press-down microinteraction (scale 0.97, CSS :active releasing on scroll) across ... | not-a-bug: Lead: CSS press already exists; button shared with Baseball, left alone | fairway/controls/button.tsx | per transcript |
| MOT-06 | [P1] Three overlay systems (ModalShell, Sheet, ui/drawer, plus ConfirmDialog) → one Sheet primitive (focus ... | done: Golf callers on Sheet / ConfirmAlert | 397587774 (W3) | per transcript |
| MOT-07 | [P1] Data entrance motion must go: NumberFlow (12 files), MetricCard chip entrance, CategoryInsightStrip stagger ... | done: Charts render final on mount (b72b7ef2c, 6fe8d81d8); NumberFlow renders the final value on mount and animates only on change | b72b7ef2c, 6fe8d81d8 | this session |
| MOT-08 | [P1] Hover sticks after tap in WKWebView (no hoverOnlyWhenSupported; 64 hover:-translate-y) | done: Already DONE in the ledger; native parts need a new build | native shell agent a93750 (cd01022e2) | per transcript |
| MOT-09 | [P2] 18 hover-only reveals (group-hover:opacity-100) become unreachable on touch once hover is gated | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| MOT-10 | [P1] Green -webkit-tap-highlight flash under 1024px | done: Already DONE in the ledger; native parts need a new build | native shell agent a93750 (cd01022e2) | per transcript |
| MOT-11 | [P3] transition-all: 332 hits in 169 files | done: transition-all replaced on golf paths | d3d1a5f6e | per transcript |
| MOT-12 | [P1] Push/pop directional transitions via View Transitions with direction flags; popstate → instant | residual: Re-scoped on purpose: a transform slide on the route wrapper breaks fixed sheets and bars mid-animation; View Transitions is experimental in Next 16. Pushes fade, pops are instant | route-motion.ts | this session |
| MOT-13 | [P1] D-SWIPE swipe-back: native allowsBackForwardNavigationGestures; HelmNav.setSwipeBackEnabled bridge (off ... | done: Swipe-back off mid-round and with a sheet open; Swift not Xcode-built | 4bacddc68; GolfBridgeViewController.swift | per transcript |
| MOT-14 | [P1] D-BOUNCE: page rubber-band on; fixed-bar jitter hardening; theme-synced overscroll colour (cream band in dark) | done: Theme-synced native overscroll via HelmAppearancePlugin (9dd625f2d). Needs a new iOS build; Swift parse-checked only | 9dd625f2d | this session |
| MOT-15 | [P2] Tab bar: equal slots, instant swap, reselect → scroll-top + bounce; drop layout/layoutId pill; bottom-nav ... | done: Static pill, equal slots, no layoutId | FairwayBottomNav.tsx | verified in code |
| MOT-16 | [P2] Segmented thumb animates x without layout projection | done: Regrade DONE; tokens re-exported later | cd01022e2 / 397587774 (W2) | per transcript |
| MOT-17 | [P2] Skeleton→content: hard swap under 300ms, 150ms crossfade only after (useSkeletonSwap) | done: useSkeletonSwap | 8c31b21cf | per transcript |
| MOT-18 | [P2] Error shake + inline message; success checkmark retime (260ms) | done: successCheckmark retimed to 260ms and used by the success toast (c0b049e4d) | c0b049e4d | this session |
| MOT-19 | [P2] Add-to-plan morph plus an Undo toast; triage row highlight and scroll restore on pop; PTR on Home, Rounds ... | not-a-bug: Owner decision 2026-09-24: keep the confirm step, no player Undo (no new write path on minors' data). Triage return-to-row done | owner decision | this session |
| MOT-20 | [P1] Hole pager with drag (lazy domMax for tracking only) | residual: Owner decision: hole pager ships in its own PR with a device test (with OD-05 quick score) | owner decision | this session |
| MOT-21 | [P2] Tests: e2e motion-stillness.spec.ts and course-picker-flicker.spec.ts; unit tests for tokens/haptics | partial: Specs written (2e5bbccb0): e2e/golf-motion-stillness.spec.ts, e2e/golf-course-picker-flicker.spec.ts. Local run failed at the sign-in fixture (dev server restarted); not yet green | 2e5bbccb0 | this session |
| MOT-22 | [P3] Core Haptics signature (helm-haptics.ts) stays gated until the owner's device pass | blocked: Waits on the owner device pass | lib/native/helm-haptics.ts | per transcript |
| MOT-23 | [P1] D-NUM: numerals in SF tabular, no mono, no slashed zero; Fragment Mono retired | done: Already DONE in the ledger; native parts need a new build | native shell agent a93750 (cd01022e2) | per transcript |
| MOT-R1 | [P2] Raw `useReducedMotion()` in Messages composer/thread and round-detail ScoringDistribution | done: 0 raw framer useReducedMotion imports left in golf paths | lint ban + 44-file codemod (3e2b51b77) | verified in code |
| MOT-R2 | [P2] Raw useReducedMotion() in auth/onboarding (signup, demo, coach and player onboarding) | done: 0 raw framer useReducedMotion imports left in golf paths | lint ban + 44-file codemod (3e2b51b77) | verified in code |
| MOT-R3 | [P0] FocusAreaCard: raw useReducedMotion drives SSR `initial` (reduced-motion users get a mismatch) | done: Guarded hook | FocusAreaCard.tsx | verified in code |
| MOT-R4 | [P2] Sparkline/EkgSparkline: useInView(amount .6/.4) leaves lines invisible mid-scroll; raw useReducedMotion | done: Guard hook, no inView gate, final state on mount | Sparkline.tsx, EkgSparkline.tsx | verified in code |
| MOT-R5 | [P3] Raw useReducedMotion in HubSubNav, Sidebar, route-motion, DayScheduleSwipe | done: 0 raw framer useReducedMotion imports left in golf paths | lint ban + 44-file codemod (3e2b51b77) | verified in code |
| MOT-RM | [P1] Raw framer useReducedMotion() instead of useReducedMotionGuard, repo-wide, including core primitives ... | done: 0 raw framer useReducedMotion imports left in golf paths | lint ban + 44-file codemod (3e2b51b77) | verified in code |
| MOT-RM2 | [P2] globals.css `.animate-pulse-subtle` infinite animation not covered by prefers-reduced-motion | done: Golf reduced-motion rule covers .animate-pulse-subtle | globals.css:2108-2115 | verified in code |

### NAT (11)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| NAT-01 | [P1] Launch colour jump: storyboard tan #EDE0C8 vs bridge #FFFEFA vs CSS canvas; no dark variant | done: Already DONE in the ledger; native parts need a new build | native shell agent a93750 (cd01022e2) | per transcript |
| NAT-02 | [P1] Every launch is a cold download: the WKWebView cache is wiped on each viewDidLoad, plus a www→apex redirect | done: Already DONE in the ledger; native parts need a new build | native shell agent a93750 (cd01022e2) | per transcript |
| NAT-03 | [P1] 7 web font families on every golf page; mixed sans stacks (DM Sans body, Geist font-sans, SF fw-sans) | done: Already DONE in the ledger; native parts need a new build | native shell agent a93750 (cd01022e2) | per transcript |
| NAT-04 | [P1] No iOS nav bar: 44pt, centred 17pt title, ‹ Parent back chevron on pushed routes | done: 44pt phone bar with a centred 17pt title via opt-in nativeBar (157d8a842) | 157d8a842 | this session |
| NAT-05 | [P1] Travel: desktop master-detail leaks to the phone (empty "Select a trip" pane) | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| NAT-06 | [P1] Roster: identical card grid with 8 full-width green "View player" primaries (identical-card tell app-wide ... | done: Row link instead of a primary per card; one meta line | 3e2b51b77; FairwayPlayerCard.tsx | verified in code |
| NAT-07 | [P1] Settings is a 7,245px mega page with about 6 "Save changes" buttons; avatar shown twice; "Remove" rose pill ... | residual: Owner: separate follow-up PR; not started. Avatar Remove button fixed | follow-up PR (Settings rebuild) | per transcript |
| NAT-08 | [P2] `body.capacitor span { user-select:text }` re-enables selection on every span (tab labels, button labels) | done: Golf-only span user-select none | globals.css:412 | verified in code |
| NAT-09 | [P2] Offline page is off-system (Tailwind green, stone palette, gradient tile) | done: Already DONE in the ledger; native parts need a new build | native shell agent a93750 (cd01022e2) | per transcript |
| NAT-10 | [P3] min-height 100dvh overridden by -webkit-fill-available on iOS | done: Already DONE in the ledger; native parts need a new build | native shell agent a93750 (cd01022e2) | per transcript |
| NAT-11 | [P3] No theme-color meta on web | done: Already DONE in the ledger; native parts need a new build | native shell agent a93750 (cd01022e2) | per transcript |

### NAV (10)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| NAV-B1 | [P1] Bell badge 14→6→14: two halves set by separate awaits; a read error becomes 0; no request-order guard | done: Already DONE in the ledger | before ledger stamp | per transcript |
| NAV-IA1 | [P1] Player tabs Home · Rounds · Game · Plan · Team (CoachHelm becomes the insight byline); new routes with ... | done: Regrade upgraded to DONE | cd01022e2 / 397587774 | per transcript |
| NAV-IA2 | [P1] Coach tabs Home · Players · CoachHelm · Schedule · Team; Team Stats and What's new fold into Brief | done: Regrade upgraded to DONE | cd01022e2 / 397587774 | per transcript |
| NAV-IA3 | [P2] Deep-link contract §3.5: every entry point (push payloads included) opens the exact step | done: Push payloads open the exact event, qualifier or round; plan pushes skip the redirect shim (67629b706) | 67629b706 | this session |
| NAV-R1 | [P2] Calendar: Android-style "+" FAB above the tab bar plus a "⋯" header circle | done: Regrade upgraded to DONE | cd01022e2 / 397587774 | per transcript |
| NAV-R2 | [P2] Tab bar: the active pill resizes per tab and inactive items are icon-only | done: Static pill, equal slots, no layoutId | FairwayBottomNav.tsx | verified in code |
| NAV-R3 | [P2] Pull-to-refresh only on Messages; feed screens have none | done: PTR on Home, Rounds, CoachHelm, Calendar | 724624671; GolfRouteRefresh.tsx | per transcript |
| NAV-S1 | [P2] Global scroll-margin-top 120px is less than bar + safe area + sub-nav, so anchored content hides under the bar | done: scroll-margin uses the header offset | globals.css:494 | verified in code |
| NAV-S2 | [P2] Calendar agenda scrollIntoView bucket has no scroll margin | done: scroll-mt on buckets | FairwayAgendaView.tsx:458 | verified in code |
| NAV-V1 | [P2] Brief view switch is now client-side (replaceState); StageRouter (player hub) not checked in a browser ... | blocked: Code matches; needs a browser check | TriageDesk.tsx | per transcript |

### TYPE (3)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| TYPE-01 | [P2] Four parallel type scales; 9-10px sizes; cap eyebrows at one per screen; sentence-case heads | done: Legacy type classes mapped to the canonical scale on golf | d3d1a5f6e | per transcript |
| TYPE-02 | [P2] Dynamic Type ignored (px scale; no `font: -apple-system-body` root) | done: Dynamic Type for reading text, capped at XXL (OD-06) | cd4be3a72 | per transcript |
| TYPE-03 | [P2] ALL-CAPS tracked eyebrow above nearly every block (text-eyebrow ×1065) | partial: Sentence-case eyebrows; eyebrow count ratcheted per file so it can only fall (909e18f93). One-per-screen cap swept on the 15 densest golf player/coach files, 120 → 1 eyebrows (51e975f87): section titles are now h2/h3/h4 in `font-fw-sans text-body-sm font-semibold text-text-primary`, meta/labels use `text-caption`; the print scouting report keeps its page kicker. Remaining: ~420 uses across ~200 lower-count golf files, including admin CRM (skipped as non player/coach) and `components/golf/calendar/**` (shared with Baseball). Ratchet baseline not yet lowered for the swept files | 909e18f93, 51e975f87 | this session |

### DS (22)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| DS-01 | [P2] Classes: 3 of 4 vaul drawers have no bottom safe-area padding | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| DS-02 | [P2] About 22 legacy `ui/drawer` call sites bypass the Fairway Sheet/ModalShell ("one modal" rule) | done: Golf callers on Sheet / ConfirmAlert | 397587774 (W3) | per transcript |
| DS-03 | [P3] ConfirmDialog is a second hand-rolled modal outside ModalShell | done: Golf callers on Sheet / ConfirmAlert | 397587774 (W3) | per transcript |
| DS-04 | [P3] Dead FingerprintHero.tsx (banned warm-/cream- classes); only MetricPill is live | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W11/W12 agents) | per transcript |
| DS-05 | [P3] WhatIfPanel: raw amber-/red- classes (banned) | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W11/W12 agents) | per transcript |
| DS-10 | [P1] Metric display registry + formatMetric(metricId, value, ctx): precision, true minus, tone from polarity × ... | done: Registry, parity test, render-bans ratchet; parity todos closed in d76d77dd4 | cd01022e2/397587774 (W15); d76d77dd4 | per transcript |
| DS-11 | [P1] Cross-surface parity test (Home, Game, Roster, Brief, player page) | done: Registry, parity test, render-bans ratchet; parity todos closed in d76d77dd4 | cd01022e2/397587774 (W15); d76d77dd4 | per transcript |
| DS-12 | [P1] Phase 2 primitives: Masthead, VerdictLine, Row, MetricValue, TemplateSkeleton, KeyboardDoneBar; Stage variant ... | done: Masthead, VerdictLine, Row/RowGroup, TemplateSkeleton, KeyboardDoneBar in fairway/primitives/ (direct-path imports) and Surface variant="stage", each with tests. Adopted: KeyboardDoneBar in FairwayShotEntry (RE-F3; device check still open). Masthead/Row/TemplateSkeleton not yet swapped into screens (no clearly equivalent low-risk site) | 75b90b7a8, 2732b8051, c27406840, acb46b6c2, 069ccf706, f12a8a71b, 1977c31ff | this session |
| DS-13 | [P1] Instruments RoundStrip, TeamField, SignedBars, TargetTrack, SplitStrip | done: TeamField, SignedBars, TargetTrack, SplitStrip built in fairway/charts/ (registry numbers, role=img or real lists, tests); RoundStrip already in modules/ and player-detail/. Not yet placed on a screen: they land with the Game/Plan/Coach Home IA work | 6e00d220f, 96e36974d, b1e86dd41, 101e9812f, 701a16fa2, 9602532df | this session |
| DS-14 | [P2] Lint bans: retired components, font-mono, arbitrary text-[Npx], .toFixed( in render, transition-all, raw ... | done: Registry, parity test, render-bans ratchet; parity todos closed in d76d77dd4 | cd01022e2/397587774 (W15); d76d77dd4 | per transcript |
| DS-15 | [P2] 108 ad-hoc `active:scale` → one Pressable (fwPress 0.97) | partial: Shared fwPress/fwPressSurface exported; golf page sites migrated, 52 to 40 (c7dc95a08); the remaining golf press sites (Baseball-shared golf calendar, MobileMenuButton, AttachmentButton, FairwayTeeCard, FairwayCalendar FAB, demo gate, golf auth canvas/shell/sign-up) migrated in af443ba4f, 32 to 4 in those files. The 4 left are press neutralizers, not presses (`active:scale-100` on the MobileEventSheet backdrop, `disabled:active:scale-100` on three auth submits). Remaining: primitive definitions (_internal.ts, surface.tsx, ui/button, ui/modal), admin CRM, `golf/join/[code]/golf-join-team-client.tsx` (1, outside this slice), shared recruiting/coach-discover, Baseball and Lift Lab | c7dc95a08; af443ba4f | this session |
| DS-16 | [P2] Glossary: one name per concept (Profile, Report, Outcomes, Insights, Focus area); retire Genome/Game ... | not-a-bug: OD-13: keep Genome and Fingerprint names; goal vs focus area unified (OD-10) | - | per transcript |
| DS-D6 | [P2] 147 fixed min-h-[…] dead-space blocks (drill panels 112-132px) | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W11/W12 agents) | per transcript |
| DS-E4 | [P3] Drop shadows on in-flow rows (roster cards, event rows) | done: No elevation shadow on roster cards | FairwayPlayerCard.tsx | verified in code |
| DS-HEX | [P2] Hard-coded hex colour systems in production components (tee swatches, hole hero, putting zoom, button ... | not-a-bug: Owner decision: tee and course colours are real-world data. Consolidated into src/lib/golf/tee-colors.ts and course-illustration-palette.ts, values unchanged (f729cd903) | f729cd903 | this session |
| DS-N6 | [P2] Pill/badge soup (roster 3 pills per card, delta pill on every recent-round row) | done: Row link instead of a primary per card; one meta line | 3e2b51b77; FairwayPlayerCard.tsx | verified in code |
| DS-N7 | [P2] Status dots with no legend (dashboard Latest, roster presence) | done: Dashboard Latest shows "● N new" as the dot key (1f05c10f9) | 1f05c10f9 | this session |
| DS-R1 | [P2] Radii soup: rounded-full 838, fw-md 673, fw-sm 430, xl 148, lg 130 … fw-card 1 | partial: Off-ramp radii ratcheted per file on golf paths (909e18f93); call sites not swept | 909e18f93 | this session |
| DS-R2 | [P2] Sparkles AI iconography in 24 golf/fairway files | done: Sparkles replaced with icons that say what the thing does (7edeca093); admin CRM keeps it | 7edeca093 | this session |
| DS-R3 | [P2] Mono "01-06" ordinals on the Brief lists; zero-value "0 high priority" noise | done: Plain index numbers; no zero-count noise | TeamSignalSummary.tsx, EffectivenessScoreboard.tsx | verified in code |
| DS-R4 | [P2] Tasks "QUICK STATS" tiles duplicate the filter-chip counts | blocked: Needs a live check to find the source | tasks quick stats | per transcript |
| DS-THEMECOLOR | [P2] theme-color meta drifts from the dark canvas token | done: Already DONE in the ledger; native parts need a new build | native shell agent a93750 (cd01022e2) | per transcript |

### CON (12)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| CON-01 | [P1] CONTRAST tokens (light): raise text-secondary (warm-600), text-tertiary (0.535 L), hairline/border and accent ... | done: Token level; enforced by fairway-token-contrast.test.ts and lint | 397587774 (W1) | per transcript |
| CON-02 | [P1] CONTRAST tokens (dark): the same on dark cream; tertiary on surface-tint 4.41:1 (D4); golden-700 2.92:1 on ... | done: Token level; enforced by fairway-token-contrast.test.ts and lint | 397587774 (W1) | per transcript |
| CON-03 | [P1] GREEN becomes the contrasting colour: headings/verdicts, key numbers, active states, selected segments ... | done: Token level; enforced by fairway-token-contrast.test.ts and lint | 397587774 (W1) | per transcript |
| CON-04 | [P1] Sweep about 230 (now 261) low-contrast class uses: text-primary-600 70, text-accent-600 84 (as body text) ... | done: Token level; enforced by fairway-token-contrast.test.ts and lint | 397587774 (W1) | per transcript |
| CON-05 | [P2] White on #16a34a CTAs 3.29:1 (demo CTA, onboarding Done, 61 bg-primary-600 uses) | done: Token level; enforced by fairway-token-contrast.test.ts and lint | 397587774 (W1) | per transcript |
| CON-06 | [P2] text-primary-600 links on the translucent cream card (signup, demo, coach/pending) | done: Token level; enforced by fairway-token-contrast.test.ts and lint | 397587774 (W1) | per transcript |
| CON-07 | [P2] golden-* scale and Tailwind success/warning/danger/info are theme-blind hex | done: No golden-* on golf paths; last raw status colours moved to fw tokens (725a49fb6) | 725a49fb6 | this session |
| CON-08 | [P2] Chart non-text contrast fails 3:1: viz-seq-5 amber, viz-div-neg, the pgaTour reference line | done: Token level; enforced by fairway-token-contrast.test.ts and lint | 397587774 (W1) | per transcript |
| CON-09 | [P2] No guard against regressions: lint ban on failing classes plus a token contrast test | done: Token level; enforced by fairway-token-contrast.test.ts and lint | 397587774 (W1) | per transcript |
| CON-10 | [P1] Live contrast pass (cc.mjs background-resolving; axe incomplete on gradient cards) never ran | blocked: Live WCAG after-pass never ran (dev server down, then signed out) | live contrast pass | per transcript |
| CON-11 | [P1] Owner's Calendar screenshot (iPhone light): header, Calendar/Travel tabs, Day/Week/Month/Agenda segmented ... | done: Calendar fixed in code; not live-verified | 397587774 (W1) | per transcript |
| CON-12 | [P2] Checklist items graded on contrast/colour that the green decision changes: E1 (one accent, one neutral ramp) ... | partial: E7 passes at token level; E1/E5/I8 re-grade on screen not done | W1 | per transcript |

### DARK (5)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| DARK-01 | [P1] Native cold start is cream for dark-mode users (WebView bg, splash, storyboard) | done: Android splash now #F2E6D2; needs a native build | android styles.xml, splash.xml, capacitor.config.ts | verified in code |
| DARK-02 | [P3] Signed-out screens (login/signup/demo) always light; hard-white inputs | done: OD-07: auth screens follow the system theme | 3e2b51b77; ThemeScript.tsx | per transcript |
| DARK-03 | [P2] Recent Rounds avatar fallback disc near-black on the dark card; Cole's avatar blank in both themes (no ... | done: Checked in code: avatar fallback uses surface-sunken + ring + initials, and falls back on image error | avatar.tsx | this session |
| DARK-04 | [P2] Coach Performance Trend chart shows no series in either theme; y-domain 20-100 | done: Checked in code: missing series was the draw-on animation (off, b72b7ef2c) and the 0-based domain (data-fitted, CHART-R1) | b72b7ef2c | this session |
| DARK-05 | [P3] Legacy PremiumCalendarClient hard-coded cream glass and #374151 | not-a-bug: Golf no longer renders it; Baseball-only file, frozen by OD-17 | PremiumCalendarClient | per transcript |

### A11Y (15)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| A11Y-01 | [P2] KPI value/delta/caption unlabelled fragments with no units; scores without units ("37 −35", "21 rd", "−13.4") | done: One spoken label per KPI | MetricCard.tsx:355-369 | verified in code |
| A11Y-02 | [P3] Loading fallbacks wrap the whole skeleton (with a real h1) in role=status | done: W13 results file | 397587774 (W13) | per transcript |
| A11Y-03 | [P3] InlineNotice info/success are always role=status even when static | done: role=status only when live | InlineNotice.tsx:46,85,96 | verified in code |
| A11Y-04 | [P3] Roster heading skip h1 → h3; coach dashboard h3 under a region | done: W13 results file | 397587774 (W13) | per transcript |
| A11Y-05 | [P3] Invite-code button named only by the code | done: W13 results file | 397587774 (W13) | per transcript |
| A11Y-06 | [P2] Game pressure map has no text/table alternative | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W11/W12 agents) | per transcript |
| A11Y-R1 | [P2] Documents card is a div[role=button] containing nested buttons | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| A11Y-R2 | [P2] What's New: aria-live on a freshness line that ticks every 30s, so it re-announces forever | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| A11Y-R3 | [P1] Tasks: template row div[role=button] wraps Edit/Delete buttons; pressing Enter on Edit also fires ... | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| A11Y-R4 | [P2] SignalQueue: group-header button is a direct child of role=listbox | done: role=group per section | SignalQueue.tsx:200 | verified in code |
| A11Y-R5 | [P2] StageRouter: aria-live on the whole stage announces entire drills | done: Already DONE in the ledger | before ledger stamp | per transcript |
| A11Y-R6 | [P3] PlayerCoachHelmNav: aria-current="page" on in-page view tabs | done: aria-current=true, not page | PlayerCoachHelmNav.tsx:101 | verified in code |
| A11Y-R7 | [P3] /intelligence: the only h1 lives in CommandOpening, which is null without chat context | done: sr-only h1 | CoachIntelligenceHome.tsx:111 | verified in code |
| A11Y-R8 | [P3] DrillPanel title is a span, not a heading | done: No card chrome; title is an h2 | DrillPanel.tsx:47 | verified in code |
| A11Y-R9 | [P2] BentoCell: aria-label replaces the content (number not read); block elements inside a button | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W9) | per transcript |

### HYD (15)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| HYD-01 | [P0] Messages: sessionStorage cache read inside useState initializer causes an SSR/client hydration mismatch (#418) | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| HYD-02 | [P0] What's New: day buckets use the runtime-local timezone, not the `tz` prop, so SSR and client disagree near ... | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| HYD-03 | [P2] Team settings/info: toLocaleDateString(undefined) rendered with no timezone and no mount gate | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| HYD-04 | [P2] Documents: `timeAgo` calls `new Date()` at render with no mount gate | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| HYD-05 | [P3] Date formatting without a timezone: message day separator, semester-start ISO off-by-one, course last-edited | done: One site fixed; the other sites checked and judged fine by W4 | 397587774 (W4) | per transcript |
| HYD-06 | [P2] Tasks: is_overdue parses the date-only due_date with new Date() (UTC), so the overdue banner can disagree ... | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| HYD-07 | [P2] New qualifier: `today` is computed by useMemo during SSR, giving a mismatched date-input `min` attribute | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| HYD-08 | [P1] Welcome greeting uses the SSR server's local hour, so the greeting text mismatches after hydration | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| HYD-09 | [P1] Roster player profile: memberSince toLocaleDateString without a timezone in an SSR'd client component (#418 ... | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W9) | per transcript |
| HYD-10 | [P0] TriageDesk "Last scan Xm ago" is computed from the clock during render (minute-granular), causing a #418 ... | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W11/W12 agents) | per transcript |
| HYD-11 | [P1] FocusAreaCard: completed/lastPracticed/started dates formatted without a timezone | done: Dates format after mount | FocusAreaCard.tsx LocalShortDate | verified in code |
| HYD-12 | [P3] CommandOpening relativeDays uses Date.now() in render | done: Mount-gated relative date | CommandOpening.tsx:159-165 | verified in code |
| HYD-13 | [P3] Rounds/Scoring drills: round dates formatted without timeZone:'UTC' | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| HYD-14 | [P3] NotificationBell swaps Sheet→Popover after hydration on desktop | not-a-bug: Lead: useSyncExternalStore media query is hydration-safe | NotificationBell.tsx | per transcript |
| HYD-15 | [P3] player-dashboard-parts toLocaleTimeString with a possibly-undefined timeZone; UnfinishedBanner Date.now() in ... | done: Relative time uses a now value set after mount | FairwayUnfinishedBanner.tsx | per transcript |

### DATA (16)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| DATA-01 | [P1] Messages: desktop auto-select of the first thread marks it read without the user looking | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| DATA-02 | [P1] Classes: a thrown calendar sync is swallowed by the modal catch, so re-submitting creates a duplicate class | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| DATA-03 | [P1] Travel: mark-seen fires on mount with no .catch (unhandled rejection) | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| DATA-04 | [P0] Round detail runs an LLM recap and DB writes during RSC render; the "No writes" comment is false; Link ... | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| DATA-05 | [P1] Round review auto-generates and stores a review on mount, with no user action | done: Owner chose the idempotency guard; auto-generate kept | 3e2b51b77; round-review-system.ts ifMissing | per transcript |
| DATA-06 | [P2] Edit qualifier: two sequential writes with no rollback, and the error message hides the partial save | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| DATA-07 | [P3] Edit qualifier: clearing Rounds silently saves 1 round (the create form requires confirmation) | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| DATA-08 | [P1] Notification settings: a failed toggle rolls back the whole prefs snapshot, wiping concurrent toggles | done: W5 results file, with tests | 397587774 (W5) | per transcript |
| DATA-09 | [P1] Notification settings: bulk mute/reset leaves per-row switches enabled (blind upsert vs CAS race) | done: W5 results file, with tests | 397587774 (W5) | per transcript |
| DATA-10 | [P2] PriorityRanker: an inline `values` literal resets local drag order on every parent render | done: W5 results file, with tests | 397587774 (W5) | per transcript |
| DATA-11 | [P2] useCoachPhilosophy.save() has no overlap guard; an out-of-order response reverts a newer edit | done: W5 results file, with tests | 397587774 (W5) | per transcript |
| DATA-12 | [P1] TriageDesk dismiss: the optimistic rollback restores a stale snapshot, resurrecting a signal the server ... | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W11/W12 agents) | per transcript |
| DATA-13 | [P1] WhatIfPanel.handleSimulate has no catch, so a failed simulation is silent and the rejection unhandled | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W11/W12 agents) | per transcript |
| DATA-14 | [P2] Player hub Helpful/Dismiss: no pending/disabled state; a double tap sends 2 ratings and 2 refreshes | done: In-flight guard on ratings | PlayerCoachHelmHome.tsx:214 | verified in code |
| DATA-15 | [P2] coachhelm/chat?q=… auto-submits the question on load (paid LLM call plus a conversation insert from a URL) | done: Bare ?q= only pre-fills; Brief to Ask uses a one-time hand-off token | 397587774 (W4); ask-handoff.ts | per transcript |
| DATA-16 | [P3] About 12 routes (plus redirect shims) insert golf_insight_exposure on render; the game route double-logs ... | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W11/W12 agents) | per transcript |

### STATE (11)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| STATE-01 | [P2] Stats cold-start copy "More rounds needed / Log 5+" is shown at exactly 0 rounds | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W9) | per transcript |
| STATE-02 | [P2] Coach view of a 0-round player: player-directed copy with no action; three surface links lead to empty pages | done: Coach-facing 0-round state with one Message action | player-detail (PD-01) | per transcript |
| STATE-03 | [P3] 1-4 rounds: KPI secondary row shows four bare "-" with no reason; VoiceOver reads "dash" | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W9) | per transcript |
| STATE-04 | [P3] Onboarding completion page uses the legacy text-2xl/primary idiom, not Fairway | done: Onboarding headings use the display role; legacy gradients removed (d5a4fed15) | d5a4fed15 | this session |
| STATE-05 | [P3] Welcome auto-advances after about 1.9s with no pause control | done: Owner chose tap to continue; no auto-advance | 3e2b51b77; (auth)/welcome/page.tsx | per transcript |
| STATE-O1 | [P2] Onboarding submit-failure banners are plain `<p>` (no role=alert, not linked to a field) | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| STATE-O2 | [P2] Onboarding: no focus move on step change or error; no field-level validation | done: Required fields are marked inline with aria-invalid and focus moves to the first (26a0086c2) | 26a0086c2 | this session |
| STATE-O3 | [P3] Coach onboarding "Go to Dashboard" lands on an empty dashboard with no roster/invite next step | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| STATE-O4 | [P2] Player CoachHelm with 0 rounds stacks a 5-metric dash-soup snapshot tile (no gating) | done: Empty snapshot gated | PlayerHomeBento.tsx:100 | verified in code |
| STATE-R1 | [P2] Coach player-game repeats the same "No insights in this area" empty per section | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W11/W12 agents) | per transcript |
| STATE-X1 | [P2] not-found, error and loading for every segment | done: Loading debt is zero (304c65258); golf 404 outside the shell (c17a78f72); dashboard 404 in-shell | 304c65258, c17a78f72 | this session |

### SHEET (9)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| SHEET-01 | [P1] "Set a goal" sheet: Escape doesn't close it; see-through glass; no grabber; blank band above | done: Already DONE in the ledger | before ledger stamp (a5e672 overlay fix) | per transcript |
| SHEET-02 | [P1] Focus doesn't move into dialogs (More, Log progress, calendar event, Sort documents, Set a goal); focus not ... | done: Already DONE in the ledger | before ledger stamp (a5e672 overlay fix) | per transcript |
| SHEET-03 | [P2] Sheet bodies need overscroll-behavior: contain once bounce is on | done: Already DONE in the ledger | before ledger stamp (a5e672 overlay fix) | per transcript |
| SHEET-04 | [P2] New focus area modal is a floating near-full-height card (no grabber) with a disabled-green primary above ... | done: Sheet form plus weakest-SG preselect per owner | 3e2b51b77; FocusAreaModal.tsx:196 | verified in code |
| SHEET-05 | [P2] Single-tap writes with no confirm or undo: "Reopen" completed focus area, profile "Make focus area" | done: Undo on Reopen | DevelopmentDrill.tsx:474-517 | verified in code |
| SHEET-06 | [P2] Profile view "Genome" and "Make focus area" taps do nothing visible (dead or a silent state change) | blocked: Needs a live check | profile view taps | per transcript |
| SHEET-07 | [P2] Hand-built useFocusTrap dialogs not migrated (command palettes, CRM modals, golf/calendar/EventDetailModal ... | partial: Golf parts done; the rest is Baseball-only or dead code (OD-17) | 397587774 (W3) | per transcript |
| SHEET-08 | [P2] Glass/blurred hand-built dialogs untouched: ui/modal.tsx, golf/calendar/MobileEventSheet.tsx ... | partial: Golf parts done; the rest is Baseball-only or dead code (OD-17) | 397587774 (W3) | per transcript |
| SHEET-09 | [P2] ui/drawer keeps a light-only surface-stone background (dark title text would break on bg-surface); ui/dialog ... | partial: Golf parts done; the rest is Baseball-only or dead code (OD-17) | 397587774 (W3) | per transcript |

### PERF (27)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| PERF-01 | [P0] CAPACITY: the app degrades at about 10 concurrent users on dashboard pages (dashboard/coachhelm didn't finish ... | partial: Code fixes done; capacity under load not re-measured | notification-badge-context.tsx; use-presence.ts | per transcript |
| PERF-02 | [P1] Proposed indexes: notifications(user_id) WHERE read=false; golf_calendar_notifications(user_id ... | done: Indexes already in prod (pg_indexes check); no migration | - | per transcript |
| PERF-03 | [P1] Player dashboard: 5 page-level server actions serialized behind the badge POST (conversation ids, unified ... | done: Latest seeded from the server; Messages allow-list fetched with the rail RPC | b70de2c35, 30975fce6 | per transcript |
| PERF-04 | [P1] Dev-server timings (TTFB 6-13s on :3217) are not valid prod latency; prod before/after is unmeasured | blocked: Measurement only; needs a live run | prod-like build | per transcript |
| PERF-05 | [P2] LastSeenUpdater writes on every shell mount | done: Golf uses the presence heartbeat only | FairwayDashboardShell.tsx | per transcript |
| PERF-06 | [P2] CLS > 0.1: coach dashboard mobile 0.102, /team small 0.175 | blocked: CLS needs a live run | coach dashboard, /team | per transcript |
| PERF-07 | [P2] /api/health returned 503 during genome loads; Sentry /monitoring tunnel 429 | blocked: Measurement only; needs a live run | prod-like build | per transcript |
| PERF-08 | [P2] Safari "Failed to fetch RSC payload … falling back to browser navigation" on player /dashboard (full reload = ... | blocked: Needs a device/network check | WKWebView | per transcript |
| PERF-09 | [P2] ChunkLoadError on coach /roster after a deploy → error boundary; check the stale-chunk recovery path | done: Regrade upgraded to DONE | cd01022e2 / 397587774 | per transcript |
| PERF-10 | [P2] Bad-network/slow-CPU audit (Slow 4G, 3G+4x CPU): per-route TTFB/FCP/LCP/CLS, skeleton time, filmstrips ... | blocked: Measurement only; needs a live run | prod-like build | per transcript |
| PERF-11 | [P2] Route CSS 487KB decoded (6 stylesheets); globals.css ~3.2k lines carry marketing/baseball/legacy | residual: No per-surface CSS split | globals.css (3,360 lines) | verified in code |
| PERF-12 | [P2] Blur on a sticky scrolling surface (WeekView) | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| PERF-13 | [P3] 23 raw img, only 3 lazy | done: loading=lazy on avatar images; message and receipt images not re-checked | avatar img tags | per transcript |
| PERF-R1 | [P3] Qualifiers page: serial session then createClient awaits; static skeletons use index keys | done: W13 results file | 397587774 (W13) | per transcript |
| PERF-R2 | [P1] Coaching-intelligence settings: createClient() in the render body is an effect dependency, so it refetches on ... | done: W5 results file, with tests | 397587774 (W5) | per transcript |
| PERF-R3 | [P1] StatsSpineStage.loadAll has no stale-response guard (rapid scope switches race) | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W9) | per transcript |
| PERF-R4 | [P2] Roster player stats load client-side after SSR (waterfall; the 8-read bundle starts after hydration) | done: Roster player page loads on the server | player-detail/loadPlayerDetail.ts (PD-01) | per transcript |
| PERF-R5 | [P2] Genome page: loadGenome, focus areas and alert counts awaited serially | done: Already DONE in the ledger | before ledger stamp | per transcript |
| PERF-R6 | [P2] roster/[id]: player query then resolveCoachTeamId run serially | done: Promise.all | roster/[id]/page.tsx:61 | verified in code |
| PERF-R7 | [P2] /intelligence: about 8 serial server round-trips | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W11/W12 agents) | per transcript |
| PERF-R8 | [P2] /coachhelm: about 11 serial awaits, and every view's data fetched on every request | not-a-bug: Lead: not gated because stage views switch client-side | coachhelm/page.tsx | per transcript |
| PERF-R9 | [P2] Player /stats: client-side fetch waterfall after hydration (about 5s to data) | done: Already DONE in the ledger | before ledger stamp | per transcript |
| PERF-R10 | [P2] stats-dashboard bundle waits for the slowest of 8 reads (15s cap) | done: Critical/deferred split in stats-dashboard.ts | 0f9d8ba36, 1f75410ba | verified in code |
| PERF-R11 | [P2] Coach /stats ?player= switch: loadAll runs twice (old scope, then overall) | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W9) | per transcript |
| PERF-R12 | [P2] /stats/team: serial chain, hole batches fetched in a for-loop | done: W13 results file | 397587774 (W13) | per transcript |
| PERF-R13 | [P3] LastSeenUpdater writes last_seen on every shell mount (duplicates the presence heartbeat) | done: Golf uses the presence heartbeat only | FairwayDashboardShell.tsx | per transcript |
| PERF-X1 | [P1] Coach /players/[id]/game never rendered in 150s on prod (stuck on loading.tsx) | done: One Promise.all plus streaming; prod render time not measured | game/page.tsx | per transcript |

### QA (11)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| QA-GATE1 | [P1] scripts/__tests__/no-stale-cream-hardcodes.test.mjs fails (exit 1): demo/page.tsx and Lift Lab auth pages ... | done: Token level; enforced by fairway-token-contrast.test.ts and lint | 397587774 (W1) | per transcript |
| QA-R1 | [P3] Index keys: AddClassModal conflicts, ChatThread parts, FairwayHoleHero landings | done: One site fixed; the other sites checked and judged fine by W4 | 397587774 (W4) | per transcript |
| QA-R2 | [P3] `{credits && …}` renders a literal 0 | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| QA-R3 | [P3] Sign-in/up: a fixed 100-150ms sleep after router.refresh() before navigating | residual: 100/150ms sleep after router.refresh() still present; needs a live sign-in check | golf-sign-in-form.tsx:207; golf-sign-up-form.tsx:197 | verified in code |
| QA-R4 | [P3] Demo page: redundant manual aria-describedby | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| QA-R5 | [P3] CoachHelmShell `role` prop collides with ARIA role; eslint-disable at every call site | done: viewerRole prop | CoachHelmShell.tsx:73 | verified in code |
| QA-R6 | [P3] TriageDesk: stale comment claims router.replace re-runs the server page (it's a shallow replaceState) | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W11/W12 agents) | per transcript |
| QA-R7 | [P3] TeamSignalSummary: hard-coded SVG pattern id (duplicate ids if mounted twice) | done: useId pattern | TeamSignalSummary.tsx:248 | verified in code |
| QA-R8 | [P3] (dashboard)/error.tsx tags itself GolfDashboardLayout (misattributed telemetry) | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| QA-R9 | [P3] CoachHelmShell breadcrumb key={i}; calendar dead filter | done: Stable breadcrumb key | CoachHelmShell.tsx:180 | verified in code |
| QA-TITLE | [P2] Mixed document titles: root template appends "/ Helm Sports Labs" to titles that already carry one of 4 brand ... | done: Golf titles end in one "· GolfHelm" | src/app/golf/layout.tsx:15 | verified in code |

### FP (12)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| FP-01 | [P1] Game Fingerprint redesign: large title + verdict + derivation line; stage (StrokesWaterfall / SprayField / ... | done: Agent report; typecheck and tests passed | fingerprint agent ad0a60 (cd01022e2) | per transcript |
| FP-02 | [P1] Fingerprint tells: cards four deep (about 25ch column); hover-lift on static panels; decorative 01-06 ... | done: Agent report; typecheck and tests passed | fingerprint agent ad0a60 (cd01022e2) | per transcript |
| FP-03 | [P1] Coach-voiced copy shown to the player ("have the player call the carry number") | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W11/W12 agents) | per transcript |
| FP-04 | [P1] Fabricated category ratings on coach /game: short game = average of the other three; categories default to 50 | done: Agent report; typecheck and tests passed | fingerprint agent ad0a60 (cd01022e2) | per transcript |
| FP-05 | [P2] Putting bars coerce a null band to 0% | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W11/W12 agents) | per transcript |
| FP-06 | [P2] Number-parity contract test (composite, pressure, scrambling, no 15-20/20+ band, partial round affects ... | done: Registry, parity test, render-bans ratchet; parity todos closed in d76d77dd4 | cd01022e2/397587774 (W15); d76d77dd4 | per transcript |
| FP-07 | [P2] Profile drill chrome: `bare` DrillPanel/ChartFrame; sticky translucent PlayerCoachHelmNav; remove ... | done: bg-canvas-gradient dropped | coachhelm/page.tsx | verified in code |
| FP-08 | [P3] Print reads the Fingerprint view model | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W11/W12 agents) | per transcript |
| FP-09 | [P2] Fingerprint has no scope switch (last 5 / last 10 / all); the data layer returns one window | done: Graded DONE in the 12:20 regrade | cd01022e2 / 397587774 (W11/W12 agents) | per transcript |
| FP-10 | [P2] Two SG baselines on one screen: the waterfall uses the stats-cache baseline and the ladder uses the ... | done: OD-12: stats-cache baseline everywhere | c6b0d98e4; stats-cache-baseline.ts | per transcript |
| FP-11 | [P2] Fingerprint visual verification is incomplete: the last 3 fixes are not screenshotted; no 1440 dark or player ... | blocked: Screenshots at 1440 dark and player mode never taken | players/[id]/game | per transcript |
| FP-12 | [P3] Fingerprint desktop nits: the CoachHelm FAB covers the 200-225 ladder row at 1440; the miss compass is small ... | done: Greener meters, scaled compass; FAB clearance predates the audit | cd4be3a72 | per transcript |

### GN (1)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| GN-01 | [P1] Genome redesign: strands/ledger/tendencies; radar removed; coach detail + compare same anatomy; gauge needle ... | done: Genome rebuilt; Form score shown | genome agent a8da21; f287a182c | per transcript |

### SC (1)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| SC-01 | [P1] Scouting report redesign (coach ?tab=scouting): composite → derivation line; claim visuals | done: ScoutingReport swapped into the tab | scouting agent ac3d53 (cd01022e2) | per transcript |

### PD (2)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| PD-01 | [P1] Coach player detail (roster/[id]) redesign: RoundStrip, mini previews, actions menu, summary sheet, skeleton | done: New roster player page | player-detail agent a5518c (cd01022e2) | per transcript |
| PD-02 | [P3] Player detail leftovers: retake light 390 and the round sheet on a warm server; 320 check; waterfall reading ... | blocked: Screenshot pass on a warm server not done | roster/[id] | per transcript |

### DD (1)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| DD-01 | [P1] Deep dive: DistanceLadder (approach-only, labelled shot-level SG); what-if never projects from a missing ... | done: One scroll, DistanceLadder, no Dial or red fills | 0e32d62e5; DistanceLadder.tsx | verified in code |

### CHART (2)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| CHART-R1 | [P2] Y ticks "100.0, 80.0…" decimals on integer ticks (coach Performance Trend) | done: W13 results file | 397587774 (W13) | per transcript |
| CHART-R2 | [P2] Team SG diverging bar category labels truncate ("Off …/Appr…"), value overlaps label | done: Tornado value labels flip across zero when there is no room (783f47cfe) | 783f47cfe | this session |

### COPY (5)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| COPY-01 | [P3] Exclamation points in toasts and banners | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |
| COPY-02 | [P2] Em dashes >1 per screen (player dashboard has 5) | done: AST sweep of rendered golf copy | d3d1a5f6e, f3ef34de2 | per transcript |
| COPY-03 | [P2] Over-explaining helper text stacks (Team Stats subtitle + cache meta before data) | done: Engine and notification copy rewritten by hand (b784c9f41, 580253ced). Stored insights refresh on regeneration | b784c9f41, 580253ced | this session |
| COPY-04 | [P3] Glued units `{ft}ft` | done: W6 results file, with tests | 397587774 (W6) | per transcript |
| COPY-05 | [P3] Instruction placeholders ("Enter your password") | done: W4 results file | cd01022e2 / 397587774 (W4) | per transcript |

### AUTH (2)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| AUTH-01 | [P3] Auth illustration: remove it (helm mark only), or keep | done: OD-15: keep the illustration, better card and scene | 3e2b51b77; golf-auth-canvas.tsx | per transcript |
| AUTH-02 | [P2] Login redesign leftovers: keyboard lift untested on device; reset-password still on the old card+illustration ... | done: Reset-password on the new design; keyboard lift not checked on a device | 397587774; reset-password page | per transcript |

### DOC (1)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| DOC-01 | [P3] memory/features/ios-native-shell.md lacks the accessory-bar behaviour (installNumericAccessoryBar) | done: Regrade upgraded to DONE | cd01022e2 / 397587774 | per transcript |

### LAYOUT (1)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| LAYOUT-01 | [P2] At 320px the roster attention list truncates names to 4 letters and status overlaps the action | done: W13 results file | 397587774 (W13) | per transcript |

### AN (1)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| AN-OQ | [P2] A2/A3 distance surfaces flag-off and coach-only; most new insight output dark in prod ... | blocked: Parity test now passes; turning the flags on is an owner decision | feature-flags.yml | per transcript |

### K1 (1)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| K1-GREEN | [P2] coachhelm/loading.tsx draws a green gradient band (brand shimmer, not shape-matched) | done: Green gradient rail removed (the rest of the loading rewrite is HUB-20) | coachhelm/loading.tsx | verified in code |

### X (2)

| ID | Finding (short) | Status | Where (commit or file) | Evidence |
|---|---|---|---|---|
| X-1933 | [P1] PR #1933 (frost-facelift, LANGUAGE.md) owns many of the same files; cherry-pick its primitives, supersede its ... | not-a-bug: OD-16: leave PR #1933 alone, no cherry-pick | - | per transcript |
| X-SPORTS | [P3] Other sports (Baseball, Lift Lab) share the Phase 1 global fixes only | done: OD-17: golf-only scoping | ThemeScript golf marker; LEGACY_SPORT_TOKENS_CSS | per transcript |

## Owner decisions

| Status | Count |
|---|---|
| done | 20 |
| residual | 1 |
| blocked | 2 |
| not-a-bug | 1 |

| ID | Decision | Status | Where | Evidence |
|---|---|---|---|---|
| OD-01 | Ship the DB-side countable-round rule (stats-cache trigger ... | blocked: Migration written and HELD; owner applies | supabase/migrations/20260924120000_golf_countable_round_stats_cache.sql | per transcript |
| OD-02 | Replace "Overall game 100" (Fingerprint) and "Game strength 57" (Genome) with one score? | done: One Form score | f287a182c; form-score.ts | per transcript |
| OD-03 | Clean demo/QA data visible to prospects (QA courses, the 60824 qualifiers, duplicate demo team ... | blocked: Flag migration HELD; read-path filters are a follow-up | supabase/migrations/20260924130000_golf_is_test_flag.sql | per transcript |
| OD-04 | Qualifier standings rule and tie-break | done: Keep the current qualifier rule (no change) | - | per transcript |
| OD-05 | Add a quick score mode (about 20 taps per par-4 today)? | residual: Quick score mode approved; not started | follow-up PR | per transcript |
| OD-06 | Dynamic Type scope | done: Dynamic Type for reading text, capped XXL | cd4be3a72 | per transcript |
| OD-07 | Signed-out screens in dark mode? | done: Auth follows the system theme | ThemeScript.tsx | per transcript |
| OD-08 | Remove the SG radar and insight teaser from player Home? | done: Radar and teaser removed from Home | FairwayPlayerDashboard.tsx | per transcript |
| OD-09 | Hide wide prediction bands | done: Bands over 8 strokes hidden | insight-composer.ts:23 | verified in code |
| OD-10 | "Goal" vs "focus area" | done: One noun: focus area; targets named as targets | 54599c478 | per transcript |
| OD-11 | Keep Game Profile and Deep dive in the hub tab strip, or move them to the overflow menu? | done: Keep Game Profile and Deep dive in the strip | - | per transcript |
| OD-12 | Analysis flags and the canonical SG baseline | done: Stats-cache baseline everywhere | c6b0d98e4 | per transcript |
| OD-13 | Glossary: one name per concept (Profile, Report, Outcomes, Insights, Focus area); retire Genome / ... | done: Keep Genome and Fingerprint names | - | per transcript |
| OD-14 | Tab IA. Player: Home · Rounds · Game · Plan · Team. Coach: Home · Players · CoachHelm · Schedule · ... | done: Both tab IAs adopted | nav-registry.ts | per transcript |
| OD-15 | Auth illustration: remove it (helm mark only) or keep it? | done: Keep the illustration; better card | 3e2b51b77 | per transcript |
| OD-16 | PR #1933 (frost facelift) overlaps these files | done: Leave #1933 alone | - | per transcript |
| OD-17 | Do Baseball and Lift Lab get the redesign? | done: Baseball and Lift Lab frozen | golf scoping | per transcript |
| OD-18 | Production indexes on notifications, golf_calendar_notifications and golf_team_members (partial) | done: EXPLAIN done; indexes already exist | - | per transcript |
| OD-19 | Round-entry plausibility thresholds: confirm above 400 yd, block above 500 yd, score cap ... | not-a-bug: Thresholds kept as recommended; no recorded owner sign-off | round-entry-validation.ts | per transcript |
| OD-20 | Nav bar: translucent (iOS glass) or opaque cream with a scroll hairline? | done: Opaque bar plus scroll hairline | FairwayTopBar.tsx | per transcript |
| OD-21 | Player Undo after "Add to focus area" (MOT-19)? | done: No. Keep the confirm step; no new player delete path | owner, 2026-09-24 | this session |
| OD-22 | Overdue tasks on the Calendar? | done: A pinned "N overdue tasks" row at the top of the agenda, linking to Tasks (7a9ce3700) | FairwayAgendaView.tsx | this session |
| OD-23 | Tee and course colours: tokenise or real-world data (DS-HEX)? | done: Real-world data; consolidated into two named modules (f729cd903) | src/lib/golf/tee-colors.ts | this session |
| OD-24 | Hole-swipe pager (RE-D1/MOT-20) in this PR? | done: No. Its own PR with a device test, alongside OD-05 quick score | follow-up PR | this session |

## Workstreams

| ID | Workstream | Status | Open items |
|---|---|---|---|
| W1 | Contrast and green accent | done | CON-10 live pass never ran; CON-12 partial; DS-HEX closed by OD-23 |
| W2 | Reduced motion and haptics primitives | partial | MOT-12 residual (route slide re-scoped); MOT-21 specs written, not run green |
| W3 | Sheets and overlays | done | Golf done; SHEET-07/08/09 rest is Baseball-only; SHEET-06 needs a live check |
| W4 | Hydration, timezone and data races | done | QA-R3 residual (needs a live sign-in check) |
| W5 | Settings | partial | All rows done except NAT-07 (Settings rebuild follow-up PR) |
| W6 | Round entry | partial | RE-D1/MOT-20 pager and RE-F7 quick score in a follow-up PR (OD-05, OD-24); RE-F3/F8/F12/P4 need a device |
| W7 | Shell, tab bar, titles, 404, native bridge | done | New iOS/Android build needed for the native pieces (Swift parse-checked only) |
| W8 | Type scale, eyebrows, cards, design-system tells | partial | TYPE-03 and DS-R1 ratcheted per file, sweep not finished; PERF-11 residual |
| W9 | Player Dashboard, Rounds and Stats | partial | DASH-12 field sheet not built |
| W10 | CoachHelm hub (player side) | done | Hub rebuilt as a feed (894cfab86); Overview HubInsight still shows Helpful/Dismiss |
| W11 | Coach intelligence and triage | done | - |
| W12 | Deep dive and analysis follow-ups | done | DD-01, NUM-31, FP-12 done; FP-11 screenshots blocked |
| W13 | Coach numbers, qualifiers and team stats | partial | OD-01 and NUM-24 migrations held (apply OD-01 first); SQL team percentile floor is still 3 vs 5 in TS |
| W14 | Perf leftovers | done | PERF-R10 and PERF-03 done; PERF-01 capacity and live timings not re-measured |
| W15 | Formatting registry and parity tests | partial | DS-12, DS-13, DS-15 partial |

## IDs in the transcript that are not findings

| ID | What it is |
|---|---|
| BYZ-38 | Storyboard view-controller id in LaunchScreen/Main storyboard XML (BYZ-38-t0r) |
| DS-4 | Code comment in round-review-system.ts from an older review; not a ledger row |
| FID-5 | Code comment (render-time clamp on strokes_impact) from an older audit |
| UI-2 | Code comment from the 2026-09-02 mobile audit (scroll landing) |
| UI-3 | Code comment from the 2026-09-02 mobile audit (scroll landing) |
| UI-7 | Code comment from the 2026-09-02 mobile audit (label clip) |
| UI-11 | Test id in mobile-audit-2026-09-02.test.ts; copy updated to "Not synced · retrying" (see RE-F18) |
| NAV-03 | Example ID in the ledger-compile prompt; no finding |
| RE-05 | Example ID in the ledger-compile prompt; no finding |
| OD-3 | Design-direction doc numbering; maps to OD-13 / DS-16 |
| OD-4 | Design-direction doc numbering (Scouting composite); maps to OD-02 |
| W0, W22, W42, W69 | Grep noise (not workstreams) |

## Notes for the next pass

- **RE-D1 / MOT-20.** The lead's status says the hole-swipe pager is not built. `useHoleSwipe.ts` exists and is wired at `FairwayShotTracking.tsx:542`: touch swipe between holes, 20pt edge guard, selection haptic. What is missing is a drag pager that shows the next hole while dragging.
- **COPY-03.** The ledger text for this ID (helper-text stacks on Team Stats) was fixed by W13. The lead now uses COPY-03 for the roughly 290 em dashes left in engine and notification copy (88 files).
- **DASH-16.** Only the badge part is done. The empty agenda after one event and the overdue task missing from the calendar were never addressed.
- **RE-V3 / OD-19.** The thresholds are kept as recommended, but no owner sign-off is recorded.
- **Native build.** DARK-01, NAT-01, NAT-02 and MOT-13 need a new iOS/Android build. The Swift change was only parsed, not built in Xcode.
- **Held migrations.** OD-01 (`20260924120000_golf_countable_round_stats_cache.sql`) and OD-03 (`20260924130000_golf_is_test_flag.sql`) are HELD in `supabase/migrations/HELD.md`.
