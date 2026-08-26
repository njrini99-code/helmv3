# Golf Round Lifecycle test ledger

## 2026-08-22 — confirmed-snapshot recovery contract

- SHA: `48b41e1c4d8c86f12f5a2becd11454f5bd3899e2`.
- Added `src/lib/utils/emergency-save.test.ts` coverage for acknowledged-save
  clearing, preservation of a newer concurrent fallback, equivalent server
  progress with server-generated shot IDs, and non-equivalent scorecards.
- Verification: targeted emergency-save tests (6), golf schema tests (25),
  TypeScript, and ESLint passed. The repository-wide static preflight remains
  blocked by an unrelated unchecked-Supabase-read baseline of 1050 vs 1049.
  The Vercel production build for the deployed repair passed.

## 2026-08-22 — server checkpoint verification

- SHA: `a68d7c299` (implementation commit; amended after ledger stamping).
- Coverage: targeted partial-save and round-tracking regressions, typecheck,
  preflight, and production build for the start and completed-hole checkpoint
  contract.
- Guarantees: a committed in-progress parent survives until explicit discard or
  completion, and a player cannot advance past a completed hole before the
  server has acknowledged its persisted data.

## 2026-08-22 — child-write round preservation contract

- SHA: `f06c9bf34b72e9b368d49db79fa9c0c88dc0e659`.
- Added action-level regressions for failed hole and shot persistence against
  an existing recoverable round, plus emergency-save discovery coverage.
- Guarantees: child-write errors do not erase an in-progress parent; the next
  retry or device recovery retains the prior durable state.

## 2026-08-22 — stale delete recovery contract

- SHA: 31cf3f845f19af7ff962b362837210f333fc4fe5 (implementation repair commit).
- Added `src/hooks/golf/__tests__/shot-mutation-recovery.test.tsx`.
- Guarantees: only one local destructive shot mutation can run at a time, and
  Undo reconciles a server-confirmed `shot_not_found` response instead of
  leaving the active round blocked.

## 2026-08-22 — durable checkpoint navigation contract

- SHA: `4276cec7e2556aa4b1dffc92851ba780d2a67b1a`.
- Coverage: focused UI, recovery, offline-consolidation, mutation, and schema
  tests exercise retry-on-failure, no navigation before acknowledgement, and
  clearing a reopened hole's completed state before persistence.
- Verification: 68 focused tests, TypeScript, ESLint, and the local production
  build passed. The repository-wide preflight remains blocked only by its
  unrelated stale unchecked-Supabase-read baseline (1,047 observed vs 1,049
  expected), which this change intentionally does not rewrite.

## 2026-08-23 — scoped recovery ownership and ordering contract

- Added localStorage and IndexedDB regressions for shared-device isolation,
  safe recovery of authorized pre-owner server snapshots, and acknowledged
  snapshot cleanup that leaves a newer recovery copy intact.
- Verification: targeted unit coverage, TypeScript, and ESLint are required
  before merge. The direct-RPC pgTAP suite remains pending a database-enabled
  runner.

## 2026-08-23 — completed-round database guard regression

- The shot-detail visibility RLS fixture keeps its normal player-write scenario
  in progress, seeds only its history scenario through the postgres-owner
  lifecycle marker used by the atomic round RPCs, and asserts that a player
  cannot mutate details on that completed history row.
- The database suite therefore verifies both sides of the contract on a clean
  local stack: player-owned in-progress details remain editable and
  completed-round details remain immutable.

## 2026-08-23 — lost terminal-response reconciliation contract

- Added action coverage for an atomic `submit_round_atomic` commit whose HTTP
  response times out or is reported as Safari/WKWebView `Load failed`. The
  action confirms the authenticated round's completed state and returns success
  without executing any destructive fallback.
- An unconfirmed abort remains safely retryable: its in-progress parent,
  holes, shots, and persisted recovery backup are left untouched.

## 2026-08-25 — recap wrapper guarantee flipped, call-path now exercised

- The round-recap lifecycle pgTAP suite (`supabase/tests/rls/`) previously
  asserted the public recap
  endpoint "remains SECURITY INVOKER" — that assertion enshrined the 42501
  schema-permission bug. It now asserts the definer boundary + pinned
  search_path, and a new test executes the endpoint as the `authenticated`
  role, proving the call reaches the private implementation instead of dying
  at the schema boundary. Catalog-only suites cannot catch grant/visibility
  regressions; the call-path test is the load-bearing guarantee.

## 2026-08-25 — lifecycle privilege-contract suite

- Added the lifecycle privilege-contract suite in `supabase/tests/rls/`: the
  privilege contract of the whole lifecycle RPC surface asserted at the
  catalog level (schema USAGE, EXECUTE grants, owner, definer mode, pinned
  search_path), plus two zero tripwires — no public definer function is
  anon-executable, and none is left on default PUBLIC ACLs.
- Exists because the recap outage passed behavioral testing locally while
  production denied the same privilege path (P1-10): catalog assertions
  hold identically in every environment built from this chain, so a grant
  regression fails CI even where local runtime behavior is lax. This suite
  is the complement to the call-path test above, not a replacement for it.
