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
2. **BaseballHelm is iffy in prod → HOLD OFF.** Focus = **GolfHelm + CoachHelm (golf AI layer)**. Any task that MODIFIES baseball or lifting app code is DEFERRED (no wrapping baseball/lifting actions, no baseball auth emitters, W9 Baseball tab deferred). Command-center pieces that only READ baseball data (Overview KPIs, Users directory) may stay — read-only, admin-gated, zero prod impact. Feature-health + total coverage (W15/W16) scoped to golf+coachhelm; baseball is a "paused" appendix.

## W6 — Errors Tab + RLS-Denial Capture + withAdminObserved (no migration) — DONE
- Commits `64c6a744f` (centralized RLS-denial capture), `2bcdde74b` (withAdminObserved + savePartialRound exemplar), `4fc033e13` (errors tab: Sentry table, deploy-marked series, incident feed, fingerprint detail).
- 14 new tests; typecheck exit 0; lint 0 errors (+5 `no-arbitrary-bg-white` warnings — matches the app's documented glass-card recipe / W4-W5 convention; under ceiling). gate-coverage passes (both new pages gate first-line).
- UI elevated per directive: ChartFrame (matte + table-fallback), StatusPill severity (dot+tone+label), KpiTile Fragment Mono numerals. `savePartialRound` → impl+wrapped delegate ('use server' gotcha handled).
- Note: local `next build` prerender fails on unrelated pages (missing NEXT_PUBLIC_SUPABASE_URL locally) — pre-existing env limit, validated on Vercel preview instead.
- POLISH TODO: consider Fairway surface primitives over raw bg-white/70 in a final sweep (optional; current is on-brand).

## W15/W16 — Feature Health + Total Coverage (Fable-planned, golf+coachhelm) — QUEUED after W13
- Coverage plan DONE (Fable, noise-disciplined + golf-scoped). Docs written (commit pending between-agent window): `docs/superpowers/specs/helm-bridge/FEATURE_COVERAGE.md` (38 features, coverage matrix for 424 actions, Noise-Discipline Charter N1–N6, health state machine, board design, baseball/lifting deferred appendix), `waves/w15-total-coverage.md` (16 tasks), `waves/w16-feature-health-board.md` (6 tasks).
- Migration (to review+apply at W15): `20260702090000_admin_events_feature_health.sql` — admin_events.feature col + 2 partial indexes + get_feature_health(jsonb) SECURITY DEFINER RPC (is_super_admin-gated; heartbeat via HARD-allowlisted dynamic SQL golf_% only; only error/critical → dots; re-asserts W2 ACL). Additive.
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
- W11 code (recordJobRun + cron-registry + wire 14 crons + integrity/retention cron routes + /admin/jobs tab) pending (dispatch after W10).

## W7 — Auth & Sign-ins (golf-scoped; baseball/lifting emitters DEFERRED) + migration
- Task 1 migration `20260701140000_revoke_user_sessions_rpc.sql` applied to prod (SECURITY DEFINER, is_super_admin-gated, DELETEs auth.sessions + writes audit_log; anon denied, authenticated granted — asserted). Verified audit_log col types (record_id/user_id uuid, new_data jsonb) before apply.
- Code DONE (Sonnet): commits `88f2dc056` (capture coverage: internal log-auth-failure route, middleware bridge fire-and-forget, anonymous log-error relax, AuthApiError ignore narrowed, golf password-reset event), `b83419344` (auth tab: funnel MetricCards, 7d sign-in TrendChart, lockouts, sessions+revoke). 6 new tests; typecheck exit 0; **lint-ratchet delta 0** (agent used Fairway Surface/MetricCard/TrendChart/StatusPill/InlineNotice/Button — no raw bg-white); gate-coverage passes. **DEFERRED per baseball-hold:** baseball/lifting auth emitters (confirmed never opened).
- Owner env (fail-soft): `INTERNAL_LOG_KEY` (32+ char) enables the middleware→node capture bridge; no-ops without it.
- ★ CI NOTE: W5/W6 added ~+10 lint-ratchet warnings (no-arbitrary-bg-white/text-px) above baseline — FINAL POLISH SWEEP must convert those admin surfaces to Fairway `Surface` (like W7) OR re-lock baseline, else the ratchet CI check fails on the PR.
