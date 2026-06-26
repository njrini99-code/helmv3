# Helm Codebase Cleanup Master Report

Generated from first-pass audit outputs on branch cleanup/comprehensive-code-audit. First pass is audit/report only; no product-code cleanup is approved.

## Executive Summary

- Total estimated app code: 691,135 LOC.
- Repo LOC excluding configured junk: 1,386,031 LOC; this is inflated by generated bundles, docs, reports, screenshots, and archives.
- Biggest bloat source: local/generated artifacts, especially `.next` at 28G and `ds-bundle` source output.
- Safest cleanup wins: generated artifact policy, raw report gitignore, analyzer command hardening, test-fixture dedupe.
- Highest-risk areas: BaseballHelm, migrations/RLS/service-role code, auth/security, stats calculations, CoachHelm engine outputs.
- BaseballHelm status: 1348 matching files/findings deferred; do not touch.
- Database-adjacent risk: Supabase CLI checks could not run locally; service-role and RLS surfaces need explicit review.
- Bundle risk: normal build passes, but `npm run analyze` OOMs.
- Architecture risk: madge found 15 circular dependency groups.

## Key Metrics

| Metric | Value |
|---|---|
| App LOC | 691,135 |
| Repo LOC excluding junk | 1,386,031 |
| Largest file | `supabase/migrations/20260527000000_prod_public_baseline.sql` by source lines |
| Largest folder | `.next` at 28G |
| Duplicate percentage | 3.03% standard; 3.61% strict |
| Knip issue entries | 634 |
| Knip files | 49 |
| Depcheck unused dependencies | 9 runtime, 12 dev |
| Circular dependency count | 15 |
| Bundle bloat concern | Analyze build OOM |
| BaseballHelm deferred findings | 1348 file matches plus explicit deferred tool findings |

## Cleanup Categories

### Safe Cleanup Candidates

These are low-risk but still need approval.

| Rank | Item | Type | Expected Benefit | Risk |
|---|---|---|---|---|
| 1 | Add safe cleanup/secret-scan report gitignore policy | GENERATED_ARTIFACT / SECURITY_REVIEW | Prevent raw secret or huge reports entering git | Low |
| 2 | Remove or ignore generated `.next`, Playwright reports/captures, screenshots where tracked | GENERATED_ARTIFACT | Major local/repo bloat reduction | Low to medium |
| 3 | Fix `npm run analyze` memory/config | BUNDLE_REVIEW | Enables real bundle sizing | Low |
| 4 | Dedupe lint-rule test harness helpers | SAFE_CANDIDATE | Reduces repeated test code | Low |
| 5 | Add dependency-cruiser config or run with `--no-config` | ARCHITECTURE_REVIEW | Makes architecture audit reproducible | Low |

### Manual Review Required

| Rank | Item | Reason |
|---|---|---|
| 1 | depcheck dependency removals | Static scan has false positives for mobile, build, chart, map, and dynamic imports. |
| 2 | CoachHelm cron/API dedupe | Product correctness and scheduled behavior risk. |
| 3 | Fairway barrel exports | Public UI API risk. |
| 4 | `helm-website-ui`, `.helmdev`, `.agents`, `.claude` | Ownership/tooling intent unclear. |

### High Risk / Do Not Touch

| Item | Reason |
|---|---|
| BaseballHelm | Frozen by playbook. |
| migrations/RLS/service-role code | Database security boundary. |
| auth/account/security files | Security boundary. |
| stats calculations | User-facing correctness. |
| CoachHelm engine/scoring | Product correctness. |

### Deferred BaseballHelm Findings

See `DEFERRED_BASEBALLHELM_FINDINGS.md`.

## Recommended PR Plan

### PR 1: Reports and cleanup tooling only

No source changes. Include this audit report set and decide whether audit tooling belongs in package metadata.

### PR 2: Generated artifact policy

Gitignore/report hygiene for `.cleanup`, raw secret scans, browser captures, local screenshots, and generated bundles.

### PR 3: Analyzer and audit command hardening

Fix `npm run analyze` OOM path, dependency-cruiser invocation, and safe secret scan exclusions.

### PR 4: Confirmed non-Baseball generated artifact cleanup

Small, owner-approved deletion batch only.

### PR 5: Test tooling dedupe

Dedupe repeated non-product lint-rule test helpers.

## Validation Plan

Every cleanup PR must run:

```bash
npm run typecheck
npm run lint
npm run build
npm run test
```

If relevant:

```bash
npm run test:e2e
npm run test:coverage
```

## Rollback Plan

Every cleanup PR should be small enough to revert safely. No large mixed cleanup PRs.
