# Bundle Bloat Report

Generated from first-pass audit outputs on branch cleanup/comprehensive-code-audit. First pass is audit/report only; no product-code cleanup is approved.

## Largest Client Bundles

| Route/Chunk | Size | Suspected Cause |
|---|---|---|
| Not available | Analyze build failed with Node heap OOM | Analyzer could not complete. Normal build passes. |

## Suspicious Client-Side Packages

| Package | Why Suspicious | Recommendation |
|---|---|---|
| Mapbox | Playbook calls out map libraries imported too high; Knip also flags mapbox as unused. | BUNDLE_REVIEW before removal or dynamic import changes. |
| PDF/import tooling | Heavy parsing can leak into client bundles if imported through UI. | Audit import boundaries before changes. |
| Chart libraries / Visx | depcheck reports mixed umbrella/granular package issues. | Confirm usage and dynamic boundaries. |
| Large icon imports | Not quantified because analyzer failed. | Inspect after analyzer memory issue is solved. |

## Easy Wins

| Fix | Expected Impact | Risk |
|---|---|---|
| Make analyzer runnable with higher Node heap or smaller stats output | Enables real bundle report | Low |
| Exclude generated artifacts from analysis/report scans | Faster audit tooling | Low |

## Manual Review

| Item | Reason |
|---|---|
| `npm run analyze` OOM | Need rerun with memory limit or analyzer config before claiming bundle sizes. |
| Any BaseballHelm bundle finding | DEFERRED_BASEBALLHELM. |
