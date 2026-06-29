# Current Repo Status

Last updated: 2026-06-29

## Hard Gates

| Gate | Status | Notes |
|---|---|---|
| TypeScript | Green locally | `npm run typecheck` passed. |
| ESLint | Green locally | `npm run lint` passed under the repo warning ceiling. |
| Lint Ratchet | Green locally | Baseline locked at 2132 warnings after net cleanup. |
| Unit Tests | Green locally | `npm run test:run` passed: 3434 passed, 39 skipped. |
| Build | Green locally | `npm run build` passed with the 8GB heap setting. |
| Workflow lint | Green locally | `actionlint .github/workflows/*.yml` passed. |
| Repo Health | Green locally | `npm run repo:health` passed, including root docs, generated artifact, and tracked-ignored-file checks. |
| Playwright Smoke | Listed locally | Four smoke tests are discoverable. Full execution depends on browser/server env. |

## Known Follow-Ups

- [#349](https://github.com/njrini99-code/helmv3/issues/349): Fix Supabase local stack startup before RLS tests run.
- [#350](https://github.com/njrini99-code/helmv3/issues/350): Apply branch protection to the new required check names.
- [#351](https://github.com/njrini99-code/helmv3/issues/351): Stabilize the full Playwright suite before making it a hard gate.
- [#352](https://github.com/njrini99-code/helmv3/issues/352): Continue design-system primitive migration for dense legacy raw-button surfaces.
- [#353](https://github.com/njrini99-code/helmv3/issues/353): Keep `.helm/` as legacy tool output unless old tools are migrated.
- [#354](https://github.com/njrini99-code/helmv3/issues/354): Harden cleanup secret-scan reports so raw secret-like values are never written.
- [#355](https://github.com/njrini99-code/helmv3/issues/355): Decide whether to untrack the generated Capacitor iOS public bundle after native build verification.
