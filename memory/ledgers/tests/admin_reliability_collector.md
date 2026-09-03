<!-- markdownlint-disable MD004 MD007 MD012 MD013 MD022 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->
# Admin Reliability Collector test ledger

## 2026-09-03 — Fourth collector arm: executable invariants (Phase D.4.3)

- `src/lib/reliability/__tests__/error-budget.test.ts` — 13 cases: unreadable
  windows never read `'ok'`, a fully blind window set marks every feature
  `'unknown'`, real zero-error `'ok'`, red/amber threshold crossings against
  `TIER_THRESHOLDS`, floor accounting (`observedIsFloor` from a
  degraded/partial window, a truncated window, or a floored signal),
  worst-first sort order, and the `crm_recruiting_pipeline` exclusion.
- `src/lib/reliability/invariants/__tests__/round-graph-invariants.test.ts` —
  the pure `evaluate*` functions: zero-violation pass, exact count/sample
  passthrough, no caller-array mutation.
- `src/lib/reliability/invariants/__tests__/run-checks.test.ts` — the runner
  contract via `vi.doMock`: a clean read maps to pass/fail with a real
  `feature_id`; a hung fetch (never-resolving promise) times out to
  `'unknown'` on every declared check, never `'pass'`; a fetch error
  degrades to `'unknown'` with the error message surfaced.
- `src/lib/reliability/invariants/__tests__/round-graph-data.readonly.test.ts`
  — a source-text check (not a runtime mock) that the invariant data layer
  contains no Supabase write-method call (`.insert(`/`.update(`/`.upsert(`/
  `.delete(`/`.rpc(`), adapted from the D.5 spec's raw-SQL grep to this
  repo's PostgREST-client shape.
- `src/lib/admin/triage/__tests__/invariant-lattice.test.ts` — extended
  (not replaced): the new `roundGraphChecks` input renders pass/fail/unknown
  rows under a `'Round graph'` group, an omitted input (a caller predating
  this phase) still compiles and renders one unknown row, and an
  `'unknown'`-state check never carries a severity even when its declared
  severity is `'critical'`.
