<!-- BaseballHelm — UNIFIED PRODUCTION ROADMAP (the single source of truth).
     Author: Fable 5, product owner + lead planner · 2026-07-01 · Repo: /Users/ricknini/Downloads/helmv3
     Reconciles-and-supersedes-for-sequencing:
       1. docs/audits/BASEBALLHELM_HONEST_FEATURE_READ.md        (feature truth: 72/21/18/7 · ~61%)
       2. docs/baseball/PRODUCTION_READINESS_MASTER_PLAN.md      (56-task plan; its spec blocks remain the per-task specs, cited as MP WSx.y)
       3. docs/audits/REPO_UNTANGLE_AND_CLEAN_BASE.md            (git/PR/issue/check untangle, cited as UT §x)
       4. docs/baseball/COACH_NAV_8TAB_PROPOSAL.md               (8-tab nav consolidation)
       5. Live prod DB baseline (shared golf+baseball; captured in Phase 0/3 below)
     Where this doc and an input disagree on ORDER, this doc wins. Where a task needs its full spec,
     the cited input doc wins on CONTENT. Audience: Sonnet 5 execution agents with zero prior context.
     -->

# BaseballHelm — Production Roadmap (Unified)

## Executive summary

**Where we are.** BaseballHelm is honestly ~61% production-ready by feature count (72 of 118 SHIPPED per the Honest Feature Read) — and less by user-visible weight, because the 7 BROKEN features cluster on the flagship *player performance story*: Lift Lab can't log a single set (helm_lifting_* read vs baseball_lift_* write), readiness check-ins vanish into a table no coach reads (and soreness≥3 crashes on an FK), travel Create Trip fails for every real coach, coach camps are invisible to players, Discover's peek panel errors on every click, public team profiles 404 for all teams, college-interest gives players a blank page, and video clips are trim-theater. The coach Pressbox spine (Command Center, Roster, Practice Planner, Signals, Stats Center, Import Center, Scout Packets, Pipeline, Settings OS, auth) is genuinely launch-grade — do not rebuild it. Meanwhile the repo base is tangled (222 branches / 37 worktrees / 57 open PRs / red main / #650 blocked) and the shared prod DB carries 167 security-advisor findings, a schema drift (#651), and an RLS recursion (#652).

**Where we're going.** Production-ready SHIP verdict: clean single-lane repo, green main, healthy prod DB, all 7 broken loops repaired, all 21 half-builts completed, security hardened (SECURITY DEFINER + recruiting RLS adversarially verified), the entire baseball surface on the Living-Annual one-publication design system, coach nav folded 32→8 tabs, stubs decided build-or-delete, and `BASEBALLHELM_PRODUCTION_VERDICT.md` re-issued as SHIP with command evidence.

**The sequence, in one line:** *Fresh base → repair the 7 broken flagship loops (61%→~80%) → complete the 21 half-builts → correctness + security hardening → Living-Annual UI sweep + 8-tab IA → long tail (stubs, mobile, perf, observability, docs) → ship.*

**Why this order (value × dependency × risk):** you cannot build on quicksand — a red main, 43 zombie PRs, and a prod DB throwing 42P17/42703 poison every downstream verification, so the fresh base comes first and is mostly mechanical. The loop repairs come second because they are cheap (mostly S/M), enormous in user-visible value (they ARE the player story), and they de-risk every later phase's E2E verification. Correctness/security lands *before* the UI sweep so we harden the smaller surface area and so 66 UI PRs land on locked, tested read-models. The UI sweep is the biggest volume of work but presentation-only by contract, so it goes late where it can't destabilize data paths. Long tail and ship close it out.

---

## Standing constraints (apply to EVERY task in every phase)

1. **Shared golf+baseball prod DB.** Additive-only migrations (`ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS`+recreate). NEVER touch `golf_*` objects, never destructive DDL, never delete-then-reinsert in save/submit/sync paths. Apply via `mcp__supabase__apply_migration`.
2. **`schema_migrations` is UNRELIABLE.** After every migration, verify effect via `information_schema` / `pg_policies` / `pg_proc` — never trust the history table.
3. **New SECURITY DEFINER functions / matviews / tables in `public` auto-grant to `anon`+`authenticated`.** Every new object: `REVOKE ALL ... FROM public, anon;` first, then explicit grants; paste the `proacl`/`relacl` check in the PR. This is the repo's #1 recurring agent failure — reviewers reject any PR missing the evidence.
4. **≤15-file PRs.** Mega-PRs are the documented root cause of the tangle. #650 was the last exception.
5. **Never merge onto red main.** If main goes red, the only allowed PR is the one that fixes it.
6. **Owner standing rules:** #516 service_role key rotation is owner-DECLINED accepted risk — do not re-raise. PR #262 (email) never merges without explicit approval. Never grant anon EXECUTE on standing RPCs.
7. `[OWNER-GATED]` = requires Nick's explicit green light before executing (all merges, closes, deletes, prod-data writes, product decisions).

---

## PHASE 0 — Fresh Base (repo untangle + CI green + DB baseline)

**Goal:** one integration lane, green main, #650 merged and deployed, ≤7 open PRs, ~55 branches / ~13 worktrees, prod DB free of ERROR-severity defects. Reconciles UT Phases 0–5 + MP WS0/WS8.1/WS9.1 + the live DB baseline into one phase, deduped.

> **Dedupe notes:** (a) the missing SELECT policy on `baseball_event_acknowledgements` appears in both the untangle CI defects and the DB baseline — it is fixed ONCE, in P0.1. (b) #651/#652 appear in both UT (issues) and MP (WS0.1/WS0.2) — fixed once, P0.5/P0.6. (c) The 155-function SECURITY DEFINER sweep is *inventoried* here (P0.8) but *executed* in Phase 3 — Phase 0 fixes only the ERROR-severity DB items.

### 0-A · Make the gates honest (no destructive ops — start immediately, all parallel EXCEPT P0.12, which runs only after P0.5 verifies)

- **P0.1 — Fix red main** (UT §3 Phase 0.1). One ≤15-file PR direct to main: (a) guard/mocked-store fix for the `revalidatePath` static-generation invariant in `src/app/golf/actions/__tests__/round-recap.test.ts`; (b) add the missing SELECT RLS policy on `baseball_event_acknowledgements` (currently RLS-on-zero-policies = locked out; this also clears 10/16 failing pgTAP subtests). Verify: `gh run list --branch main --workflow=ci.yml --limit 1 --json conclusion` → success; `select policyname from pg_policies where tablename='baseball_event_acknowledgements';` returns the new policy.
- **P0.2 — Fix #650's CSS defect** (UT §3 Phase 0.2). `src/app/globals.css:2-4`: the comment text `--pursuit-*/` self-terminates the comment → postcss error 3:42. Rewrite so `*/` can't appear inside. Verify: `npm run build`.
- **P0.3 — Fix #650's 22 semgrep missing-auth findings — TWO PRs (the findings span ~22 server-action files; one PR would break the ≤15-file cap).** (UT §3 Phase 0.3). Split by action family: **P0.3a** = the insights + performance/lifting action files (start `src/app/baseball/actions/insights.ts`); **P0.3b** = all remaining flagged action files (events, travel, recruiting, settings families). Each PR adds `supabase.auth.getUser()` + `!user` throw before the first `.from()/.rpc()` in its files, and each PR's verify command is the semgrep rule re-run scoped to its files with the zero-findings output pasted in the PR body. True false-positives: reviewed inline `// nosemgrep` only — never weaken the rule. Both PRs land on `batch/baseball-fixes` before P0.14.
- **P0.4 — Clear stale CodeRabbit statuses** (UT §3 Phase 0.4) on any fleet PR kept open past #650; skip for PRs being closed in P0.16.
- **P0.5 — #651 schema-drift migration.** Full spec: **MP WS0.1** (11 `ADD COLUMN IF NOT EXISTS` columns, exact source migrations and line refs listed there). Verify all 11 rows via the `information_schema.columns` query in the spec, then Stats Center splits non-zero.
- **P0.6 — #652 announcements RLS recursion.** Full spec: **MP WS0.2** (3 SECURITY DEFINER helpers with REVOKE-first, drop+recreate exactly `baseball_announcements_select_player`, `baseball_ann_recipients_select_coach`, `_insert`, `_delete`; leave `baseball_ann_recipients_select_player` untouched; new pgTAP suite). Verify per spec incl. `pg_policies` quals + zero 42P17 in `mcp__supabase__get_logs`.
- **P0.7 — Fix the 2 ERROR-severity SECURITY DEFINER views.** `baseball_coaches_public` and `v_crm_coaches_by_school`: migration setting `security_invoker=on` (`ALTER VIEW ... SET (security_invoker = on);`), then verify each view's consumers still resolve (grep callers; run their pages). If a view genuinely needs definer semantics for a public read, replace with a narrow SECURITY DEFINER function instead — REVOKE-first rule applies.
- **P0.8 — DB baseline snapshot + anon verify (read-mostly).** (a) Verify and fix the 1 anon-granted baseball table (`pg_class.relacl` check; REVOKE migration if confirmed). (b) Run the MP WS2.2 anon-grant queries and snapshot output. (c) Export the full list of 155 SECURITY DEFINER functions executable by anon/authenticated (incl. the 30 baseball helpers like `is_baseball_team_coach`, `can_view_baseball_player`) to `docs/audits/DB_SECDEF_INVENTORY_2026-07.md` with columns: function, callers (grep of `.rpc(`), needed-by-anon?, needed-by-authenticated?, verdict. This inventory FEEDS Phase 3 — no REVOKEs on standing RPCs happen in Phase 0.
- **P0.9 — ERA invariant test rewrite.** Full spec: **MP WS0.4**. The CODE is correct (thirds-aware `ipToInnings`, stats-center.ts:434-437); the TEST is stale. Touch only `src/contracts/baseball/stats/pitching-invariants.test.ts`.
- **P0.10 — Nav tests triage.** Full spec: **MP WS0.5** (nav-manifest + program-type-nav-variants suites). Escalate to owner if root cause is frozen `nav-registry.ts`.
- **P0.11 — #434 residual in player-passport + scout-packet.** Full spec: **MP WS1.1** (sumInningsPitched/ipToInnings in the two recruiting-facing read-models + regression test). Needed for the green gate; also listed under Phase 3's stat-math track as DONE-in-Phase-0.
- **P0.12 — Re-seed the Rini demo** `[OWNER-GATED — prod data write]`. Full spec: **MP WS8.1**. **HARD ORDER — this is the ONE 0-A task that is NOT parallel: it runs only AFTER P0.5's `information_schema.columns` verification confirms all 11 #651 columns exist.** Re-seeding before the columns exist writes NULL-bearing rows again, keeps the seeded-smoke leg red, and burns an owner-gated prod-data write (this ordering is the entire point of MP WS8.1). It must then complete BEFORE P0.14 (seeded-smoke leg can only green after re-seed; standing approval exists for additive baseball prod work, but flag the run to Nick).
- **P0.13 — Protect the 8 `fix/qa-*` branches: open draft PRs NOW** (UT §3.4 R3–R10). `gh pr create --draft --base main --head fix/qa-<name>` for calendar, capability-redirects, misc-visual, nav-deadends, player-today, practice-coachname, shell-chrome-dup, stats-charts (46 unpushed commits each; map to issues #479–#485). This MUST complete before any prune step. Landed in Phase 5.

### 0-B · Land and clean `[OWNER-GATED throughout]`

- **P0.14 — #650 green gate.** Full spec: **MP WS0.6**. After P0.1–P0.3, P0.5, P0.6, P0.9–P0.12 land: `gh pr checks 650` → all required contexts green. Any remaining red leg spawns a root-cause task; nobody edits #650's diff to force green.
- **P0.15 — `[OWNER-GATED]` Merge #650 + the 3 independent PRs.** Sequence per MP WS9.1 / UT Phase 1: flip Vercel Ignored Build Step back on → verify migration `20260701020000` applied via `information_schema` → `gh pr merge 650 --squash` (no `--delete-branch`) → verify prod deploy healthy → then `gh pr merge 620 / 585 / 514 --squash` on their own schedule. ~25 issues auto-close (UT appendix: incl. #474; also close #430 citing merged #615).
- **P0.16 — `[OWNER-GATED]` Close 43 superseded/stale PRs** (UT Phase 2): the 22 folded-into-#650 fleet PRs (#550,552,553,554,557,559,560,566–571,641–649) + the 21 red dependabot PRs (base-staleness fingerprint; regenerate against clean main). Exact commands in UT §3 Phase 2. Never close the REVIEW holds: #243, #262, #333, #334, #356–#358, #366, #515, #572.
- **P0.17 — `[OWNER-GATED]` Prune dead worktrees + branches** (UT Phase 3, exact lists there): 16 dead worktrees → `git worktree remove --force` + `prune`; 42 merged-ancestry branches (`-d`, self-verifying); 85 squash-orphan branches (`-D`, each labeled with its shipped PR#); after P0.16, the 22 closed-PR branches and their 10 fleet worktrees join the list. **Hard guard: the 8 `fix/qa-*` branches/worktrees are untouchable until their P0.13 PRs exist and are triaged.** Verify: ~13 worktrees, ~55 branches.
- **P0.18 — `[OWNER-GATED]` REVIEW-pile triage** (UT §3.4, ~25 items R1–R21 + 7 held PRs). Owner decides keep-and-PR vs abandon per item; notable: `worktree-groupC` (ahead 31, diverges from #571), `chore/disable-vercel-auto-deploy` (infra), stacked test chain #356→#366 (feeds Phase 5 P5.15).
- **P0.19 — Post-merge prod + CI trust verification.** MP WS6.2 first pass: `mcp__supabase__get_logs` shows zero new 42703 / 42P17 on baseball_*; Sentry (helm-xs) no new baseball issues; fresh dependabot PRs come up green (UT Phase 5); main stays green.

**Phase 0 exit gate:** UT §4 clean-base definition holds (one lane, green main, ≤~7 PRs, pruned, checks trustworthy) AND prod logs clean AND the DB ERROR-severity findings (event_acks lockout, 2 definer views, #651, #652, anon table) are fixed with `information_schema`/`pg_policies` evidence.

---

## PHASE 1 — Repair the 7 broken flagship loops (61% → ~80%)

**Goal:** every BROKEN feature from the Honest Feature Read works end-to-end, verified by a test that round-trips the user action. These are cheap (S/M), enormous in value — the player performance story is a headline product pillar — and they unblock honest demos. Full failure analyses: HONEST_READ §3.1; work here follows its fix guidance exactly.

**Branching:** short-lived ≤15-file PRs into main (clean base now exists). Tasks P1.1–P1.3 are one keystone wave (same root cause); P1.4–P1.9 are fully parallel, disjoint files.

- **P1.1 — Lift Lab write-path reconciliation (KEYSTONE — breaks 4 features).** Root cause: the W2-G rewire moved reads to `helm_lifting_sessions` but left `startLiftSession` / `logSetResult` / `completeLiftSession` (`src/app/baseball/actions/lifting-v11.ts:2028–2278`) querying legacy `baseball_lift_sessions` by the helm ID — different UUID spaces (`legacy_baseball_id` bridge). Fix: repoint the three v11 actions at helm tables (or resolve `legacy_baseball_id` server-side); make `start` check matched-row count (currently returns success on 0 rows); consolidate the two parallel logging writers (`logLiftResult` in lifting.ts vs v11) to ONE canonical path. Fixes: lift-session, lift-log. Files: `lifting-v11.ts`, possibly `lifting.ts`. **Do not touch golf tables or the helm schema itself.**
- **P1.2 — Readiness source of truth + soreness FK.** Root cause: players write `helm_lifting_readiness_checkins`; ALL consumers read legacy `baseball_readiness_checkins`. Decide: **helm tables are canonical** (writes already there; matches the Lift Lab direction). Repoint all seven readers — the readiness page's own "already checked in" query, performance-command, engine-run, decision-room, strength-groups, live-weight-room, stat-visuals — plus fix `baseball_soreness_maps` FK (references legacy table; helm row IDs crash on soreness≥3) via additive migration (new nullable FK column or bridge resolution — never drop the old column), and add error handling in the readiness `handleSubmit`. Fixes: readiness + the readiness half of performance-overview.
- **P1.3 — Lift Lab round-trip verification (the wave gate).** One E2E/integration test per loop: (a) player start→log-set→complete against helm-only seed data; (b) player submits readiness check-in (incl. soreness≥3) → row appears in coach `getPerformanceCommandData`. Also assert coach status edits in performance-overview reflect in its KPI strip (read/write now same table family). **Phase 1 does not exit until these pass.** Rule going forward (HONEST_READ §5.1): any table migration lands writes + all readers + FKs in the same wave, with a round-trip test.
- **P1.4 — Travel Create Trip FK.** `createItinerary` writes `ctx.user.id` into `created_by` which FKs `baseball_coaches.id`. One-line fix to `ctx.activeCoachId` + fix the demo seed (same bug) + one integration test that actually creates a trip. (S)
- **P1.5 — Camps visibility.** RLS select requires `status='published'`; everything writes `'active'`. **Product decision — PRE-MADE by the planner here, per constraint 7; the execution agent does not re-litigate it:** add a publish step to the coach UI *and* align the RLS policy so players see coach-intended camps. Additive policy change via DROP POLICY IF EXISTS + recreate. Verify with a real player account E2E. (Action-layer wiring completes in P2.11.)
- **P1.6 — Discover peek + message route.** PlayerPeekPanel embeds golf-copy-paste FK hints (`players_high_school_org_id_fkey`, `committed_to_org_id`) that don't exist → every click fails; "Message" routes to nonexistent `/messages/new`. Fix the select to real FKs, wire message to a real conversation-start flow (or the existing messages surface), add one E2E click test. (S)
- **P1.7 — public-team-profile embeds.** Query embeds `organization_staff` / `organization_facilities` — tables that exist nowhere → PostgREST rejects → permanent 404 for every team. Drop/re-model the embeds, add `error.tsx`/`loading.tsx`, resolve the "(public)" vs signed-in-college-coach intent, verify against live DB. (M)
- **P1.8 — college-interest player dead-end (SPLIT to respect the nav-registry freeze).** Nav promises players a feature; component `return null`s. **Product decision — PRE-MADE by the planner, per constraint 7: build the thin player view** over the existing engagement read-model (not the minimum redirect). The Phase-1 PR touches ONLY route/component files — it does **NOT** touch `src/lib/baseball/nav-registry.ts`, which stays frozen. The registry-entry correction (the player-facing college-interest row) is **folded into the owner-gated P4.32 frozen-file edit**: the P1.8 PR body must name the exact registry row so P4.32 picks it up; until P4.32 lands, the built player view simply makes the existing nav entry honest. (M)
- **P1.9 — video-edit clip honesty.** Make players seek/stop at `clip_start`/`clip_end` (currently trim is metadata-only theater); move the raw client insert to a server action under `withBaseballAction`; replace the silent coach bounce with an honest not-available state. **Product decision — PRE-MADE by the planner, per constraint 7: coach clip-creation is OUT of scope for this wave.** Ship the honest state, file a ticket for coach scope — do not build it here. (M)

**Phase 1 exit gate:** all 7 BROKEN features re-verified as SHIPPED per the Honest Read's method (route → read-model → action → table → RLS trace); the P1.3 round-trip suites green in CI; honest number ~80%.

---

## PHASE 2 — Complete the 21 half-builts

**Goal:** kill the "half-built feeling": wire dead buttons, persist discarded wizard input, mount unmounted consumers, wire-or-delete dead action layers. Every item's exact gap + effort: HONEST_READ §2 HALF-BUILT table + §3.2. All tasks parallel, disjoint files, ≤15-file PRs into main.

**Cross-cutting rules for this phase** (from HONEST_READ §5 — enforce in review):
- Every wizard step maps to a server-action parameter (no silently discarded client state).
- Raw client Supabase writes in feature code migrate to `withBaseballAction` (capability checks, audit, revalidation).
- No `const { data } = await query` with error ignored — explicit error envelopes.
- Dead action layers get wired OR deleted — never left as paper security.

| Task | Feature | The work (spec: HONEST_READ §3.2) |
|---|---|---|
| P2.1 | performance-overview | Residual verification post-P1.2 (KPIs, queue, board, embedded-panel edits all one table family); fix any leftover legacy reads. |
| P2.2 | stats-upload | Extend the server action signature to accept the wizard's columnMappings/playerMatches; persist raw CSV so resolveUnmatchedPlayers works; align UploadHistory columns. |
| P2.3 | stats-game-detail | Wrap CSV save in the existing atomic RPC (kills the forbidden delete-then-insert); delete or build the PDF tab (default: delete, honest). |
| P2.4 | stats-games-list | Un-hide the delete button (missing `group` class + literal `hidden`); deliberate delete-confirmation UX. |
| P2.5 | Team Documents | Mount edit / version-history / revert / move modals onto the already-built actions; category + visibility pickers on upload; verify bucket-prefix storage RLS. |
| P2.6 | teams-manage | Move to the action layer; add team edit/delete/leave + invite revoke; use the hardened server-side code generator; surface errors. |
| P2.7 | program page | Create/repoint the missing `logos` storage bucket; add `can_manage_settings` gate; resolve the two-program-surfaces overlap (fold into settings-program). |
| P2.8 | practice-effectiveness | Extend the disposition enum so Worked / Needs-More-Time / Not-Enough-Data persist distinctly (additive migration); wire or remove setReviewVisibility. |
| P2.9 | player-detail | Pass liftingOrgId/liftingAthleteId on the canonical route (copy the sibling /profile wiring); decide exposing note edit/delete. |
| P2.10 | player-profile-coach-view | Fold the orphan route into /players/[id] and delete it (preferred), or wire its two dead CTAs to existing actions. |
| P2.11 | camps (action layer) | Route UI through the audited deleteCamp/checkIn/noShow/unregister actions (RLS half done in P1.5). |
| P2.12 | colleges-directory | State filter from organizations.location_state; error-vs-empty honesty; College-player gating per spec. |
| P2.13 | journey ↔ pipeline `[OWNER-GATED product decision]` | Unify or explicitly separate the player 6-value status vocabulary vs the coach 5-stage pipeline; then modest code (CHECK constraint, feed events, kill dead coach_name branch, id-based event matching). Decision memo first, ≤1 page. |
| P2.14 | dev-plans-list | One goal schema: stable IDs persisted, writer/actions/parseGoals aligned ({id,status,progress}); migration of existing rows additive. |
| P2.15 | dev-plan-detail | Wire role-branched complete/progress controls (actions exist) + coach edit/delete affordance. |
| P2.16 | settings-appearance | Mount `BaseballProgramBrand` in `src/components/baseball/dashboard-shell.tsx` — this is a **sanctioned one-time edit** to that conflict-mapped file (the second, alongside P5.7's WS5.1 edit; recorded in the Execution Model conflict-map note). **Sequencing: P2.16 lands BEFORE P5.7 and the two never run concurrently** (both touch the sticky-bar region); P5.7 rebases on P2.16's merged result. Do NOT mount via `(dashboard)/layout.tsx` or `BaseballFairwayShell.tsx` (both frozen). Verify the CSS var is consumed end-to-end. |
| P2.17 | settings-data-retention `[OWNER-GATED decision]` | Build the lifecycle job + missing 5 policies, or explicitly descope and remove the decorative toggle. Default recommendation: descope now, ship later. |
| P2.18 | settings-recruiting-preferences `[OWNER-GATED decision]` | Build the Discover scoring consumer (match-score RPCs exist only in an archived unapplied migration) or pull the page. Default recommendation: pull the page until War Room scoring is a priority. |
| P2.19 | public-player-profile | Wire or remove the coach "Message" button; remove the hardcoded `[]` player_stats vestige or wire real stats. |
| P2.20 | public-program-profile | Remove the ~85 lines of unreachable facilities/commitments UI (tables don't exist); wire "Contact Program"; add a pipeline CTA. |

**Phase 2 exit gate:** zero dead visible controls in the baseball surface (grep + click-crawl); every HALF-BUILT row re-verified SHIPPED or explicitly descoped by owner decision (P2.13/17/18); no raw client writes remain in the features touched.

---

## PHASE 3 — Correctness & security hardening

**Goal:** the numbers are right and the tenancy walls hold — verified adversarially — BEFORE we grow surface area in Phase 4. PRs into main; migrations additive-only with REVOKE-first discipline.

### 3-A · Stat-math correctness
- **P3.1 — #434/#436 live verification.** On deployed prod: ERA/WHIP thirds-aware everywhere (stats-center, box score, passport, scout-packet — P0.11 landed the residual), OBP/SLG/OPS live per migration `20260701020000`. Evidence: seeded-demo Stats Center + passport + packet values hand-checked against fixtures.
- **P3.2 — elite-stat-events pagination.** Full spec: **MP WS1.2** (fetchAllRowsResult + .order().range() over the 4 event tables; PostgREST 1000-row server cap is NOT lifted by .limit()).
- **P3.3 — Stats Center honest degrade.** Full spec: **MP WS6.1** (log degraded event-reads, thread `*Degraded` flags, render EmptyIssue/ghost — never fabricated zeros). Depends on P0.5/P0.9.

### 3-B · SECURITY DEFINER / anon sweep (execution of the P0.8 inventory)
- **P3.4 — Classification sign-off** `[OWNER-GATED]`. Review `docs/audits/DB_SECDEF_INVENTORY_2026-07.md`: for each of the 155 functions, verdict = keep-authenticated / REVOKE-from-anon / REVOKE-from-both / convert-to-invoker. The 30 baseball RLS helpers (`is_baseball_team_coach`, `can_view_baseball_player`, …) generally need `authenticated` EXECUTE (policies call them) but NOT anon. Anything golf-shared gets flagged to owner separately — golf behavior must not change.
- **P3.5 — REVOKE waves (baseball).** Execute the signed-off verdicts in ≤15-file migration batches. Per function: REVOKE, then adversarial verify — (a) `pg_proc.proacl` shows the intended ACL; (b) an anon PostgREST `.rpc()` call fails; (c) the function's legitimate callers (grep `.rpc('<name>'`) still work via an authenticated smoke. Never REVOKE authenticated EXECUTE from a function referenced by any RLS policy without running the full pgTAP suite.
- **P3.6 — Anon re-sweep + CI guard.** MP WS2.2 queries → zero rows; add a pgTAP/CI check asserting no `public`-schema `baseball%` function or relation carries anon in its ACL, so the auto-grant failure mode can never silently return.
- **P3.7 — Announcements-family cycle-freedom sweep.** Full spec: **MP WS2.1** (post-#652 pg_policies audit + `docs/BASEBALL_RLS_SECURITY_AUDIT.md` status update).

### 3-C · RECRUITING RLS — its own carefully-verified sub-track
*The recruiting domain is where a mistake = cross-tenant PII exposure of minors. Every task here gets an adversarial verify by a SECOND agent that tries to break it, plus pgTAP.*

- **P3.8 — Cross-tenant visibility matrix.** pgTAP suite enumerating: coach A (college) vs players on teams A/B, activated vs not, discoverable-team vs not, HS/showcase coach (recruiting-blocked), JUCO↔JUCO rules, college players (never recruitable). Assert both ALLOW and DENY sides for every read surface: discover, watchlist, pipeline, compare, public-player-profile, engagement events. Fixture accounts, not mocks.
- **P3.9 — Anonymity model adversarial pass.** The pre-activation contract: interest is anonymous (`isAnonymous = !coach_id` on engagement rows). Adversarially verify a non-activated player can NEVER resolve coach identity — through the API shape, embedded joins, count deltas, or timeline text — and that post-activation identification is correctly scoped. Verify the activation gate itself (server-side college block, opt-in only) with tests on `activateRecruitingExposure`.
- **P3.10 — Scout-packet token + PII surface.** Run **MP WS2.3** verbatim (verify-only: `can_export_reports` capability wrapper + `readVisibilityState` + `scoutExportEnabled` on every exported entry point; **do NOT add `assertCoachCanRecruitPlayer` to own-roster export paths**). Extend with: token entropy/expiry/revocation behavior on `/baseball/packet/[token]` (revoked token = 404, no data), CSV export honors withheldFieldCount, and a PII field audit of the packet payload vs passport visibility_state (no field reaches the packet that visibility settings withhold).
- **P3.11 — Recruitability gate unit tests.** Full spec: **MP WS3.1** (`assertCoachCanRecruitPlayer`, all 7 denial reasons in precedence order, zero current coverage).

### 3-D · Test hardening (WS3 remainder + guards)
- **P3.12 — Pipeline stage-transition tests.** Full spec: **MP WS3.2** (observed behavior incl. the committed→uninterested array-walk oddity, flagged).
- **P3.13 — Decision-room readiness rollup tests.** Full spec: **MP WS3.3** (never-confident-green-on-stale-data invariant). Note: P1.2 repointed this read-model's source tables — write tests against the helm tables.
- **P3.14 — #394 completion: legacy action guards.** Migrate the remaining ~14 legacy action files to shared active-team/capability guards (stats.ts slice already shipped via #579). Split across 2 PRs. Unblocks the deferred #430/#431 follow-ups and #503 — note "unblocks" is not "closes": #430 closes in P0.15 citing merged #615, and **#431 is executed by P3.16 below**.
- **P3.15 — RLS follow-ups #519/#520.** Harden authenticated-role grants on phase-1 RLS tables; enforce team-match in practice block/attendance policies. pgTAP for each.
- **P3.16 — #431 execution: Discover player sort server-side, all pages.** Runs after P3.14. Move the Discover player sort into the server query (the discover read-model under `src/lib/baseball/read-models`) so ordering is applied across ALL pages — client-side sorting of a paginated list mis-orders every page boundary. Include a pagination-aware test asserting global order holds across consecutive page fetches (respect the PostgREST 1000-row cap pattern: `.order()` + `.range()`). Cite #431 in the PR; P6.1 closes it with this evidence.
- **P3.17 — #391: hardcoded-credential sweep of `scripts/`** `[OWNER-GATED decision]`. UT's disposition table carries #391 as REAL-OPEN (security): hardcoded real/demo credentials in `scripts/`, **explicitly distinct from the #516 owner-declined service_role key — constraint 6 covers #516 only and does NOT extend to these**. Sweep `scripts/` (gitleaks + targeted grep), remove/parameterize every hardcoded credential into env vars, and present the owner a per-account list of exposed demo/real accounts for a rotate-vs-accept decision on each. Reference #391 so P6.1 either closes it with evidence or records the explicit accepted-risk decision. (Numbered after P3.15 to avoid renumbering cross-references; it belongs to the 3-B security track and may run any time in Phase 3.)

**Phase 3 exit gate:** full `npm run test:all` + `supabase test db` (33+ suites incl. new recruiting matrix) green; security-advisor findings reduced to zero ERROR / documented-accepted WARN; adversarial reports for 3-C attached to the PRs; stat values verified against fixtures on prod.

---

## PHASE 4 — UI/UX sweep + information architecture

**Goal:** one publication — the entire baseball surface on Living-Annual, legacy deleted — and the coach nav folded 32→8 tabs with zero orphans. Runs on successor branch `batch/baseball-ui-annual` (created off green main), per MP.

### 4-A · Living-Annual migration (31 tasks — ABSORBED, not restated)
**The authoritative spec is `docs/baseball/ui-migration-execution-plan.md`** (per-surface specs, kit cheat-sheet, fork-collapse recipe, §5 verification checklist) + `docs/baseball/ui-migration-map.md` (coverage matrix), exactly as MP WS-UI absorbs them: 29 surfaces (Pressbox 16 · War Room 6 · Passport 7) + owner Batch 0 (EmptyIssue presets) + owner Batch H (PlayerPassportCard deletion, doc ticks). Batches 0 → A–G (may overlap across lanes; F apart from G) → H. Non-negotiables stand: presentation-only, no read-model/action/RLS edits, EmptyIssue-not-amber, StatReadout numbers, ink discipline, reduced-motion. command-center + stats-center are DONE reference implementations — do not touch. Note for agents: Phases 1–3 repaired several surfaces' data paths (travel, camps, discover, college-interest, readiness) — the UI batches now migrate *working* features; re-verify each surface's §5 checklist against live data, not mocks.

### 4-B · 8-tab coach nav consolidation (spec: COACH_NAV_8TAB_PROPOSAL.md)
- **P4.32 — `[OWNER-GATED — frozen-file edit]` Add the derived `hub` field to `nav-registry.ts`.** The registry is the declared single source of truth; every coach/both entry gets exactly one of the 8 hubs per the proposal's mapping table (owner confirms the flagged placement calls: camps→Recruiting, import-center→Stats, events→Management). **This edit also absorbs the deferred P1.8 registry correction** — fix the player-facing college-interest row exactly as named in the P1.8 PR body. This is the ONE sanctioned edit to a frozen file in this roadmap; owner performs or explicitly delegates it.
- **P4.33 — Derive, don't hand-list.** Rewrite `hub-definitions.ts` / `resolve-active-hub.ts` / `buildCondensedBaseballNavigation` (sidebar.tsx) to group by `entry.hub`, inheriting `requiredCapability`/`allowedProgramTypes` verbatim from the registry. This structurally fixes the 5 unreachable features (camps, postgame-review, practice-effectiveness, practice-planner, comparisons), the phantom coach `tasks` tab, the player-only `college-interest` coach link, and the Decision-Room/Staff-Room label drift.
- **P4.34 — BaseballFairwayShell lockstep port.** Port the same hub-derived section builder into `BaseballFairwayShell.tsx` **in the same wave** — if Lane B's flag flips with the Fairway shell unported, the sidebar silently regresses to a 31-item flat wall. Both shells consume ONE builder; per-coach-type views (College 7 / HS 6 / JUCO 8 / Showcase two-level) verified in both.
- **P4.35 — Nav invariant tests.** Extend `nav-manifest.test.ts`: every coach/both registry entry has exactly one `hub`; no hub tab renders a route the role/program-type can't access; set-conservation across program types; zero dead aliases. This is the permanent guard against the drift that caused the 5-orphans bug.

**Phase 4 exit gate:** every surface ticked in `ui-migration-map.md` with legacy components deleted; both shells render the 8-tab nav identically under the flag; MP WS5.1-adjacent checks (no clipped chrome) pass; `npm run typecheck` + lint ratchet green; zero regressions in the Phase-1 round-trip suites.

---

## PHASE 5 — Long tail

**Goal:** the product tells the truth everywhere — stubs decided, mobile polished, perf and observability closed, demo data exercising every repaired loop, dead code gone, docs current.

### 5-A · The 18 stubs — build-vs-delete, each decided `[OWNER-GATED decisions; deletions gated]`
- **P5.1 — Delete the 12 legacy redirect stubs** + orphaned duplicates (unused NewGameClient copy, useOnboardingFlow hook, .tmp file, /profile orphan route after P2.10): coach-dashboard-{college,high-school,juco,showcase}, team-overview, team-high-school, stats-home, performance-player-detail, player-{college,high-school,juco,showcase}-hub — all self-documented deprecated redirects; delete routes + dead loading/error boundaries so the route tree tells the truth. Default verdict: DELETE (per-type dashboards/hubs were superseded by command-center and /player/today by design). Owner may pull any single one back to a build ticket.
- **P5.2 — analytics (coach):** decision — build a Pressbox analytics surface (L, from scratch) or remove the redirect and nav promise. Recommendation: defer build; remove the promise now.
- **P5.3 — academics (player lane):** decision — build "my academics" (player-scoped actions already exist unused) or stop presenting it as player-reachable. Recommendation: BUILD (S–M; actions ready; JUCO story needs it).
- **P5.4 — settings-demo-mode:** delete route + dead boundaries (deliberately retired; column write-blocked).
- **P5.5 — guardian-access + showcase-profile player counterparts:** decision per proposal (M each) or remove player reachability. Recommendation: remove reachability now, ticket the builds.
- **P5.6 — marketing-home:** `/baseball` has zero landing content — fine for private beta, hard blocker for public launch. Decision + (if go-public) a proper build ticket with the Helm marketing design direction.

### 5-B · Mobile / iOS / a11y
- **P5.7 — #483 safe-area-top.** Full spec: **MP WS5.1** (`dashboard-shell.tsx:241` sticky bar, `pt-[env(safe-area-inset-top)]`, do NOT misroute to BaseballFairwayShell).
- **P5.8 — Land the 8 `fix/qa-*` PRs (#479–#485).** Drafted in P0.13; rebase onto current main (they predate Phases 1–4 — expect conflicts in shell/nav files; the nav consolidation may have obsoleted parts of nav-deadends), review, land or close-with-reason each.
- **P5.9 — Device pass.** Full spec: **MP WS5.2** (≥44px tap targets on both bottom navs; Capacitor iOS offline behavior vs the route-contract runbook). Plus an axe-core a11y pass over the migrated Living-Annual surfaces.

### 5-C · Perf, observability, data
- **P5.10 — Perf pair.** **MP WS1.3** (recalculateTeamAggregates N+1 → single-query batch; confirm #394 done in P3.14 first) + **MP WS4.1** (strength-groups Promise.all).
- **P5.11 — Error-honesty sweep + sustained funnel.** Codify the explicit-error-envelope pattern (no ignored `error` destructures — grep-driven fix list from HONEST_READ §5.11); Sentry/postgres funnel re-check per **MP WS6.2**; add the missing task-reminder dispatcher or remove the reminder UI (inert-setting rule).
- **P5.12 — Module-toggle enforcement (#503/#504).** Season + program module toggles actually gate features at runtime (was deferred pending locked stats.ts/teams.ts — both settled by Phase 3).
- **P5.13 — `[OWNER-GATED prod write]` Full demo re-seed.** Re-run/extend `scripts/seed-rini-baseball-demo.ts` so demo data exercises every repaired loop (lift sessions with logged sets, readiness check-ins visible to the coach, a created trip, published camps, clips with bounds). No delete-then-reinsert; golf data untouched.
- **P5.14 — Dead-code + docs truth.** Full spec: **MP WS7.2** (knip over baseball surfaces post-Batch-H) + write `memory/context/baseballhelm-features.md` (the missing baseball source-of-truth — per the standing remediation rule this file's absence was a root cause) + update `docs/operations/BASEBALLHELM_FEATURE_READINESS_MATRIX.md` + CLAUDE.md baseball routing line.
- **P5.15 — Test-hardening cluster decision (#372/#373/#377/#379/#382).** Owner decides on the stacked chain #356→#366 (conflicting with main): rebase-and-land the authenticated smoke/crawler/contracts stack, or re-implement fresh on the clean base (recommendation: re-implement fresh — the base has moved too far).

**Phase 5 exit gate:** route tree contains zero stubs (all built or deleted); mobile issues #479–#485 closed; feature docs match reality; knip clean; demo account demos every headline loop without a single error.

---

## PHASE 6 — Ship

- **P6.1 — Ledger reconciliation.** Full spec: **MP WS7.1**: re-verify each of the 25 fleet-absorbed issues' acceptance criteria on prod; close with evidence; anything regressed becomes a scoped task before the verdict.
- **P6.2 — Full green gate.** On main: `npm run test:all` (unit + integration + rls) + `npm run build` + `supabase test db` + Playwright E2E + smoke, all green; lint ratchet re-locked down-only; DB-types drift + route hygiene + schema invariants green.
- **P6.3 — 72-hour prod watch.** Zero baseball 42703/42P17 in postgres logs; zero new baseball Sentry issues; Vercel function durations nominal on the perf-touched paths.
- **P6.4 — `[OWNER-GATED]` Re-issue the verdict.** Update `docs/audits/BASEBALLHELM_PRODUCTION_VERDICT.md` to SHIP with pasted command evidence per MP §5's Definition of SHIP (all six conditions). Owner signs.

---

## EXECUTION MODEL

**Fleet.** Fable 5 (this doc's author) plans and re-plans; **Sonnet 5 agents execute every task — one task = one agent = one git worktree = one PR.** Opus runs the main loop only. A fresh agent receives: this doc's task block, the cited spec block (MP WSx.y / HONEST_READ §3.x / UT §x / nav proposal), and the standing constraints — nothing else is assumed.

**Branching.** Phase 0 pre-merge work lands on `batch/baseball-fixes` (the #650 vehicle); everything after #650 merges lands as short-lived ≤15-file PRs into `main` — EXCEPT Phase 4, which uses `batch/baseball-ui-annual` per the WS-UI plan. Rebase onto the target tip immediately before merge. Every agent worktree is removed (and its branch deleted) at PR-merge time — the Phase-0 tangle never recurs (UT §5 governance).

**Per-task verification gate (no evidence → no merge):**
1. The task's own listed verify command(s), output pasted in the PR body.
2. `npm run typecheck` + `npm run lint` (ratchet must not trip: `node scripts/lint-ratchet.mjs`).
3. Relevant vitest project(s); `npm run test:rls` whenever a migration or policy is touched.
4. Migrations: post-apply `information_schema`/`pg_policies`/`pg_proc` proof — never `schema_migrations`.
5. New DB objects: `proacl`/`relacl` output showing no anon.

**Adversarial verification (mandatory, second agent):** every Phase 3-C recruiting-RLS task, every P3.5 REVOKE wave, and every stat-math change (P0.9/P0.11/P3.1–P3.3) gets an independent Sonnet 5 verifier whose brief is to BREAK the change (wrong-tenant reads, anon rpc calls, fixture math recomputed by hand). Verifier report attaches to the PR; author ≠ verifier.

**Frozen files (owner-only; reviewer rejects any diff touching them):** `src/lib/baseball/nav-registry.ts` (single sanctioned exception: P4.32, owner-gated), `src/app/baseball/(dashboard)/BaseballFairwayShell.tsx` (exception: P4.34, owner-gated, lockstep-only), `src/app/baseball/(dashboard)/layout.tsx`, `src/components/baseball/living-annual/molecules/EmptyIssue.tsx` (WS-UI Batch 0 owner edit only), the living-annual barrels, `Header`, `ui/*`. The MP §4 conflict map governs all other contended files (stats-center.ts, StatsCenterClient.tsx, stats.ts, passport/scout-packet read-models, dashboard-shell.tsx, `.lint-baseline.json`) — **amended: `dashboard-shell.tsx` now carries TWO sanctioned edits, P2.16 (BaseballProgramBrand mount) then P5.7 (WS5.1 safe-area), strictly sequenced in that order and never concurrent.**

**Database rules (restated because agents keep failing them):** shared golf+baseball prod — additive-only, never touch `golf_*`, never destructive DDL, never delete-then-reinsert; apply via `mcp__supabase__apply_migration`; verify via `information_schema`; REVOKE-first on every new object; add columns BEFORE any bulk-ingest; upserts need the authenticated UPDATE grant.

**Escalation.** Any task that (a) needs a frozen file, (b) finds its spec contradicts live code, or (c) discovers a new cross-tenant exposure: STOP, file a spec-block task against this roadmap, do not drive-by fix.

---

## Task census

| Phase | Name | Tasks | Owner-gated items |
|---|---|---|---|
| 0 | Fresh Base | 19 | merge #650 (+3 PRs); close 43 PRs; prune 143 branches + 16 worktrees; REVIEW-pile triage; demo re-seed |
| 1 | Repair the 7 broken loops | 9 | — |
| 2 | Complete the 21 half-builts | 20 | journey↔pipeline decision; data-retention descope; recruiting-prefs keep/pull |
| 3 | Correctness & security | 17 | SECURITY DEFINER classification sign-off; #391 credential rotate-vs-accept decision |
| 4 | UI sweep + 8-tab IA | 35 | nav-registry frozen-file edit; Fairway-shell lockstep edit; WS-UI Batches 0+H |
| 5 | Long tail | 15 | stub build-vs-delete decisions (×6); full demo re-seed; test-chain decision |
| 6 | Ship | 4 | SHIP verdict sign-off |
| **Total** | | **119** | |

## Top risks (watch these)

1. **Shared prod DB (golf + baseball).** One careless DDL or REVOKE harms the live golf product. Mitigation: additive-only + information_schema verification + golf-shared functions flagged to owner (P3.4) + never DROP in rollbacks.
2. **Lift Lab reconciliation partially landed.** 3 writers + 7 readers + 1 FK across two ID spaces; landing writes without readers recreates silent data loss. Mitigation: P1.1–P1.3 are one wave with a hard round-trip gate.
3. **The 155-function REVOKE sweep.** Over-revoke breaks RLS policies/RPC callers silently; under-revoke leaves the holes. Mitigation: inventory→sign-off→waves with per-function adversarial verify + full pgTAP per wave (P3.4–P3.6) + permanent CI guard.
4. **Recruiting RLS / anonymity.** Cross-tenant PII (minors) is the existential failure mode. Mitigation: dedicated sub-track 3-C, fixture-account pgTAP matrix, second-agent adversarial verification, scout-packet token audit.
5. **Both-shells lockstep on nav.** If the Fairway flag flips before P4.34, the sidebar regresses to a 31-item flat wall. Mitigation: P4.32–P4.34 are one wave; nav invariant tests (P4.35) block drift permanently.
6. **schema_migrations unreliability.** Recorded-but-unran migrations have burned this repo repeatedly (postgame, dev-plan RLS, import registry). Mitigation: information_schema verification is a per-task gate, plus P3.1's live-value checks.
7. **Unshipped work destroyed in the prune.** 8 `fix/qa-*` branches carry 46 unpushed commits each; 85 squash-orphan deletions use `-D`. Mitigation: P0.13 drafts PRs BEFORE any prune; REVIEW list is never auto-deleted; every `-D` carries its shipped-PR citation.
8. **Mega-PR relapse under fleet pressure.** The tangle's root cause. Mitigation: ≤15-file hard cap, worktree-removal-at-merge, weekly hygiene sweep, no-work-without-a-PR rule.
