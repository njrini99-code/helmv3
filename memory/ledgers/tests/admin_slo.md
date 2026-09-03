<!-- markdownlint-disable MD004 MD007 MD012 MD013 MD022 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->
# Admin SLO Center test ledger

## 2026-09-03 — New sub-capability (Bridge Control Plane Phase D)

- `src/lib/admin/slo/__tests__/golden-path-health.test.ts` — one row per
  seeded journey; a `feature_id` that resolves to a real `FeatureKey`
  inherits its error-budget state; an unresolved `feature_id`
  (`golf_round_lifecycle`, `auth_onboarding_join`,
  `coach_intelligence_triage` — none are `FeatureKey`s or
  `FEATURE_AREA_ALIASES` entries) reads `'unknown'` with the reason stated,
  never a fabricated pass; a journey's health is the WORST of its stages,
  demonstrated on a real mixed case (`player_login_hub`); worst-first sort;
  `status: 'collecting'` is preserved distinctly from the computed health
  state.
- `src/lib/admin/slo/__tests__/silence-detection.test.ts` — degraded reads
  every feature `'unknown'`; a null `heartbeatAgeHours` reads
  `'no_heartbeat_signal'`; an age inside/past the tier threshold reads
  `'healthy_quiet'`/`'stale'`; `qualifiers`' own 7-day override is used, not
  the med-tier 72h default; a `seasonalEmpty` feature past its threshold
  still reads `'healthy_quiet'` (exercised via a mocked registry entry,
  since the one live `seasonalEmpty` feature has no heartbeat table and can
  never reach this branch with real data); `crm_recruiting_pipeline`
  excluded.
- `src/lib/admin/slo/__tests__/trace-funnels.test.ts` — `buildFunnel()` pure
  logic: empty-set is a real zero not an error, status tallying, missing-
  required-step counting kept separate from status, dropoffs ranked
  worst-first and capped at 5, `hitCeiling` exact-boundary behavior.
- Also covered under `admin_reliability_collector`'s own test ledger:
  `error-budget.test.ts`, the invariant runner suite, and the extended
  `invariant-lattice.test.ts` — this feature CONSUMES those, it does not
  re-test them.
- `scripts/knowledge/__tests__/check-invariants.test.mjs`,
  `scripts/knowledge/__tests__/check-event-contracts.test.mjs` — the two new
  registry checkers' own pure-logic fixtures (`node:test`, no real
  git/filesystem), mirroring `check-journeys.test.mjs`'s pattern.
