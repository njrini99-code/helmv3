# Dependency Audit

Generated from first-pass audit outputs on branch cleanup/comprehensive-code-audit. First pass is audit/report only; no product-code cleanup is approved.

## Likely Unused Dependencies

| Package | Evidence | Risk | Proposed Action |
|---|---|---|---|
| `@capacitor/app` | depcheck reported unused | Manual review | Do not remove until grep/runtime verification |
| `@capacitor/ios` | depcheck reported unused | Manual review | Do not remove until grep/runtime verification |
| `@capacitor/local-notifications` | depcheck reported unused | Manual review | Do not remove until grep/runtime verification |
| `@capacitor/network` | depcheck reported unused | Manual review | Do not remove until grep/runtime verification |
| `@capacitor/share` | depcheck reported unused | Manual review | Do not remove until grep/runtime verification |
| `@visx/visx` | depcheck reported unused | Manual review | Do not remove until grep/runtime verification |
| `autoprefixer` | depcheck reported unused | Manual review | Do not remove until grep/runtime verification |
| `date-fns-tz` | depcheck reported unused | Manual review | Do not remove until grep/runtime verification |
| `postcss` | depcheck reported unused | Manual review | Do not remove until grep/runtime verification |

## Manual Review Dependencies

| Package | Why Manual Review |
|---|---|
| `@capacitor/*` | Mobile/iOS runtime risk. |
| `@visx/visx`, `@visx/*` | depcheck shows missing granular visx packages while umbrella package appears unused; chart bundle/dependency plan needed. |
| `autoprefixer`, `postcss` | Build tooling false-positive risk. |
| `date-fns-tz` | Date/time logic risk. |
| `promptfoo` | Evals tooling may be intentionally retained. |

## Likely False Positives

| Package | Why |
|---|---|
| audit dev tools | Installed during Phase 3 and used to produce reports. |
| `playwright`, `sharp`, `glob` missing reports | Used by scripts/tests; may be transitive or intentionally omitted. |
| `fflate` missing reports | Baseball import adapters; DEFERRED_BASEBALLHELM. |

## Do Not Remove Without Explicit Approval

| Package | Reason |
|---|---|
| Next/React/Supabase/auth/security packages | App-critical. |
| Capacitor packages | Mobile-critical. |
| AI/monitoring/email/chart/map packages | Feature and bundle review required first. |
| BaseballHelm-related packages | DEFERRED_BASEBALLHELM. |
