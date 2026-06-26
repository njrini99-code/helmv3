# Knip Classified Findings

Generated from first-pass audit outputs on branch cleanup/comprehensive-code-audit. First pass is audit/report only; no product-code cleanup is approved.

Knip reported 634 issue entries across 49 files. Treat this as a triage input only.

## Safe Delete Candidates

| Type | File/Export/Dependency | Evidence | Confidence |
|---|---|---|---|
| None approved | None | First pass is report-only and Knip needs manual verification for dynamic Next routes/barrels. | N/A |

## Manual Review Required

| Type | File/Export/Dependency | Why Risky |
|---|---|---|
| dependency | `@capacitor/*` packages | May be required by iOS/mobile even if static import scan misses usage. |
| dependency | `mapbox-gl`, `@types/mapbox-gl` | Bundle-risk candidate but maps may be dynamically imported. |
| barrel exports | `src/components/fairway/index.ts` exports | Many exports are public design-system API; false-positive risk. |
| export | `src/lib/coachhelm/v2/orchestrator.ts` alert toggles | Engine behavior risk. |

## Likely False Positives

| Type | File/Export/Dependency | Why Likely False Positive |
|---|---|---|
| generated type exports | `src/lib/types/database.ts` | Generated Supabase type file. |
| default component exports | Fairway settings/CoachHelm page components | Next/dynamic/component-level imports can confuse static analysis. |
| dev tool dependencies | newly installed audit tools | Installed specifically for this audit phase. |

## Deferred BaseballHelm Findings

| Type | File/Export/Dependency | Reason Deferred |
|---|---|---|
| dependencies/exports/files | Any `baseball`, `Baseball`, `BaseballHelm`, or Baseball-adjacent finding | DEFERRED_BASEBALLHELM; frozen by playbook. |
