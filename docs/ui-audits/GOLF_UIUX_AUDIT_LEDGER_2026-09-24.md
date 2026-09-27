# GolfHelm UI/UX audit ledger (rebuilt 2026-09-24)

Branch `agent/ui-ux-audit-fa093f`, PR #2069 (draft). Graded at HEAD `ab1bfd32a`.

The original `MASTER-LEDGER.md` lived in the session scratchpad and was lost.
This file rebuilds it from:

- the ledger agent transcript (all 364 finding rows, recovered from its write
  calls);
- the fix-agent result files (W1, W3, W4, W5, W6, W13, W15) and the 12:20
  regrade reports (W2, W7-W8, W9-W10, W11-W12-W14);
- the lead's later work (session summaries, commits on the branch, the PR body)
  and the lead's authoritative status list;
- spot checks against the code at `ab1bfd32a`.

Evidence: "verified in code" means a grep or read at `ab1bfd32a` confirmed the
status. "per transcript" means the status comes from an agent report, the
regrade, or the lead, and was not re-checked here.

Status meanings:

- **done**: fixed, or decided and applied.
- **partial**: some of the finding is fixed and the rest is open.
- **residual**: not done and actionable now, including approved follow-up PRs
  that have not started.
- **blocked**: the remaining work waits on something outside the code: a held
  migration, a device or live check, or an owner flag.
- **not-a-bug**: closed with no change, by owner or lead decision.
- **unknown**: no status could be determined.

Work the lead listed that has no ledger ID: the Stats Flight crash fix
(`f3ef34de2`), the frosted Stats hero and avatar-as-More button (`d4731c864`,
`603a7f48e`), the W11 JSDoc on the z-score composite fields (per lead; no commit
identified), and standing bars fitting off-range values (`ab1bfd32a`).

## Summary (364 ledger findings)

Recounted 2026-09-27 (PR #2069) from the rows. DASH-21 moved from blocked to
residual: PR #1933 closed unmerged on 2026-09-27. Since the 09-25 recount,
TYPE-03 went done (35bf8f9a2), and that table was one off on partial (7; the
rows had 8) and on blocked (28; the rows had 27). The 09-25 recount covered the
2026-09-24 afternoon pass plus the 09-25 leftovers (DS-12, DS-13, DS-15, HUB-19,
MOT-21 done; DASH-07, NUM-24 blocked on held migrations; DASH-12 partial).

| Status | Count |
| --- | --- |
| done | 308 |
| partial | 7 |
| residual | 8 |
| blocked | 26 |
| not-a-bug | 15 |
| unknown | 0 |
| **total** | **364** |

Owner decisions (OD-01 to OD-24) and workstreams (W1 to W15) have their own
sections below and are not in these counts.

## Findings by prefix

### DASH (22)

- **DASH-01** · done: Graded DONE in the 12:20 regrade
  - Finding: [P1] Player Home: 8 KPI tiles (~150px each, dead space, trophy icon
    with an empty body) about 4 phone screens ...
  - Where: cd01022e2 / 397587774 (W9)
  - Evidence: per transcript
- **DASH-02** · done: Numbering by position fixed; truncation not re-checked
  - Finding: [P2] Home: focus areas numbered 1,1,2; orphaned chevron; cards
    nested in cards; "Today" task and course names ...
  - Where: FairwayPlayerDashboard.tsx
  - Evidence: per transcript
- **DASH-03** · done: Graded DONE in the 12:20 regrade
  - Finding: [P2] Home: CoachHelm insight card nested 3 deep, values truncated,
    4 stacked actions; duplicate feed item ×2; SG ...
  - Where: cd01022e2 / 397587774 (W9)
  - Evidence: per transcript
- **DASH-04** · done: Graded DONE in the 12:20 regrade
  - Finding: [P1] Scrolled content shows through/over the "Dashboard" top bar
    (InsightCard z-20 without isolate)
  - Where: cd01022e2 / 397587774 (W9)
  - Evidence: per transcript
- **DASH-05** · done: Large-title fade
  - Finding: [P2] Bar says "Dashboard" while the h1 says "Good afternoon, Cole"
    (two titles)
  - Where: 3e2b51b77; FairwayTopBar.tsx
  - Evidence: per transcript
- **DASH-06** · done: No strip under 2 tabs
  - Finding: [P2] Stats: single-tab "Overview" segmented control
  - Where: CoachHelmSubNav.tsx:270
  - Evidence: verified in code
- **DASH-07** · blocked: One scope control and clean names done; QA qualifier
  preset hiding waits on OD-03 (is_test absent in prod 2026-09-25, migration
  HELD)
  - Finding: [P2] Stats: three filter controls before any data; combobox double
    focus ring, blank first row, "(real)" suffix, a ...
  - Where: StatsSpineStage.tsx:505;
    supabase/migrations/20260924130000_golf_is_test_flag.sql
  - Evidence: verified in code
- **DASH-08** · done: Graded DONE in the 12:20 regrade
  - Finding: [P2] Stats skeleton is one grey slab (not shape-matched); sections
    blank mid-scroll
  - Where: cd01022e2 / 397587774 (W9)
  - Evidence: per transcript
- **DASH-09** · done: Registry labels printed as-is; only prose is lowercased
  - Finding: [P3] Lowercased metric in prose (leakLabel.toLowerCase)
  - Where: buildStatsViewModel.ts:272-275
  - Evidence: verified in code
- **DASH-10** · done: Unfinished list capped at 2 with Show N more
  - Finding: [P1] Rounds: triple title (bar + "YOUR ROUNDS" eyebrow + "Your
    rounds." h1); KPI strip + orphan "Scoring trend • ...
  - Where: FairwayUnfinishedBanner.tsx:54
  - Evidence: verified in code
- **DASH-11** · blocked: OD-03 is_test flag held; read paths do not filter yet
  (follow-up)
  - Finding: [P2] Rounds: Pebble Beach ×3 same day with GIR 100% and 37-39 putts
    (implausible seed data); QA rounds show "No ...
  - Where: supabase/migrations/20260924130000_golf_is_test_flag.sql
  - Evidence: per transcript
- **DASH-12** · partial: putting.ts (golf_pga_standards, cited) and the Putting
  benchmark Sheet built; (B) the page-language field-sheet rebuild stays open:
  the cited spec (spec-dashboard-shell §3.2/§5) is not in the repo
  - Finding: [P1] Stats server fetch + putting benchmark module + Stats field
    sheet (spec §3.2/§5, plan #7)
  - Where: caf753eef, 03a21a4c1; lib/golf/benchmarks/putting.ts;
    spine-stage/PuttingBenchmarkSheet.tsx
  - Evidence: verified in code
- **DASH-13** · done: Golf 404 inside the shell
  - Finding: [P2] Titles in 6 variants and an in-shell 404: unknown /dashboard/*
    drops the shell and offers "Baseball ...
  - Where: dashboard/[...missing]/page.tsx
  - Evidence: verified in code
- **DASH-14** · done: Role-aware back link
  - Finding: [P2] Player "Round not found" offers "Back to roster" (players have
    no roster)
  - Where: dashboard/not-found.tsx:29-30
  - Evidence: verified in code
- **DASH-15** · done: Regrade upgraded to DONE
  - Finding: [P2] More sheet: "Sign out" is the loudest control (filled rose
    pill)
  - Where: cd01022e2 / 397587774
  - Evidence: per transcript
- **DASH-16** · done: Agenda ends with "That's everything for …" (4eb357472);
  pinned "N overdue tasks" row per owner decision (7a9ce3700)
  - Finding: [P2] Calendar: badge "6" matches nothing visible; agenda one event
    then a void; overdue task not on the calendar
  - Where: 4eb357472, 7a9ce3700
  - Evidence: this session
- **DASH-17** · done: Edge-fade scroll affordance on both sub-navs
  - Finding: [P2] Team sub-nav clipped with no affordance; CoachHelm 6 tabs with
    "Standing" clipped; insights chips clipped
  - Where: FairwayHubSubNav.tsx, CoachHelmSubNav.tsx
  - Evidence: per transcript
- **DASH-18** · done: Route actions portal into the shared top bar; the bar
  hides only in an open thread (3c823e8bb)
  - Finding: [P2] Messages uses its own header (large title + compose FAB, no
    bar/bell)
  - Where: 3c823e8bb
  - Evidence: this session
- **DASH-19** · done: No trailing periods
  - Finding: [P3] Courses h1 "Course library." period tell (also "The library.",
    "Your rounds.")
  - Where: FairwayRoundsLibrary.tsx:384
  - Evidence: verified in code
- **DASH-20** · done: W5 results file, with tests
  - Finding: [P2] Settings "Save changes" disabled-green reads as enabled
  - Where: 397587774 (W5)
  - Evidence: per transcript
- **DASH-21** · residual: #1933 closed 2026-09-27
  - Finding: [P3] Delete the old page bodies after #1933 merges
    (FairwayPlayerDashboard, FairwayRoundsLibrary, StatsSpineStage)
  - Where: FairwayPlayerDashboard / FairwayRoundsLibrary / StatsSpineStage
  - Evidence: per transcript
- **DASH-22** · blocked: Live-only verification list
  - Finding: [P3] Unverified list: S1 stacking cause, S6 blank band, S5 provider
    remount, server-action serialization, 19 vs 21 ...
  - Where: dev server :3217
  - Evidence: per transcript

### HUB (23)

- **HUB-01** · done: Tabs are the only navigation; hub cards and the Home chip
  removed (894cfab86)
  - Finding: [P1] Player CoachHelm hub IA: 6 horizontal tabs + 9 hub cards
    duplicating them + "← Home" chip + category chips ...
  - Where: 894cfab86
  - Evidence: this session
- **HUB-02** · done: buildPlayerHubViewModel: one source per number, stats cache
  for round count (894cfab86)
  - Finding: [P1] hub/buildPlayerHubViewModel.ts: one source per number,
    read-quality buckets, prediction-band guard, standing ...
  - Where: 894cfab86
  - Evidence: this session
- **HUB-03** · done: Scoring windows, SG slopes and evidence rails as hub
  instruments (894cfab86)
  - Finding: [P1] Instruments SignedLadder (themes, leak, standing) and
    NextRoundWindow
  - Where: 894cfab86
  - Evidence: this session
- **HUB-04** · done: Word band, ghost actions, and one visible action per
  insight sheet with Acknowledge/Dismiss under More (521903c8c)
  - Finding: [P1] Insight anatomy: takeaway-first row/sheet/EvidenceLine; one
    primary + Menu; word band instead of percent ...
  - Where: 521903c8c
  - Evidence: this session
- **HUB-05** · done: No green gradient hero
  - Finding: [P2] Green gradient hero with a mixed pill cloud; jargon "Practice
    Frequency 0.3 opportunity"; mono pills
  - Where: PlayerSpine.tsx
  - Evidence: verified in code
- **HUB-06** · done: No hover lift
  - Finding: [P2] Hover-lifting bento (hover:-translate-y-1 on every cell);
    big-number tiles "6 active/6 themes/6 signals" ...
  - Where: Bento.tsx
  - Evidence: verified in code
- **HUB-07** · done: Regrade DONE
  - Finding: [P2] Percentile shown as a value ("SG: Total 100%" from team_pct)
  - Where: PlayerHomeBento.tsx; player-hub deleted
  - Evidence: per transcript
- **HUB-08** · done: No card chrome; title is an h2
  - Finding: [P2] DrillPanel border + shadow; cards nested three deep
  - Where: DrillPanel.tsx:47
  - Evidence: verified in code
- **HUB-09** · done: No violet or glass
  - Finding: [P2] Banned tokens: EvidencePanel amber/violet/warm/cream glass;
    DivergingBars bg-warm-400; StandingBar Inline ...
  - Where: EvidencePanel.tsx:276
  - Evidence: verified in code
- **HUB-10** · done: Regrade DONE
  - Finding: [P3] Regex voice rewrite in the client
  - Where: PlayerHomeBento.tsx; player-hub deleted
  - Evidence: per transcript
- **HUB-11** · done: Chevron icon instead of arrow glyphs
  - Finding: [P3] Arrows in copy ("More insights →", "↗ Improving", "←")
  - Where: PlayerHomeBento.tsx
  - Evidence: verified in code
- **HUB-12** · done: One better/worse value drives word, colour and sign on the
  Overview (894cfab86) and Standing (a36244990)
  - Finding: [P2] Contradictory signals side by side ("Improving" next to a
    danger badge)
  - Where: 894cfab86, a36244990
  - Evidence: this session
- **HUB-13** · done: "Weakest link" jargon gone
  - Finding: [P2] Causal cards repeat one disclaimer; jargon "Weakest link,
    confidence/strength"
  - Where: CausalWhyPanel.tsx
  - Evidence: verified in code
- **HUB-14** · done: One primary; targets named as targets
  - Finding: [P1] Development: terminology soup (focus areas / goals / target /
    New focus area / Set a goal) and three primary ...
  - Where: 54599c478
  - Evidence: per transcript
- **HUB-15** · done: ?focus= lands on the card
  - Finding: [P1] Dashboard focus-area "Set a target" chip navigates to
    development without the focus area (dead end)
  - Where: DevelopmentDrill.tsx:371
  - Evidence: verified in code
- **HUB-16** · done: Already DONE in the ledger
  - Finding: [P1] Dashboard insight → `/coachhelm?focus=<id>` dead deep link
  - Where: before ledger stamp
  - Evidence: per transcript
- **HUB-17** · not-a-bug: Lead: keep the top insight out of the library
  - Finding: [P2] Top insight filtered out of the insights list
  - Where: PlayerCoachHelmHome.tsx
  - Evidence: per transcript
- **HUB-18** · done: No person named; plain SG description
  - Finding: [P2] StandingView: ladder, row sheet, a gap line only when honest;
    person named in chrome ("Mark Broadie")
  - Where: StandingDrill.tsx
  - Evidence: verified in code
- **HUB-19** · done: Overview plan edits in place (log a value, mark complete
  with Undo) through the existing focus-area actions, optimistic with rollback
  and a danger toast
  - Finding: [P2] PlanView / PlanBoard / CausalLedger reusing the focus-area
    writes
  - Where: HubPlanBoard.tsx
  - Evidence: verified in code (HubPlanBoard.test.tsx)
- **HUB-20** · done: coachhelm/loading.tsx matches the new first paint
  (894cfab86)
  - Finding: [P2] coachhelm/loading.tsx rewritten to the new first paint
  - Where: 894cfab86
  - Evidence: this session
- **HUB-21** · done: PlayerSpine, PlayerHomeBento and buildPlayerHomeViewModel
  deleted; #1933 does not touch them (894cfab86)
  - Finding: [P3] Delete orphaned home/* drills, PlayerSpine, PlayerHomeBento
    after #1933
  - Where: 894cfab86
  - Evidence: this session
- **HUB-22** · not-a-bug: OD-11: keep Game Profile and Deep dive in the strip
  - Finding: [P2] Game Profile and Deep dive leave the tab strip (overflow Menu)
  - Where: -
  - Evidence: per transcript
- **HUB-23** · done: Shifting now explains direction
  - Finding: [P2] Trend "Shifting, changed direction recently" (no
    direction/magnitude); "AWAITING DATA · Around the Green" ...
  - Where: buildPlayerHomeViewModel.ts
  - Evidence: per transcript

### NUM (42)

- **NUM-01** · blocked: TS side done; DB side is the OD-01 migration, held for
  owner apply
  - Finding: [P0] No countable-round rule. Sep 17 round 91301a75 (37 strokes, SG
    +34.51) poisons Best 37, the trend plunge ...
  - Where: round-countable.ts; held migration 20260924120000
  - Evidence: per transcript
- **NUM-02** · done: Labels, putts per 18, axis clamp, 9-hole normalising
  - Finding: [P1] Dashboard "last 5 rounds" labels sit on all-time values (72.8
    not reproducible)
  - Where: numbers agent a6494e (in cd01022e2/397587774)
  - Evidence: per transcript
- **NUM-03** · done: Labels, putts per 18, axis clamp, 9-hole normalising
  - Finding: [P1] Putts/rd denominator includes hole-less rounds (29.7 shown vs
    32.9 true)
  - Where: numbers agent a6494e (in cd01022e2/397587774)
  - Evidence: per transcript
- **NUM-04** · done: Already DONE in the ledger
  - Finding: [P2] Birdies per round labelled "per 18"; 9-hole rounds counted as
    full
  - Where: before ledger stamp
  - Evidence: per transcript
- **NUM-05** · done: Already DONE in the ledger
  - Finding: [P1] Sparkline/trend read raw total_score (seed drift ±1) while the
    Rounds list uses hole sums
  - Where: before ledger stamp
  - Evidence: per transcript
- **NUM-06** · done: Already DONE in the ledger
  - Finding: [P1] "↑ −39.0" = newest vs first-ever round; delta chips absurd
    (Fairways −79%, Putts improvement red/green ...
  - Where: before ledger stamp
  - Evidence: per transcript
- **NUM-07** · done: Signed range, bands over 8 strokes hidden (OD-09),
  confidence as a word
  - Finding: [P1] Prediction: 80% interval labelled 60%, centred on the mean,
    "+" missing; 25-stroke band "−11.8-13.6"
  - Where: insight-composer.ts:23,341
  - Evidence: verified in code
- **NUM-08** · done: Word bands, no percent confidence in golf UI
  - Finding: [P1] "100% confidence" = min(n/30,1) shown on nearly every insight;
    "conf 100%" in a mono box
  - Where: confidence-label.ts; CausalWhyPanel.tsx
  - Evidence: verified in code
- **NUM-09** · not-a-bug: 53% 3-putt is a projection in an owner-settled rule;
  measured is about 9-10%
  - Finding: [P1] "53% 3-putt" product estimate (true 14%); ~2.3 strokes/rd
    overstated
  - Where: -
  - Evidence: per transcript
- **NUM-10** · done: Already DONE in the ledger
  - Finding: [P2] 3-5ft band missing from the stats bento
  - Where: before ledger stamp
  - Evidence: per transcript
- **NUM-11** · done: Already DONE in the ledger
  - Finding: [P2] "Every completed round is included" is false (19 of 21)
  - Where: before ledger stamp
  - Evidence: per transcript
- **NUM-12** · done: Data-through date and "Built before your last round"
  computed at display time on the Overview; coach evidence shows the real window
  dates
  - Finding: [P2] Insight window text frozen at generation ("Data through
    2026-05-31" stale; 15 rounds/54 days vs 21/123)
  - Where: 894cfab86
  - Evidence: this session
- **NUM-13** · done: Standing deltaVsTeam arrow now means better/worse
  (a36244990); Overview uses one convention (894cfab86)
  - Finding: [P2] Sign conventions differ across CoachHelm pills; "Putting ↗
    Improving" next to a red "↘ 0.2"
  - Where: a36244990, 894cfab86
  - Evidence: this session
- **NUM-14** · done: Already DONE in the ledger
  - Finding: [P3] No same-date tiebreak ordering
  - Where: before ledger stamp
  - Evidence: per transcript
- **NUM-15** · done: Labels, putts per 18, axis clamp, 9-hole normalising
  - Finding: [P2] Standing: "SG: Total" twice; axis to 104%
  - Where: numbers agent a6494e (in cd01022e2/397587774)
  - Evidence: per transcript
- **NUM-16** · done: Counts come from one themeCauseCounts object
  - Finding: [P2] "6 signals · 13 to work on · 1 strengths" mixes three row
    sets; hard-coded label; "6 themes" with only one bar
  - Where: PlayerHomeBento.tsx:124
  - Evidence: verified in code
- **NUM-17** · done: Already DONE in the ledger
  - Finding: [P3] BEST badge = best per month, never said so; shown on several
    rounds
  - Where: before ledger stamp
  - Evidence: per transcript
- **NUM-18** · done: One Form score on Fingerprint and Genome (OD-02)
  - Finding: [P0] Two composites one tab apart: Fingerprint "Overall game 100"
    vs Genome "Game strength 57"
  - Where: f287a182c; form-score.ts
  - Evidence: per transcript
- **NUM-19** · done: Labels, putts per 18, axis clamp, 9-hole normalising
  - Finding: [P2] Rounds page avgToPar is an unnormalized mean for 9-hole rounds
  - Where: numbers agent a6494e (in cd01022e2/397587774)
  - Evidence: per transcript
- **NUM-20** · done: Graded DONE in the 12:20 regrade
  - Finding: [P1] Scrambling 27 vs 34: 90-day live window vs lifetime cache,
    same name
  - Where: cd01022e2 / 397587774 (W11/W12 agents)
  - Evidence: per transcript
- **NUM-21** · done: Already DONE in the ledger
  - Finding: [P1] Putting bands: Fingerprint reads legacy 15_20/20_plus;
    everything else 15_25/25_plus (43% vs 19%)
  - Where: before ledger stamp
  - Evidence: per transcript
- **NUM-22** · done: Overview no longer shows the 30-day stat pills; round count
  from the stats cache (894cfab86)
  - Finding: [P1] Hero pills "Fairways 7% · Greens 100% · Putts 18.0" contradict
    the Performance Snapshot (62/72/29.7) on the ...
  - Where: 894cfab86
  - Evidence: this session
- **NUM-23** · done: Already DONE in the ledger
  - Finding: [P1] Dashboard SG table labelled "Strokes gained" shows 0-100
    scores (83/36/53/1); radar axis 0-100
  - Where: before ledger stamp
  - Evidence: per transcript
- **NUM-24** · blocked: Label and format unified (f07c0cdee). Standing SQL now
  follows the shared rule (18-hole basis, legacy 'qualifying') and so does the
  v3 generator (7dc04fe5b); the migration 20260924140000 is HELD and applies
  after OD-01
  - Finding: [P2] Pressure gap 15.75 (Standing) vs +17.4 (Fingerprint);
    "Pressure delta 0" hero vs "Tightens up"
  - Where: f07c0cdee, 7dc04fe5b
  - Evidence: this session
- **NUM-25** · blocked: TS sources unified; cached averages change only after
  OD-01
  - Finding: [P2] Scoring avg to par: +0.9 (FP) vs +0.44/18 (Stats) vs +0.7
    (Rounds); stats 72.3 vs dash 72.8 vs rounds 72.5 ...
  - Where: countable rule in TS
  - Evidence: per transcript
- **NUM-26** · blocked: Still open; re-check putt make% after OD-01 is applied
  - Finding: [P2] Putting make% non-monotonic (10-15ft 16% < 15-20ft 43%; 5-10
    28% < 15-20 43%)
  - Where: -
  - Evidence: per transcript
- **NUM-27** · done: Graded DONE in the 12:20 regrade
  - Finding: [P2] "3-5 ft putts · 15 shots" (deep dive) vs 44 attempts elsewhere
  - Where: cd01022e2 / 397587774 (W11/W12 agents)
  - Evidence: per transcript
- **NUM-28** · done: Graded DONE in the 12:20 regrade
  - Finding: [P2] Deep dive yardage table mixes tee shots with approaches ("Dead
    zone 275-300y" is driving); contradicts SG Tee ...
  - Where: cd01022e2 / 397587774 (W11/W12 agents)
  - Evidence: per transcript
- **NUM-29** · done: Miss compass replaces chips; n denominator not
  live-verified
  - Finding: [P2] Miss direction as 4 text chips (L26/R43/S52/Long30) whose
    pairs don't sum; no denominator
  - Where: fingerprint/instruments.tsx
  - Evidence: per transcript
- **NUM-30** · done: Units on deep-dive trend and insight gaps (lead)
  - Finding: [P2] Unitless numbers: "14.2 vs 9.2 typical", "Resilience 1.1",
    "1.0 from Tour", Form "% of what?"
  - Where: 9ad388a88
  - Evidence: per transcript
- **NUM-31** · done: Duplicate Par 3/4/5 chart removed
  - Finding: [P3] Duplicate display: Par 3 3.27 (+0.27), then "Averages Par 3
    3.3"
  - Where: 2b43716a4
  - Evidence: per transcript
- **NUM-32** · done: Focus-area strip uses formatMetricText (9dd89a443)
  - Finding: [P2] Focus-area context strip shows raw 2-decimal mono ("Avg 72.75
    · FW 61.96%")
  - Where: 9dd89a443
  - Evidence: this session
- **NUM-33** · not-a-bug: Lead: arrow semantics are deliberate and test-locked
  - Finding: [P2] Standing: arrow semantics contradict labels ("↓ vs team" +
    "Above team average" where lower is better)
  - Where: StandingBar/utils.ts
  - Evidence: per transcript
- **NUM-34** · done: Regrade: real per-metric inputs
  - Finding: [P2] Standing counterfactual "72.8 → 70.3 (≈4 wks)" repeated
    identically and shown on metrics already better than ...
  - Where: counterfactual/compute.ts
  - Evidence: per transcript
- **NUM-35** · done: Standing prints strokes, never percentiles (test);
  Form-card team %ile needs 5 teammates, fake platform percentile removed
  (cc9d96e83)
  - Finding: [P2] Standing overview shows percentiles (SG Total 100%) while the
    page shows raw SG (−1.61): two scales, same ...
  - Where: cc9d96e83
  - Evidence: this session
- **NUM-36** · done: Goal targets capped at the catalog improveStep (sand 5% →
  10%, not 28%) (baed36e1b). Pending suggestions keep old targets until expiry;
  accepted goals keep theirs
  - Finding: [P2] Suggested target "Scrambling % Sand → 28%" from 5% (1/20),
    with no baseline
  - Where: baed36e1b
  - Evidence: this session
- **NUM-37** · done: Registry labels printed as-is; only prose is lowercased
  - Finding: [P3] Lowercased metric names in prose ("strongest in sg: off the
    tee")
  - Where: buildStatsViewModel.ts:272-275
  - Evidence: verified in code
- **NUM-38** · done: Percent axes pinned 0–100 (tested); Standing comparison
  cells wrap instead of truncating (5501e422e)
  - Finding: [P2] Insight bar axis "42% … 104%"; Team/You/PGA values truncated
    "TE… 5…"
  - Where: 5501e422e
  - Evidence: this session
- **NUM-39** · blocked: Written and HELD; owner applies, then cache refresh
  - Finding: [P1] DB-side countable-round and stats-cache migrations (stats
    cache trigger ...
  - Where:
    supabase/migrations/20260924120000_golf_countable_round_stats_cache.sql
  - Evidence: per transcript
- **NUM-40** · blocked: OD-03 is_test flag held; read paths do not filter yet
  (follow-up)
  - Finding: [P1] Demo/QA data pollution visible to prospects: round 91301a75, 4
    QA Test Course rounds, QA Hell Enum, Progress ...
  - Where: supabase/migrations/20260924130000_golf_is_test_flag.sql
  - Evidence: per transcript
- **NUM-41** · done: Stats and rounds clean names; Fingerprint no longer renders
  course names
  - Finding: [P2] Debug suffix leaks into course names ("Poplar Grove (real)")
    on fingerprint/stats filters
  - Where: StatsSpineStage.tsx; course-name.ts
  - Evidence: verified in code
- **NUM-R1** · done: Graded DONE in the 12:20 regrade
  - Finding: [P3] ShotAnalysisCard: team scramble % printed raw (61.666666%)
  - Where: cd01022e2 / 397587774 (W11/W12 agents)
  - Evidence: per transcript

### NUMC (9)

- **NUMC-01** · done: Junk rounds excluded on the coach dashboard; QA-course
  hiding waits on OD-03
  - Finding: [P0] Coach dashboard: Top Performers, Team Pulse, Top mover,
    Scoring/GIR/Putts KPIs, "98 rounds", Recent Rounds ...
  - Where: dashboard-data.ts (numbers agent a6494e)
  - Evidence: per transcript
- **NUMC-02** · done: W13 results file
  - Finding: [P1] Roster: avg, trend chips, rounds count wrong (junk rounds);
    method Σtotal/Σholes with no status filter
  - Where: 397587774 (W13)
  - Evidence: per transcript
- **NUMC-03** · done: W13 results file
  - Finding: [P1] Team Stats: score avg, TEAM SG (rounds-weighted mean of
    lifetime cache), SG categories, trajectory ...
  - Where: 397587774 (W13)
  - Evidence: per transcript
- **NUMC-04** · done: W13 results file
  - Finding: [P2] Team Stats label honesty: "ranked" is alphabetical, "with shot
    tracking" counts scored rounds, "season to ...
  - Where: 397587774 (W13)
  - Evidence: per transcript
- **NUMC-05** · done: W13 results file
  - Finding: [P2] No tie handling: Top Performers plain sort; rank columns;
    qualifier positions sequential (should show T1)
  - Where: 397587774 (W13)
  - Evidence: per transcript
- **NUMC-06** · done: W13 results file
  - Finding: [P1] Brief Players: team health putting 31.6 and scoring +3.6 are
    unweighted means of cached per-player values ...
  - Where: 397587774 (W13)
  - Evidence: per transcript
- **NUMC-07** · done: W13 results file
  - Finding: [P1] Qualifiers: "3 active" counts a QA qualifier and MOMENTIC
    dated year 60824 (no date sanity)
  - Where: 397587774 (W13)
  - Evidence: per transcript
- **NUMC-08** · not-a-bug: OD-04: owner keeps the current qualifier rule
  - Finding: [P1] Qualifier standings contract missing: Σ to-par with unequal
    round counts, no completion rule, promised ...
  - Where: -
  - Evidence: per transcript
- **NUMC-09** · done: W13 results file
  - Finding: [P1] Coach vs player: Cole's average is 72.6/72.8 everywhere vs
    clean 74.4; the composite shows 57 on coach Team ...
  - Where: 397587774 (W13)
  - Evidence: per transcript

### RE (39)

- **RE-D1** · residual: Owner decision: hole-swipe pager ships in its own PR
  with a device test
  - Finding: [P1] D-HOLESWIPE: swipe between holes with a selection haptic; 20pt
    edge reserved; swipe-back disabled mid-round
  - Where: owner decision
  - Evidence: this session
- **RE-D2** · done: Checkmark draw plus one success haptic
  - Finding: [P1] D-SUBMIT: signature success haptic plus ~400ms checkmark on
    round submit
  - Where: FairwayRoundSubmitOverlay.tsx
  - Evidence: verified in code
- **RE-F1** · done: Already DONE in the ledger
  - Finding: [P0] Holes-step Start failure is silent (no submitError/submitting
    on the manual path)
  - Where: before ledger stamp (cd01022e2)
  - Evidence: per transcript
- **RE-F2** · done: W6 results file, with tests
  - Finding: [P1] Quick-pick confirm jumps straight to tracking with no
    validateBeforeStart and no persistRoundStart
  - Where: 397587774 (W6)
  - Evidence: per transcript
- **RE-F3** · blocked: Needs a live round past setup (DB writes) or a device
  - Finding: [P1] Every non-holed shot opens a numeric pad with no Done key
    (accessory bar hidden)
  - Where: round entry on device
  - Evidence: per transcript
- **RE-F4** · not-a-bug: Owner: keep wait-for-save before advancing holes
  - Finding: [P1] Offline: a completed hole can't advance until the server acks
  - Where: -
  - Evidence: per transcript
- **RE-F5** · done: Already DONE in the ledger
  - Finding: [P1] Setup primary "Next: configure holes" is about 1400px down and
    not sticky
  - Where: before ledger stamp (cd01022e2)
  - Evidence: per transcript
- **RE-F6** · done: W6 results file, with tests
  - Finding: [P1] Setup shows two green primaries plus two exits
  - Where: 397587774 (W6)
  - Evidence: per transcript
- **RE-F7** · residual: Owner said yes; separate PR, not started
  - Finding: [P1] No quick score mode (about 20 taps per par-4 hole)
  - Where: follow-up PR (OD-05 quick score)
  - Evidence: per transcript
- **RE-F8** · blocked: Needs a live round past setup (DB writes) or a device
  - Finding: [P2] Keyboard covers Course name/Rating/Slope/yardage fields
  - Where: round entry on device
  - Evidence: per transcript
- **RE-F9** · done: W6 results file, with tests
  - Finding: [P2] Tap targets under 44pt: 9/18 segmented 140x36, par buttons
    36x36, yardage 84x40
  - Where: 397587774 (W6)
  - Evidence: per transcript
- **RE-F10** · done: W6 results file, with tests
  - Finding: [P2] Par 6 can't be entered (buttons 3/4/5 only; validation allows
    3-6)
  - Where: 397587774 (W6)
  - Evidence: per transcript
- **RE-F11** · done: W6 results file, with tests
  - Finding: [P2] A tee with no yardage is silently filled with template
    yardages
  - Where: 397587774 (W6)
  - Evidence: per transcript
- **RE-F12** · blocked: Needs a live round past setup (DB writes) or a device
  - Finding: [P2] Clipping at 320/390: round type select, date, "Save for quick
    access"
  - Where: round entry on device
  - Evidence: per transcript
- **RE-F13** · done: W6 results file, with tests
  - Finding: [P2] Putt break required on every putt, including tap-ins
  - Where: 397587774 (W6)
  - Evidence: per transcript
- **RE-F14** · done: One semantic haptic per shot
  - Finding: [P2] Double haptic per shot (fwHaptic in onClick + triggerHaptic in
    tracking)
  - Where: 3e2b51b77; FairwayShotEntry.tsx
  - Evidence: per transcript
- **RE-F15** · done: No raw framer useReducedMotion left in golf paths
  - Finding: [P2] Raw useReducedMotion in round-entry components
  - Where: 397587774 (W6)
  - Evidence: verified in code
- **RE-F16** · done: W6 results file, with tests
  - Finding: [P3] relTime() calls Date.now() in render
  - Where: 397587774 (W6)
  - Evidence: per transcript
- **RE-F17** · done: W6 results file, with tests
  - Finding: [P3] Step spine says SETUP while the scorecard is inline
  - Where: 397587774 (W6)
  - Evidence: per transcript
- **RE-F18** · done: Owner kept the undo confirm; sync chip back as "Not synced
  · retrying"
  - Finding: [P3] Undo asks for confirmation (two taps); offline sync status
    indicator removed
  - Where: FairwayScorecardHeader.tsx:130
  - Evidence: verified in code
- **RE-G1** · done: validateShotContinuity, validateHoleSequence,
  validateHolesPlayed, deriveHoleCounts present
  - Finding: [P1] Guards G1-G5 plus the round-level tripwire (score = shots +
    penalties, putts = putting shots, monotonic ...
  - Where: round-entry-validation.ts
  - Evidence: verified in code
- **RE-P1** · done: Already DONE in the ledger
  - Finding: [P0] Course picker flicker: the picker resets on close before
    vaul's exit ends; the parent restructures under the ...
  - Where: before ledger stamp (cd01022e2)
  - Evidence: per transcript
- **RE-P2** · done: W6 results file, with tests
  - Finding: [P0] D-PICKER: course picker becomes a full-screen push stack
    (search in the nav bar, tees as the next screen)
  - Where: 397587774 (W6)
  - Evidence: per transcript
- **RE-P3** · done: W6 results file, with tests
  - Finding: [P1] Library load failure shows "No courses yet" (lenient
    listCourses; toast only when all 3 feeds fail)
  - Where: 397587774 (W6)
  - Evidence: per transcript
- **RE-P4** · blocked: Needs a live round past setup (DB writes) or a device
  - Finding: [P2] "Change tees" reopens at the course list behind a skeleton
  - Where: round entry on device
  - Evidence: per transcript
- **RE-P5** · done: W6 results file, with tests
  - Finding: [P2] Escape on the tee stage closes the whole picker (no back one
    level); focus lands on BODY after close
  - Where: 397587774 (W6)
  - Evidence: per transcript
- **RE-P6** · done: Single-tee course auto-picks its tee
  - Finding: [P2] A single-tee course still needs a tee tap after a 390ms
    skeleton→card pop
  - Where: 3e2b51b77; FairwayCoursePicker.tsx
  - Evidence: per transcript
- **RE-P7** · done: W6 results file, with tests
  - Finding: [P2] Course library shelf is a 65-card horizontal carousel
    duplicated across Recent/Library
  - Where: 397587774 (W6)
  - Evidence: per transcript
- **RE-P8** · done: W6 results file, with tests
  - Finding: [P3] Search field lacks enterKeyHint="search";
    autocorrect/autocapitalize on
  - Where: 397587774 (W6)
  - Evidence: per transcript
- **RE-S1** · done: Already DONE in the ledger
  - Finding: [P0] Tee shot on a par 4/5 can be recorded as holed or on-green
  - Where: before ledger stamp (cd01022e2)
  - Evidence: per transcript
- **RE-S2** · done: Already DONE in the ledger
  - Finding: [P0] Server trusts the client's score/putts (score ≥ putts+1 etc.
    not checked)
  - Where: before ledger stamp (cd01022e2)
  - Evidence: per transcript
- **RE-S3** · done: Already DONE in the ledger
  - Finding: [P1] Client-supplied puttDistanceFeet is unclamped
  - Where: before ledger stamp (cd01022e2)
  - Evidence: per transcript
- **RE-S4** · done: W6 results file, with tests
  - Finding: [P1] holes_played comes from payload length; its assert is
    self-referential, so a 5-hole payload is saved as ...
  - Where: 397587774 (W6)
  - Evidence: per transcript
- **RE-S5** · done: W6 results file, with tests
  - Finding: [P2] Edit-shot modal: distances unvalidated (negative, after >
    before)
  - Where: 397587774 (W6)
  - Evidence: per transcript
- **RE-V1** · done: W6 results file, with tests
  - Finding: [P1] Validation gaps left by the fix agent: shot starts where the
    last ended (±5 yd); holes exactly 9/18 numbered ...
  - Where: 397587774 (W6)
  - Evidence: per transcript
- **RE-V2** · done: W6 results file, with tests
  - Finding: [P2] Yardage-0 holes on the one-tap path mean the tee-shot rule
    can't judge the drive
  - Where: 397587774 (W6)
  - Evidence: per transcript
- **RE-V3** · not-a-bug: Thresholds kept as recommended (OD-19); owner sign-off
  not recorded, confirm with owner
  - Finding: [P2] Plausibility thresholds (confirm >400yd, block >500yd, score
    cap max(par+10, 15)) were chosen by the agent
  - Where: round-entry-validation.ts
  - Evidence: per transcript
- **RE-V4** · done: W6 results file, with tests
  - Finding: [P3] shot-helpers.ts and the validator each compute score/putts
    (duplicate logic)
  - Where: 397587774 (W6)
  - Evidence: per transcript
- **RE-X1** · done: W6 results file, with tests
  - Finding: [P2] Three raw window.location.reload() calls in new-round-client
    become the shared stale-action recovery
  - Where: 397587774 (W6)
  - Evidence: per transcript

### MOT (30)

- **MOT-01** · done: Regrade DONE; tokens re-exported later
  - Finding: [P1] No motion tokens: springs (snappy/sheet/push/gentle),
    durations and press values are undefined; duration ...
  - Where: cd01022e2 / 397587774 (W2)
  - Evidence: per transcript
- **MOT-02** · done: Regrade DONE; tokens re-exported later
  - Finding: [P1] No semantic haptic() API over fwHaptic (last-wins throttle;
    commit/select/checkpoint/roundSubmitted); no ...
  - Where: cd01022e2 / 397587774 (W2)
  - Evidence: per transcript
- **MOT-03** · done: Regrade DONE; tokens re-exported later
  - Finding: [P1] Fairway Button fires fwHaptic('light') on every click;
    PressTarget fires selection on every tap; legacy ...
  - Where: cd01022e2 / 397587774 (W2)
  - Evidence: per transcript
- **MOT-04** · done: Semantic haptic(); open haptic off on golf
  - Finding: [P2] Double haptics: FairwayRecentCourses tile (light + medium on
    top of Button), confirm-dialog warning on OPEN ...
  - Where: FairwayRecentCourses.tsx:87,96; confirm-dialog.tsx
  - Evidence: verified in code
- **MOT-05** · not-a-bug: Lead: CSS press already exists; button shared with
  Baseball, left alone
  - Finding: [P1] usePress/Pressable press-down microinteraction (scale 0.97,
    CSS :active releasing on scroll) across ...
  - Where: fairway/controls/button.tsx
  - Evidence: per transcript
- **MOT-06** · done: Golf callers on Sheet / ConfirmAlert
  - Finding: [P1] Three overlay systems (ModalShell, Sheet, ui/drawer, plus
    ConfirmDialog) → one Sheet primitive (focus ...
  - Where: 397587774 (W3)
  - Evidence: per transcript
- **MOT-07** · done: Charts render final on mount (b72b7ef2c, 6fe8d81d8);
  NumberFlow renders the final value on mount and animates only on change
  - Finding: [P1] Data entrance motion must go: NumberFlow (12 files),
    MetricCard chip entrance, CategoryInsightStrip stagger ...
  - Where: b72b7ef2c, 6fe8d81d8
  - Evidence: this session
- **MOT-08** · done: Already DONE in the ledger; native parts need a new build
  - Finding: [P1] Hover sticks after tap in WKWebView (no
    hoverOnlyWhenSupported; 64 hover:-translate-y)
  - Where: native shell agent a93750 (cd01022e2)
  - Evidence: per transcript
- **MOT-09** · done: W4 results file
  - Finding: [P2] 18 hover-only reveals (group-hover:opacity-100) become
    unreachable on touch once hover is gated
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **MOT-10** · done: Already DONE in the ledger; native parts need a new build
  - Finding: [P1] Green -webkit-tap-highlight flash under 1024px
  - Where: native shell agent a93750 (cd01022e2)
  - Evidence: per transcript
- **MOT-11** · done: transition-all replaced on golf paths
  - Finding: [P3] transition-all: 332 hits in 169 files
  - Where: d3d1a5f6e
  - Evidence: per transcript
- **MOT-12** · residual: Re-scoped on purpose: a transform slide on the route
  wrapper breaks fixed sheets and bars mid-animation; View Transitions is
  experimental in Next 16. Pushes fade, pops are instant
  - Finding: [P1] Push/pop directional transitions via View Transitions with
    direction flags; popstate → instant
  - Where: route-motion.ts
  - Evidence: this session
- **MOT-13** · done: Swipe-back off mid-round and with a sheet open; Swift not
  Xcode-built
  - Finding: [P1] D-SWIPE swipe-back: native
    allowsBackForwardNavigationGestures; HelmNav.setSwipeBackEnabled bridge (off
    ...
  - Where: 4bacddc68; GolfBridgeViewController.swift
  - Evidence: per transcript
- **MOT-14** · done: Theme-synced native overscroll via HelmAppearancePlugin
  (9dd625f2d). Needs a new iOS build; Swift parse-checked only
  - Finding: [P1] D-BOUNCE: page rubber-band on; fixed-bar jitter hardening;
    theme-synced overscroll colour (cream band in dark)
  - Where: 9dd625f2d
  - Evidence: this session
- **MOT-15** · done: Static pill, equal slots, no layoutId
  - Finding: [P2] Tab bar: equal slots, instant swap, reselect → scroll-top +
    bounce; drop layout/layoutId pill; bottom-nav ...
  - Where: FairwayBottomNav.tsx
  - Evidence: verified in code
- **MOT-16** · done: Regrade DONE; tokens re-exported later
  - Finding: [P2] Segmented thumb animates x without layout projection
  - Where: cd01022e2 / 397587774 (W2)
  - Evidence: per transcript
- **MOT-17** · done: useSkeletonSwap
  - Finding: [P2] Skeleton→content: hard swap under 300ms, 150ms crossfade only
    after (useSkeletonSwap)
  - Where: 8c31b21cf
  - Evidence: per transcript
- **MOT-18** · done: successCheckmark retimed to 260ms and used by the success
  toast (c0b049e4d)
  - Finding: [P2] Error shake + inline message; success checkmark retime (260ms)
  - Where: c0b049e4d
  - Evidence: this session
- **MOT-19** · not-a-bug: Owner decision 2026-09-24: keep the confirm step, no
  player Undo (no new write path on minors' data). Triage return-to-row done
  - Finding: [P2] Add-to-plan morph plus an Undo toast; triage row highlight and
    scroll restore on pop; PTR on Home, Rounds ...
  - Where: owner decision
  - Evidence: this session
- **MOT-20** · residual: Owner decision: hole pager ships in its own PR with a
  device test (with OD-05 quick score)
  - Finding: [P1] Hole pager with drag (lazy domMax for tracking only)
  - Where: owner decision
  - Evidence: this session
- **MOT-21** · done: Specs (2e5bbccb0) e2e/golf-motion-stillness.spec.ts and
  e2e/golf-course-picker-flicker.spec.ts green 2026-09-25: 11/11 passed on
  chromium against a production build (`next start`) of this branch, twice
  (before and after the TYPE-03/DS-15 sweeps)
  - Finding: [P2] Tests: e2e motion-stillness.spec.ts and
    course-picker-flicker.spec.ts; unit tests for tokens/haptics
  - Where: 2e5bbccb0
  - Evidence: verified (e2e run)
- **MOT-22** · blocked: Waits on the owner device pass
  - Finding: [P3] Core Haptics signature (helm-haptics.ts) stays gated until the
    owner's device pass
  - Where: lib/native/helm-haptics.ts
  - Evidence: per transcript
- **MOT-23** · done: Already DONE in the ledger; native parts need a new build
  - Finding: [P1] D-NUM: numerals in SF tabular, no mono, no slashed zero;
    Fragment Mono retired
  - Where: native shell agent a93750 (cd01022e2)
  - Evidence: per transcript
- **MOT-R1** · done: 0 raw framer useReducedMotion imports left in golf paths
  - Finding: [P2] Raw `useReducedMotion()` in Messages composer/thread and
    round-detail ScoringDistribution
  - Where: lint ban + 44-file codemod (3e2b51b77)
  - Evidence: verified in code
- **MOT-R2** · done: 0 raw framer useReducedMotion imports left in golf paths
  - Finding: [P2] Raw useReducedMotion() in auth/onboarding (signup, demo, coach
    and player onboarding)
  - Where: lint ban + 44-file codemod (3e2b51b77)
  - Evidence: verified in code
- **MOT-R3** · done: Guarded hook
  - Finding: [P0] FocusAreaCard: raw useReducedMotion drives SSR `initial`
    (reduced-motion users get a mismatch)
  - Where: FocusAreaCard.tsx
  - Evidence: verified in code
- **MOT-R4** · done: Guard hook, no inView gate, final state on mount
  - Finding: [P2] Sparkline/EkgSparkline: useInView(amount .6/.4) leaves lines
    invisible mid-scroll; raw useReducedMotion
  - Where: Sparkline.tsx, EkgSparkline.tsx
  - Evidence: verified in code
- **MOT-R5** · done: 0 raw framer useReducedMotion imports left in golf paths
  - Finding: [P3] Raw useReducedMotion in HubSubNav, Sidebar, route-motion,
    DayScheduleSwipe
  - Where: lint ban + 44-file codemod (3e2b51b77)
  - Evidence: verified in code
- **MOT-RM** · done: 0 raw framer useReducedMotion imports left in golf paths
  - Finding: [P1] Raw framer useReducedMotion() instead of
    useReducedMotionGuard, repo-wide, including core primitives ...
  - Where: lint ban + 44-file codemod (3e2b51b77)
  - Evidence: verified in code
- **MOT-RM2** · done: Golf reduced-motion rule covers .animate-pulse-subtle
  - Finding: [P2] globals.css `.animate-pulse-subtle` infinite animation not
    covered by prefers-reduced-motion
  - Where: globals.css:2108-2115
  - Evidence: verified in code

### NAT (11)

- **NAT-01** · done: Already DONE in the ledger; native parts need a new build
  - Finding: [P1] Launch colour jump: storyboard tan #EDE0C8 vs bridge #FFFEFA
    vs CSS canvas; no dark variant
  - Where: native shell agent a93750 (cd01022e2)
  - Evidence: per transcript
- **NAT-02** · done: Already DONE in the ledger; native parts need a new build
  - Finding: [P1] Every launch is a cold download: the WKWebView cache is wiped
    on each viewDidLoad, plus a www→apex redirect
  - Where: native shell agent a93750 (cd01022e2)
  - Evidence: per transcript
- **NAT-03** · done: Already DONE in the ledger; native parts need a new build
  - Finding: [P1] 7 web font families on every golf page; mixed sans stacks (DM
    Sans body, Geist font-sans, SF fw-sans)
  - Where: native shell agent a93750 (cd01022e2)
  - Evidence: per transcript
- **NAT-04** · done: 44pt phone bar with a centred 17pt title via opt-in
  nativeBar (157d8a842)
  - Finding: [P1] No iOS nav bar: 44pt, centred 17pt title, ‹ Parent back
    chevron on pushed routes
  - Where: 157d8a842
  - Evidence: this session
- **NAT-05** · done: W4 results file
  - Finding: [P1] Travel: desktop master-detail leaks to the phone (empty
    "Select a trip" pane)
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **NAT-06** · done: Row link instead of a primary per card; one meta line
  - Finding: [P1] Roster: identical card grid with 8 full-width green "View
    player" primaries (identical-card tell app-wide ...
  - Where: 3e2b51b77; FairwayPlayerCard.tsx
  - Evidence: verified in code
- **NAT-07** · residual: Owner: separate follow-up PR; not started. Avatar
  Remove button fixed
  - Finding: [P1] Settings is a 7,245px mega page with about 6 "Save changes"
    buttons; avatar shown twice; "Remove" rose pill ...
  - Where: follow-up PR (Settings rebuild)
  - Evidence: per transcript
- **NAT-08** · done: Golf-only span user-select none
  - Finding: [P2] `body.capacitor span { user-select:text }` re-enables
    selection on every span (tab labels, button labels)
  - Where: globals.css:412
  - Evidence: verified in code
- **NAT-09** · done: Already DONE in the ledger; native parts need a new build
  - Finding: [P2] Offline page is off-system (Tailwind green, stone palette,
    gradient tile)
  - Where: native shell agent a93750 (cd01022e2)
  - Evidence: per transcript
- **NAT-10** · done: Already DONE in the ledger; native parts need a new build
  - Finding: [P3] min-height 100dvh overridden by -webkit-fill-available on iOS
  - Where: native shell agent a93750 (cd01022e2)
  - Evidence: per transcript
- **NAT-11** · done: Already DONE in the ledger; native parts need a new build
  - Finding: [P3] No theme-color meta on web
  - Where: native shell agent a93750 (cd01022e2)
  - Evidence: per transcript

### NAV (10)

- **NAV-B1** · done: Already DONE in the ledger
  - Finding: [P1] Bell badge 14→6→14: two halves set by separate awaits; a read
    error becomes 0; no request-order guard
  - Where: before ledger stamp
  - Evidence: per transcript
- **NAV-IA1** · done: Regrade upgraded to DONE
  - Finding: [P1] Player tabs Home · Rounds · Game · Plan · Team (CoachHelm
    becomes the insight byline); new routes with ...
  - Where: cd01022e2 / 397587774
  - Evidence: per transcript
- **NAV-IA2** · done: Regrade upgraded to DONE
  - Finding: [P1] Coach tabs Home · Players · CoachHelm · Schedule · Team; Team
    Stats and What's new fold into Brief
  - Where: cd01022e2 / 397587774
  - Evidence: per transcript
- **NAV-IA3** · done: Push payloads open the exact event, qualifier or round;
  plan pushes skip the redirect shim (67629b706)
  - Finding: [P2] Deep-link contract §3.5: every entry point (push payloads
    included) opens the exact step
  - Where: 67629b706
  - Evidence: this session
- **NAV-R1** · done: Regrade upgraded to DONE
  - Finding: [P2] Calendar: Android-style "+" FAB above the tab bar plus a "⋯"
    header circle
  - Where: cd01022e2 / 397587774
  - Evidence: per transcript
- **NAV-R2** · done: Static pill, equal slots, no layoutId
  - Finding: [P2] Tab bar: the active pill resizes per tab and inactive items
    are icon-only
  - Where: FairwayBottomNav.tsx
  - Evidence: verified in code
- **NAV-R3** · done: PTR on Home, Rounds, CoachHelm, Calendar
  - Finding: [P2] Pull-to-refresh only on Messages; feed screens have none
  - Where: 724624671; GolfRouteRefresh.tsx
  - Evidence: per transcript
- **NAV-S1** · done: scroll-margin uses the header offset
  - Finding: [P2] Global scroll-margin-top 120px is less than bar + safe area +
    sub-nav, so anchored content hides under the bar
  - Where: globals.css:494
  - Evidence: verified in code
- **NAV-S2** · done: scroll-mt on buckets
  - Finding: [P2] Calendar agenda scrollIntoView bucket has no scroll margin
  - Where: FairwayAgendaView.tsx:458
  - Evidence: verified in code
- **NAV-V1** · blocked: Code matches; needs a browser check
  - Finding: [P2] Brief view switch is now client-side (replaceState);
    StageRouter (player hub) not checked in a browser ...
  - Where: TriageDesk.tsx
  - Evidence: per transcript

### TYPE (3)

- **TYPE-01** · done: Legacy type classes mapped to the canonical scale on golf
  - Finding: [P2] Four parallel type scales; 9-10px sizes; cap eyebrows at one
    per screen; sentence-case heads
  - Where: d3d1a5f6e
  - Evidence: per transcript
- **TYPE-02** · done: Dynamic Type for reading text, capped at XXL (OD-06)
  - Finding: [P2] Dynamic Type ignored (px scale; no `font: -apple-system-body`
    root)
  - Where: cd4be3a72
  - Evidence: per transcript
- **TYPE-03** · done: Sentence-case eyebrows; eyebrow count ratcheted per file
  so it can only fall (909e18f93). One-per-screen sweep: the 15 densest golf
  player/coach files (51e975f87, 120 → 1), then every remaining golf file with
  an eyebrow, admin CRM included (2026-09-26): section titles are real h2/h3/h4
  headings in `font-fw-sans text-body-sm font-semibold text-text-primary`,
  meta/row/axis labels are `text-caption`, the dead `uppercase`/`tracking-*`
  went with them. Golf render-path census 539 → 62 across 36 files, ratchet
  baseline lowered to the live counts. What remains is deliberate:
  `components/golf/calendar/**` (38, renders in Baseball through
  `components/shared/calendar`), `fairway/app-shell/**` and
  `overlays/PopoverPanel` (imported by Baseball and Lift Lab), the `Eyebrow`
  primitive, `view-header`, `forms/styles.ts`, retired components awaiting
  deletion (Ribbon, StandingStrip, StatTile, TrendChip, InstrumentPanel,
  BentoCell, RxCard, SpineLedger), GroupDetailsSheet (its test pins the artboard
  type), and single page kickers (print report, new-round entry, course library,
  team-stats loading, dev haptics)
  - Finding: [P2] ALL-CAPS tracked eyebrow above nearly every block
    (text-eyebrow ×1065)
  - Where: 909e18f93, 51e975f87, this commit
  - Evidence: this session

### DS (22)

- **DS-01** · done: W4 results file
  - Finding: [P2] Classes: 3 of 4 vaul drawers have no bottom safe-area padding
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **DS-02** · done: Golf callers on Sheet / ConfirmAlert
  - Finding: [P2] About 22 legacy `ui/drawer` call sites bypass the Fairway
    Sheet/ModalShell ("one modal" rule)
  - Where: 397587774 (W3)
  - Evidence: per transcript
- **DS-03** · done: Golf callers on Sheet / ConfirmAlert
  - Finding: [P3] ConfirmDialog is a second hand-rolled modal outside ModalShell
  - Where: 397587774 (W3)
  - Evidence: per transcript
- **DS-04** · done: Graded DONE in the 12:20 regrade
  - Finding: [P3] Dead FingerprintHero.tsx (banned warm-/cream- classes); only
    MetricPill is live
  - Where: cd01022e2 / 397587774 (W11/W12 agents)
  - Evidence: per transcript
- **DS-05** · done: Graded DONE in the 12:20 regrade
  - Finding: [P3] WhatIfPanel: raw amber-/red- classes (banned)
  - Where: cd01022e2 / 397587774 (W11/W12 agents)
  - Evidence: per transcript
- **DS-10** · done: Registry, parity test, render-bans ratchet; parity todos
  closed in d76d77dd4
  - Finding: [P1] Metric display registry + formatMetric(metricId, value, ctx):
    precision, true minus, tone from polarity × ...
  - Where: cd01022e2/397587774 (W15); d76d77dd4
  - Evidence: per transcript
- **DS-11** · done: Registry, parity test, render-bans ratchet; parity todos
  closed in d76d77dd4
  - Finding: [P1] Cross-surface parity test (Home, Game, Roster, Brief, player
    page)
  - Where: cd01022e2/397587774 (W15); d76d77dd4
  - Evidence: per transcript
- **DS-12** · done: Masthead, VerdictLine, Row/RowGroup, TemplateSkeleton,
  KeyboardDoneBar in fairway/primitives/ (direct-path imports) and Surface
  variant="stage", each with tests. Adopted: KeyboardDoneBar in FairwayShotEntry
  (RE-F3; device check still open). Masthead, VerdictLine, Row, TemplateSkeleton
  removed before merge (unused on any route, #1264 check); restore from these
  commits when a screen adopts them
  - Finding: [P1] Phase 2 primitives: Masthead, VerdictLine, Row, MetricValue,
    TemplateSkeleton, KeyboardDoneBar; Stage variant ...
  - Where: 75b90b7a8, 2732b8051, c27406840, acb46b6c2, 069ccf706, f12a8a71b,
    1977c31ff
  - Evidence: this session
- **DS-13** · done: TeamField, SignedBars, TargetTrack, SplitStrip built in
  fairway/charts/ (registry numbers, role=img or real lists, tests); RoundStrip
  already in modules/ and player-detail/. Removed before merge (unreachable from
  any route, #1264 check); restore from these commits when the Game/Plan/Coach
  Home IA work places them
  - Finding: [P1] Instruments RoundStrip, TeamField, SignedBars, TargetTrack,
    SplitStrip
  - Where: 6e00d220f, 96e36974d, b1e86dd41, 101e9812f, 701a16fa2, 9602532df
  - Evidence: this session
- **DS-14** · done: Registry, parity test, render-bans ratchet; parity todos
  closed in d76d77dd4
  - Finding: [P2] Lint bans: retired components, font-mono, arbitrary
    text-[Npx], .toFixed( in render, transition-all, raw ...
  - Where: cd01022e2/397587774 (W15); d76d77dd4
  - Evidence: per transcript
- **DS-15** · done (golf): Shared fwPress/fwPressSurface exported; golf page
  sites migrated, 52 to 40 (c7dc95a08); the remaining golf press sites
  (Baseball-shared golf calendar, MobileMenuButton, AttachmentButton,
  FairwayTeeCard, FairwayCalendar FAB, demo gate, golf auth
  canvas/shell/sign-up) migrated in af443ba4f, 32 to 4 in those files. The 4
  left are press neutralizers, not presses (`active:scale-100` on the
  MobileEventSheet backdrop, `disabled:active:scale-100` on three auth submits).
  Remaining: primitive definitions (_internal.ts, surface.tsx, ui/button,
  ui/modal), admin CRM, shared recruiting/coach-discover, Baseball and Lift Lab.
  The last golf site (join-team, a duplicate press on ui/Button) dropped in
  d38ec947e
  - Finding: [P2] 108 ad-hoc `active:scale` → one Pressable (fwPress 0.97)
  - Where: c7dc95a08; af443ba4f; d38ec947e
  - Evidence: this session
- **DS-16** · not-a-bug: OD-13: keep Genome and Fingerprint names; goal vs focus
  area unified (OD-10)
  - Finding: [P2] Glossary: one name per concept (Profile, Report, Outcomes,
    Insights, Focus area); retire Genome/Game ...
  - Where: -
  - Evidence: per transcript
- **DS-D6** · done: Graded DONE in the 12:20 regrade
  - Finding: [P2] 147 fixed min-h-[…] dead-space blocks (drill panels 112-132px)
  - Where: cd01022e2 / 397587774 (W11/W12 agents)
  - Evidence: per transcript
- **DS-E4** · done: No elevation shadow on roster cards
  - Finding: [P3] Drop shadows on in-flow rows (roster cards, event rows)
  - Where: FairwayPlayerCard.tsx
  - Evidence: verified in code
- **DS-HEX** · not-a-bug: Owner decision: tee and course colours are real-world
  data. Consolidated into src/lib/golf/tee-colors.ts and
  course-illustration-palette.ts, values unchanged (f729cd903)
  - Finding: [P2] Hard-coded hex colour systems in production components (tee
    swatches, hole hero, putting zoom, button ...
  - Where: f729cd903
  - Evidence: this session
- **DS-N6** · done: Row link instead of a primary per card; one meta line
  - Finding: [P2] Pill/badge soup (roster 3 pills per card, delta pill on every
    recent-round row)
  - Where: 3e2b51b77; FairwayPlayerCard.tsx
  - Evidence: verified in code
- **DS-N7** · done: Dashboard Latest shows "● N new" as the dot key (1f05c10f9)
  - Finding: [P2] Status dots with no legend (dashboard Latest, roster presence)
  - Where: 1f05c10f9
  - Evidence: this session
- **DS-R1** · partial: Off-ramp radii ratcheted per file on golf paths
  (909e18f93); call sites not swept
  - Finding: [P2] Radii soup: rounded-full 838, fw-md 673, fw-sm 430, xl 148, lg
    130 … fw-card 1
  - Where: 909e18f93
  - Evidence: this session
- **DS-R2** · done: Sparkles replaced with icons that say what the thing does
  (7edeca093); admin CRM keeps it
  - Finding: [P2] Sparkles AI iconography in 24 golf/fairway files
  - Where: 7edeca093
  - Evidence: this session
- **DS-R3** · done: Plain index numbers; no zero-count noise
  - Finding: [P2] Mono "01-06" ordinals on the Brief lists; zero-value "0 high
    priority" noise
  - Where: TeamSignalSummary.tsx, EffectivenessScoreboard.tsx
  - Evidence: verified in code
- **DS-R4** · blocked: Needs a live check to find the source
  - Finding: [P2] Tasks "QUICK STATS" tiles duplicate the filter-chip counts
  - Where: tasks quick stats
  - Evidence: per transcript
- **DS-THEMECOLOR** · done: Already DONE in the ledger; native parts need a new
  build
  - Finding: [P2] theme-color meta drifts from the dark canvas token
  - Where: native shell agent a93750 (cd01022e2)
  - Evidence: per transcript

### CON (12)

- **CON-01** · done: Token level; enforced by fairway-token-contrast.test.ts and
  lint
  - Finding: [P1] CONTRAST tokens (light): raise text-secondary (warm-600),
    text-tertiary (0.535 L), hairline/border and accent ...
  - Where: 397587774 (W1)
  - Evidence: per transcript
- **CON-02** · done: Token level; enforced by fairway-token-contrast.test.ts and
  lint
  - Finding: [P1] CONTRAST tokens (dark): the same on dark cream; tertiary on
    surface-tint 4.41:1 (D4); golden-700 2.92:1 on ...
  - Where: 397587774 (W1)
  - Evidence: per transcript
- **CON-03** · done: Token level; enforced by fairway-token-contrast.test.ts and
  lint
  - Finding: [P1] GREEN becomes the contrasting colour: headings/verdicts, key
    numbers, active states, selected segments ...
  - Where: 397587774 (W1)
  - Evidence: per transcript
- **CON-04** · done: Token level; enforced by fairway-token-contrast.test.ts and
  lint
  - Finding: [P1] Sweep about 230 (now 261) low-contrast class uses:
    text-primary-600 70, text-accent-600 84 (as body text) ...
  - Where: 397587774 (W1)
  - Evidence: per transcript
- **CON-05** · done: Token level; enforced by fairway-token-contrast.test.ts and
  lint
  - Finding: [P2] White on #16a34a CTAs 3.29:1 (demo CTA, onboarding Done, 61
    bg-primary-600 uses)
  - Where: 397587774 (W1)
  - Evidence: per transcript
- **CON-06** · done: Token level; enforced by fairway-token-contrast.test.ts and
  lint
  - Finding: [P2] text-primary-600 links on the translucent cream card (signup,
    demo, coach/pending)
  - Where: 397587774 (W1)
  - Evidence: per transcript
- **CON-07** · done: No golden-* on golf paths; last raw status colours moved to
  fw tokens (725a49fb6)
  - Finding: [P2] golden-* scale and Tailwind success/warning/danger/info are
    theme-blind hex
  - Where: 725a49fb6
  - Evidence: this session
- **CON-08** · done: Token level; enforced by fairway-token-contrast.test.ts and
  lint
  - Finding: [P2] Chart non-text contrast fails 3:1: viz-seq-5 amber,
    viz-div-neg, the pgaTour reference line
  - Where: 397587774 (W1)
  - Evidence: per transcript
- **CON-09** · done: Token level; enforced by fairway-token-contrast.test.ts and
  lint
  - Finding: [P2] No guard against regressions: lint ban on failing classes plus
    a token contrast test
  - Where: 397587774 (W1)
  - Evidence: per transcript
- **CON-10** · blocked: Live WCAG after-pass never ran (dev server down, then
  signed out)
  - Finding: [P1] Live contrast pass (cc.mjs background-resolving; axe
    incomplete on gradient cards) never ran
  - Where: live contrast pass
  - Evidence: per transcript
- **CON-11** · done: Calendar fixed in code; not live-verified
  - Finding: [P1] Owner's Calendar screenshot (iPhone light): header,
    Calendar/Travel tabs, Day/Week/Month/Agenda segmented ...
  - Where: 397587774 (W1)
  - Evidence: per transcript
- **CON-12** · partial: E7 passes at token level. On-screen contrast regraded
  2026-09-25 with axe `color-contrast` on a production build at 390px, light and
  dark: /golf/dashboard, stats, coachhelm, rounds, calendar, rounds/new are all
  0 violations after d38ec947e (new-round upcoming step labels were
  text-white/35, 3.14:1). E1 (one accent, one neutral ramp) is a visual
  judgement still open for the owner's screenshot pass
  - Finding: [P2] Checklist items graded on contrast/colour that the green
    decision changes: E1 (one accent, one neutral ramp) ...
  - Where: W1; d38ec947e
  - Evidence: verified (axe run)

### DARK (5)

- **DARK-01** · done: Android splash now #F2E6D2; needs a native build
  - Finding: [P1] Native cold start is cream for dark-mode users (WebView bg,
    splash, storyboard)
  - Where: android styles.xml, splash.xml, capacitor.config.ts
  - Evidence: verified in code
- **DARK-02** · done: OD-07: auth screens follow the system theme
  - Finding: [P3] Signed-out screens (login/signup/demo) always light;
    hard-white inputs
  - Where: 3e2b51b77; ThemeScript.tsx
  - Evidence: per transcript
- **DARK-03** · done: Checked in code: avatar fallback uses surface-sunken +
  ring + initials, and falls back on image error
  - Finding: [P2] Recent Rounds avatar fallback disc near-black on the dark
    card; Cole's avatar blank in both themes (no ...
  - Where: avatar.tsx
  - Evidence: this session
- **DARK-04** · done: Checked in code: missing series was the draw-on animation
  (off, b72b7ef2c) and the 0-based domain (data-fitted, CHART-R1)
  - Finding: [P2] Coach Performance Trend chart shows no series in either theme;
    y-domain 20-100
  - Where: b72b7ef2c
  - Evidence: this session
- **DARK-05** · not-a-bug: Golf no longer renders it; Baseball-only file, frozen
  by OD-17
  - Finding: [P3] Legacy PremiumCalendarClient hard-coded cream glass and
    #374151
  - Where: PremiumCalendarClient
  - Evidence: per transcript

### A11Y (15)

- **A11Y-01** · done: One spoken label per KPI
  - Finding: [P2] KPI value/delta/caption unlabelled fragments with no units;
    scores without units ("37 −35", "21 rd", "−13.4")
  - Where: MetricCard.tsx:355-369
  - Evidence: verified in code
- **A11Y-02** · done: W13 results file
  - Finding: [P3] Loading fallbacks wrap the whole skeleton (with a real h1) in
    role=status
  - Where: 397587774 (W13)
  - Evidence: per transcript
- **A11Y-03** · done: role=status only when live
  - Finding: [P3] InlineNotice info/success are always role=status even when
    static
  - Where: InlineNotice.tsx:46,85,96
  - Evidence: verified in code
- **A11Y-04** · done: W13 results file
  - Finding: [P3] Roster heading skip h1 → h3; coach dashboard h3 under a region
  - Where: 397587774 (W13)
  - Evidence: per transcript
- **A11Y-05** · done: W13 results file
  - Finding: [P3] Invite-code button named only by the code
  - Where: 397587774 (W13)
  - Evidence: per transcript
- **A11Y-06** · done: Graded DONE in the 12:20 regrade
  - Finding: [P2] Game pressure map has no text/table alternative
  - Where: cd01022e2 / 397587774 (W11/W12 agents)
  - Evidence: per transcript
- **A11Y-R1** · done: W4 results file
  - Finding: [P2] Documents card is a div[role=button] containing nested buttons
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **A11Y-R2** · done: W4 results file
  - Finding: [P2] What's New: aria-live on a freshness line that ticks every
    30s, so it re-announces forever
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **A11Y-R3** · done: W4 results file
  - Finding: [P1] Tasks: template row div[role=button] wraps Edit/Delete
    buttons; pressing Enter on Edit also fires ...
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **A11Y-R4** · done: role=group per section
  - Finding: [P2] SignalQueue: group-header button is a direct child of
    role=listbox
  - Where: SignalQueue.tsx:200
  - Evidence: verified in code
- **A11Y-R5** · done: Already DONE in the ledger
  - Finding: [P2] StageRouter: aria-live on the whole stage announces entire
    drills
  - Where: before ledger stamp
  - Evidence: per transcript
- **A11Y-R6** · done: aria-current=true, not page
  - Finding: [P3] PlayerCoachHelmNav: aria-current="page" on in-page view tabs
  - Where: PlayerCoachHelmNav.tsx:101
  - Evidence: verified in code
- **A11Y-R7** · done: sr-only h1
  - Finding: [P3] /intelligence: the only h1 lives in CommandOpening, which is
    null without chat context
  - Where: CoachIntelligenceHome.tsx:111
  - Evidence: verified in code
- **A11Y-R8** · done: No card chrome; title is an h2
  - Finding: [P3] DrillPanel title is a span, not a heading
  - Where: DrillPanel.tsx:47
  - Evidence: verified in code
- **A11Y-R9** · done: Graded DONE in the 12:20 regrade
  - Finding: [P2] BentoCell: aria-label replaces the content (number not read);
    block elements inside a button
  - Where: cd01022e2 / 397587774 (W9)
  - Evidence: per transcript

### HYD (15)

- **HYD-01** · done: W4 results file
  - Finding: [P0] Messages: sessionStorage cache read inside useState
    initializer causes an SSR/client hydration mismatch (#418)
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **HYD-02** · done: W4 results file
  - Finding: [P0] What's New: day buckets use the runtime-local timezone, not
    the `tz` prop, so SSR and client disagree near ...
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **HYD-03** · done: W4 results file
  - Finding: [P2] Team settings/info: toLocaleDateString(undefined) rendered
    with no timezone and no mount gate
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **HYD-04** · done: W4 results file
  - Finding: [P2] Documents: `timeAgo` calls `new Date()` at render with no
    mount gate
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **HYD-05** · done: One site fixed; the other sites checked and judged fine by
  W4
  - Finding: [P3] Date formatting without a timezone: message day separator,
    semester-start ISO off-by-one, course last-edited
  - Where: 397587774 (W4)
  - Evidence: per transcript
- **HYD-06** · done: W4 results file
  - Finding: [P2] Tasks: is_overdue parses the date-only due_date with new
    Date() (UTC), so the overdue banner can disagree ...
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **HYD-07** · done: W4 results file
  - Finding: [P2] New qualifier: `today` is computed by useMemo during SSR,
    giving a mismatched date-input `min` attribute
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **HYD-08** · done: W4 results file
  - Finding: [P1] Welcome greeting uses the SSR server's local hour, so the
    greeting text mismatches after hydration
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **HYD-09** · done: Graded DONE in the 12:20 regrade
  - Finding: [P1] Roster player profile: memberSince toLocaleDateString without
    a timezone in an SSR'd client component (#418 ...
  - Where: cd01022e2 / 397587774 (W9)
  - Evidence: per transcript
- **HYD-10** · done: Graded DONE in the 12:20 regrade
  - Finding: [P0] TriageDesk "Last scan Xm ago" is computed from the clock
    during render (minute-granular), causing a #418 ...
  - Where: cd01022e2 / 397587774 (W11/W12 agents)
  - Evidence: per transcript
- **HYD-11** · done: Dates format after mount
  - Finding: [P1] FocusAreaCard: completed/lastPracticed/started dates formatted
    without a timezone
  - Where: FocusAreaCard.tsx LocalShortDate
  - Evidence: verified in code
- **HYD-12** · done: Mount-gated relative date
  - Finding: [P3] CommandOpening relativeDays uses Date.now() in render
  - Where: CommandOpening.tsx:159-165
  - Evidence: verified in code
- **HYD-13** · done: W4 results file
  - Finding: [P3] Rounds/Scoring drills: round dates formatted without
    timeZone:'UTC'
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **HYD-14** · not-a-bug: Lead: useSyncExternalStore media query is
  hydration-safe
  - Finding: [P3] NotificationBell swaps Sheet→Popover after hydration on
    desktop
  - Where: NotificationBell.tsx
  - Evidence: per transcript
- **HYD-15** · done: Relative time uses a now value set after mount
  - Finding: [P3] player-dashboard-parts toLocaleTimeString with a
    possibly-undefined timeZone; UnfinishedBanner Date.now() in ...
  - Where: FairwayUnfinishedBanner.tsx
  - Evidence: per transcript

### DATA (16)

- **DATA-01** · done: W4 results file
  - Finding: [P1] Messages: desktop auto-select of the first thread marks it
    read without the user looking
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **DATA-02** · done: W4 results file
  - Finding: [P1] Classes: a thrown calendar sync is swallowed by the modal
    catch, so re-submitting creates a duplicate class
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **DATA-03** · done: W4 results file
  - Finding: [P1] Travel: mark-seen fires on mount with no .catch (unhandled
    rejection)
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **DATA-04** · done: W4 results file
  - Finding: [P0] Round detail runs an LLM recap and DB writes during RSC
    render; the "No writes" comment is false; Link ...
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **DATA-05** · done: Owner chose the idempotency guard; auto-generate kept
  - Finding: [P1] Round review auto-generates and stores a review on mount, with
    no user action
  - Where: 3e2b51b77; round-review-system.ts ifMissing
  - Evidence: per transcript
- **DATA-06** · done: W4 results file
  - Finding: [P2] Edit qualifier: two sequential writes with no rollback, and
    the error message hides the partial save
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **DATA-07** · done: W4 results file
  - Finding: [P3] Edit qualifier: clearing Rounds silently saves 1 round (the
    create form requires confirmation)
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **DATA-08** · done: W5 results file, with tests
  - Finding: [P1] Notification settings: a failed toggle rolls back the whole
    prefs snapshot, wiping concurrent toggles
  - Where: 397587774 (W5)
  - Evidence: per transcript
- **DATA-09** · done: W5 results file, with tests
  - Finding: [P1] Notification settings: bulk mute/reset leaves per-row switches
    enabled (blind upsert vs CAS race)
  - Where: 397587774 (W5)
  - Evidence: per transcript
- **DATA-10** · done: W5 results file, with tests
  - Finding: [P2] PriorityRanker: an inline `values` literal resets local drag
    order on every parent render
  - Where: 397587774 (W5)
  - Evidence: per transcript
- **DATA-11** · done: W5 results file, with tests
  - Finding: [P2] useCoachPhilosophy.save() has no overlap guard; an
    out-of-order response reverts a newer edit
  - Where: 397587774 (W5)
  - Evidence: per transcript
- **DATA-12** · done: Graded DONE in the 12:20 regrade
  - Finding: [P1] TriageDesk dismiss: the optimistic rollback restores a stale
    snapshot, resurrecting a signal the server ...
  - Where: cd01022e2 / 397587774 (W11/W12 agents)
  - Evidence: per transcript
- **DATA-13** · done: Graded DONE in the 12:20 regrade
  - Finding: [P1] WhatIfPanel.handleSimulate has no catch, so a failed
    simulation is silent and the rejection unhandled
  - Where: cd01022e2 / 397587774 (W11/W12 agents)
  - Evidence: per transcript
- **DATA-14** · done: In-flight guard on ratings
  - Finding: [P2] Player hub Helpful/Dismiss: no pending/disabled state; a
    double tap sends 2 ratings and 2 refreshes
  - Where: PlayerCoachHelmHome.tsx:214
  - Evidence: verified in code
- **DATA-15** · done: Bare ?q= only pre-fills; Brief to Ask uses a one-time
  hand-off token
  - Finding: [P2] coachhelm/chat?q=… auto-submits the question on load (paid LLM
    call plus a conversation insert from a URL)
  - Where: 397587774 (W4); ask-handoff.ts
  - Evidence: per transcript
- **DATA-16** · done: Graded DONE in the 12:20 regrade
  - Finding: [P3] About 12 routes (plus redirect shims) insert
    golf_insight_exposure on render; the game route double-logs ...
  - Where: cd01022e2 / 397587774 (W11/W12 agents)
  - Evidence: per transcript

### STATE (11)

- **STATE-01** · done: Graded DONE in the 12:20 regrade
  - Finding: [P2] Stats cold-start copy "More rounds needed / Log 5+" is shown
    at exactly 0 rounds
  - Where: cd01022e2 / 397587774 (W9)
  - Evidence: per transcript
- **STATE-02** · done: Coach-facing 0-round state with one Message action
  - Finding: [P2] Coach view of a 0-round player: player-directed copy with no
    action; three surface links lead to empty pages
  - Where: player-detail (PD-01)
  - Evidence: per transcript
- **STATE-03** · done: Graded DONE in the 12:20 regrade
  - Finding: [P3] 1-4 rounds: KPI secondary row shows four bare "-" with no
    reason; VoiceOver reads "dash"
  - Where: cd01022e2 / 397587774 (W9)
  - Evidence: per transcript
- **STATE-04** · done: Onboarding headings use the display role; legacy
  gradients removed (d5a4fed15)
  - Finding: [P3] Onboarding completion page uses the legacy text-2xl/primary
    idiom, not Fairway
  - Where: d5a4fed15
  - Evidence: this session
- **STATE-05** · done: Owner chose tap to continue; no auto-advance
  - Finding: [P3] Welcome auto-advances after about 1.9s with no pause control
  - Where: 3e2b51b77; (auth)/welcome/page.tsx
  - Evidence: per transcript
- **STATE-O1** · done: W4 results file
  - Finding: [P2] Onboarding submit-failure banners are plain `<p>` (no
    role=alert, not linked to a field)
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **STATE-O2** · done: Required fields are marked inline with aria-invalid and
  focus moves to the first (26a0086c2)
  - Finding: [P2] Onboarding: no focus move on step change or error; no
    field-level validation
  - Where: 26a0086c2
  - Evidence: this session
- **STATE-O3** · done: W4 results file
  - Finding: [P3] Coach onboarding "Go to Dashboard" lands on an empty dashboard
    with no roster/invite next step
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **STATE-O4** · done: Empty snapshot gated
  - Finding: [P2] Player CoachHelm with 0 rounds stacks a 5-metric dash-soup
    snapshot tile (no gating)
  - Where: PlayerHomeBento.tsx:100
  - Evidence: verified in code
- **STATE-R1** · done: Graded DONE in the 12:20 regrade
  - Finding: [P2] Coach player-game repeats the same "No insights in this area"
    empty per section
  - Where: cd01022e2 / 397587774 (W11/W12 agents)
  - Evidence: per transcript
- **STATE-X1** · done: Loading debt is zero (304c65258); golf 404 outside the
  shell (c17a78f72); dashboard 404 in-shell
  - Finding: [P2] not-found, error and loading for every segment
  - Where: 304c65258, c17a78f72
  - Evidence: this session

### SHEET (9)

- **SHEET-01** · done: Already DONE in the ledger
  - Finding: [P1] "Set a goal" sheet: Escape doesn't close it; see-through
    glass; no grabber; blank band above
  - Where: before ledger stamp (a5e672 overlay fix)
  - Evidence: per transcript
- **SHEET-02** · done: Already DONE in the ledger
  - Finding: [P1] Focus doesn't move into dialogs (More, Log progress, calendar
    event, Sort documents, Set a goal); focus not ...
  - Where: before ledger stamp (a5e672 overlay fix)
  - Evidence: per transcript
- **SHEET-03** · done: Already DONE in the ledger
  - Finding: [P2] Sheet bodies need overscroll-behavior: contain once bounce is
    on
  - Where: before ledger stamp (a5e672 overlay fix)
  - Evidence: per transcript
- **SHEET-04** · done: Sheet form plus weakest-SG preselect per owner
  - Finding: [P2] New focus area modal is a floating near-full-height card (no
    grabber) with a disabled-green primary above ...
  - Where: 3e2b51b77; FocusAreaModal.tsx:196
  - Evidence: verified in code
- **SHEET-05** · done: Undo on Reopen
  - Finding: [P2] Single-tap writes with no confirm or undo: "Reopen" completed
    focus area, profile "Make focus area"
  - Where: DevelopmentDrill.tsx:474-517
  - Evidence: verified in code
- **SHEET-06** · blocked: Needs a live check
  - Finding: [P2] Profile view "Genome" and "Make focus area" taps do nothing
    visible (dead or a silent state change)
  - Where: profile view taps
  - Evidence: per transcript
- **SHEET-07** · partial: Golf parts done; the rest is Baseball-only or dead
  code (OD-17)
  - Finding: [P2] Hand-built useFocusTrap dialogs not migrated (command
    palettes, CRM modals, golf/calendar/EventDetailModal ...
  - Where: 397587774 (W3)
  - Evidence: per transcript
- **SHEET-08** · partial: Golf parts done; the rest is Baseball-only or dead
  code (OD-17)
  - Finding: [P2] Glass/blurred hand-built dialogs untouched: ui/modal.tsx,
    golf/calendar/MobileEventSheet.tsx ...
  - Where: 397587774 (W3)
  - Evidence: per transcript
- **SHEET-09** · partial: Golf parts done; the rest is Baseball-only or dead
  code (OD-17)
  - Finding: [P2] ui/drawer keeps a light-only surface-stone background (dark
    title text would break on bg-surface); ui/dialog ...
  - Where: 397587774 (W3)
  - Evidence: per transcript

### PERF (27)

- **PERF-01** · partial: Code fixes done; capacity under load not re-measured
  - Finding: [P0] CAPACITY: the app degrades at about 10 concurrent users on
    dashboard pages (dashboard/coachhelm didn't finish ...
  - Where: notification-badge-context.tsx; use-presence.ts
  - Evidence: per transcript
- **PERF-02** · done: Indexes already in prod (pg_indexes check); no migration
  - Finding: [P1] Proposed indexes: notifications(user_id) WHERE read=false;
    golf_calendar_notifications(user_id ...
  - Where: -
  - Evidence: per transcript
- **PERF-03** · done: Latest seeded from the server; Messages allow-list fetched
  with the rail RPC
  - Finding: [P1] Player dashboard: 5 page-level server actions serialized
    behind the badge POST (conversation ids, unified ...
  - Where: b70de2c35, 30975fce6
  - Evidence: per transcript
- **PERF-04** · blocked: Measurement only; needs a live run
  - Finding: [P1] Dev-server timings (TTFB 6-13s on :3217) are not valid prod
    latency; prod before/after is unmeasured
  - Where: prod-like build
  - Evidence: per transcript
- **PERF-05** · done: Golf uses the presence heartbeat only
  - Finding: [P2] LastSeenUpdater writes on every shell mount
  - Where: FairwayDashboardShell.tsx
  - Evidence: per transcript
- **PERF-06** · blocked: CLS needs a live run
  - Finding: [P2] CLS > 0.1: coach dashboard mobile 0.102, /team small 0.175
  - Where: coach dashboard, /team
  - Evidence: per transcript
- **PERF-07** · blocked: Measurement only; needs a live run
  - Finding: [P2] /api/health returned 503 during genome loads; Sentry
    /monitoring tunnel 429
  - Where: prod-like build
  - Evidence: per transcript
- **PERF-08** · blocked: Needs a device/network check
  - Finding: [P2] Safari "Failed to fetch RSC payload … falling back to browser
    navigation" on player /dashboard (full reload = ...
  - Where: WKWebView
  - Evidence: per transcript
- **PERF-09** · done: Regrade upgraded to DONE
  - Finding: [P2] ChunkLoadError on coach /roster after a deploy → error
    boundary; check the stale-chunk recovery path
  - Where: cd01022e2 / 397587774
  - Evidence: per transcript
- **PERF-10** · blocked: Measurement only; needs a live run
  - Finding: [P2] Bad-network/slow-CPU audit (Slow 4G, 3G+4x CPU): per-route
    TTFB/FCP/LCP/CLS, skeleton time, filmstrips ...
  - Where: prod-like build
  - Evidence: per transcript
- **PERF-11** · residual: No per-surface CSS split
  - Finding: [P2] Route CSS 487KB decoded (6 stylesheets); globals.css ~3.2k
    lines carry marketing/baseball/legacy
  - Where: globals.css (3,360 lines)
  - Evidence: verified in code
- **PERF-12** · done: W4 results file
  - Finding: [P2] Blur on a sticky scrolling surface (WeekView)
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **PERF-13** · done: loading=lazy on avatar images; message and receipt images
  not re-checked
  - Finding: [P3] 23 raw img, only 3 lazy
  - Where: avatar img tags
  - Evidence: per transcript
- **PERF-R1** · done: W13 results file
  - Finding: [P3] Qualifiers page: serial session then createClient awaits;
    static skeletons use index keys
  - Where: 397587774 (W13)
  - Evidence: per transcript
- **PERF-R2** · done: W5 results file, with tests
  - Finding: [P1] Coaching-intelligence settings: createClient() in the render
    body is an effect dependency, so it refetches on ...
  - Where: 397587774 (W5)
  - Evidence: per transcript
- **PERF-R3** · done: Graded DONE in the 12:20 regrade
  - Finding: [P1] StatsSpineStage.loadAll has no stale-response guard (rapid
    scope switches race)
  - Where: cd01022e2 / 397587774 (W9)
  - Evidence: per transcript
- **PERF-R4** · done: Roster player page loads on the server
  - Finding: [P2] Roster player stats load client-side after SSR (waterfall; the
    8-read bundle starts after hydration)
  - Where: player-detail/loadPlayerDetail.ts (PD-01)
  - Evidence: per transcript
- **PERF-R5** · done: Already DONE in the ledger
  - Finding: [P2] Genome page: loadGenome, focus areas and alert counts awaited
    serially
  - Where: before ledger stamp
  - Evidence: per transcript
- **PERF-R6** · done: Promise.all
  - Finding: [P2] roster/[id]: player query then resolveCoachTeamId run serially
  - Where: roster/[id]/page.tsx:61
  - Evidence: verified in code
- **PERF-R7** · done: Graded DONE in the 12:20 regrade
  - Finding: [P2] /intelligence: about 8 serial server round-trips
  - Where: cd01022e2 / 397587774 (W11/W12 agents)
  - Evidence: per transcript
- **PERF-R8** · not-a-bug: Lead: not gated because stage views switch
  client-side
  - Finding: [P2] /coachhelm: about 11 serial awaits, and every view's data
    fetched on every request
  - Where: coachhelm/page.tsx
  - Evidence: per transcript
- **PERF-R9** · done: Already DONE in the ledger
  - Finding: [P2] Player /stats: client-side fetch waterfall after hydration
    (about 5s to data)
  - Where: before ledger stamp
  - Evidence: per transcript
- **PERF-R10** · done: Critical/deferred split in stats-dashboard.ts
  - Finding: [P2] stats-dashboard bundle waits for the slowest of 8 reads (15s
    cap)
  - Where: 0f9d8ba36, 1f75410ba
  - Evidence: verified in code
- **PERF-R11** · done: Graded DONE in the 12:20 regrade
  - Finding: [P2] Coach /stats ?player= switch: loadAll runs twice (old scope,
    then overall)
  - Where: cd01022e2 / 397587774 (W9)
  - Evidence: per transcript
- **PERF-R12** · done: W13 results file
  - Finding: [P2] /stats/team: serial chain, hole batches fetched in a for-loop
  - Where: 397587774 (W13)
  - Evidence: per transcript
- **PERF-R13** · done: Golf uses the presence heartbeat only
  - Finding: [P3] LastSeenUpdater writes last_seen on every shell mount
    (duplicates the presence heartbeat)
  - Where: FairwayDashboardShell.tsx
  - Evidence: per transcript
- **PERF-X1** · done: One Promise.all plus streaming; prod render time not
  measured
  - Finding: [P1] Coach /players/[id]/game never rendered in 150s on prod (stuck
    on loading.tsx)
  - Where: game/page.tsx
  - Evidence: per transcript

### QA (11)

- **QA-GATE1** · done: Token level; enforced by fairway-token-contrast.test.ts
  and lint
  - Finding: [P1] `scripts/__tests__/no-stale-cream-hardcodes.test.mjs` fails
    (exit 1): demo/page.tsx and Lift Lab auth pages ...
  - Where: 397587774 (W1)
  - Evidence: per transcript
- **QA-R1** · done: One site fixed; the other sites checked and judged fine by
  W4
  - Finding: [P3] Index keys: AddClassModal conflicts, ChatThread parts,
    FairwayHoleHero landings
  - Where: 397587774 (W4)
  - Evidence: per transcript
- **QA-R2** · done: W4 results file
  - Finding: [P3] `{credits && …}` renders a literal 0
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **QA-R3** · residual: 100/150ms sleep after router.refresh() still present;
  needs a live sign-in check
  - Finding: [P3] Sign-in/up: a fixed 100-150ms sleep after router.refresh()
    before navigating
  - Where: golf-sign-in-form.tsx:207; golf-sign-up-form.tsx:197
  - Evidence: verified in code
- **QA-R4** · done: W4 results file
  - Finding: [P3] Demo page: redundant manual aria-describedby
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **QA-R5** · done: viewerRole prop
  - Finding: [P3] CoachHelmShell `role` prop collides with ARIA role;
    eslint-disable at every call site
  - Where: CoachHelmShell.tsx:73
  - Evidence: verified in code
- **QA-R6** · done: Graded DONE in the 12:20 regrade
  - Finding: [P3] TriageDesk: stale comment claims router.replace re-runs the
    server page (it's a shallow replaceState)
  - Where: cd01022e2 / 397587774 (W11/W12 agents)
  - Evidence: per transcript
- **QA-R7** · done: useId pattern
  - Finding: [P3] TeamSignalSummary: hard-coded SVG pattern id (duplicate ids if
    mounted twice)
  - Where: TeamSignalSummary.tsx:248
  - Evidence: verified in code
- **QA-R8** · done: W4 results file
  - Finding: [P3] (dashboard)/error.tsx tags itself GolfDashboardLayout
    (misattributed telemetry)
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **QA-R9** · done: Stable breadcrumb key
  - Finding: [P3] CoachHelmShell breadcrumb key={i}; calendar dead filter
  - Where: CoachHelmShell.tsx:180
  - Evidence: verified in code
- **QA-TITLE** · done: Golf titles end in one "· GolfHelm"
  - Finding: [P2] Mixed document titles: root template appends "/ Helm Sports
    Labs" to titles that already carry one of 4 brand ...
  - Where: src/app/golf/layout.tsx:15
  - Evidence: verified in code

### FP (12)

- **FP-01** · done: Agent report; typecheck and tests passed
  - Finding: [P1] Game Fingerprint redesign: large title + verdict + derivation
    line; stage (StrokesWaterfall / SprayField / ...
  - Where: fingerprint agent ad0a60 (cd01022e2)
  - Evidence: per transcript
- **FP-02** · done: Agent report; typecheck and tests passed
  - Finding: [P1] Fingerprint tells: cards four deep (about 25ch column);
    hover-lift on static panels; decorative 01-06 ...
  - Where: fingerprint agent ad0a60 (cd01022e2)
  - Evidence: per transcript
- **FP-03** · done: Graded DONE in the 12:20 regrade
  - Finding: [P1] Coach-voiced copy shown to the player ("have the player call
    the carry number")
  - Where: cd01022e2 / 397587774 (W11/W12 agents)
  - Evidence: per transcript
- **FP-04** · done: Agent report; typecheck and tests passed
  - Finding: [P1] Fabricated category ratings on coach /game: short game =
    average of the other three; categories default to 50
  - Where: fingerprint agent ad0a60 (cd01022e2)
  - Evidence: per transcript
- **FP-05** · done: Graded DONE in the 12:20 regrade
  - Finding: [P2] Putting bars coerce a null band to 0%
  - Where: cd01022e2 / 397587774 (W11/W12 agents)
  - Evidence: per transcript
- **FP-06** · done: Registry, parity test, render-bans ratchet; parity todos
  closed in d76d77dd4
  - Finding: [P2] Number-parity contract test (composite, pressure, scrambling,
    no 15-20/20+ band, partial round affects ...
  - Where: cd01022e2/397587774 (W15); d76d77dd4
  - Evidence: per transcript
- **FP-07** · done: bg-canvas-gradient dropped
  - Finding: [P2] Profile drill chrome: `bare` DrillPanel/ChartFrame; sticky
    translucent PlayerCoachHelmNav; remove ...
  - Where: coachhelm/page.tsx
  - Evidence: verified in code
- **FP-08** · done: Graded DONE in the 12:20 regrade
  - Finding: [P3] Print reads the Fingerprint view model
  - Where: cd01022e2 / 397587774 (W11/W12 agents)
  - Evidence: per transcript
- **FP-09** · done: Graded DONE in the 12:20 regrade
  - Finding: [P2] Fingerprint has no scope switch (last 5 / last 10 / all); the
    data layer returns one window
  - Where: cd01022e2 / 397587774 (W11/W12 agents)
  - Evidence: per transcript
- **FP-10** · done: OD-12: stats-cache baseline everywhere
  - Finding: [P2] Two SG baselines on one screen: the waterfall uses the
    stats-cache baseline and the ladder uses the ...
  - Where: c6b0d98e4; stats-cache-baseline.ts
  - Evidence: per transcript
- **FP-11** · blocked: Screenshots at 1440 dark and player mode never taken
  - Finding: [P2] Fingerprint visual verification is incomplete: the last 3
    fixes are not screenshotted; no 1440 dark or player ...
  - Where: players/[id]/game
  - Evidence: per transcript
- **FP-12** · done: Greener meters, scaled compass; FAB clearance predates the
  audit
  - Finding: [P3] Fingerprint desktop nits: the CoachHelm FAB covers the 200-225
    ladder row at 1440; the miss compass is small ...
  - Where: cd4be3a72
  - Evidence: per transcript

### GN (1)

- **GN-01** · done: Genome rebuilt; Form score shown
  - Finding: [P1] Genome redesign: strands/ledger/tendencies; radar removed;
    coach detail + compare same anatomy; gauge needle ...
  - Where: genome agent a8da21; f287a182c
  - Evidence: per transcript

### SC (1)

- **SC-01** · done: ScoutingReport swapped into the tab
  - Finding: [P1] Scouting report redesign (coach ?tab=scouting): composite →
    derivation line; claim visuals
  - Where: scouting agent ac3d53 (cd01022e2)
  - Evidence: per transcript

### PD (2)

- **PD-01** · done: New roster player page
  - Finding: [P1] Coach player detail (roster/[id]) redesign: RoundStrip, mini
    previews, actions menu, summary sheet, skeleton
  - Where: player-detail agent a5518c (cd01022e2)
  - Evidence: per transcript
- **PD-02** · blocked: Screenshot pass on a warm server not done
  - Finding: [P3] Player detail leftovers: retake light 390 and the round sheet
    on a warm server; 320 check; waterfall reading ...
  - Where: roster/[id]
  - Evidence: per transcript

### DD (1)

- **DD-01** · done: One scroll, DistanceLadder, no Dial or red fills
  - Finding: [P1] Deep dive: DistanceLadder (approach-only, labelled shot-level
    SG); what-if never projects from a missing ...
  - Where: 0e32d62e5; DistanceLadder.tsx
  - Evidence: verified in code

### CHART (2)

- **CHART-R1** · done: W13 results file
  - Finding: [P2] Y ticks "100.0, 80.0…" decimals on integer ticks (coach
    Performance Trend)
  - Where: 397587774 (W13)
  - Evidence: per transcript
- **CHART-R2** · done: Tornado value labels flip across zero when there is no
  room (783f47cfe)
  - Finding: [P2] Team SG diverging bar category labels truncate ("Off
    …/Appr…"), value overlaps label
  - Where: 783f47cfe
  - Evidence: this session

### COPY (5)

- **COPY-01** · done: W4 results file
  - Finding: [P3] Exclamation points in toasts and banners
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript
- **COPY-02** · done: AST sweep of rendered golf copy
  - Finding: [P2] Em dashes >1 per screen (player dashboard has 5)
  - Where: d3d1a5f6e, f3ef34de2
  - Evidence: per transcript
- **COPY-03** · done: Engine and notification copy rewritten by hand (b784c9f41,
  580253ced). Stored insights refresh on regeneration
  - Finding: [P2] Over-explaining helper text stacks (Team Stats subtitle +
    cache meta before data)
  - Where: b784c9f41, 580253ced
  - Evidence: this session
- **COPY-04** · done: W6 results file, with tests
  - Finding: [P3] Glued units `{ft}ft`
  - Where: 397587774 (W6)
  - Evidence: per transcript
- **COPY-05** · done: W4 results file
  - Finding: [P3] Instruction placeholders ("Enter your password")
  - Where: cd01022e2 / 397587774 (W4)
  - Evidence: per transcript

### AUTH (2)

- **AUTH-01** · done: OD-15: keep the illustration, better card and scene
  - Finding: [P3] Auth illustration: remove it (helm mark only), or keep
  - Where: 3e2b51b77; golf-auth-canvas.tsx
  - Evidence: per transcript
- **AUTH-02** · done: Reset-password on the new design; keyboard lift not
  checked on a device
  - Finding: [P2] Login redesign leftovers: keyboard lift untested on device;
    reset-password still on the old card+illustration ...
  - Where: 397587774; reset-password page
  - Evidence: per transcript

### DOC (1)

- **DOC-01** · done: Regrade upgraded to DONE
  - Finding: [P3] memory/features/ios-native-shell.md lacks the accessory-bar
    behaviour (installNumericAccessoryBar)
  - Where: cd01022e2 / 397587774
  - Evidence: per transcript

### LAYOUT (1)

- **LAYOUT-01** · done: W13 results file
  - Finding: [P2] At 320px the roster attention list truncates names to 4
    letters and status overlaps the action
  - Where: 397587774 (W13)
  - Evidence: per transcript

### AN (1)

- **AN-OQ** · blocked: Parity test now passes; turning the flags on is an owner
  decision
  - Finding: [P2] A2/A3 distance surfaces flag-off and coach-only; most new
    insight output dark in prod ...
  - Where: feature-flags.yml
  - Evidence: per transcript

### K1 (1)

- **K1-GREEN** · done: Green gradient rail removed (the rest of the loading
  rewrite is HUB-20)
  - Finding: [P2] coachhelm/loading.tsx draws a green gradient band (brand
    shimmer, not shape-matched)
  - Where: coachhelm/loading.tsx
  - Evidence: verified in code

### X (2)

- **X-1933** · not-a-bug: OD-16: leave PR #1933 alone, no cherry-pick
  - Finding: [P1] PR #1933 (frost-facelift, LANGUAGE.md) owns many of the same
    files; cherry-pick its primitives, supersede its ...
  - Where: -
  - Evidence: per transcript
- **X-SPORTS** · done: OD-17: golf-only scoping
  - Finding: [P3] Other sports (Baseball, Lift Lab) share the Phase 1 global
    fixes only
  - Where: ThemeScript golf marker; LEGACY_SPORT_TOKENS_CSS
  - Evidence: per transcript

## Owner decisions

| Status | Count |
| --- | --- |
| done | 20 |
| residual | 1 |
| blocked | 2 |
| not-a-bug | 1 |

- **OD-01** · blocked: Migration written and HELD; owner applies
  - Decision: Ship the DB-side countable-round rule (stats-cache trigger ...
  - Where:
    supabase/migrations/20260924120000_golf_countable_round_stats_cache.sql
  - Evidence: per transcript
- **OD-02** · done: One Form score
  - Decision: Replace "Overall game 100" (Fingerprint) and "Game strength 57"
    (Genome) with one score?
  - Where: f287a182c; form-score.ts
  - Evidence: per transcript
- **OD-03** · blocked: Flag migration HELD; read-path filters are a follow-up
  - Decision: Clean demo/QA data visible to prospects (QA courses, the 60824
    qualifiers, duplicate demo team ...
  - Where: supabase/migrations/20260924130000_golf_is_test_flag.sql
  - Evidence: per transcript
- **OD-04** · done: Keep the current qualifier rule (no change)
  - Decision: Qualifier standings rule and tie-break
  - Where: -
  - Evidence: per transcript
- **OD-05** · residual: Quick score mode approved; not started
  - Decision: Add a quick score mode (about 20 taps per par-4 today)?
  - Where: follow-up PR
  - Evidence: per transcript
- **OD-06** · done: Dynamic Type for reading text, capped XXL
  - Decision: Dynamic Type scope
  - Where: cd4be3a72
  - Evidence: per transcript
- **OD-07** · done: Auth follows the system theme
  - Decision: Signed-out screens in dark mode?
  - Where: ThemeScript.tsx
  - Evidence: per transcript
- **OD-08** · done: Radar and teaser removed from Home
  - Decision: Remove the SG radar and insight teaser from player Home?
  - Where: FairwayPlayerDashboard.tsx
  - Evidence: per transcript
- **OD-09** · done: Bands over 8 strokes hidden
  - Decision: Hide wide prediction bands
  - Where: insight-composer.ts:23
  - Evidence: verified in code
- **OD-10** · done: One noun: focus area; targets named as targets
  - Decision: "Goal" vs "focus area"
  - Where: 54599c478
  - Evidence: per transcript
- **OD-11** · done: Keep Game Profile and Deep dive in the strip
  - Decision: Keep Game Profile and Deep dive in the hub tab strip, or move them
    to the overflow menu?
  - Where: -
  - Evidence: per transcript
- **OD-12** · done: Stats-cache baseline everywhere
  - Decision: Analysis flags and the canonical SG baseline
  - Where: c6b0d98e4
  - Evidence: per transcript
- **OD-13** · done: Keep Genome and Fingerprint names
  - Decision: Glossary: one name per concept (Profile, Report, Outcomes,
    Insights, Focus area); retire Genome / ...
  - Where: -
  - Evidence: per transcript
- **OD-14** · done: Both tab IAs adopted
  - Decision: Tab IA. Player: Home · Rounds · Game · Plan · Team. Coach: Home ·
    Players · CoachHelm · Schedule · ...
  - Where: nav-registry.ts
  - Evidence: per transcript
- **OD-15** · done: Keep the illustration; better card
  - Decision: Auth illustration: remove it (helm mark only) or keep it?
  - Where: 3e2b51b77
  - Evidence: per transcript
- **OD-16** · done: Leave #1933 alone
  - Decision: PR #1933 (frost facelift) overlaps these files
  - Where: -
  - Evidence: per transcript
- **OD-17** · done: Baseball and Lift Lab frozen
  - Decision: Do Baseball and Lift Lab get the redesign?
  - Where: golf scoping
  - Evidence: per transcript
- **OD-18** · done: EXPLAIN done; indexes already exist
  - Decision: Production indexes on notifications, golf_calendar_notifications
    and golf_team_members (partial)
  - Where: -
  - Evidence: per transcript
- **OD-19** · not-a-bug: Thresholds kept as recommended; no recorded owner
  sign-off
  - Decision: Round-entry plausibility thresholds: confirm above 400 yd, block
    above 500 yd, score cap ...
  - Where: round-entry-validation.ts
  - Evidence: per transcript
- **OD-20** · done: Opaque bar plus scroll hairline
  - Decision: Nav bar: translucent (iOS glass) or opaque cream with a scroll
    hairline?
  - Where: FairwayTopBar.tsx
  - Evidence: per transcript
- **OD-21** · done: No. Keep the confirm step; no new player delete path
  - Decision: Player Undo after "Add to focus area" (MOT-19)?
  - Where: owner, 2026-09-24
  - Evidence: this session
- **OD-22** · done: A pinned "N overdue tasks" row at the top of the agenda,
  linking to Tasks (7a9ce3700)
  - Decision: Overdue tasks on the Calendar?
  - Where: FairwayAgendaView.tsx
  - Evidence: this session
- **OD-23** · done: Real-world data; consolidated into two named modules
  (f729cd903)
  - Decision: Tee and course colours: tokenise or real-world data (DS-HEX)?
  - Where: src/lib/golf/tee-colors.ts
  - Evidence: this session
- **OD-24** · done: No. Its own PR with a device test, alongside OD-05 quick
  score
  - Decision: Hole-swipe pager (RE-D1/MOT-20) in this PR?
  - Where: follow-up PR
  - Evidence: this session

## Workstreams

- **W1** · done
  - Workstream: Contrast and green accent
  - Open items: CON-10 live pass never ran; CON-12 partial; DS-HEX closed by
    OD-23
- **W2** · partial
  - Workstream: Reduced motion and haptics primitives
  - Open items: MOT-12 residual (route slide re-scoped); MOT-21 specs written,
    not run green
- **W3** · done
  - Workstream: Sheets and overlays
  - Open items: Golf done; SHEET-07/08/09 rest is Baseball-only; SHEET-06 needs
    a live check
- **W4** · done
  - Workstream: Hydration, timezone and data races
  - Open items: QA-R3 residual (needs a live sign-in check)
- **W5** · partial
  - Workstream: Settings
  - Open items: All rows done except NAT-07 (Settings rebuild follow-up PR)
- **W6** · partial
  - Workstream: Round entry
  - Open items: RE-D1/MOT-20 pager and RE-F7 quick score in a follow-up PR
    (OD-05, OD-24); RE-F3/F8/F12/P4 need a device
- **W7** · done
  - Workstream: Shell, tab bar, titles, 404, native bridge
  - Open items: New iOS/Android build needed for the native pieces (Swift
    parse-checked only)
- **W8** · partial
  - Workstream: Type scale, eyebrows, cards, design-system tells
  - Open items: TYPE-03 and DS-R1 ratcheted per file, sweep not finished;
    PERF-11 residual
- **W9** · partial
  - Workstream: Player Dashboard, Rounds and Stats
  - Open items: DASH-12 field sheet not built
- **W10** · done
  - Workstream: CoachHelm hub (player side)
  - Open items: Hub rebuilt as a feed (894cfab86); Overview HubInsight still
    shows Helpful/Dismiss
- **W11** · done
  - Workstream: Coach intelligence and triage
  - Open items: -
- **W12** · done
  - Workstream: Deep dive and analysis follow-ups
  - Open items: DD-01, NUM-31, FP-12 done; FP-11 screenshots blocked
- **W13** · partial
  - Workstream: Coach numbers, qualifiers and team stats
  - Open items: OD-01 and NUM-24 migrations held (apply OD-01 first); SQL team
    percentile floor is still 3 vs 5 in TS
- **W14** · done
  - Workstream: Perf leftovers
  - Open items: PERF-R10 and PERF-03 done; PERF-01 capacity and live timings not
    re-measured
- **W15** · partial
  - Workstream: Formatting registry and parity tests
  - Open items: DS-12, DS-13, DS-15 partial

## IDs in the transcript that are not findings

- **BYZ-38**: Storyboard view-controller id in LaunchScreen/Main storyboard XML
  (BYZ-38-t0r)
- **DS-4**: Code comment in round-review-system.ts from an older review; not a
  ledger row
- **FID-5**: Code comment (render-time clamp on strokes_impact) from an older
  audit
- **UI-2**: Code comment from the 2026-09-02 mobile audit (scroll landing)
- **UI-3**: Code comment from the 2026-09-02 mobile audit (scroll landing)
- **UI-7**: Code comment from the 2026-09-02 mobile audit (label clip)
- **UI-11**: Test id in mobile-audit-2026-09-02.test.ts; copy updated to "Not
  synced · retrying" (see RE-F18)
- **NAV-03**: Example ID in the ledger-compile prompt; no finding
- **RE-05**: Example ID in the ledger-compile prompt; no finding
- **OD-3**: Design-direction doc numbering; maps to OD-13 / DS-16
- **OD-4**: Design-direction doc numbering (Scouting composite); maps to OD-02
- **W0, W22, W42, W69**: Grep noise (not workstreams)

## Notes for the next pass

- **RE-D1 / MOT-20.** The lead's status says the hole-swipe pager is not built.
  `useHoleSwipe.ts` exists and is wired at `FairwayShotTracking.tsx:542`: touch
  swipe between holes, 20pt edge guard, selection haptic. What is missing is a
  drag pager that shows the next hole while dragging.
- **COPY-03.** The ledger text for this ID (helper-text stacks on Team Stats)
  was fixed by W13. The lead now uses COPY-03 for the roughly 290 em dashes left
  in engine and notification copy (88 files).
- **DASH-16.** Only the badge part is done. The empty agenda after one event and
  the overdue task missing from the calendar were never addressed.
- **RE-V3 / OD-19.** The thresholds are kept as recommended, but no owner
  sign-off is recorded.
- **Native build.** DARK-01, NAT-01, NAT-02 and MOT-13 need a new iOS/Android
  build. The Swift change was only parsed, not built in Xcode.
- **Held migrations.** OD-01
  (`20260924120000_golf_countable_round_stats_cache.sql`) and OD-03
  (`20260924130000_golf_is_test_flag.sql`) are HELD in
  `supabase/migrations/HELD.md`.
