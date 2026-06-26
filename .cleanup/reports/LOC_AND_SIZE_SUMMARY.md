# LOC and Size Summary

Generated from first-pass audit outputs on branch cleanup/comprehensive-code-audit. First pass is audit/report only; no product-code cleanup is approved.

## Key Numbers

| Metric | Value |
|---|---|
| App LOC | 691,135 code lines across cloc app scan |
| Repo LOC excluding junk | 1,386,031 code/text lines across cloc repo scan |
| Largest source file | `supabase/migrations/20260527000000_prod_public_baseline.sql` at 22,207 total lines |
| Largest folder | `.next` at 28G |
| Largest git object | `.ultracode/baseballhelm/events.ndjson` at ~31.4 MB; DEFERRED_BASEBALLHELM |

## Top Bloat Sources

| Rank | Path | Reason | Cleanup Risk |
|---|---|---|---|
| 1 | `.next` | 28G build output | GENERATED_ARTIFACT |
| 2 | `node_modules` | 2.8G local install output | GENERATED_ARTIFACT |
| 3 | `helm-website-ui` | 490M nested site/tooling area | MANUAL_REVIEW |
| 4 | `ds-bundle` | Large bundled JS/CSS, including 83,326-code-line JS bundle | GENERATED_ARTIFACT / MANUAL_REVIEW |
| 5 | `.playwright-mcp` | 48M screenshots/YAML captures | GENERATED_ARTIFACT |
| 6 | `.ultracode` | Includes large BaseballHelm event log | DEFERRED_BASEBALLHELM |

## Largest Source Files

- 22207 supabase/migrations/20260527000000_prod_public_baseline.sql
- 20300 src/lib/types/database.ts
- 6613 src/app/golf/actions/golf.ts
- 4062 src/app/golf/actions/insights.ts
- 3792 src/app/golf/actions/admin-data.ts
- 3135 supabase/migrations_archive/pre_20260527/20260427210000_canonical_rls_snapshot.sql
- 3035 src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx
- 2775 src/lib/utils/golf-stats-calculator-shots.ts
- 2741 scripts/ui-intelligence/generate-atlas.ts
- 2610 src/components/fairway/pages/coachhelm/FairwayStatsCockpit.tsx
- 2517 src/app/golf/actions/stats-data.ts

## BaseballHelm Size Findings

| Path | Finding |
|---|---|
| `.ultracode/baseballhelm/events.ndjson` | Largest tracked object; BaseballHelm frozen. |
| `scripts/baseballhelm-mega-build.workflow.js` | cloc timed out; defer. |
| `scripts/baseballhelm-verification.workflow.js` | cloc timed out; defer. |

## Immediate Observations

The repo size is inflated heavily by generated/local artifacts and bundled outputs, not just source code. The app code is large, but the first safe cleanup lane is artifact policy and gitignore/report hygiene, not product refactors.
