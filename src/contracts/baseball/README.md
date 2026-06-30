# `src/contracts/baseball/` — BaseballHelm product-truth contract lane

These are **pinning tests, not aspirational tests**. Each file documents a
business/product-truth invariant the rest of BaseballHelm relies on, and
asserts it against the REAL implementation (a real pure function, a real read
model run against `createFakeSupabase`, or — when the underlying helper is
intentionally private — a static read of the source file). When a contract
test fails after a refactor, it means the product truth changed: either the
refactor is wrong, or this file (and the matrix doc below) needs a deliberate
update — never a silent skip.

No new test infrastructure lives here. Every file reuses one of the two
established BaseballHelm test idioms:

1. `createFakeSupabase` (`src/test/fixtures/fake-supabase.ts`) for read-model
   contracts where seeding tables is natural (stats-center, access scope).
2. The `vi.mock('@/lib/baseball/with-baseball-action', ...)` passthrough +
   chainable-builder pattern (see
   `src/app/baseball/actions/__tests__/imports-registry.test.ts`) for
   action-level contracts (imports).

A third, lighter idiom — `readFileSync` + `toContain`/`toMatch` on the source
file — is used ONLY when the formula/behavior being pinned lives in a
function that is intentionally not exported (e.g. the inline box-score rate
helpers in `src/app/baseball/actions/games.ts`). Prefer importing the real
function whenever it is exported.

## Directory map

| Dir | Pins |
|---|---|
| `stats/` | Batting/pitching rate-math correctness + null-honesty; official-vs-scrimmage separation |
| `source-trust/` | Import commit stamps provenance (source/trust/visibility/match-confidence/tier); lineage + raw-file linkage; required-review hold writes zero rows |
| `coachhelm/` (+ root `coachhelm-product-truth.contract.test.ts`) | Signal promotion gates, minimum-sample honesty, evidence citation |
| `product-trust/` (+ root `product-trust.contract.test.ts`) | Honest empty/failure states never render as a healthy result |
| `access/` | Coach/player/team scope enforcement in read models + player-self mutations |

## Source of truth

The full business-contract matrix — every contract, its implementation
module(s), its pinning test file, and explicit **needs-decision** rows for
known gaps — lives at
[`docs/operations/BASEBALLHELM_BUSINESS_CONTRACT_MATRIX.md`](../../../docs/operations/BASEBALLHELM_BUSINESS_CONTRACT_MATRIX.md).
Read it before adding a new contract file so the matrix stays the index.

## Running

Auto-discovered by the existing Vitest `unit` project (no config change):

```bash
npx vitest run --project unit src/contracts/baseball/
```
