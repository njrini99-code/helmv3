# Stats And Analytics test ledger

## 2026-08-25 — completed-round SG recalculation contract

- Status: uncommitted local reliability repair; not deployed.
- Added `supabase/tests/rls/golf_completed_round_sg_recalculation.sql`.
- Guarantee: the protected SG recalculation can persist its derived output for
  a completed round without opening any general completed-history write path.
