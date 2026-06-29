# Business Contract Issue Drafts

These are ready-to-file follow-up issues created from `docs/operations/BUSINESS_CONTRACT_MATRIX.md`. They are drafts rather than opened issues because the repo has not yet decided whether the advisory Business Contracts lane should auto-create GitHub issues.

## Issue Draft: Decide canonical SG baseline surface

Labels: `area:golfhelm`, `type:product-truth`, `needs-decision`

### Problem

`src/lib/golf/sg-benchmarks.ts` exposes legacy `BenchmarkLevel` metadata for NCAA/scratch/break scales while the runtime `SG_BASELINE_OPTIONS` contract exposes only `pga_tour` and `womens`.

### Decision Needed

Decide whether legacy benchmark metadata is still supported UI/reference metadata, or whether it should be removed/renamed so the runtime baseline contract is unambiguous.

### Risk

Strokes-gained comparisons can become mathematically meaningless if a player/team view mixes incompatible baselines or implies support for a baseline the cache does not use.

### Acceptance Criteria

- The product decision is recorded in `docs/operations/BUSINESS_CONTRACT_MATRIX.md`.
- If legacy metadata remains, comments/tests explain it is not a runtime SG baseline choice.
- If legacy metadata is removed, affected UI/actions/tests are updated in a focused PR.

## Issue Draft: Decide canonical CoachHelm metric alias policy

Labels: `area:coachhelm`, `type:product-truth`, `needs-decision`

### Problem

`src/lib/coachhelm/v3/metrics/registry.ts` has canonical v3 metric IDs and a legacy alias map. The business contracts can verify direction parity for canonical metrics today, but cannot decide whether all generators must emit canonical IDs.

### Decision Needed

Decide whether v2 legacy metric aliases are permanently supported product inputs or a migration bridge that should shrink over time.

### Risk

CoachHelm may learn or explain trends backward if an alias lacks the right lower-is-better/higher-is-better direction.

### Acceptance Criteria

- Alias policy is documented.
- Business contracts either require all emitted metrics to be canonical or verify every allowed alias has direction coverage.
- Any generator emitting an unknown metric fails the advisory lane or records a decision item.

## Issue Draft: Decide advisory issue automation

Labels: `repo-hygiene`, `type:automation`, `needs-decision`

### Problem

The Business Contracts lane is advisory. The mission asks for a radar that reveals issues and creates high-quality follow-up issues, but the repo has not decided whether CI should open GitHub issues automatically.

### Decision Needed

Choose one:

- Keep in-repo issue drafts only.
- Add a manual script that files selected drafts.
- Add CI automation that opens/updates issues with labels and duplicate detection.

### Risk

Without a clear policy, advisory failures may either spam the tracker or never become actionable work.

### Acceptance Criteria

- The chosen policy is recorded in `docs/operations/BUSINESS_CONTRACT_MATRIX.md`.
- If automation is chosen, labels, duplicate keys, and permissions are defined before enabling it in CI.

## Issue Draft: Decide missing-putts aggregate semantics

Labels: `area:golfhelm`, `type:product-truth`, `needs-decision`

### Problem

When a hole row exists with `putts = null`, the shot aggregate preserves scoring null-honesty but currently reports `puttsPerRound` as `0` in at least one no-putt-data fixture. The product contract needs to decide whether that is a valid "zero recorded putts" value or should be `null` to mean "putting data missing."

### Decision Needed

Decide whether missing putting data should remain `null` across per-round aggregates, or whether `0` is acceptable when no putts are recorded.

### Risk

Missing putting data can look like a healthy zero-value stat, which conflicts with the no fake healthy empty-state goal.

### Acceptance Criteria

- The chosen behavior is recorded in `docs/operations/BUSINESS_CONTRACT_MATRIX.md`.
- A business contract is added for `puttsPerRound` once the product rule is settled.
