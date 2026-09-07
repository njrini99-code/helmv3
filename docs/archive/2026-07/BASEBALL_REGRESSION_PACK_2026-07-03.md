# BaseballHelm Regression Pack — 2026-07-03

Phase 5 of the HelmV3 stabilization brief. A pre-pass survey of existing
vitest coverage (`src/**`, excluding the separately-tracked dead
`scripts/__tests__/` suite) found several historical issues with **zero**
regression coverage despite being marked closed/fixed. This pass adds
tests for the highest-severity gaps; the rest are documented below for a
dedicated follow-up.

## Added in this pass

| Issue | File | What it proves |
|---|---|---|
| #477 | `src/app/baseball/actions/__tests__/postgame.test.ts` | `generatePostgameReview` preserves `converted_to_timeline` / `converted_to_task` / `dismissed` / `resolved` dispositions across regenerate; stale (no-longer-emitted) `new` items are soft-dismissed, never deleted; already-converted stale items are left untouched. |
| #442 / #443 | `src/app/baseball/actions/__tests__/register-for-camp.test.ts` | `registerForCamp` requires authentication before any RPC call, always calls the atomic `baseball_register_for_camp` RPC (never a raw insert), and maps every RPC outcome (`registered`/`full`/`already_registered`/`not_found`/`unauthorized`/transport error/unrecognized string) to the correct result — never a false success. |
| #415 | `src/app/baseball/actions/__tests__/commit-event-import-review-bands.test.ts` | `commitEventImport`'s server-recomputed auto-commit band overrides a forged client `detectionAutoCommit`; `do_not_commit` throws before any `baseball_import_runs` row is written; `hold_for_review` stages the run (`status: 'review'`, `baseball_stat_uploads` with `staged: true`) with **zero** event-grain table writes. |

All three run under `npm test` / `npm run test:run` (default `unit`
project) — no new CI wiring needed.

## Deliberately not covered in this pass, with reasons

| Issue | Why not | What's needed |
|---|---|---|
| #406 (staff player-scope RLS) | Enforcement is **100% Postgres RLS** via `can_view_baseball_player(team_id, player_id)` — there is no TypeScript mirror of the scoping logic to unit-test. A vitest mock would only prove the mock's own behavior, not the real RLS policy. | A pgTAP suite (`supabase/tests/rls/`) seeding a coach + scoped staff row + players and asserting `SELECT` visibility under `SET ROLE`. **Docker is not available in this environment** (`docker info` fails), so this could not be authored/run here — needs a maintainer machine with the local Supabase stack. |
| #442 true concurrency | The action-level test above proves the *caller* always routes through the atomic RPC, but a vitest mock cannot exercise real Postgres row locking (`FOR UPDATE`) under concurrent transactions — the actual capacity-cannot-be-exceeded guarantee lives entirely in `supabase/migrations/20260701000442_baseball_camp_register_atomic.sql`. | Same as #406: a pgTAP or `postgres`-driven integration test that opens two concurrent connections against a local Supabase instance and asserts only `capacity` registrations succeed. Docker-dependent, not run here. |
| #395 (team join code lifecycle) | Partial coverage already exists in `src/app/baseball/actions/__tests__/team-join-code.test.ts` (max-uses exhaustion, atomic redemption, IDOR). Missing: expired invite, invalid/inactive code, duplicate join, cross-team denial, join-code collision retry. | Extend the existing test file — same mocking pattern, no new infra needed. Left for a follow-up pass; flagged here so it isn't lost. |
| #407 (disabled import sources) | Helper-level coverage exists (`import-source-enabled.test.ts`, `import-source-registration.test.ts`) plus a static contract check. Missing: an end-to-end `previewEventImport`/`commitEventImport` call with a disabled registry row asserting rejection. | Extend `commit-event-import-review-bands.test.ts` (new file, same mock scaffolding) with a disabled-source case. Left for follow-up. |
| #413 (dashboard failure-state taxonomy) | Utility-level coverage exists (`resolveReadModelLoadState`) plus static contracts for a handful of pages. Missing: component-level rendering tests proving loading/empty/permission-denied/partial/hard-failure don't collapse into one generic empty state across all Baseball dashboard pages. | A dedicated React Testing Library pass per page — larger scope, left for follow-up. |
| #399 (box-score atomicity) | Adequate existing coverage at the RPC-response level (`save-full-box-score.test.ts`, `upload-box-score-csv.test.ts`); no test proves DB-level rollback (single-RPC design means there's no app-level "batting succeeded, pitching failed" split to test without a live DB). | pgTAP or a real Postgres integration test asserting the RPC's transactional boundary. Docker-dependent. |
| #417 (legacy stats seed safety) | `scripts/__tests__/seed-baseball-stats.safety.test.mjs` has adequate *content* (dry-run default, `--confirm`, `--allow-prod`, upsert-not-delete) but is part of the separately-tracked "scripts/__tests__ is entirely dead" finding (see `docs/operations/2026-07-03-p0-service-role-key-rotation-runbook.md` §4) — it's written for `node --test`, which nothing invokes. | Covered by the broader `scripts/__tests__/` wiring follow-up, not a Baseball-specific fix. |

## Why pgTAP/Docker items can't be closed from this environment

This session's sandbox has no `docker` binary (`docker: command not found`),
so `supabase start` (required for pgTAP suites and true-concurrency
integration tests) is not possible here. Every item above that needs
Postgres-level verification is flagged rather than faked with a
vitest mock that would only prove its own assumptions.
