# CoachHelm remediation — SDD progress ledger
Plan: docs/superpowers/plans/2026-07-24-coachhelm-remediation.md
Worktree: /Users/ricknini/Downloads/helmv3-wt/e2e-timeout
Branch: plan/coachhelm-remediation
Merge base: 7363daf6a

Pre-flight: fixed 6x `supabase db remote query` -> `supabase db query`.
DECISION: implementers write migrations but DO NOT apply to prod. All prod
applies deferred to one owner approval gate after the final review.

PREMISE AUDIT (dispatched because 2 of 2 tasks so far rested on false claims
  about source — this is a plan-quality pattern, not bad luck). Findings for
  Tasks 3-5 in .superpowers/sdd/premise-audit-A.md:

  Task 3: 9 claims, 0 false. Ready to dispatch as written. Its one
    unverifiable DB claim I checked myself against prod (read-only):
    bunker_miss_side_amplifier = exactly 2 rows, both sample_n 5;
    short_approach_proximity_gap = 4 rows, all sample_n 10;
    lag_distance_3putt (the honest control) = 10 rows, sample_n 15/30/31.
    Confirms the finding AND supplies a control. NOTE: prod has ZERO
    long_approach_3putt_cascade rows — the source claim (literal sample_n: 5)
    still holds, but that rule has never emitted, so there is no prod
    evidence for it. Step 6's DORMANT->LIVE prose is settled: it IS live.

  Task 4: FALSE premise. Brief's Interfaces claim `standing?.level_avg` is in
    scope at pressure-gap.ts:253. It is not — composeContent(agg) takes only
    agg, PressureGapAggregate has no such field, `standing` appears only in
    prose comments. Prescribed edit is a hard "Cannot find name 'standing'".
    Real pattern (per CourseMgmtGenerator): fetch loadStandingForMetric inside
    aggregate() and store on a new aggregate field = undisclosed scope.
    Repair dispatched -> task-4-brief-REPAIRED.md. DRIFT: the 2-5 strokes
    comment starts at 247, not 249.

  Task 5: FALSE premise. Entire Files/Interfaces section targets
    src/components/fairway/pages/coachhelm/ which DOES NOT EXIST. Real wiring
    (verified): golf/coachhelm/insights/InsightListView.tsx renders
    golf/coachhelm/insight-card/InsightCard.tsx with audience="coach"; that
    card takes insight: EvidenceInsight + required audience + density. A
    second InsightCard exists at fairway/cards-insight/. Brief's test fixture
    matches neither. InsightTrustChips itself checks out (exists, exported,
    unused, props correct). Repair dispatched -> task-5-brief-REPAIRED.md,
    including the honest alternative: if EvidencePanel/WhyPopover/MovementPill
    already surface the same info, the task becomes delete-the-redundant-
    component, not render-it.

PREMISE AUDIT Tasks 6-8 (full detail .superpowers/sdd/premise-audit-B.md):

  Task 6: 8 claims, 0 false. Ready. Only drift: its verification filter
    matches 11 cron entries, not the 8 listed — the extra 3 are
    coachhelm-validation / coachhelm-safety-net / v3-weekly-coach-email,
    which the brief elsewhere says to leave alone. Plan patched in place so
    the implementer does not read 11 lines as a failure.

  Task 7: 2 FALSE. (a) Root cause mischaracterized — the route ALREADY writes
    background_job_logs via recordJobRun (route.ts:24,83,88). Real cause:
    extractOutcomeMetadata (src/lib/admin/job-log.ts ~92-111) copies only a
    hardcoded whitelist [skipped, matched, inserted, sent, processed, count,
    detail]; none of causality's 7 summary keys are in it, so metadata is
    always null. Brief's Step 2 has NO insertion point (writeRow unexported)
    and its Files omitted job-log.ts. (b) Step 3's SQL uses job_name +
    created_at; real columns are job_type + started_at. Repair dispatched ->
    task-7-brief-REPAIRED.md. DESIGN DECIDED: do not pollute the shared
    generic whitelist with one cron's vocabulary — add an optional per-call
    key allowlist to recordJobRun, declared at the causality call site,
    byte-for-byte unchanged for existing callers.

  Task 8: 2 FALSE, one of them the best catch of the audit. The brief creates
    a PARTIAL unique index then tells the writer to .upsert(onConflict:
    'player_id,metric_id'). Postgres infers an arbiter from a bare column
    list only among IMMEDIATE non-partial unique indexes; supabase-js cannot
    send the predicate. That call fails at runtime. THIS REPO ALREADY SHIPPED
    AND DIAGNOSED THIS EXACT BUG — see migration
    20260701010000_fix_baseball_signals_dedupe_and_disposition.sql:1-33.
    Also FALSE: brief's "mirrors insertNew() exactly" — that arbiter
    (golf_coach_insights_dedup_key) is NON-partial, which is the whole
    difference. Also wrong var name (`rows`; real is `inserts`).

    Auditor's bonus claim that src/lib/baseball/coachhelm/engine-run.ts:893
    is a live instance of this bug is FALSE — I checked: that same migration
    DROPPED the partial index (line 39) and re-added a global immediate
    UNIQUE, so that call site is fine. Do not file it.

    DESIGN DECIDED (verified semantics first): KEEP the partial index — the
    writer's pre-flight read is state IN ('pending','snoozed') only
    (suggestion-writer.ts:415-419) and states include accepted/dismissed/
    expired, which deliberately do NOT block a re-suggestion. A global unique
    would collide with that history and an upsert would overwrite it,
    resurrecting dismissed or clobbering accepted rows — so baseball's
    "make it global" resolution does NOT transfer. Writer keeps plain
    .insert() and instead tolerates SQLSTATE 23505 as benign (concurrent run
    won), every other error unchanged. Index becomes the race backstop, the
    pre-flight read stays the quiet primary path. Repair dispatched ->
    task-8-brief-REPAIRED.md.

PREMISE AUDIT Tasks 9-12 (full detail .superpowers/sdd/premise-audit-C.md):

  Task 9: 1 FALSE + a load-bearing defect. Minor: ratings come from 4 UI
    callers of rateInsightAsPlayer, not 5. Load-bearing: the prescribed
    applyLearnedPreferences<T extends {insightType?: string}> is wired onto
    real `alerts: ComposedInsight[]`, but ComposedInsight (types.ts:472-483)
    has NO insightType and no id. The constraint marks it OPTIONAL, so it
    compiles, and the brief's synthetic {id,insightType} mocks pass green —
    while production a.insightType is always undefined and the reorder is a
    permanent no-op. THIRD instance of compiles+passes+does-nothing. Repair
    dispatched -> task-9-brief-REPAIRED.md, with instructions that the test
    must use real-type values so an absent key goes red.

  Task 10: 0 FALSE. Diagnosis task, hypotheses properly hedged, and the real
    query at genome/orchestrator.ts:67-73 does have the 90-day window +
    status='completed' filter it tells the implementer to look for. Ready.

  Task 11: 0 FALSE claims, but I found a worse problem in code I wrote.
    NOW AN OPEN DECISION, DO NOT DISPATCH until the owner resolves:
    the task conflates two opposite goals. V2's real function
    (pattern-miner.ts:155-158, NOT :143-145 which is the incident comment)
    is `if (roundCount<6) return 2; min(6, max(3, round(n*0.15)))` — it
    RELAXES the floor for low-volume players because it was fixing
    starvation. The prescribed V3 function only ever RAISES above baseMin.
    Its doc comment ("40-round player should clear a higher bar") contradicts
    the task's own opening paragraph (starvation citation). Separate real BUG
    in the prescribed code either way: `Math.min(12, Math.max(baseMin,
    scaled))` caps at 12, silently lowering tee-strategy's baseMin of 15.
    Correct form: `Math.max(baseMin, Math.min(12, scaled))`. Both recorded
    in the plan at commit abd55206d.

  Task 11 RESOLVED 2026-07-25 by owner: "Both — relax, but label it."
    Relax the floor for low-volume players (fixes the starvation V2 already
    learned about) AND surface a thin-evidence label so the number stays
    honest. "Tighten for high volume" is REJECTED. Consequences: Task 11 now
    DEPENDS ON Task 3 (a label over a hardcoded sample_n would be a lie) and
    should follow Task 5 (same insight surface). Gains UI scope. Rewrite
    dispatched -> task-11-brief-REPAIRED.md, with the tee-strategy baseMin=15
    interaction and the min-2 floor left to the agent to resolve from source
    and state as an explicit rule.

  Task 12: 1 FALSE. The illustrative overlap example was invented — v2
    bubble_player is a roster/cut-line insight mapping to category
    mental_game (development.ts:1141), unrelated to putt_bias or putting.
    Replaced with a verified overlap: v2 putting-three-putts
    (mining/stats-insight-generator.ts:822-824, category putting, 3-putts and
    lag putting) vs v3 lag_distance_3putt, which I confirmed has 10 live prod
    rows. Schema claims and the signature LIKE 'v3:%' query were all TRUE.

RUNNING TALLY of plan quality: 12 of 12 tasks examined; 7 carried at least
  one false premise; 4 would have produced code that does not compile, does
  not run, or silently does nothing. Every underlying AUDIT finding has held
  up — the defects are all in the implementation detail I wrote around them.
  Tasks verified ready as written: 3, 6 (patched), 10.

BRIEF REPAIRS LANDED (4,5,7,8,9 written; 11 running). Notable beyond the
  original defects:

  Task 4: verified its own blast radius — nothing outside pressure-gap.ts
    constructs a PressureGapAggregate, so widening it is safe. Also caught
    that the existing 7 aggregate tests BREAK once aggregate() gains the
    loadStandingForMetric call (mock builder lacks .maybeSingle). I checked
    its full-file test replacement: all 13 original test names preserved,
    23 total. Zero dropped.

  Task 5: TWO findings bigger than the wrong path. (a) InsightListView AND
    InsightsFeed are themselves DEAD — zero live consumers, only their own
    barrel + tests. The real live audience="coach" InsightCard render is
    FairwayPlayerInsight.tsx:866,871 at /golf/dashboard/players/[playerId]/game.
    So my brief's wiring target was dead code too. (b) SECURITY: my original
    brief had client code calling getInsightEffectivenessSignals, which uses
    the ADMIN client with no caller-authorization check — that would have
    introduced an authz hole. Repaired brief routes through the auth-checked
    getInsightTrustSignals (coachhelm-analytics.ts), same action
    FairwayEffectiveness.tsx already uses. No redundancy with
    EvidencePanel/WhyPopover/MovementPill/OutcomeBadge — task stands.

  Task 7: recordJobRun is `<T>(jobType, fn) => Promise<T>` with 29 call sites
    across 21 route files. Options-arg design confirmed as the only clean
    seam; implemented as optional extraMetadataKeys merged via Set so
    no-options callers get byte-identical output. duration_ms excluded (it is
    already its own column).

  Task 8: repo already has the 23505 idiom (courses.ts:215) — followed it.
    A multi-row INSERT is atomic so a 23505 rolls back the batch; on conflict
    it early-returns leaving suggestions_inserted at 0 and result.error unset.

  Task 9: BLOCKED ON EXPANDED SCOPE — do not dispatch the reorder alone.
    Verified the whole chain: the reorder can never fire because a coach's
    preferredInsightTypes can only ever be ['unknown'].
      - insights.ts:1598 rating uses interactionType 'feedback', which is in
        NEITHER ACK_TYPES nor DISMISS_TYPES (behavior-learner.ts:63-77), so it
        is NOT COUNTED AT ALL. Renaming its camelCase insightType key would
        change nothing — a trap that looks like a one-word fix. Do not do it.
      - insights.ts:3620 ('action', counted) and :3726 ('dismiss', counted)
        record NO type — only insightTone + confidence. Both INSERT a new row
        with hardcoded insight_type 'pattern_detected' (:3594, :3699) and
        receive a client-supplied ComposedInsight, the very type with no
        insightType. So there is no real type in scope to record.
      - player-feedback.ts:182 is the ONLY writer that does it right.
    Task 9 must therefore ALSO thread AlertInsight.insightType out to the
    client and back through ack/dismiss. Prerequisite Step 0 written into
    task-9-brief-REPAIRED.md. 24 existing golf_learned_behavior rows have no
    usable type; learning starts from zero. No backfill, no deletes.

Task 11 repair landed (task-11-brief-REPAIRED.md). Rule:
  effectiveMinSampleN(baseMin, roundCount) = min(baseMin, max(2,
  round(roundCount*0.15))) — relaxation-only, never exceeds baseMin, which
  fixes the Math.min(12,...) bug that would have clamped tee-strategy's 15
  to 12. Reuses the live InsufficientData primitive
  (fairway/feedback/InsufficientData) rather than inventing a visual. Label
  fires when evidence.sample_n < evidence.min_sample_n_target and only where
  EvidencePanel already renders expanded. Anchors were verified
  programmatically against source (caught 2 indentation bugs).

  TWO THINGS TO RAISE WITH THE OWNER BEFORE DISPATCHING TASK 11:
  1. MAGNITUDE ON TEE-STRATEGY. baseMin=15 was deliberately conservative.
     Under this rule a player with ~10 rounds (the current prod average:
     290 rounds / 30 players) gets an effective floor of
     min(15, max(2, 2)) = 2. That is a 7.5x loosening on the most
     conservative generator — tee-strategy advice off 2 samples. The label
     discloses it but does not prevent bad advice. Consider a per-generator
     relaxation floor (never below baseMin/3, i.e. 5 for tee-strategy)
     instead of a flat 2. The owner chose "relax but label"; this specific
     magnitude is probably not what he pictured.
  2. NEW EVIDENCE FIELD. min_sample_n_target is stamped by
     BaseGenerator.run() going forward, so NONE of the 252 existing rows
     carry it and the label cannot render for any current insight. Combined
     with the generation stall above, that means the feature is invisible
     until new insights are produced. Not a defect — but do not expect to
     see it after shipping. Composites bypass it entirely
     (synthesis.ts:140), so they correctly never show the label.

=== THE ACTUAL ROOT CAUSE, PROVEN (2026-07-25) ===
  Insights are stale because 69% of rounds were NEVER ANALYSED, and the
  mechanism meant to catch that has permanently aged past them.

  Chain, every step verified:
  1. golf_rounds: 290 total, last round played 2026-07-23 (2.2 days ago),
     50 rounds in the last 30 days. Players are ACTIVE — the off-season
     explanation is FALSE (I tested and rejected it).
  2. coachhelm_analyzed_at set on only 82/290. coachhelm_failed_at on 2.
     206 rounds (71%) have BOTH columns NULL = never attempted.
  3. postRoundTrigger is invoked via `after()` on round submit
     (post-round-trigger.ts). `after()` is fire-and-forget and NOT durable:
     if the instance terminates first, it silently never runs and neither
     state column is written. No error, no failure flag.
  4. coachhelm-safety-net exists to catch exactly that. Its predicate is
     status='completed' AND both columns NULL AND created_at >= now()-30d,
     LIMIT 200, every 30 min (LOOKBACK_MS=30d, BATCH_LIMIT=200,
     CONCURRENCY=5). Loop is correct — no player dedupe, calls
     postRoundTrigger per round.
  5. Ran its EXACT predicate against prod:
       eligible the safety net can see NOW ... 0
       completed + both NULL + created_at older than 30d ... 200  <-- STRANDED
       not completed (legitimately skipped) ... 6
     200 + 6 = 206 = the never-attempted count exactly. Fully accounted.
  6. So the cron runs 332 times in 30 days with ZERO failures and ZERO
     effect: it correctly finds nothing, because the backlog aged out of its
     own window. Green cron, no alarm, no work.
  7. The route's line-32 comment: "Widened from 24h -> 30d on 2026-05-23 to
     drain the 112 pre-existing." They hit this before, widened the window to
     drain 112, and the backlog regrew to 200 — the widening drained the
     symptom, the cause (non-durable after()) was never fixed.

  CONSEQUENCE for the owner's complaint: only ~82 rounds ever produced
  insights, which is why 242 of 252 UI-visible insights (96%) are 31-60 days
  old and only 2 are under a week. Then the display caps (6 player / 2 coach)
  cut that stale remainder further. Staleness is the primary cause;
  truncation is the secondary one.

  TWO HYPOTHESES I FALSIFIED rather than reported (both looked right):
   - "The terminal-state write is failing / RLS-blocked." writeTerminalState
     swallows both an error and a 0-row update (post-round-trigger.ts:117-137)
     and only logs. Looked like a silent infinite retry. FALSE: error_logs has
     ZERO '[postRoundTrigger] terminal-state write' entries. The only 2
     matching rows are engine failures ("No active team membership for
     player", 2026-07-12 and 07-23) which correctly stamped
     coachhelm_failed_at — matching the 2 failed rounds exactly. The write
     path works.
   - "It is the off-season, so no new rounds is correct." FALSE: 50 rounds in
     30 days, newest 2.2 days old.

  ENHANCEMENT (not a bug fix): the durable seam already exists. CLAUDE.md
  documents Inngest wired at src/lib/inngest/ for exactly this class of work.
  Moving post-round analysis from `after()` to an Inngest function gives
  retries and durability, which removes the need for a lookback-window
  safety net at all. Prereq: INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY in prod.

  NEEDS OWNER APPROVAL (prod write, deferred): backfilling the 200 stranded
  rounds. Options are a one-off widened-window run or a scoped script. Do NOT
  run without sign-off. Also note 6 non-completed rounds are correctly
  excluded and need nothing.

=== DEAD-SURFACE SWEEP: corrections + real findings (2026-07-25) ===

  MY INSTRUCTION WAS WRONG. I told the sweep agents "a barrel/index re-export
  is NOT a consumer." Applied mechanically that yields FALSE DEAD verdicts,
  because importing THROUGH a barrel is exactly how live pages reach
  components. Correct rule: a barrel does not make a component live on its
  own — you must check whether anything live imports FROM the barrel.

  FALSE DEAD VERDICTS, corrected by reading imports directly. All of these
  are LIVE via one chain: FairwayPlayerInsight.tsx:61 imports InsightCard
  from '@/components/golf/coachhelm/insight-card' (barrel) and renders it at
  :866 (density hero) and :871 (default), audience="coach".
    InsightCard.tsx (932 lines)      LIVE — not dead
    EvidencePanel  (InsightCard:36)  LIVE
    MovementPill   (InsightCard:42)  LIVE
    WhyPopover     (InsightCard:43)  LIVE
    DrillChips     (InsightCard:44)  LIVE
    DrillSheet     (DrillChips:28)   LIVE
    DiagnosisPanel (EvidencePanel:25, rendered :451) LIVE
  DiagnosisPanel's header comment ("Production had 322 V3 rows with this
  structure and ZERO components rendering it") describes the FORMER state.
  It was built as the fix AND wired. That is a success, not a gap.

  GENUINELY DEAD, found with the better method (grep '<Component' for real
  JSX usage, zero hits). Two DIFFERENT categories — do not conflate them:

  (A) SUPERSEDED DUPLICATES — replaced by newer live implementations, so no
      user is missing anything. This is dead weight and confusion, not lost
      value. Deleting is hygiene.
        FairwayPlayerCoachHelm.tsx  1378 lines -> PlayerCoachHelmHome
        FairwayEffectiveness.tsx    1809 lines -> EffectivenessScoreboard
        FairwayMyDevelopment.tsx     885 lines -> DevelopmentDrill
        FairwayMyGameProfile.tsx     284 lines -> ProfileDrill
        v3/TrendDashboard                      -> FairwayTrendBrain
        v3/IntentPill                          -> FairwayIntentControl
        coach/LeakBoard                        -> TeamCategoryLeakBand
        insights/FocusAreaCard (golf variant)  -> fairway FocusAreaCard
      ~4,400+ lines. FairwayEffectiveness is the notable one: its own header
      calls it "the flagship effectiveness surface... answers 'is CoachHelm
      actually helping'", mounted over /dashboard/analytics/coachhelm — now a
      redirect shim to a smaller EffectivenessScoreboard.

  (B) FINISHED CAPABILITY, NEVER WIRED, NO LIVE EQUIVALENT — this is real
      lost value and the cheapest work available:
        charts/PuttingHeatmap    278 lines, finished canvas (distance x
                                 direction); live surfaces show tables
        charts/ShotDispersion    272 lines, finished canvas (scatter +
                                 1sigma/2sigma ellipse); Round Detail
                                 explicitly ships none
        v3/GoalCard              finished single-goal card; GoalsSection
                                 rolls its own markup instead
        signals/SignalsToolbar   215 lines — filter chrome for the signals
                                 queue that 548 rows badly need
        signals/ScanTeamControl  135 lines — team-wide scan trigger
        InsightTrustChips        (already known)
        insights/DrillAttachment, insights/PlayerFocusAreas,
        insights/InsightCallout, v3/HeroNarrativeCard,
        insight-card/HeroInsightCard, player/FocusAreasGrid (413),
        player/PerformancePrediction (235)

  CORRECTION TO MY OWN AUDIT/PLAN: Task 2's brief named three user-facing
  render sites for "calibrated confidence" — PlayerCoachHelmHome.tsx:290,
  FairwayPlayerCoachHelm.tsx:1203, PerformancePrediction.tsx:51. The latter
  TWO ARE DEAD COMPONENTS. The calibration bug reached ONE surface, not
  three. The fix is still correct; my stated user impact was inflated 3x.

=== ROOT CAUSE FOUND 2026-07-25: "accurate insights don't reach the UI" ===
  It is NOT a filter bug and NOT bad data. The pipeline works; the UI
  truncates it. Quantified against prod (read-only):

  252 active v3 insights, 24 players, avg 10.5 each, max 18 for one player.
  All 252 have populated evidence.
    - Player's own /dashboard/coachhelm: hard cap 6
      (coachhelm/page.tsx:214 getInsightsForPlayer(..., {limit: 6})).
      130 of 252 (52%) are never visible to the player, and there is NO
      view-more/pagination path anywhere for #7+.
    - Coach's per-player deep-dive (/dashboard/players/[playerId]/game):
      fetch capped at 4 (FairwayPlayerInsight.tsx:460) then
      `out.slice(0, 2)` for display (:612). 207 of 252 (82.1%) never appear
      in that view. NUANCE, stated honestly: the file's own comment says
      "The plan still gets the full list" — so the remainder may feed the
      development plan rather than vanish entirely. The 82% figure is
      specific to that insight view, not "reaches no surface at all".
    - That route's SSR insight query (.limit(20)) is DEAD: the prop is
      commented `insights: InsightRow[]; // legacy; client re-fetches
      evidence rows` (FairwayPlayerInsight.tsx:175). 20 rows fetched
      server-side and discarded on every page load.

  CORRECTION to trace-A's "most severe" claim: it flagged an asymmetry where
  the coach Signals queue lacks the `evidence IS NOT NULL` filter that the
  whole player-facing delivery layer requires. The mechanism is real, but I
  queried prod: ZERO rows have evidence NULL or '{}'. It currently blocks
  nothing — a latent trap, not the cause. Do not report it as the answer.

  CORRECTION to brief-repair-5: it claimed
  src/components/fairway/pages/coachhelm/ "is not in the repo". FALSE — the
  directory exists with 53 files (FairwayPlayerInsight.tsx lives there).
  What is absent is InsightCard.tsx / InsightListView.tsx specifically. Its
  operative conclusion still stands (the live card is
  golf/coachhelm/insight-card/), but the Task 5 supersede banner in the plan
  overstates this and should be softened when Task 5 is dispatched.

Task 2 REVIEWED (verdict: .superpowers/sdd/task-2-review-b.md). Spec ✅ for
  the literal steps; QUALITY: Needs fixes — one Important, plan-mandated.
  NOTE ON DELIVERY: the first reviewer (opus) completed and went idle FOUR
  times without its verdict ever arriving. A replacement (sonnet) did the
  same until asked to write to a FILE, which worked first try. Messages have
  been ~50% reliable this session; file writes 100%. Use files for anything
  that matters.

  IMPORTANT (my plan's fault, not the implementer's): generateRoundReview
  (orchestrator.ts:629) calls .calibrate() at :696, and the generateInsights
  it invokes at :660 calls it at :1111/:1135/:1165 — with NO
  ensureCalibrationBootstrapped() anywhere on that path. generateRoundReview
  never calls analyzePlayer (the only this.analyzePlayer( in the file is in
  generateAlerts:814, which is fine and bootstraps transitively). It is an
  independent production entry point (round-review-system.ts:1004,
  api/golf/rounds/generate-review/route.ts:119) feeding
  insight-composer.ts:442's reasoning.calibratedConfidence — user-facing.
  Under Vercel per-route isolation that route rarely has a warm
  analyzePlayer, so ROUND REVIEW STILL SHOWS THE PRE-FIX BUG. Root cause:
  my Step 3 said "call it at the top of analyzePlayer" and nowhere else.
  I treated this as an incomplete plan rather than a plan-vs-review conflict
  needing owner arbitration — it is a gap that defeats the task's own stated
  goal, and the fix is one line consistent with that goal.

  All three named risks came back clean: predicate correct for all 5
  canonical starts (non-canonical values skipped via the retained -1 guard);
  0.65->0.80 holds because predictedCount===5 fails a `< 5` guard; the
  flag-before-await is benign (a concurrent second caller gets raw
  passthrough, which is the stated contract). Task 1's fixture still pins
  what it was written to pin.

  FIX DISPATCHED (one subagent, all findings): (1) bootstrap
  generateRoundReview; (2) add logServerError to the bare catch at
  orchestrator.ts:260-269 — a silent catch is the exact shape that hid
  today's month-long stall; (3) reset the guard flag on FAILURE so a
  transient blip stops permanently disabling calibration for the process
  lifetime — this is a deliberate change to the brief's contract and an
  improvement, flagged as such; (4) correct the docstring's overclaim.
  Tests required: a generateRoundReview bootstrap test that genuinely fails
  before fix 1, plus a flag-reset test.

  KNOWN CEILING, accepted, not fixed: ensureCalibrationBootstrapped never
  re-fires once successful, so a long-warm process serves an increasingly
  stale calibration snapshot after the nightly cron recomputes. Inherent to
  the idempotency contract.

Task 1: complete (commits 19a3ee91f..32316ad7c, review clean — Approved).
  Reviewer independently confirmed the epsilon bug from source and verified
  the 0.85 fixture does NOT mask a filter regression (totalPredictions
  accumulates from every forType row regardless of range mapping, so the
  toBe(11) assertion fails identically either way). Its one Minor was
  process — "make the epsilon finding a tracked follow-up, not a report
  note" — already satisfied by Task 2's Step 0 (commit d91c3a4a1).
  Reviewer's one ⚠️ (couldn't verify typecheck/lint from the diff) resolved
  by the controller: tsc --noEmit emitted zero diagnostics, eslint exit 0.

PLAN AMENDED 2026-07-24 (Task 2 Step 0 added). Task 1's implementer flagged
  that it had to move a fixture off `bucket: 0.8` to make its test pass, and
  blamed a boundary bug in `bootstrapFromDb`. Verified in source: worse than
  a boundary case. `computeBucketRows` documents that the stored `bucket`
  column IS the range start (always 0/0.2/0.4/0.6/0.8), but bootstrapFromDb
  maps it with `row.bucket < b.rangeEnd + 1e-9` — epsilon on EVERY bucket,
  so each start also satisfies the band below it and findIndex takes that
  wrong one. 4 of 5 buckets misfile one band low; only 0 is correct.
  Against prod (0.4=1/1, 0.6=5/4, 0.8=11/11) Task 2 as originally written
  would have loaded the 11/11 bucket into the 0.6-0.8 band, rendering a raw
  0.65 confidence as 100% instead of 80% — actively worse than today's
  inert raw passthrough. Plan's Task 2 now carries a prerequisite Step 0
  (fix predicate + regression test + restore Task 1's fixture to 0.8);
  task-2-brief.md re-extracted. NOT a plan-vs-review conflict: the plan
  asserted a fact about source that turned out false, not a design choice.

Task 2 remaining premises re-verified before dispatch (same false-premise
  class as above): orchestrator.ts:48 does import ConfidenceCalibrator from
  './reasoning' (right target); createEmptyCalibrationRecord IS exported from
  reasoning/confidence-calibrator.ts:98 as an alias of the private
  createEmptyRecord (brief's test imports compile); bootstrapFromDb is NOT in
  reasoning/index.ts:8, so the brief's Step 5 contingency will correctly fire.

MINOR for the final whole-branch review (do NOT expand Task 2): there are two
  ConfidenceCalibrator implementations. src/lib/coachhelm/v2/feedback/
  confidence-calibrator.ts is a parallel duplicate (own CalibrationRecord,
  calibrateConfidence, updateCalibrationRecord, createEmptyCalibrationRecord,
  calculateBrierScore) with NO DB load and no calibration call sites —
  reachable only via feedback/index.ts -> v2/index.ts barrels. The rendered
  numbers all come from reasoning/. Overlaps Task 12's coexistence scope.

Task 1: WITHDRAWN AND REPLACED. Original specified a prod DELETE of the
  0%-accuracy calibration buckets, justified by "Task 2 would load them".
  FALSE — bootstrapFromDb (confidence-calibrator.ts:218) already filters
  rows by prediction_type, and Task 2 passes 'score_to_par', so the stale
  rows are unreachable. Destructive migration reverted (bac83fd85 ->
  revert). Task 1 is now a regression test pinning that type filter.
  Flagged by the harness security check; premise verified false in source.
