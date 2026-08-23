# Qualifiers test ledger

## 2026-08-22 — end-date timezone boundary

- `src/lib/golf/__tests__/qualifier-lifecycle.test.ts` proves that an Eastern
  Time qualifier stays open on its final local day after UTC has crossed
  midnight, and closes only after that local day ends.
