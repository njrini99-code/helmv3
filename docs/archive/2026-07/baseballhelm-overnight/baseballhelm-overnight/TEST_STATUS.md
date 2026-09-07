# TEST STATUS

_Baseline measured 2026-07-29 03:31–03:37 UTC on branch `baseball/overnight-completion`._

## Baseline — the tree is GREEN before this mission touched anything

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | **0 errors** |
| Lint | `npx eslint src` | **clean** |
| Unit tests | `npx vitest run --project unit` | **843 files, 7,964 passed, 13 skipped** |
| Production build | `npm run build` | **succeeds** |

**Why this matters:** the baseline is green. Therefore any failure that appears
later in this run was introduced by this mission and must be fixed, not
explained away or attributed to pre-existing rot.

## Not yet measured

These gates have not been run yet and are therefore **unknown**, not passing:

- `npm run test:integration`
- `npm run test:rls` (Supabase RLS suites)
- `npm run test:e2e` (Playwright)
- Seed verification (`scripts/verify-baseball-demo-coverage.ts`)
- Responsive checks at 375 / 430 / 768 / 1024 / 1280 / 1440

An unmeasured gate is recorded as unknown. It is never recorded as passing.

## Coverage truth

Pending the recon workflow's `tests-ci` reader, which is checking what baseball
and lifting behaviour is *actually* covered versus what merely has a test file
— specifically hunting tests that assert component existence rather than
behaviour, since those give false confidence.
