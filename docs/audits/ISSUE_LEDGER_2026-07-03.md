# Issue Ledger — 2026-07-03

Final deliverable of the HelmV3 stabilization brief (Phase 14). Classifies
every issue named in the brief against evidence gathered during this
pass. **No issues were closed automatically** — classifications and
recommended next actions only, per the brief's guardrail.

Classifications: `still valid` · `fixed — needs evidence comment` ·
`fixed — needs regression` · `duplicate/superseded` · `blocked by DB/admin
access` · `backlog/product decision` · `needs triage` · `not independently
verified this pass`.

## Bucket A — Supabase / Production DB Drift

| Issue | Title | State | Classification | Evidence | Next action |
|---|---|---|---|---|---|
| #651 | Baseball schema drift (12 missing columns) | open | **fixed — needs evidence comment** | All 12 columns confirmed present via direct `information_schema.columns` query against production. Matching migrations exist on disk and in the remote ledger. See `docs/audits/SUPABASE_DRIFT_REPORT_2026-07-03.md`. | Comment with evidence + close. |
| #728 | `recalculate_baseball_season_stats` `b.so` drift | open | **fixed — needs regression** | Live function body has no `b.so` reference; now includes a coach-auth guard. Hotfix held. | Comment with evidence. Drift guard (`npm run db:drift:check`, PR #775) now asserts this on every run — closes the "needs regression" gap. |
| #772 (linked-lint: `can_manage_baseball_lift_group`) | Stale reference to `baseball_strength_groups` | open (tracked under #772) | **fixed — needs evidence comment** | Live body has no executable reference to the graveyarded table (comment-only). | Comment with evidence + close this sub-finding. |
| #772 (linked-lint: `baseball_accept_staff_invite`) | Stale reference to `v_invitation.invitee_email` | open (tracked under #772) | **fixed — needs evidence comment** | Live body uses `v_invitation.email` / `.invitee_name`, both real columns. No stale reference. | Comment with evidence + close this sub-finding. |
| #732 | `public.rate_limits` / `expires_at` errors | open | **needs triage** (reclassified) | `public.rate_limits` doesn't exist; every function referencing `expires_at` uses a real, correctly-named column on its own table (`baseball_staff_invitations`, `helm_lifting_coach_invites`, `baseball_team_invitations`). No first-party schema/function cause found. | Next step is Supabase project **log correlation** at the time of the original error (edge function / dependency / external probe), not another schema search. |
| n/a | Migration ledger integrity (NEW finding) | not filed | **still valid — new** | Local migration filenames and remote-applied versions are systemically mismatched for ~everything since 2026-05-26 (193 local-only / 445 remote-only by version, almost entirely 1:1 name-paired). `npm run check:ledger` exists but is wired into no CI job. | File a new issue. Investigate what actually applies migrations to this project (likely the Supabase MCP `apply_migration` tool, which mints its own version at call time — this session's own admin-rollup migration reproduced the same pattern by necessity, see PR #775). |
| n/a | Admin rollup RPCs gated on mutable `users.role`, not `is_super_admin()` (NEW finding, PR #736 follow-up) | not filed | **fixed** | All 11 `get_admin_*_rollup` RPCs + `guard_users_role_self_change` now check `is_super_admin()`. Migration applied to production, verified live. See PR #775. | File a new issue documenting the incident-reproduction risk that existed, cross-reference #736, close as fixed with this PR as evidence. |

## Bucket B — BaseballHelm Data Integrity

| Issue | Title | State | Classification | Evidence | Next action |
|---|---|---|---|---|---|
| #492 | `publishLiftDay` duplicate assignments | closed | **fixed — regression exists** | `src/app/baseball/actions/__tests__/publish-lift-day-helm-bridge.integration.test.ts` covers re-publish idempotency. Runs under `npm run test:integration`, not default `npm test`. | No action — already adequately covered. |
| #477 | Postgame regenerate resets disposition to `new` | closed | **fixed — regression added this pass** | Zero prior test coverage found; added `src/app/baseball/actions/__tests__/postgame.test.ts` (5 tests: fresh insert, preserve converted/dismissed/resolved, stale soft-dismiss, stale-but-converted left alone). See PR #776. | Comment on issue with the new test file as evidence. |
| #399 | Box-score save atomicity | closed | **fixed — partial regression** | `save-full-box-score.test.ts` / `upload-box-score-csv.test.ts` cover RPC-response-level behavior; no DB-level rollback test exists (single-RPC design, needs pgTAP). | Leave open sub-task for a pgTAP/integration test; not blocking. |
| #417 | Legacy stats seed script safety | closed | **fixed — regression exists, but the regression itself doesn't run** | `scripts/__tests__/seed-baseball-stats.safety.test.mjs` has correct content but is part of the broader "scripts/__tests__ is entirely dead" finding (47 files written for `node --test`, invoked by nothing). | Tracked under the P0 security PR's follow-up item (#774's runbook §4), not Baseball-specific. |
| #442 | Camp capacity enforcement | closed | **fixed — partial regression added this pass** | `src/app/baseball/actions/__tests__/register-for-camp.test.ts` (added, PR #776) proves the caller always routes through the atomic RPC and never defaults to false success. True concurrent-capacity enforcement lives in Postgres (`baseball_register_for_camp`, `FOR UPDATE` row lock) and needs pgTAP — not possible in this session (no Docker). | pgTAP follow-up tracked in `docs/audits/BASEBALL_REGRESSION_PACK_2026-07-03.md`. |
| #443 | Cancelled registrations excluded from capacity | closed | **fixed — regression exists** | `src/lib/baseball/camp-utils.test.ts` covers `activeCampCountsByCamp`. | No action. |
| #395 | Team join code lifecycle | closed | **fixed — needs regression (partial)** | `team-join-code.test.ts` covers ~4 of ~8 scenarios (max-uses exhaustion, atomic redemption, release-on-failure, IDOR). Missing: expired invite, invalid code, duplicate join, cross-team denial, collision retry. | Extend the existing test file — same mock pattern, no new infra. Not done this pass (documented in `BASEBALL_REGRESSION_PACK_2026-07-03.md`). |
| #406 | Staff player-scope RLS | closed | **fixed — needs regression, blocked** | Enforcement is 100% Postgres RLS (`can_view_baseball_player`) with no TypeScript mirror. **Also found:** the shipped #406 migration treats `scope_player_ids IS NULL OR empty` as "see all team players," not "deny" — double-check this matches actual product intent (the brief's framing suggested empty scope should deny). | Needs a pgTAP suite (blocked — no Docker in this session) AND a product-intent confirmation on the null/empty-scope behavior. |
| #415 | Import review-band server authority | closed | **fixed — regression added this pass** | Zero prior action-level coverage found; added `src/app/baseball/actions/__tests__/commit-event-import-review-bands.test.ts` (4 tests: server recompute overrides forged client band, `do_not_commit` throws pre-write, `hold_for_review` stages with zero event writes, no-`rawFileBody` fallback documented). See PR #776. | Comment on issue with the new test file as evidence. |
| #407 | Disabled import sources rejected | closed | **fixed — partial regression** | Helper-level coverage exists (`import-source-enabled.test.ts`); no action-level (`previewEventImport`/`commitEventImport`) rejection test. | Extend `commit-event-import-review-bands.test.ts` with a disabled-source case — not done this pass. |
| #413 | Dashboard failure-state taxonomy | closed | **fixed — thin regression** | Utility-level (`resolveReadModelLoadState`) and a handful of static contracts exist; no component-level rendering tests across all Baseball dashboard pages. | Dedicated React Testing Library pass — larger scope, not done this pass. |
| #415-adjacent | #394 bespoke auth checks vs. `withBaseballAction` | open | **not independently verified this pass** | Carried from the brief; not re-audited in this session. | Needs its own audit pass. |
| #393 | Baseball document actions legacy patterns | open | **not independently verified this pass** | Carried from the brief; not re-audited in this session. | Needs its own audit pass. |

## Bucket C — Helm Bridge / Admin Dashboard

| Issue | Title | State | Classification | Evidence | Next action |
|---|---|---|---|---|---|
| #736 | Admin RPC role-model regression (root cause) | closed | **fixed this pass (root cause, not just symptom)** | #736's original fix restored the admin row + added `admin_allowlist`/`is_super_admin()`, but never migrated the 11 `get_admin_*_rollup` RPCs off the original `users.role='admin'` gate — meaning the exact incident was still fully reproducible by anything touching `users.role`. Also found `guard_users_role_self_change` allowed `admin`→`coach` self-demotion (the literal #736 transition) since it only blocked escalation, not demotion. Both fixed and verified live. See PR #775. | Comment on #736 with this evidence — the issue's "prevent recurrence" acceptance criterion is now actually met. |
| n/a | Helm Bridge admin/errors/deploys pages functional | — | **fixed/verified where checked** | Sentry/Vercel APIs confirmed fail-soft (never throw); `/admin/deploys` already treats non-`ok` status as `PanelNoData`. "0 users" → "unknown user" wording fixed for `app`-origin incidents. Error-identity enrichment (`contextFrom`) added, wired into `generateRoundRecap`. See PR #777. | No open issue found for these specific sub-items; treat PR #777 as the evidence trail. |

## Bucket D/E — Sentry / Vercel

No open issue numbers were named for these specifically in the brief (they were framed as "known issues," not filed). PR #777 addresses: Vercel web-insights false-zero-on-401/403 (was indistinguishable from real zero traffic), and adds `docs/operations/SENTRY_ADMIN_READ_API.md` + `docs/operations/VERCEL_ADMIN_DEPLOYS_RUNBOOK.md`.

## Bucket E — CI / External Checks

| Issue | Title | State | Classification | Evidence | Next action |
|---|---|---|---|---|---|
| #390 | CI: classify pending PR checks | **closed** | **fixed — verified** | `docs/CI_RUNBOOK.md` exists, comprehensive (hard-gate/advisory classification table, wait windows, rerun commands, inherited-failure guidance), and cross-checked accurate against `.github/branch-protection.md`. | No action — already fully addressed, no new runbook needed. |
| #388 | CircleCI Lighthouse preview readiness | **closed** | **fixed — verified** | `.circleci/scripts/wait-for-vercel-preview.sh` exists and is confirmed wired into `.circleci/config.yml` (line 231). | No action — already fully addressed. |

## Bucket F — Security / Secrets

| Issue | Title | State | Classification | Evidence | Next action |
|---|---|---|---|---|---|
| #516 | Hardcoded service-role key in 9 scripts | **closed** | **REOPENED — was not actually fixed** | All 9 named scripts (plus a 10th, `run-migration.mjs`, not originally named) still had the live production `service_role`/`anon` JWT hardcoded on `main` as of this pass, confirmed via `gitleaks` + manual read. Two scripts also hardcoded a real plaintext account password. The regression guard meant to catch this only scanned a different file glob and, separately, was never invoked by anything. All fixed in PR #774 (code-side). **Key rotation itself is a manual maintainer action** — see `docs/operations/2026-07-03-p0-service-role-key-rotation-runbook.md`. | **Urgent: rotate the Supabase JWT secret** (Project Settings → API → Regenerate), update Vercel/CI/local env vars, rotate the demo account password. Re-open #516 or file a new P0 until rotation is confirmed done. |
| #380 | Ad hoc stats seeding script hardcoded creds | closed | **not independently verified this pass** | `scripts/seed-baseball-stats.mjs` uses `KNOWN_PROD_PROJECT_REF` as a safety guard (not a hardcoded secret) — spot-checked while investigating #516, looks correctly remediated, but not a full independent re-audit. | Low priority — spot-check suggests this one is genuinely fixed, unlike #516. |

## Bucket G — Generated File Drift

| Issue | Title | State | Classification | Evidence | Next action |
|---|---|---|---|---|---|
| n/a | `next-env.d.ts` / `public/sw.js` drift | not filed (freshness baseline finding) | **fixed** | Untracked `next-env.d.ts`; `public/sw.js`'s `stamp-sw.mjs` now only stamps on real Vercel builds (`process.env.VERCEL`), not local/CI builds. `git blame` on `sw.js` showed this had already caused one stray real commit. See PR #778. | No action — fixed. |

## Bucket H — Knip / Dead Code

| Issue | Title | State | Classification | Evidence | Next action |
|---|---|---|---|---|---|
| n/a | 3 unlisted direct dependencies | not filed | **fixed** | `@radix-ui/react-compose-refs`, `fflate`, `postcss-load-config` added to `package.json`. See PR #779. | No action — fixed. |
| n/a | 3 "low-risk" unused files | not filed | **2 of 3 were false positives — 1 fixed** | `golf-mockups/index.tsx` and `lib/types/table.ts` are both actively imported (verified via grep) — **not deleted**. Only `lib/mapbox/client.ts` was genuinely unused (zero importers, no `mapbox-gl` dependency at all) — deleted. See PR #780. | No action on the two false positives; consider re-tuning whatever Knip config produced them if #773 merges. |
| n/a | 3 "medium-risk" files (dashboard-types.ts, MatchScoreBadge.tsx, match-calculator.ts) | not filed | **not touched, per brief instruction** | Left for feature-owner review as instructed. | Feature owner review needed before any action. |

## Bucket I — Dependency / Security Audit

| Item | State | Classification | Evidence | Next action |
|---|---|---|---|---|
| PR #735 (`tar` bump) | open | **merged this pass (auto-merge enabled)** | All hard-gate checks green; only the advisory full Playwright E2E suite failed (per `CI_RUNBOOK.md`'s own classification, non-blocking). | Will complete automatically once GitHub updates the branch. |
| PR #741 (`@anthropic-ai/sdk` bump) | open | **merged this pass (auto-merge enabled)** | Same as above. | Same as above. |
| PR #744 (GitHub Actions group) | open | **needs triage — NOT merged** | `Review Gate / all` genuinely failing: `semgrep (custom rules)` reports 11 blocking findings across 5 files, `yamllint` also failing. Not a flake — real findings on this PR's diff. | Needs someone to look at the actual semgrep/yamllint output before merging; not attempted in this pass given the unexpected failures. |
| PR #753, #760, #764, #765, #766, #767 | open | **not touched — needs individual review** | #760 is a **major** version bump (`@visx/visx` 3→4) — brief explicitly says don't combine major bumps with app changes; #767 is 36 production dependencies grouped together; #765/#766 touch separate subprojects (`ux-flow-auditor`, `helm-website-ui`), not the main app. | Handle individually, smallest/lowest-risk first, per the brief's own ordering — not attempted this pass given time/risk budget after the two safe merges. |
| `npm audit` (full) | — | **documented, not fixed** | 39 vulnerabilities (1 low, 34 moderate, 4 high) as of this pass — consistent with the freshness baseline's prior count. Per hard guardrails, `npm audit fix`/`--force` were never run. | Addressed via the individual Dependabot PRs above, not a bulk audit-fix. |

## Bucket J — Local Git Hygiene

See `docs/audits/GIT_HYGIENE_2026-07-03.md` (PR #781) for full detail: commit-graph fixed, 6 stale branches deleted, 24 stashes and 794 ignored-but-removable paths (including live `.env*` secrets) documented but not acted on.

## PRs shipped this pass

| PR | Title | Scope |
|---|---|---|
| #774 | P0: remove live hardcoded service-role secrets | Security |
| #775 | Supabase drift report + admin-rollup 42501 root-cause fix + drift guard | DB / Admin |
| #776 | Baseball regression pack (#477, #442/#443, #415) | Tests |
| #777 | Sentry/Vercel observability + error-identity hardening | Admin / Observability |
| #778 | Generated-file policy (next-env.d.ts, public/sw.js) | Repo hygiene |
| #779 | Knip direct-dependency declarations | Dependencies |
| #780 | Low-risk dead-file removal (1 of 3; 2 were false positives) | Repo hygiene |
| #781 | Local git hygiene (commit-graph fix, stale branch cleanup) | Repo hygiene |

Plus: PR #773 (pre-existing cleanup tooling) left unmerged — has a timed-out
Playwright job and pending CodeRabbit, not safe to merge without someone
re-running it. PRs #735/#741 (Dependabot) auto-merge enabled.

## Not done in this pass (explicitly out of scope or blocked)

- Actual Supabase service-role key rotation (#516) — requires Supabase
  dashboard access this session doesn't have; runbook provided instead.
- pgTAP suites for #406 (staff-scope RLS) and #442 (true concurrent
  capacity) — this environment has no Docker (`docker: command not
  found`), so `supabase start` isn't possible here.
- `scripts/__tests__/` — 46 of 47 files remain unwired dead tests (only
  the #516 secrets guard was fixed/wired in PR #774). A dedicated pass is
  needed; do not bulk-wire them into vitest without checking each runs
  cleanly first (two sampled files failed immediately when tried).
- Merging PR #773, or any of #744/#753/#760/#764/#765/#766/#767.
- Dropping any of the 24 stashes, or any `git clean` beyond dry-run.
