# Deferred BaseballHelm Findings

These findings were discovered during cleanup analysis but were not fixed because BaseballHelm is frozen.

| Tool | File/Area | Finding | Risk | Suggested Future Review |
|---|---|---|---|---|
| Product map grep | 1348 Baseball-related file matches | All BaseballHelm matches quarantined. | DEFERRED_BASEBALLHELM | Owner reconciliation of old/new BaseballHelm tracks. |
| cloc | `scripts/baseballhelm-mega-build.workflow.js` | cloc timeout. | DEFERRED_BASEBALLHELM | Review script size/structure later. |
| cloc | `scripts/baseballhelm-verification.workflow.js` | cloc timeout. | DEFERRED_BASEBALLHELM | Review script size/structure later. |
| git object scan | `.ultracode/baseballhelm/events.ndjson` | Largest tracked object, repeated versions around 31 MB. | DEFERRED_BASEBALLHELM | Decide whether event logs belong in git. |
| madge | `components/baseball/stat-visuals/*` | Circular dependencies. | DEFERRED_BASEBALLHELM | Fix only after BaseballHelm unfreezes. |
| jscpd | Baseball auth/dashboard/components | Duplicate clusters. | DEFERRED_BASEBALLHELM | Deduplicate only after implementation track is chosen. |
| lint | Baseball files | Many lint warnings in BaseballHelm paths. | DEFERRED_BASEBALLHELM | Do not auto-fix during freeze. |
| depcheck/knip | Baseball import adapters/read-models | Missing/unused findings around Baseball imports and exports. | DEFERRED_BASEBALLHELM | Verify only after freeze lifts. |
