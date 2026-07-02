# Helm Bridge — Execution Log

Running record of what was actually applied per wave, plus any deviations from the plan (the plan was authored against a snapshot; live prod verification takes precedence).

## W0 — P0 Security Prereqs

**Status:** DB work complete + verified on prod (2026-07-01). Code change (Task 3) in progress.

### Task 1 — handle_new_user role-cast fix + self-escalation guard
- Migration `20260701100000_fix_handle_new_user_role_cast.sql` applied to prod via Supabase MCP.
- **DEVIATION 1 (bug in plan):** the plan's replacement function body was copied from the stale `prod_public_baseline.sql` and OMITTED the live function's `baseball_players` seed block, `sport`/name vars, and `ON CONFLICT (id) DO NOTHING`. Applying it verbatim would have broken baseball player signup onboarding. Corrected by reading the live `pg_get_functiondef` and preserving the entire body — changing ONLY the role assignment from `COALESCE((meta->>'role')::user_role,'player')` to a `CASE` that maps only `coach|player`, else `player`.
- **DEVIATION 2 (bug in plan):** the plan's guard trigger blocked ALL self role-changes. But golf onboarding (`golf/actions/onboarding.ts:94/304/381`) upserts `users.role` via the USER-SCOPED client, so that guard would break legit player/coach onboarding. Re-scoped the guard to block only self-escalation to a NON-self-service role (`NEW.role NOT IN ('player','coach')`) — closes the admin vector, leaves onboarding working. (Baseball onboarding uses the admin client — unaffected either way.)
- **Added:** `REVOKE ... FROM PUBLIC` (not just anon/authenticated) so the ACL assertion holds — functions default-grant EXECUTE to PUBLIC.
- **Note:** the plan's `is_fixed` check (`prosrc LIKE '%WHEN ''coach'' THEN%'`) is whitespace-brittle; verified instead via `has_case_guard=true`, `still_has_vuln_coalesce=false`, `baseball_seed_preserved=true`, `on_conflict_preserved=true`, `admin_becomes=player`.
- Verified: guard trigger live; anon/authenticated EXECUTE revoked on both functions.

### Task 2 — downgrade stale test-admin (owner-approved OQ1)
- BEFORE: 2 `role='admin'` rows (`admin@helmsportslabs.com` b9673959-1c90-405b-93f7-b468a9f4daa3; `admin-ui-1779052548996@golfhelm.local` 8e894959-68f4-4973-b953-6590ed3a8c0b).
- Downgraded the `admin-ui-...golfhelm.local` row → `player` (UPDATE 1).
- AFTER: exactly 1 admin row — **`admin@helmsportslabs.com` = `b9673959-1c90-405b-93f7-b468a9f4daa3`** (the W1 allowlist seed + `SUPER_ADMIN_USER_IDS` value).

### Task 3 — replace error-monitoring.ts (code, Sonnet) — DONE (commit a2be0c42)
- Migrated 10 golf.ts call sites to `logServerException` (merged into the existing `server-error-logger` import); deleted `src/lib/error-monitoring.ts`; removed one orphaned `vi.mock` in `golf-events.test.ts`.
- Gates: `typecheck` exit 0; grep clean; `test:run` 3769 passed / 6 failed — the 6 are PRE-EXISTING on main (verified by stash): Next.js 16 `revalidatePath` static-store test-env issue + baseball nav-ordering; none related to this change.
- **Pre-existing test debt noted (not ours):** `program-type-nav-variants.test.ts` (×3), `insight-celebration.test.ts` / `round-recap.test.ts` (×3, revalidatePath store). Track separately; do not block Helm Bridge.

## W1 — Auth Foundation

**Status:** DB migration applied + verified on prod (2026-07-01). Code (Tasks 2–5) pending W0 Task 3 completion (avoid git races in the shared worktree).

### Task 1 — admin_allowlist + is_super_admin()
- Migration `20260701110000_admin_allowlist_is_super_admin.sql` applied to prod via Supabase MCP (all ACL + seed assertions passed). File committed with W1 code PR.
- Seeded `admin_allowlist` with Nick = `b9673959-1c90-405b-93f7-b468a9f4daa3` (admin@helmsportslabs.com), exactly 1 row.
- Verified: 4 cols; RLS enabled+forced; `is_super_admin()` returns false under service_role (correct); EXECUTE = authenticated only, anon denied.
- **W2 recon (confirmed finding):** `admin_events` carries table-level GRANT SELECT to **anon** + authenticated, and INSERT to authenticated — mitigated by RLS today but the classic anon-grant latent leak. **W2 must `REVOKE` these** and re-assert via `pg_class.relacl`.

### Owner action needed at W1 merge
- Set `SUPER_ADMIN_USER_IDS=b9673959-1c90-405b-93f7-b468a9f4daa3` in Vercel (Production + Preview), server-only. Gate fails CLOSED without it (nobody enters — correct failure mode).

### Tasks 2–5 — code (Sonnet) — DONE
- Commits: `ffe2dd300` (edge-safe helpers, 10 tests), `d92dfd40e` (requireSuperAdmin, 5 tests), `fe0052a22` (middleware /admin gate + proxy prefix), `51d853b64` (/admin shell: layout+page+motion provider + gate-coverage contract test).
- No deviations: plan line numbers matched; `AdminNativeGuard` named export; `framer-motion` (not motion/react); warm tokens exist.
- Gates: typecheck exit 0; lint 0 errors / 2275 warns (< 6000 ceiling); `test:run` only the 6 pre-existing failures; `nav-capability-gating` middleware contract 9/9.
- Live browser smoke deferred to the foundation checkpoint.

## W2 — admin_events Additive Schema + Writer Extension

**Status:** DB migration applied + verified on prod (2026-07-01). Writer code (Tasks 2–3) in progress (Sonnet).

### Task 1 — additive columns + indexes + ACL revoke
- Migration `20260701120000_admin_events_bridge_columns.sql` applied to prod via Supabase MCP.
- Added `sport`/`team_id`/`fingerprint`/`source` (+ NOT VALID CHECKs) + 4 triage indexes. Verified all 4 columns live.
- **DEVIATION (plan over-revoked):** plan's migration did `REVOKE ALL FROM anon, authenticated` and asserted authenticated has NO SELECT — that would break the still-live `/golf/admin` (its "Admins can read/update admin_events" RLS policies use the authenticated user-scoped client + Realtime). Corrected to: **REVOKE anon (all) + authenticated INSERT** (no INSERT policy = dead weight); **KEEP authenticated SELECT/UPDATE** (legacy admin needs them) — removed in W14 at retirement. Verified: anon_select=false, authed_insert=false, authed_select=true.
- CHECK `source` list is the union of the design's 8 + the 5 existing `ServerTraceSource` values (else it'd reject today's writers).

### Tasks 2–3 — writer extensions (Sonnet) — DONE
- Commits `4a09bde6e` (server-error-logger + database.ts types), `b542ff669` (admin-logger).
- Additive only; all existing signatures frozen. `buildIncidentSignature` matched the plan. database.ts surgically patched (db:types can't run headless). typecheck exit 0; backward-compat proven (`demo-access` 8/8); only the 6 known pre-existing failures.

## W3 — Server Data Layer

**Status:** RPC migration applied + verified on prod (2026-07-01). Code (Sentry/Vercel clients, triage) in progress (Sonnet).

### Task 1 — get_active_sessions() + resolve_admin_event() RPCs
- Migration `20260701130000_bridge_rpcs_sessions_resolve.sql` applied to prod via Supabase MCP. No deviations (new objects; plan SQL was correct).
- Both SECURITY DEFINER, internally gated on `is_super_admin()`, REVOKE PUBLIC/anon + GRANT authenticated. Verified: anon denied, authenticated allowed, secdef=true. (Calling under service_role raises Forbidden 42501 by design = pass.)

### Tasks 2+ — server data layer code (Sonnet) — DONE
- Commits `1aadf06cd` (database.ts RPC types), `9f47e8a61` (sentry-api server-only fail-soft), `21d4a0c9d` (vercel-api), `a475313db` (triage merge + resolve action).
- 11/11 new tests; typecheck exit 0; lint 0 errors; gate-coverage contract covers `actions/triage.ts`.
- Plan fix: the wave doc's sentry pagination test reused one `Response` (body read-once) — agent switched to `mockImplementation` (fresh Response per call), impl contract unchanged.
- Deferred per file-map: `fetchVercelWebInsights` → W12; `fetchActiveSessions` → W7.

**FOUNDATION (W0–W3) COMPLETE.** 4 prod migrations live + verified; auth gate + /admin shell + server data layer built; all gates green.

## W4 — Design Foundation (no migration) — DONE
- Commits `587f415f` (clay ink token + SportBadge), `af7b3f59` (AdminShell chrome), `8a1aed0b` (status banner + KPI tile), `1df1efff` (PanelBoundary + states), `d55a4a2e` (AutoRefresh).
- 16 new tests; typecheck exit 0; lint 0 errors; gate-coverage passes; ZERO changes under src/components/fairway (composed, not forked).
- Shared component signatures match the plan's Shared Interfaces exactly.
- Deviations (verified vs real source): NavItem uses `activeMatch` not `isActive`; CommandMenu uses top-level `onSelect`; React 19 dropped global JSX namespace (used ReactElement); `noImplicitOverride` needed `override`; PanelBoundary STALE label genericized to avoid a title/heading test collision; added `--fw-color-team-baseball:#C2703D` + `team-baseball` tailwind color.

**★ FOUNDATION (W0–W4) COMPLETE ★** — 4 prod migrations, 3-layer auth gate, gated /admin shell + ops chrome + data layer. All gates green. Building tabs next (W5–W13); W14 retirement held for prod verification.

## W5 — Overview Tab (no migration) — DONE
- Commits `1c38db3c8` (overview data layer + banner/staleness), `fa35f9fcd` (triage queue inline resolve + optimistic hide), `d37d9458b` (overview page: banner, 6-KPI strip, watcher chips, triage queue, regressed callout, deploy rail).
- 11 new tests; typecheck exit 0; lint 0 errors; gate-coverage passes. All column/RPC/Fairway-prop names verified vs real source.
- CLEANUP TODO (polish pass): 2 lint warnings in TriageQueue.tsx (helm/no-arbitrary-text-px, helm/no-raw-button) from verbatim doc code — under ceiling, tidy later.

## ⚑ SCOPE DIRECTIVES (owner, mid-build 2026-07-01)

1. **Signal, not noise:** capture MEANINGFUL failures wired correctly — do NOT flood. Skip expected control flow (NEXT_REDIRECT/NEXT_NOT_FOUND), validation rejections, empty/not-found, aborts, succeeded-retries. Severity: only error+critical drive a RED feature dot / Overview banner; warnings on drill-in only. Dedupe by fingerprint (one line + count, never N rows); emitters rate-limit. Health dots use grouped rate + trend + hysteresis (no flapping); expected-empty = neutral, never red. Digest/banner = meaningful state changes only.
3. **PHONE-FORMAT RESPONSIVE (owner directive 2026-07-02):** the entire /admin console — and ESPECIALLY every table (triage, teams health, users directory, sessions, cron board, integrity grid, Sentry issues, feature dot grid) — must render cleanly on phone width (~375px). No horizontal overflow off-screen; tables reflow to mobile card-stacks OR horizontal-scroll-with-sticky-first-column; numbers/labels stay readable. Bake into every remaining UI wave + the FINAL POLISH SWEEP audits W5–W11 at 375px.

2. **BaseballHelm is iffy in prod → HOLD OFF.** Focus = **GolfHelm + CoachHelm (golf AI layer)**. Any task that MODIFIES baseball or lifting app code is DEFERRED (no wrapping baseball/lifting actions, no baseball auth emitters, W9 Baseball tab deferred). Command-center pieces that only READ baseball data (Overview KPIs, Users directory) may stay — read-only, admin-gated, zero prod impact. Feature-health + total coverage (W15/W16) scoped to golf+coachhelm; baseball is a "paused" appendix.

## W6 — Errors Tab + RLS-Denial Capture + withAdminObserved (no migration) — DONE
- Commits `64c6a744f` (centralized RLS-denial capture), `2bcdde74b` (withAdminObserved + savePartialRound exemplar), `4fc033e13` (errors tab: Sentry table, deploy-marked series, incident feed, fingerprint detail).
- 14 new tests; typecheck exit 0; lint 0 errors (+5 `no-arbitrary-bg-white` warnings — matches the app's documented glass-card recipe / W4-W5 convention; under ceiling). gate-coverage passes (both new pages gate first-line).
- UI elevated per directive: ChartFrame (matte + table-fallback), StatusPill severity (dot+tone+label), KpiTile Fragment Mono numerals. `savePartialRound` → impl+wrapped delegate ('use server' gotcha handled).
- Note: local `next build` prerender fails on unrelated pages (missing NEXT_PUBLIC_SUPABASE_URL locally) — pre-existing env limit, validated on Vercel preview instead.
- POLISH TODO: consider Fairway surface primitives over raw bg-white/70 in a final sweep (optional; current is on-brand).

## W15/W16 — Feature Health + Total Coverage (Fable-planned, golf+coachhelm) — QUEUED after W13
- Coverage plan DONE (Fable, noise-disciplined + golf-scoped). Docs written (commit pending between-agent window): `docs/superpowers/specs/helm-bridge/FEATURE_COVERAGE.md` (38 features, coverage matrix for 424 actions, Noise-Discipline Charter N1–N6, health state machine, board design, baseball/lifting deferred appendix), `waves/w15-total-coverage.md` (16 tasks), `waves/w16-feature-health-board.md` (6 tasks).
- Migration `20260702090000_admin_events_feature_health.sql` REVIEWED + APPLIED to prod (verified: feature col + 2 indexes + get_feature_health RPC, anon-denied/authenticated-ok, W2 ACL re-asserted). Dynamic-SQL heartbeat is injection-safe (triple guard: golf_%/allowlist prefix + information_schema existence + format %I quoting; input ≤100 features/≤64-char keys). Noise discipline in SQL: only error/critical → fingerprints/dots; warnings + rls_denials separate counters. Commit held for between-agent window.
- ★ ALL Helm Bridge prod migrations now applied (W0/W1/W2/W3/W7/W11/W15). Only W14 hardening (revoke anon on ~49 SECURITY DEFINER fns) remains — HELD.
- Maps found real scale: golf 34 feat/487 actions (docs badly undercounted), none wrapped yet; fetchAllRowsResult drops .code (widen first); annotate known "looks-broken-but-isn't" gaps so dots don't false-red. Baseball 52/362 + lifting 15/137 = deferred.

## W8 — Golf Tab + Tracer + CoachHelm (no migration) — DONE
- Commits `e788ee8a` (data/golf.ts + classifyTeamHealth tests), `cc0a1fd8` (golf-tracer actions), `bace83b6` (TeamHealthTable + golf page + tracer page).
- Tracer guard PRESERVED byte-for-byte (admin-tracer-data.ts empty diff); Tracer UI shipped read-only MVP (fix buttons deferred to W14 per doc fallback); double-gate (requireSuperAdmin + legacy role check).
- Accuracy corrections vs plan (verified in database.ts): golf_demo_sessions.entered_at (not created_at); golf_coachhelm_llm_budget is per-(coach,date) budget_usd/spent_usd → remaining summed, honest null; golf_team_members status='active'; no fabricated quality score.
- UI: Surface/StatusPill/StatTile/TrendChart/PanelStates; rollups via user-scoped fetchAdminRollupA (never service_role); 0 new ratchet warnings. typecheck exit 0; gate-coverage passes.

## W9 — Baseball Tab — SKIPPED (baseball hold; build when prod stabilizes)

## W10 — Users & Teams + Drill-downs + Read-Only Impersonation (no migration) — DONE
- Commits `40818e06e` (data/users.ts), `f5dc8d9a4` (view-as core), `9e21cc682` (pages). 7 new tests; typecheck exit 0; gate-coverage passes; 0 new warnings in new files.
- Read-only impersonation SAFE: HMAC marker cookie (not a session), service-role read-only render, zero write buttons except Exit, 15min TTL, enter+exit both audit_log'd + logSecurityEvent, fail-soft (disabled w/o ADMIN_IMPERSONATION_SECRET), sticky InlineNotice banner.
- Plan bugs FIXED: (1) view-as token base64 made the tamper test a no-op → switched to plaintext userId.expiresMs.hmac (real HMAC tamper-evidence); (2) Teams table hard-coded playerCount:0/dormant for every team (false alarm) → real counts/activity/7d-errors.
- Schema corrections (vs database.ts): baseball_team_members.player_id (no user_id); golf_players no team_id (→ golf_team_members.player_id + golf_team_coach_staff); golf_rounds.player_id→golf_players.id; helm_lifting_sessions.athlete_id→helm_lifting_athletes; baseball_games no per-athlete attribution.
- CRM severed to a plain `Open in CRM →` link (no BulkEmailModal). Owner env (fail-soft): ADMIN_IMPERSONATION_SECRET (32+ char).
- ★ Confirms the ratchet +10 drift is pre-existing (from W5/W6 bg-white) — FINAL POLISH SWEEP owns it.

## W11 — Jobs & Integrity (migration applied ahead; code pending) + a REAL security fix
- Migration `20260701150000_run_integrity_checks_rpc.sql` applied to prod (SECURITY DEFINER, service_role-only, STATIC SQL no injection surface; 4 checks: orphaned members / stale stats-cache / bridge schema canaries / anon-grant drift). Verified it runs.
- ★ **Integrity check immediately found a REAL prod security drift:** `anon_grant_drift` FAIL — `audit_log`, `background_job_logs`, `error_logs`, `login_attempts` carried legacy anon table-grants (RLS-mitigated but latent). Verified each has RLS on + ZERO anon policies (safe to revoke; authenticated admin-read/self-insert policies kept).
- **Fixed** via `20260702093000_revoke_anon_grant_drift_log_tables.sql` (applied to prod, ACL-asserted). Re-ran integrity → **0 failing checks, all 4 green.** The command center caught + closed real drift on day one.
- W11 code DONE: commits `1940ca858` (recordJobRun + cron-registry + vercel contract), `d86b6b0a3` (wired all 14 crons), `0f3ee0240` (integrity-check + log-retention crons + 2 vercel schedules), `3e99981d` (/admin/jobs tab). 9 new tests; contract tests pass (registry↔vercel 16=16, cron→recordJobRun coverage, gate-coverage); typecheck exit 0; lint 0 errors. Noise discipline: successes→background_job_logs only; failures→admin_events source='cron'/'integrity' (pass=info+skipSentry, fail=error→banner); never-ran=neutral. Phone-responsive tables (overflow-x-auto + sticky first col) applied. Schema: error_logs.timestamp (not created_at). Ratchet +10 still pre-existing (W5/W6) → polish sweep.
- Owner env (fail-soft): CRON_SECRET (existing — the 2 new crons reuse it).

## W12 — Deploys & Infra (no migration) — DONE
- Commits `54457cdb6` (deploy markers + instrumentation hook), `0898ce682` (deploys tab + current-build card + conditional release health + web vitals).
- 7 new tests; typecheck exit 0; lint 0 errors; 0 ratchet delta; gate-coverage passes.
- Fail-soft 3-state (ok/not-configured neutral/fetch-failed amber); current-build card works with ZERO new secrets (system env); release health neutral unless sessions confirmed. Per-row Sentry release deep-link added.
- Phone-responsive: deployments table overflow-x-auto + min-w-[720px] + sticky left-0 first (Commit) col; panels stack. Used Surface/StatTile/StatusPill (no raw bg-white).
- Owner env (fail-soft): VERCEL_API_TOKEN/PROJECT_ID/TEAM_ID (deployments+vitals); Sentry session tracking (release health).

## W13 — Daily Digest (dedicated non-CRM transport; no migration) — DONE
- Commits `377f4a07` (pure digest builder), `d9879844` (dedicated ops transport, own secret), `adc440d5` (daily cron on dedicated transport). 14 relevant tests; typecheck exit 0; lint 0 errors; all contract + gate-coverage tests green.
- CRM boundary CLEAN: transport imports only `resend` npm + local type; envs OPS_DIGEST_RESEND_API_KEY/OPS_DIGEST_TO/OPS_DIGEST_FROM only; zero crm/**, zero RESEND_*/GMAIL_SA_*/CRM_UNSUB_SECRET.
- Noise: reds-first (failed/overdue crons, failing integrity, error/critical + top-5 fingerprint-grouped incidents), signups, 1-line activity; "All clear" on green nights (not silent — a missing email = dead cron). Fail-soft skip wrapped in recordJobRun. Mobile-friendly email (single-col inline CSS, cream/green/red).
- Owner env (fail-soft): OPS_DIGEST_RESEND_API_KEY + OPS_DIGEST_TO (+ optional OPS_DIGEST_FROM). Cron 10:00 UTC.

**★ TAB PHASE COMPLETE (W5–W13, minus W9 baseball-held).** Overview, Errors, Auth, Golf+Tracer+CoachHelm, Users+impersonation, Jobs+Integrity, Deploys, Digest — all built, all gates green. Remaining: W15 total coverage → W16 Feature Health board → mobile+ratchet polish sweep → draft-PR push. W14 retirement + W9 baseball HELD.

## ⚑ TWO-PR SPLIT (owner directive 2026-07-02 — de-risk the invasive part)
- **PR A "Helm Bridge command center"** = branch `feat/helm-bridge-command-center` (current): W0–W13 + W15 FOUNDATION (Tasks 2-4: registry, additive logger `feature` field + flood throttle, coverage harness) + W16 board. New `/admin` files + only additive/bounded/fire-and-forget touches to shared infra. Board shows neutral "not-yet-instrumented" dots until PR B. LOW risk. Targets `main`.
- **PR B "Total feature instrumentation"** = NEW branch `feat/helm-bridge-instrumentation` off PR-A tip: W15 batches (Tasks 5-14, the 424 action wraps across 76 golf/coachhelm action files) + Task 15 (RLS centralization in fetch-all-rows) + Task 16 (verification). The ONLY at-scale edits to existing feature code — isolated for scrutiny + preview. Stacks on PR A.
- Both pushed as DRAFTS; owner merges A first, then B. Nothing auto-merges.

## W15 — Total Error-Capture Coverage (golf+coachhelm; migration applied)
### Foundation (Tasks 2-4, PR-A branch) — DONE
- Commits `419c33dce` (feature-registry.ts + database.ts feature col/get_feature_health types), `fd2e227b8` (emitters + emit-throttle), `fbe275181` (coverage harness).
- 50 new/extended tests; typecheck exit 0; lint 0 errors; backward-compat proven (179 existing emitter callers unchanged, green).
- feature-registry.ts: 38 FeatureKey union + FEATURE_REGISTRY; re-derived exports = exactly 424 (287 golf + 137 coachhelm) matching spec; TABLE_TO_FEATURE collision resolve; rpcInput() builds get_feature_health payload.
- emit-throttle.ts: per-process flood-collapse (LRU 500, key action:errCode, collapsed_count metadata) — noise-discipline. feature threaded additively into observed-action/server-error-logger/admin-logger/rls-denial (featureForTable default). savePartialRound retro-tagged round_tracking.
- coverage-scanner + assertAreaFullyWrapped: self-test throws listing round-drafts.ts's 4 unwrapped exports; distinguishes wrapped savePartialRound from unwrapped submitGolfRoundComprehensive. Global tripwire = it.todo (flips in Task 16/PR-B).
### Batches (Tasks 5-14) + RLS centralization (15) + verification (16) → PR-B branch `feat/helm-bridge-instrumentation` (after W16 + polish)
- B0-B5 DONE (commits `027e3c4ce`,`24f220064`,`6af19e66d`,`a479f7d7a`,`2f5f286b7`,`20a67d2a1`).
- B6 library + recruiting + player surfaces (course_library, recruiting_prospect_tracking, player_hub, coach_dashboard, my_game_profile, whats_new) — DONE. 51 exports wrapped Impl+delegator: course-library.ts/courses.ts/recruiting.ts/recruit-documents.ts (ALL), dashboard-data.ts (coach fns→coach_dashboard, player fns→player_hub), command-palette.ts, player-profile-stats.ts, whats-new.ts, + golf.ts's last 4 saved-course fns (getPlayerSavedCourses/savePlayerCourse/touchSavedCourse/getRecentCoursesForPlayer→course_library) — golf.ts's full 39-export surface is now fully wrapped (spans B0/B1/B2/B4/B5/B6). Foundation self-test fixture handed forward course-library.ts → alerts.ts (B7, still bare).
- Recovered from two mid-batch session crashes on B6: verified all 9 dirty files against the registry manifest + exemplar pattern before proceeding, no rework needed. Gate green: coverage-contract.b6 + foundation tests pass, typecheck exit 0, lint 0 errors (baseline warnings only, none in the 9 touched files), npm test 3973 passed / 6 pre-existing failures confirmed unrelated via stash-and-rerun (baseball nav-variant drift + Next 16 revalidatePath-in-vitest invariant on round-recap.ts/insight-celebration.ts, both outside B6 scope).
- Remaining: B7-B9 (coachhelm batches) + Task 15 (RLS centralization) + Task 16 (lock global invariant).

## W16 — Feature Health Board (green-dot grid; PR-A branch)
**Status:** in progress (Sonnet).

## W7 — Auth & Sign-ins (golf-scoped; baseball/lifting emitters DEFERRED) + migration
- Task 1 migration `20260701140000_revoke_user_sessions_rpc.sql` applied to prod (SECURITY DEFINER, is_super_admin-gated, DELETEs auth.sessions + writes audit_log; anon denied, authenticated granted — asserted). Verified audit_log col types (record_id/user_id uuid, new_data jsonb) before apply.
- Code DONE (Sonnet): commits `88f2dc056` (capture coverage: internal log-auth-failure route, middleware bridge fire-and-forget, anonymous log-error relax, AuthApiError ignore narrowed, golf password-reset event), `b83419344` (auth tab: funnel MetricCards, 7d sign-in TrendChart, lockouts, sessions+revoke). 6 new tests; typecheck exit 0; **lint-ratchet delta 0** (agent used Fairway Surface/MetricCard/TrendChart/StatusPill/InlineNotice/Button — no raw bg-white); gate-coverage passes. **DEFERRED per baseball-hold:** baseball/lifting auth emitters (confirmed never opened).
- Owner env (fail-soft): `INTERNAL_LOG_KEY` (32+ char) enables the middleware→node capture bridge; no-ops without it.
- ★ CI NOTE: W5/W6 added ~+10 lint-ratchet warnings (no-arbitrary-bg-white/text-px) above baseline — FINAL POLISH SWEEP must convert those admin surfaces to Fairway `Surface` (like W7) OR re-lock baseline, else the ratchet CI check fails on the PR.
