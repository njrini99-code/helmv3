# Knip Triage - 2026-07-03

## Rules

- Do not delete source files from the first Knip pass.
- Treat `knip --production` and `knip --exports` as noisy until `knip.json` is tuned.
- Verify static misses against route loading, dynamic imports, tests, native builds, and docs before deleting.

## Tuned Baseline

`knip.json` now treats the two CRM migration scripts as entrypoints, ignores native-only Capacitor packages, and excludes the admin fixture files that are kept for security/test review. After that tuning:

- `npm run knip:files` reports 6 unused-file candidates.
- `npm run knip:deps` reports 5 unlisted dependency findings.
- `postgres` is no longer reported as unused because `scripts/run-crm-migration.mjs` and `scripts/apply-crm-migration.mjs` are now modeled.
- Capacitor native plugins are no longer reported as unused because iOS SPM references them under `ios/App/CapApp-SPM/Package.swift`.
- The admin fixture files are no longer reported as unused-file candidates.

## Unused File Findings

| File | Initial Signal | Risk | Decision | Next Check |
| --- | --- | --- | --- | --- |
| `src/components/baseball/dashboard/dashboard-types.ts` | Knip file finding; docs mention it as the replacement dashboard-card type location. | Medium | Keep pending manual import/path review. | Search for type-only imports after TypeScript path/barrel changes; confirm no generated or route-specific dynamic usage. |
| `src/components/baseball/recruiting-philosophy/MatchScoreBadge.tsx` | Knip file finding; old typecheck baseline and docs already called it unused. | Medium | Candidate for removal after feature-owner check. | Confirm no recruiting philosophy route expects this component and no barrel export hides usage. |
| `src/components/products/golf-mockups/index.tsx` | Knip file finding. | Low | Candidate for removal or archive after confirming product mockups are not route-linked. | Search route imports and docs references. |
| `src/lib/mapbox/client.ts` | Knip file finding. | Low | Candidate for removal if Mapbox is no longer a supported surface. | Confirm no env/config/docs still expect Mapbox. |
| `src/lib/recruiting/match-calculator.ts` | Knip file finding. | Medium | Keep pending recruiting feature review. | Check whether product roadmap or tests expect match scoring to return. |
| `src/lib/types/table.ts` | Knip file finding. | Low | Candidate for removal if no table abstraction imports remain. | Search for exported type names, not just filename. |

Ignored as intentional fixtures:

- `src/lib/admin/__tests__/fixtures/broken-delegation.fixture.ts`
- `src/lib/admin/__tests__/fixtures/unwrapped-actions.fixture.ts`

## Dependency Findings

| Package | Knip Signal | Risk | Decision | Next Check |
| --- | --- | --- | --- | --- |
| `@capacitor/app` | Unused dependency | High | Keep. | Native iOS/Capacitor plugin usage can be invisible to Knip. Check `ios/`, `capacitor.config.ts`, and plugin registration before removal. |
| `@capacitor/ios` | Unused dependency | High | Keep. | Required for the iOS platform even if JS imports are absent. |
| `@capacitor/local-notifications` | Unused dependency | High | Keep pending native/mobile review. | Check mobile notification code paths and iOS plugin use. |
| `@capacitor/network` | Unused dependency | High | Keep pending offline/mobile review. | Check offline and native connectivity plans. |
| `@capacitor/share` | Unused dependency | Medium | Keep pending mobile share-feature review. | Confirm whether share flows are planned or native-only. |
| `postgres` | Unused devDependency | Low | Keep. | `scripts/run-crm-migration.mjs` and `scripts/apply-crm-migration.mjs` import `postgres`. Knip missed local script usage or config coverage. |

These are now modeled in `knip.json` and are no longer active `npm run knip:deps` findings.

## Unlisted Dependency Findings

| Package | Signal | Decision | Next Check |
| --- | --- | --- | --- |
| `postcss-load-config` | Unlisted dependency | Add directly or remove the JSDoc type import. | `postcss.config.mjs` imports its `Config` type in JSDoc. |
| `@radix-ui/react-compose-refs` | Unlisted dependency | Add directly if the custom Fairway tabs primitive remains. | `src/components/fairway/controls/tabs.tsx` imports `useComposedRefs` directly. |
| `fflate` | Unlisted dependency | Add directly if the Baseball import adapters remain. | `src/lib/baseball/adapters/pdf-reader.ts`, `xlsx-reader.ts`, and an import-format test import it directly. |

## Recommended Knip PR

1. Tune `knip.json` for Next route entrypoints, native iOS/Capacitor, local migration scripts, and fixture directories.
2. Re-run `npm run knip`, `npm run knip:files`, and `npm run knip:deps`.
3. Delete only the lowest-risk file candidates after a focused grep and tests.
4. Leave the 695 export findings for scoped feature-owner passes.
