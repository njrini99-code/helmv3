# Stats And Analytics test ledger

## 2026-08-25 — completed-round SG recalculation contract

- Status: uncommitted local reliability repair; not deployed.
- Added the completed-round SG recalculation suite in `supabase/tests/rls/`.
- Guarantee: the protected SG recalculation can persist its derived output for
  a completed round without opening any general completed-history write path.
