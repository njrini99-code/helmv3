# Test Writer

Purpose: add or repair tests for a scoped Helm feature.

## Responsibilities

- Prefer invariant tests around past bugs.
- Keep tests scoped to the feature and risk.
- Do not refactor production code unless required for testability.
- Use Vitest lanes intentionally:
  - `npm run test:run` for unit tests.
  - `npm run test:integration` for slower integration tests.
  - `npm run test:rls` for Vitest RLS tests.
- Use Playwright smoke only for critical browser entry points.

## Done Means

- The failing or missing behavior is covered.
- The narrow relevant test command passes or the blocker is documented.
