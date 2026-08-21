# NIGHT TRIAGE — 2026-08-20/21 (owner-ordered)
Sources: GitHub issues (33 open) · Sentry (inventory pending) · Helm Bridge (238 signatures / 95,215 rows since 2026-03-13) · admin_events
Verdicts: FIXED-ALREADY (close w/ evidence) | NOT-REAL (close w/ reason) | FIXED-TONIGHT (PR#) | DEFERRED (owner decision needed, stated)
## Waves
- W1 dispatched 23:15: sentry-inv, issues×4, bridge×3

## GitHub issues — slice 3 (w-issues-3, #1487-#1501) DECIDED 23:2x
- CLOSED (fixed, evidence commented): #1491 (2e0632326), #1499 (b387973a3 + 3eeebcf47), #1500 (12561d5db), #1501 (80472667a)
- CLOSE-AFTER-PROMOTE: #1492 — code fixed 9f85cdf92, prod still runs pre-fix (issue's own re-measurement); close with alias evidence after tonight's batch promote
- FIX QUEUE:
  - F1 #1487 remainder: FairwayTeamInfo viewer-zone → isGolfTaskOverdueInZone (thread golf_teams.timezone through TeamForClient; 3 selects; delete isGolfTaskOverdue after) [M] + en-CA todayIsoInZone hardening + test [S]
  - F2 #1488: effectiveness metricToRoundField → category-keyed 4 SG families; rounds-based windows; labelled/eligible coverage in UI; unmapped-list test [M]
  - F3 #1496 coach side: get_coach_today_schedule needs p_today_date date param (avoids the all-day off-by-one that killed the first draft); DROP+CREATE migration + dashboard-data.ts:770 caller change; MUST pass db-migration-reviewer before touching prod [S-M]

## GitHub issues — slice 1 (w-issues-1, #1470-#1478) DECIDED 23:3x
- CLOSED completed: #1474 (7feaeb545, 0 discards since 08-18), #1478 (54b97e591 + bfe938e09; mobile-hidden = intentional)
- CLOSED not-planned: #1476 (root-cause mechanism factually wrong — reviews are lazy-on-view), #1477 (two distinct auth accounts, not duplication)
- NEW ISSUES FILED: #1540 coach_chat ~46% ungrounded discard (invisible to error_logs method); #1541 same-name join warning (S)
- OPEN w/ comment: #1475 OWNER-CALL (dormant-by-data composite rule: delete/rebuild/leave), #1471 + #1472 scoped backlog (M-L / L feature builds, not overnight work)
- FIX QUEUE adds:
  - F4 #1470: ALL selects every member id; >8 rosters use initials-only fallback; test [M]
  - F-DB1 #1473: backfill steps 1-3 via MCP (snapshot + 22-row UPDATE, non-destructive); step 4 (6-row golf_events DELETE) left for owner eyeball — issue stays open scoped to step 4
  - (candidate) #1471's narrow half: ungate conflict-check from attendee selection [S] — decide after all slices in

## GitHub issues — slice 2 (w-issues-2, #1479-#1486) DECIDED 23:4x
- CLOSED completed: #1479 (3f1a2c813), #1480 (54b97e591), #1483 (demo escape hatch), #1486 (structural CI fix + specs; live-green confirmed run 32440537042)
- OPEN w/ comment: #1481 test-coverage backlog (top item already resolved; next: anomaly-detector/baselines), #1482 copy-rewrite backlog, #1485 OWNER-CALL (3-way: wire/wire-partial/delete forecaster)
- FIX QUEUE adds:
  - F5 #1484: mock getPlayerRoundOptions in StatsSpineStage.hooks-stability.test.tsx (pattern already in file) [S]
  - F6 (optional, capacity) #1481 next item: unit tests for v2/stats/anomaly-detector.ts + baselines.ts [M]
- VERIFY QUEUE: V1 — SELECT golf_coach_insights lag-cascade figures: byte-identical 43%/57% across players? (feeds #1482 comment)
- V1 DONE: lag-cascade identical figures = demo-clone players (verified via golf_team_members join), not a shared-value bug. #1482 commented; copy rewrite unblocked.
- w-fix-1 dispatched: F5 (#1484 mock), F4 (#1470 ALL-select), F1 (#1487 tz) — serial, 3 PRs, auto-merge armed.

## GitHub issues — slice 4 (w-issues-4, #1502-#1511) DECIDED 23:5x
- CLOSED completed: #1507 (resolved by deliberate deletion a259fa296)
- OPEN w/ comment: #1502 (coupled to #1475 decision), #1511 (fan-out hypothesis, post-promote logs will name the slow leg)
- FIX QUEUE adds (re-prioritized):
  - F8 [TOP] #1504+#1508 one investigation: React #310 on player game/genome, hit TODAY 17:21 UTC — debugger agent after w-fix-1 frees the tree
  - F7 #1503: genome refusal sentinel (crowd-out now real: 33 eligible vs 25 slots, 7 stuck) [S-M, may need migration]
  - F9 #1505: staleness → read path w/ window_end + stats-cache fallback, resolve double-print [M]
  - F10 #1506: exposure dedup skip-if-exists (23.5 rows/bucket re-confirmed) [S]
  - F11 #1511: Suspense split + timing [M, after promote logs]
- SERIALIZATION: one tree-mutating worker at a time. Wave order: w-fix-1 (running) → F8 debugger → wave-3 worker (F2, F10, F7, F9) → F3/F11/F6 as capacity allows. F-DB1 (me, MCP).
- F-DB1 DONE (me, MCP): #1473 backfill steps 1-3 committed. 43→21 nulls (22 fixed: 17 Fall + 5 Summer), synced_but_still_null=0, events untouched (1769), backup_class_semester_20260813 = 67 rows. Issue re-scoped to step-4 DELETE + 17 orphans (owner).

## Bridge critical+error (w-bridge-1) DECIDED — 152 sigs: 8 ACTIVE-REAL, ~24 NOISE, ~114 DEAD, 0 UNKNOWN
- CONFIRMED DEAD w/ root cause: round-destruction cluster (e196ef6a8, zero after 04:10 UTC), inngest.signatureValidation (env fix 13:12, drained 13:43), GolfRoot/v3-storms/eventReminders/crm bursts, calendar toLocaleTimeString (8a0b74686), getAttendanceReport jersey_number (code comment + live schema verified)
- F8 SCOPE WIDENED: React #418/#310 — calendar hydration (n=125+86+78, #310 last TODAY 17:21) + player game/genome (#1504/#1508) = one investigation
- W-TIMEOUT dispatched: 17:07-17:30 UTC statement-timeout cluster; hypothesis = 13:12 ET deploy fallout (deploy at 17:12 UTC — 5 min before cluster start? verify)
- FIX QUEUE adds: F12 #syncClassToCalendar malformed timestamptz "13:00:00:00" in calendar-sync.ts [S, owner sore spot]; F13 getInsightsForCoach logs payload as error [S]; F14 noise downgrades (soft_failure→warn, Capacitor plugin rejections, dynamic-server notices, gmail cron dash/underscore tag unify, SIGNUP_ACCESS_CODE critical→info) [M, optional]
- OWNER LIST adds: SIGNUP_ACCESS_CODE unset = consistent with owner's join-code-only flow, confirm intentional; STRIPE_* entirely absent at project level (billing live?); Vercel API token for Bridge deployments widget rejected as invalid (rotate in dashboard); addSecondTeam RLS 42501 policy review (1 hit 8/5, wave-3 analysis)

## Sentry (w-sentry) — inventory DONE, mutations DISPATCHED
- 254 unresolved (exhaustive, 5 timesSeen buckets): DEAD 83, NOISE 29, ACTIVE-REAL 42, UNKNOWN 100
- OVERRIDES (cross-ref w/ bridge): rounds cluster NC/NG/NF/NE/NJ/NH/51/ND = round-destruction incident (dead, e196ef6a8) → resolve; MQ = inngest cluster (n=149 match) → resolve; ME = likely our own signup E2E test traffic + expected unset-env notice → drill then mute
- EXECUTING: resolve 83 DEAD + stale-UNKNOWN (>14d) + stale hook cluster; mute 29 NOISE; drill recent UNKNOWNs + CK/MB/KC/MC/P0/NZ/NY
- F8 corroborated from Sentry: hook-count on genome (CN) + calendar (NT) recent and real
- F15 candidate: IndexedDB offline-sync transaction races (P0/NZ/NY) — pending drill-down (stale-bundle churn vs real regression)

## admin_events (w-bridge-3) DECIDED + EXECUTED — 3,661 → 369 unresolved
- ROOT CAUSE (structural): auto-resolve.ts quiet-window heuristics can never fire for continuous telemetry; classifyIncident already knows actionable:false but nothing resolves those rows
- RESOLVED tonight w/ evidence (3,292 rows): inngest 149, incident cluster 12, savePartialRound 21 (e196ef6a8 + #1537), telemetry/empty-state/integrity 2,448, access denials 119, orphaned audit rows 538, chunk-stale 3, gmail transient 2
- REMAINING 369 = genuinely open: llm.budget 35 (classifier or seed), insight-delivery degradations 77 (F13 scope), React #418/#310 17 (F8), Load-failed ~21, dashboard timeouts 6 (w-timeout), AI Gateway credit 40 (OWNER: check billing), SIGNUP_ACCESS_CODE 41 (OWNER: confirm by-design → downgrade to startup check), long-tail
- FIX QUEUE adds: F16 auto-resolve Rule D — bulk-resolve actionable:false families [M, prevents rebuild]; F17 audit-log rows (login/signup/deploy/round_submitted/security/system) set resolved at write or route to activity log [S]
- dup-org title pattern matched 0 (3 rows left, harmless)

## Bridge warning/info (w-bridge-2) DECIDED — 4 ACTIVE-REAL, ~19 NOISE (correctly engineered), 15 DEAD, ~35 long-tail
- F18 NEW: pattern-miner starvation = 2 players (16-28 rounds) starved 3 months, zero patterns [M root-cause + S per-entity dedup]
- F19 NEW (merges bridge-3 item 3): golf_shots query perf — fetchShotDriversByCategory (90 aborts + 53 stmt-timeouts) + getTopInsightForPlayer same budget; check index + the double-permissive RLS (golf_shots_select + admin_read_all) [S-M]
- inngestSendFailed n=9 last 8/5 = same outage family as signature cluster, predates 13:12 fix → VERIFIED-RESOLVED, no action
- NOISE/DEAD: no action (existing suppression system is correct; v3.llm.budget fixed 3464e4374)

## CONSOLIDATED FIX QUEUE (priority order)
F8 React #310/#418 (crash, live today) > F12 syncClassToCalendar tz [S] > F10 #1506 dedup [S] > F7 #1503 sentinel [S-M] > F19 golf_shots perf [S-M] > F13 insights logging [S] > F16 rule D [M] > F17 audit-at-write [S] > F2 #1488 [M] > F9 #1505 [M] > F18 starvation [M+S] > F14 downgrades [M] > F15 IndexedDB (await sentry drill) > F11 #1511 (post-promote) > F3 #1496 migration (careful) > F6 tests (optional)

## Timeout incident 17:07-17:30 UTC (w-timeout) — CLOSED with root cause
- Verdict: SPECIFIC-QUERY, not deploy fallout. Recurrence (smaller) of the round-autosave lock pile-up; both bursts implicate Guilford (b714c30f). Fixed MID-INCIDENT at 17:21:26 UTC by the FOR UPDATE NOWAIT migration on save_partial_round_atomic; errors stop immediately after. Indexes ruled out (advisors clean on all 9 paths' tables); small instance (max_connections=60) means write-side pile-up starves unrelated reads.
- Resolved 26 more admin_events rows from the incident window (with cause)
- FIX QUEUE adds: F20 submit_round_atomic lacks the NOWAIT guard — same lock, same destroy-class risk as the round that was lost; verify current prod function def first, then migration + db-migration-reviewer [S-M, HIGH]; F21 batch row-by-row hole/shot inserts into set-based [S-M, latency]
- F20 SCOPED (prod fn def read): submit_round_atomic has NO explicit FOR UPDATE; it IS transactional w/ 30s/15s timeouts (not a destroy vector — deletes roll back on failure). Real gap: check-then-update isn't single-flight → 15s lock-wait + ugly error under contention w/ autosave. Fix [S]: replace the PERFORM existence check with FOR UPDATE NOWAIT + 55P03 handler returning clean 'save in progress' (mirror of save_partial_round_atomic). Migration + db-migration-reviewer, next tree slot.
- F21 CONFIRMED: hole/shot inserts are row-by-row loops (both), set-based rewrite [S-M, latency only].
- INCIDENT (mine, owned): backup_class_semester_20260813 (the backfill's undo snapshot) redded the Database types drift check on all open PRs (#1542/#1543 auto-merge blocked). Repair: triggered types-regen workflow_dispatch (run 32444047992) → auto-PR types/auto-regen → merge → update-branch both PRs. Exactly the failure mode the workflow was built for this afternoon.

## Fix wave 1 (w-fix-1) COMPLETE — tree freed
- PR #1542 (F5, #1484 root cause: stats-data mock) — auto-merge armed
- PR #1543 (F4, #1470 ALL selects whole roster; >8 = initials+id-hash tint; cap silent-refusal fixed too; known follow-up: body overlay palette still cycles at >8) — armed
- PR #1545 (F1, #1487 team-tz overdue badges; isGolfTaskOverdue deleted; todayIsoInZone formatToParts hardening) — armed; needs update-branch after #1544 like the others
## Fix wave 3 (w-fix-3) DISPATCHED — F12, F10, F13, F7, F16, F17 (6 PRs, serial)
- F8 (React #310/#418) gets exclusive tree after w-fix-3 returns

## Sentry (w-sentry) EXECUTED + VERIFIED — 254 → 29 open
- 178 resolved (83 dead + 9 overrides + 86 stale w/ auto-reopen notes), 47 ignored (29 noise + 18 drill-down reclassified), 29 genuinely active left open (aligned w/ fix queue)
- Drill-downs: ME/CK/MB/KC were SUCCESS/info traces surfacing as Sentry issues (cron "sent=12 failed=0"!) → muted; F14 gains a sub-item: stop shipping level:info/success server traces to Sentry as error events (source-level, else new signatures keep spawning)
- MC (undici socket closed, mobile Safari, no dest URL) left open — needs instrumentation before actionable
- F15 CONFIRMED REAL: IndexedDB trio = ONE incident, single Capacitor-iOS user, stack implicates use-offline-sync.ts transaction teardown (race, not stale-bundle: 17:54 ET sits between deploys) [S-M, after F8]

## F19 (w-timeout) INVESTIGATION DONE — root cause: planner COST mis-estimate on RLS helper
- can_read_golf_shot_detail (SECURITY DEFINER, 6-table join) at default COST 100 → planner seq-scans detail tables evaluating it row-by-row; 877ms→105ms (8.3x) verified live-rolled-back with COST 10000; indexes already exist, no policy/semantic change
- CORRECTION: getTopInsightForPlayer reads golf_coach_insights only (clean 23.7ms) — its ~30 timeouts were the shared contention incident, not query shape
- golf_shots policies already consolidated (2 SELECT, matches 08-17 migration); flagged cleanup: golf_coach_insights redundant policy pair (not implicated)
- Deferred (measured fine): owns_golf_shot/is_golf_team_coach/is_golf_team_player same default-COST gap
- w-db-review-1 (db-migration-reviewer) dispatched on the ALTER FUNCTION ... COST 10000 statement; on approval: apply via MCP + migration file in next tree slot
- F19 APPLIED TO PRODUCTION: migration can_read_golf_shot_detail_planner_cost (ALTER ... COST 10000 + grant re-assertion, lock_timeout 3s). Verified: procost=10000, anon EXECUTE=false, authenticated=true. Pre-flight sweep clean (only the 2 expected policies call it). Review: APPROVE-WITH-CHANGES (w-db-review-1) — remaining changes for next tree slot: (a) mirror migration file in supabase/migrations/, (b) schema-budget test asserting procost=10000 (guards against CREATE OR REPLACE silently resetting to 100), modeled on golf-shots-select-policy-count.test.ts replay pattern. If Bridge timeouts don't fully clear, first place to look = the coach-path branch (07-28's worst number).

## F18 (w-timeout) DONE — starvation root-caused
- 0c82eefb: real edge case — practice-heavy roster (14/16 practice) makes round-type conditions structurally inapplicable; rest/rust signal 0.56 vs 0.6 impact floor (93%). Gate calibration = coachhelm-reviewed change → GitHub issue filed (see above cmd output #). 49ffe06d SELF-RESOLVED via 07-30 retune (3 active patterns now).
- F18b (dedup fingerprint [S]) appended to w-fix-3 as FIX 7
- NEW URGENT: 49ffe06d has 38 in_progress rounds (18 created TODAY) — retry-storm suspicion; w-timeout investigating (still-accumulating? creator path? blast radius? cleanup proposal — no deletes without approval)
- BUG IN MY OWN TYPES-REGEN WORKFLOW FOUND: peter-evans auto-PRs are created with GITHUB_TOKEN → GitHub triggers NO workflows on them → required checks never report → auto-merge can never fire. #1544 sat 18 min with zero CI runs. Worked around via close/reopen (checks now running, auto-merge re-armed). F22 queued: make types-regen.yml (and check docs-regen.yml for the same trap) self-trigger CI — close/reopen step in the workflow or a PAT.

## in_progress pileup (w-timeout) — SOLVED + CLEANED
- Root cause: CI's full e2e job ran on every push to main against PRODUCTION (real secrets, real test account rinin376@gmail.com = player 49ffe06d on the REAL Guilford roster); golf-round.spec's save-in-progress test seeded a junk round per run, no teardown. Already stopped by owner's 65fe08a7b (manual-only e2e); empirically clean 9+ hrs; blast radius = exactly this one player.
- CLEANED: 37 junk rounds deleted (backup_ci_junk_rounds_20260821 = 37 rows kept as undo; 666 holes cascaded; 0 orphans; the 1 genuine 07-25 round preserved; junk_left=0 verified)
- F23 queued: e2e teardown + stop pointing manual e2e at prod creds/real roster [S-M + owner decision]
- OWNER LIST adds: e2e test account lives on the real Guilford roster — should move to a demo team
- Types-drift trap round 2 (backup table): re-triggered regen (run 32445445890) folding both backup tables into PR #1544 via same-branch update; background job re-arms after close/reopen

## F20 REVIEW BACK (w-db-review-1): APPROVE-WITH-CHANGES — spec FINAL
- NOWAIT → bounded wait: reviewer correctly argues client-abort fix (10s→35s, landed) already closed the data-safety hole; submit is terminal, common-case brief waits should SUCCEED. Final shape: guard block w/ SET LOCAL lock_timeout='3s' (picked from pg_stat_statements: autosave mean 107ms/sd 549ms, and autosave can no longer queue) + PERFORM...FOR UPDATE + EXCEPTION WHEN lock_not_available (55P03 — raised identically by lock_timeout expiry) → RETURN {success:false, error:'busy'}; restore SET LOCAL lock_timeout='15s' after guard; FOUND semantics confirmed (function-scoped, proven shape in 20260820170000).
- REQUIRED in same unit of work: (a) golf.ts carve-out BOTH submit call sites (1909-1945, 2046-2083) — 'busy' must not logServerError at error severity (else Bridge shows a new error class at ship time); (b) symbolic code 'busy' not a sentence, client owns the friendly string; DROP the retryable field (nothing reads it); (c) build CREATE OR REPLACE from fresh pg_get_functiondef pull, then DIFF against prod def to confirm all 3 SET clauses + secdef survive verbatim (CREATE OR REPLACE resets everything but owner+ACL); (d) REVOKE/GRANT re-assertion (confirmed no-op — 07-03 dynamic sweep already closed the 05-27 anon grant).
- Confirmed safe: 'busy' can never reach attemptDirectSubmitFallback (not 'internal_error', rpcError null); no deadlock possible; completed rounds take no lock.
- DB WAVE (next tree slot, one worker): F20 (migration+carve-out+tests) → F19b (COST migration file + procost schema-budget test) → F22 (auto-PR trigger trap in types-regen.yml + audit docs-regen.yml) → F23 (e2e teardown + prod-creds note)

## Completeness pass (w-timeout) — 0 UNMAPPED. "Don't miss anything" bar met.
- All 343 remaining admin_events rows bucketed, sum reconciles exactly; insight-delivery 77 reconciles (43+21+11+2)
- EXECUTED: +69 more resolved (64 shot-drivers/getTopInsight predating the COST fix — procost=10000 re-verified live; 2 toLocaleTimeString predating 8a0b74686; 3 dup-org). admin_events unresolved ≈ 274, every row mapped.
- Sentry: 15 more reclassified as resolved (14 = the 17:07-17:30 incident, 1 = calendar fix) — w-sentry executing; NT decision delegated (keep open if it's the hooks-order stack). Sentry genuinely-open after this: ~14.
- Newly noted routine-telemetry families (no action): llm.compose discards (guardrail working), cron success summaries, signup validation

## Sentry FINAL: 254 → 15 unresolved (14 resolved this pass; NT kept open — right call)
- KEY F8 INTEL: the "React #310 hit today 17:21 UTC" that two workers cited as proof #1504/#1508 is still live is actually NT = hooks-order error on /golf/dashboard/CALENDAR (Mobile Safari), firstSeen 17:21:00.056 — NOT the player game/genome route. The genome/game hits are last-seen 8/18. So F8 has TWO candidate surfaces (calendar + player-game/genome), same error class, possibly one shared component — debugger brief must include this.
- Remaining 14 open: CN, E0, KX, HA, "3", MC, GF, BV, KS, K8, KT, P0/NZ/NY — all mapped (F8, F15, MC-instrumentation, or standing items in sentry.md)

## Fix wave 3 (w-fix-3) COMPLETE — 6 PRs armed + 1 already-fixed
- F12/FIX1: ALREADY FIXED on main (f888fa6c7 #1294, 08-06, normalizeTimeOfDay + regression test re-run green) — bridge error predated it. No PR needed.
- FIX2 #1546 (exposure dedup) · FIX3 #1548 (postgrest unparseable-2xx central-sink fix — better than brief) · FIX4 #1549 (genome refusal marker, no schema change) · FIX5 #1550 (Rule D + operator-gated belt-and-braces) · FIX6 #1551 (3 real insert sites traced; born-resolved) · FIX7 #1553 (dbFingerprint — the field that actually feeds admin_events; Sentry fingerprint too)
- Known flake: no-tranwarm-typo.test.mjs 5000ms timeout under CI load (pre-existing) — watch #1546's aggregate
## DB wave (w-fix-4) DISPATCHED — F20 (migration file + carve-out; commander applies), F19b (mirror 20260821035329 + procost test), F22 (auto-PR CI-trigger trap, research-first), F23 (e2e teardown)
- After w-fix-4: F8 debugger gets fully exclusive tree (with the NT-calendar intel)

## DB wave (w-fix-4) COMPLETE — PRs #1554-#1557 armed
- #1554 F20: submit single-flight (3s bounded) + BOTH call-site carve-outs + observe-action-result soft-failure tier for 'busy' (withAdminObserved wrinkle caught) + tests. MIGRATION NOT YET APPLIED — I apply to prod after merge.
- #1555 F19b: mirror migration (false "sibling precedent" claim caught+removed) + procost replay test
- #1556 F22: research CONFIRMED same-token close/reopen does NOT retrigger CI (my manual one worked only because my PAT ≠ workflow token); wired secrets.REGEN_PR_PAT || GITHUB_TOKEN on both regen workflows + runbook note. OWNER LIST: create REGEN_PR_PAT secret (fine-grained PAT, repo:PR scope) to make auto-regen PRs self-merging.
- #1557 F23: e2e teardown via real UI discard (XPath ancestor idiom; text() first-pass bug caught pre-commit) + prod-seeding header warning
## F8 (w-debug-f8, debugger) DISPATCHED — exclusive tree, both surfaces, rule-outs + reduced-motion landmine lead, real-component regression test required

## F8 (w-debug-f8) CONCLUDED — honest negative, no guess-fix
- Reframe: CN = Sentry-merged cross-app bucket (golf + baseball routes); crash frame in Next AppRouter internals (vendored React canary); whole-repo rules-of-hooks lint = 0 violations; 14/14 clean repros of both #1504 shapes on main; prior 'fix' 89c287161 shown to be a no-op rename
- NT (calendar, 1 event, 1 sec, iOS WKWebView after 4x 'Load failed') = unreproduced, plausible-network-blip, NOT ruled either way
- EXECUTED: #1504 updated w/ full evidence + promote-then-observe plan (SENTRY_AUTH_TOKEN confirmed in prod env → post-promote events should symbolicate); #1508 CLOSED as duplicate
- Post-promote watch item: if NT/CN persist symbolicated → escalate to Next.js (cross-product = framework-level)
- Tree verified returned clean at c6c144ab7
- 1554/1555 lint fixed (LT05 wraps, CP02 lowercase; #1555 + honest search_path re-assertion w/ repo-side note; empirically verified against sqlfluff + semgrep + ratchet + tests) — pushed, auto-merge armed, fresh CI queued

## MORNING SCARE (owner 07:28 ET) — RESOLVED as display bugs, zero real failures
- DB truth: 0 rounds created/touched since midnight, 0 submit errors, Sentry 0 error-events since 06:00Z; 10 in_progress all-time (1/player, stale); max coach visibility 3 (UNCW); owner's coach account sees 1
- PRIMARY SURFACE (live-confirmed path): /golf/admin DEFAULT Overview tab "Rounds" card (OverviewBriefing.tsx:65-71) — stuck = total_score==null && created_at>2h: any-status + wrong clock + one red "Stuck" row per round → up to 10 stacked red lines. Secondary: RecentActivityFeed score-derived label + no age-out; Tracer priority +40 no decay; Health-tab unscoped "N incomplete"
- Alternative candidate (real data, not bug): owner's own team has 12 in-progress TASK assignments (2 June tasks never completed by 7/5 players)
- w-fix-5 PR in flight: FIX A-E (labels from status, 48h age-gate, stuck-vs-abandoned tiering, priority decay, Overview card status+updated_at+rollup)
- HARDENED: RLS enabled + anon/authenticated revoked on all 3 backup/audit tables (advisory caught my overnight snapshots exposed via PostgREST defaults)
- Cleanup candidates (owner ok needed): Codex Sprint Course 3 round (May, test), Ben Potter's Goodyear duplicate pair (7/15, teamless) — NOT deleted
- F20 APPLIED TO PRODUCTION (post-merge of #1554): submit_round_atomic single-flight guard live; verified prosecdef=t, FOR UPDATE + 55P03 busy handler present, proconfig all 3 settings intact, anon=false/auth=true. Note: version recorded by MCP differs from the repo file's 20260821043500 (same precedent as 20260820170000→172125, documented).
- #1555 pgTAP catch: my suggested search_path re-assertion DROPPED pg_temp vs the defining pin — test 18 refused it; prod unaffected (pre-addition version applied). w-fix-4 pushed the correct single-string form ('public, pg_temp'). ALSO: near-miss of the shared-HEAD trap — w-fix-4 parked on its branch while w-fix-5 had uncommitted edits; both coordinated explicitly (w-fix-5 verifies HEAD before commit; w-fix-4 frozen). MY PROCESS ERROR: dispatched w-fix-5 while w-fix-4 still had branch work pending — serialize means serialize.
- #1559 COMPLETE (w-fix-5): FIX A-E done — new getAdminStuckRounds query (status+updated_at, no RPC change), shared classifyInProgressActivity + stuck-rounds-rollup so Overview/Tracer can't drift; alerts rollup; KPI "N incomplete" subtitle deferred w/ reasoning (data-completeness vs staleness intent unclear). 25 new tests; 1,390-test admin/actions/lib suite green. Tree back on main clean; w-fix-4 releasable.

## BRIDGE ACCURACY AUDIT (owner-ordered, 6 auditors)
- w-audit-4 (core: Overview/Errors/Health/Activity/Deploys/Auth): 8 ACCURATE, 0 wrong, 0 misleading. Clear held (0 unresolved live, 306 resolved trailing 2h). One shared resolved=false definition feeds badge/KPI/triage/Errors — can't drift. Deploys degrade honestly on the invalid token. 2 notes: "Errors today" tile = all-today vs feed = unresolved (both honest labels); Sentry counts + get_feature_health RPC not independently re-verified (access/scope).
- w-audit-2 (golf People/Teams): 2 INACCURATE (baseball users pollute golf metrics 45-vs-11 never-logged-in + winback-email eligibility; demo teams inflate headcounts/activation), 1 MISLEADING (28% vs 10% never-login banner), 12 DEAD components (GrowthTab family unmounted — cleanup candidate), Matt Thomas NOT double-counted (canonical staff join dedupes; cosmetic only). w-fix-7 dispatched (single assembly-point scoping + demo badges). Deploy watcher will include the fix (waits for zero open PRs).
- w-audit-1 (golf Overview): 12 accurate; clear holding (openIncidents=0); Platform Health Score formula verified (~84, admin_events-independent); pollution confirmed empirically (testcoach@helm.test + baseball admin in "Active This Week"); NOTE: 4 of the 10 in_progress rounds now legitimately show as "4 rounds idle" rollup under #1559's correct tiering (created ≤6d, idle 22-133h) — working as designed, not a bug. ~6 truly dead components repo-wide.
- w-audit-5 (Bridge teams/users): THE BIG ONE — every team/player error count (TeamHealthTable errors7d, pulse errors30d, team grades, TeamCommandCard watch pill, PlayerWatchlist badges) counts admin_events WITHOUT resolved filter: Guilford "67 errors this week" all resolved, grade C; 11 Guilford players danger-red off resolved incidents. /admin/errors has the right convention; 4 data files need it (team-scope.ts, team-detail.ts, pulse-grid.ts, users.ts). + cron-registry says 5min for refresh-engagement vs real 4h → perpetual "overdue" flag (contract test doesn't check cadence). + "Coaches: Matt Thomas Matt Thomas" no disambiguator. + demo/test-team filter is substring "demo" only (misses Rini/E2E/Test baseball teams).
- F26 QUEUED (after w-fix-7 frees tree): resolved-filters on 4 team/user data files + platform-Bridge demo/cross-sport scoping + cron cadence fix w/ contract-test extension + coach-name disambiguator.
- w-audit-6 (ops): billing/utilization/work/crm/demo-sessions ACCURATE (billing degrades honestly, no Stripe fabrication). Ben+Leah = GitHub-issue intake, ZERO pending submissions (only #785, a July test, closed). INACCURATE: jobs.ts reads metadata.count one nesting level too shallow (integrity "offending rows" always 0/samples never render — masked while checks pass); entity-thread hitCap hardcoded false (3 roster sources, dormant); ben-leah label color. MISLEADING: integrity panel source collision w/ integration-health; wontfix copy vs never-closes behavior; get_feature_health RPC counts RESOLVED rows in fingerprint/error counts (calendar_events AMBER off closed rows) — 3rd instance of the resolved-blind class, RPC fix = migration + review. CORRECTION: refresh-engagement NOT genuinely overdue — 164min vs real 4h schedule is fine; only the wrong 5-min registry cadence makes the board say overdue (F26 fix covers). round_tracking AMBER = honest (no submissions in 25.9h).
- w-audit-5 addendum: Lift Lab = 100% test data ever (88 sessions, all Rini/Demo orgs) with "platform-wide" copy and no demo filter; engagement score's insightsEngaged30d counts GENERATED insights not engaged ones (0 acknowledged platform-wide; Yakola 85→70 band demotion hidden) — reviewsViewed bucket honest.
- w-audit-3 (System/Tracer): Open Incidents/Data Quality ring/HealthCheckGrid/ErrorFeed tiering/Tracer error status all ACCURATE + architecturally clean. FAKE-GREEN CLASS: API latency 0ms (apiPerf hardcoded [], table never written), External Services hardcoded 'operational', web-analytics token failure renders as "0 visitors", "Platform Metrics Snapshot" job fabricated (re-displays lastRoundSubmitted), storage quota fake 8GB bar. #1559 residual quantified: 3/10 rounds (idle 88-133h, created ≤7d) still tier loud-stuck — createdRecently compares to now not idle duration; completion-rate truncated flag computed but never read. +4 dead components.
## F26 FINAL MANIFEST (wave-2, after w-fix-7): PR-A resolved-blind (4 data files + get_feature_health RPC migration w/ review); PR-B System-tab honesty (unmeasured-not-0ms, live-or-unchecked services, token-failure state, remove fabricated job, honest storage); PR-C misc (cron cadence + contract test, metadata nesting, hitCap, engagement-score acknowledged filter, stuck-tier idle-duration compare, truncated-flag wiring, Matt Thomas disambiguator, ben-leah copy/color, integrity source collision, Lift Lab test-data banner)
- Ben+Leah FINAL: exactly ONE submission ever = owner's own July smoke test (closed). ZERO pending. Architecture note for owner: requireSuperAdmin() gates the submit action — Ben/Leah CANNOT file into it themselves; it's an owner-relay tool. No notification path on submission (silent accumulation, moot today). If direct coach filing is wanted, that's a small build (owner call).
- F26-A RPC review (w-db-review-1): APPROVE-WITH-CHANGES, spec FINAL: filter {fingerprints, errors, errors_prev_24h, fingerprints_prev_24h} as ONE unit (trend/hysteresis compare like-with-like); DO NOT filter fingerprints_7d/total (else cleared features flip GREEN→NEUTRAL post-clear — worse bug); NAMED GAP: low-tier features still amber-from-resolved (fingerprints_7d doubles as their whole signal — needs a field split later, write it down); use `resolved IS NOT TRUE` (verified live: 0 NULL rows today, but column is nullable — don't copy the unsafe idiom forward); rls_denial rows: check if ever resolved, filter for consistency if no-op; guard-block test must be COUNT-based (existing 'AND NOT resolved' substring passes vacuously) + carry forward all 6 prior assertions per 20260807020000's own contract; only 1 SET clause (search_path) on this fn — confirm STABLE unchanged.
- Wave-2 report (w-fix-8): #1578 MERGED (fake-green gone + 2 extra same-root-cause sites); #1576 (resolved-blind; sqlfluff reformat follow-up; migration 20260821050000_feature_health_excludes_resolved_incidents.sql per spec — 7x resolved IS NOT TRUE incl. rls_denial trio [premise inverted: all 7 rls rows ARE resolved], 7d/total untouched, count-based guards, 8-not-6 prior assertions carried verbatim, NOT applied — I apply post-merge); #1579 (all 10 small debts, 68 new tests; createdAt param dropped w/ 4 call sites; disambiguator helpers moved out of page.tsx per Next route-export rules; wontfix now closes the GH issue). Another benign HEAD-move overlap (w-fix-6 pin-bump vs w-fix-8 polling) — all work pushed, nothing lost; my serialization slipped again, noted.

## FINAL DEPLOY 2026-08-21 14:10 ET — helmv3-4ildzo7g3, alias verified
- Ships everything functional through a4e68d37a (all audit fixes, trajectory, People-tab scoping, System-tab honesty, small debts, e2e teardown, submit guard app-side)
- Missing (build pinned by leftover deploy-tree from the aborted run): #1580 Deno CI flag (CI-only) + #1581 Ben+Leah subtitle (admin copy) — ride next promote per one-deploy rule; owner can order redeploy
- Both prod DB migrations applied+verified pre-deploy (submit single-flight, feature-health resolved-filter)

## Landing/UX wave complete-ish (evening)
- #1582 MERGED (Aug-19 copy revert byte-verified, jargon → coach-speak, qualifier animation 2 root causes). #1583 OPEN (headlines fail-visible, w-fix-10 PR-A). #1584 OPEN (sweep found 2 MORE: masked-word scrub-park on coachHelmDeepScene; dockScene autoAlpha/opacity mismatch = PERMANENTLY invisible mobile readouts; other 9 scenes verified clean).
- MY ERROR owned: double-assigned the headline fix to w-fix-9 (Part 4 addendum) AND w-fix-10 (PR-A). w-fix-9 detected the duplicate, byte-verified, discarded local copies safely, and did the sweep instead. Worker discipline saved a collision.
- Outstanding fixes: w-fix-10 PR-B (needs-your-eyes recency) + PR-C (offline-sync IDB) — status pinged.
## ENGINEERING OS: P0 done (both audits); compact OS drafted by commander; P1/P3/P4 prep workers authoring to os-stage/ in parallel (zero tree contact); P2/P5 briefs ready, take the tree in turn.
- OS P4 prep DONE (staged, actually executed end-to-end): collector (paginated bridge reads, honest ok/unconfigured/error per source, prior-resolution check mirrors incident-feed), report (candidate grouping, no fake "0 actionable"), 2 skills, 3 agents, tests. Smart deferrals: feature-mapping left to P5's reconciliation (registry divergence), classification_basis explicit when incidents/ absent. Caught real dotenv-17 stdout-pollution bug. package.json hunk lands with P3+P4 apply.
- OS P1 prep DONE (staged, every hunk lint-pretested): compact OS 183 lines w/ honest build-status annotations; policy YAML validated; rules file paths audited vs real globs; PATCHES.md w/ 5 CLAUDE.md hunks (incl. dead-count → baseline-pointer fixes + scoped-rules table row); ledger backfill refuses to guess SHAs (1 confirmed, 4 honest unknowns + backfill how-to).
- APPLY-STEP DECISIONS: (1) markdownlint zero-headroom + verbatim spec = +6 violations → resolve WITHOUT baseline raise: scoped `<!-- markdownlint-disable MD033 -->` under the spec's title (placeholder syntax = false positive; content untouched) + one MD032 blank line; baseline stays put per only-goes-down rule. (2) Week semantics DECIDED: ISO Mon-Sun, America/New_York (sent to P3; applier adds one comment line to release-policy.yml). (3) registry-equivalences = P5, confirmed deferred.
- Tree queue: w-fix-11 (2 PRs) → P1 apply → P2 (hooks) → P3+P4 apply (incl. joint package.json hunk) → P5 → base proofs → extension arc A-I.
- w-fix-10 FULL REPORT (it was never dead — silent in worktrees): #1583 MERGED (root cause = iOS scroll-event coalescing skipping the reveal-threshold frame in the two non-GSAP systems; settle-once-past fix in shared primitives, 13 tests), #1585 MERGED (dormancy window was already right — only demo exclusion missing; coachs typo = shared plural() helper; inactive-coaches rescoped via golf_coaches, 40 tests), #1586 auto-merging (both IDB classes in BOTH offline DBs v1+v2; Safari auto-commit strictness; 7 call sites; open-failure cached once; 10 tests). Its worktree use = shared checkout occupied; git refused branch switch protecting others' work.
- UX/Bridge fix set COMPLETE pending #1586: #1582/#1583/#1584/#1585/#1586. UNRELEASED batch accumulating on main + OS P1 in flight → release decision belongs to owner under incoming 2/week policy (today already used 2 slots).

## FEATURE DOCS waves A+B DONE (13/19 staged, SHA-stamped c567bcd44)
- CRITICAL: registry.yml blind to live Fairway layer (still cites deleted src/components/golf/**; knowledge:map returns [] for live UI files) → would leave the real UI ungoverned by P2's gate. Fix routed to P5: registry glob repair sourced from the verified doc file-lists + a glob-liveness check (glob matching 0 files = FAIL).
- Other drift caught: 'memberships' table never existed (golf_team_members); golf_task_completions bug claim STALE (fixed, table gone); roster enum truth = pending|active|inactive|removed; e2e/roster.spec.ts required-check points at nothing; /development route misattributed; RoundTypeEditor IS mounted (commit msg was stale); coach-entry-path consolidation (this week's P0 fix) now documented; schema-drift checker false-positive class (pgTAP filenames).
- One writer collision on roster-team.md (two authors, better version kept) — verify wave C's exact file list on return.
- FEATURE DOCS COMPLETE (wave C in): all 19 registry features staged, SHA-stamped. Wave B/C 3-doc overlap (differing alphabetical splits) — workers resolved by merge/accept, nothing lost; shot-tracking.md = best-of-both (310 lines w/ full incident history incl. 8e89c73e destruction + isIndeterminateWriteFailure fix + single-flight pair + COST fix). NEW drift found: 'memberships' table cited but never existed AND not in schema baseline (new debt, feed P5); src/app/api/stats/** + api/messages/** + api/announcements/** in registry don't exist; foundation/flags.ts dead citation (generator-toggles.ts unwired); last_read_at write-path corrected; hub-vs-team-hub conflation untangled; travel expense CRUD exists (only splits missing); #1496 coach-side re-confirmed OPEN (deliberately deferred — SECURITY DEFINER migration, F3).
- Staging-dir collision lesson recorded: shared os-stage dir + overlapping assignments = silent-overwrite risk; harness "file changed" notice saved it. Future waves: disjoint per-worker subdirs or explicit file claims.

## 2026-08-21 — Owner directive: explicit dates on everything
Owner: "Make sure dates are labeled in everything including issues and fixes."
Adopted as a campaign-wide formatting invariant (dated 2026-08-21). Broadcast to all 8 active workers
(6 incident miners + w-os-p2 + w-os-p5). Apply-step briefs for the docs PR and incidents PR now carry a
date-coverage audit gate: undated entries are backfilled or rejected before landing. P2 folds the
requirement into the Stop-gate ledger validation and the compact OS text.

## 2026-08-21 — w-incidents complete: 12 records staged (deep 08-17+ wave)
12 dated incident records staged (round_tracking x3, calendar_events x2, coachhelm x2, admin_bridge x2,
platform_observability, shot_tracking, unmapped/marketing). 10/12 carry drafted SQL invariant predicates;
7 clear replay-lab candidates. Notable dispositions:
- GENOME VERIFIED IN PROD (2026-08-21): golf_player_genome max(computed_at)=2026-08-21 02:40 UTC, 8/51
  recomputed in 7d — the fix's "next nightly run" assumption confirmed by live query; record updated.
- OWNER DECISION PENDING (carry to owner-items): calendar class-semester cleanup step 4 — 6 known-bogus
  rows + 17 orphans still in prod awaiting explicit owner call on the DELETE (INC-2026-08-13-02).
- DELIBERATE RESIDUAL: Feature Health RPC 7-day tier still counts resolved incidents (naive fix would
  flip cleared features GREEN→NEUTRAL, worse). Documented in-record, not a bug to "finish".
- AUTHORING GUIDANCE: round-destruction fix is inside c38596d82 (unrelated subject line, shared-checkout
  artifact) — verify fix commits by content not subject; noted in-record.
- REGISTRY GAPS routed to w-os-p5: marketing site (zero coverage) + platform_observability.
- coach_chat citation-grounding sibling remains OPEN (#1540, ~46% ungrounded discard) — already tracked.

## 2026-08-21 — w-inc-rounds complete (8 records) + prod verifications + SG reopened
w-inc-rounds staged 8 dated records (shot_tracking x3, stats_analytics x2, round_tracking x2, qualifiers x1),
8/8 with invariant predicates. Cross-cutting finding (2 miners now): GitHub `closed` is NOT fix evidence —
bulk closes 2026-07-29 (disclaimed) and 2026-08-17T01:47 (silent, zero linked PRs) → incident-authoring rule.
Commander prod verifications (2026-08-21):
- SG COLUMN DIVERGENCE CONFIRMED LIVE: 39/50 golf_player_stats_cache rows diverge >0.5 strokes
  (sg_total_per_round vs strokes_gained_total), max 91.40. Reopened #1297 + #1300 with evidence
  (2026-08-21). Dispatched w-fix-sg (root cause → worktree fix PR; semantic-mismatch hypothesis).
- Qualifier creation WORKS in prod: 3 created since the 08-03 incident, latest 2026-08-20 01:37 UTC.
Owner DeepWiki upload (Architecture Overview, anchor cf5c51b0): deduped to
/tmp/claude/night/deepwiki-architecture-overview.md, hint-tier. Caught it propagating stale fiction:
feature-registry.ts:345 "dual-table drift" note names golf_task_completions — table does not exist in
schema, nothing reads it (verified 2026-08-21). Correction routed to w-os-p5. Staged coachhelm-ai.md
already covers the real v3/ engine correctly.
