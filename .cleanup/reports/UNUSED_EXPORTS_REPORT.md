# Unused Exports Report

Generated from first-pass audit outputs on branch cleanup/comprehensive-code-audit. First pass is audit/report only; no product-code cleanup is approved.

## Safe Candidates

| Export | File | Evidence | Confidence |
|---|---|---|---|
| None approved | N/A | ts-prune output needs route/dynamic-import verification. | N/A |

## Manual Review

| Export | File | Risk |
|---|---|---|
| `pluralize` | `src/lib/utils.ts` | Low utility risk, but verify global references first. |
| `useCalendarEvents` | `src/hooks/useCalendarEvents.ts` | Hook may be used dynamically or intended API. |
| Fairway barrel exports | `src/components/fairway/index.ts` | Public UI API; high false-positive risk. |
| CoachHelm alert toggles | `src/lib/coachhelm/v2/orchestrator.ts` | Engine behavior risk. |

## Likely False Positives

| Export | File | Why |
|---|---|---|
| generated DB exports | `src/lib/types/database.ts` | Generated types are consumed by type-only imports. |
| Next route/page defaults | `src/app/**` | Framework entrypoints are not normal imports. |
| test helpers | `src/test/**` | Test-only or dynamic usage. |

## Deferred BaseballHelm

| Export | File | Reason Deferred |
|---|---|---|
| Any BaseballHelm export | `src/app/baseball`, `src/components/baseball`, `src/lib/baseball` | DEFERRED_BASEBALLHELM. |
