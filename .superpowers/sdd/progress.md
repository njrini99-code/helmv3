# CoachHelm remediation — SDD progress ledger
Plan: docs/superpowers/plans/2026-07-24-coachhelm-remediation.md
Worktree: /Users/ricknini/Downloads/helmv3-wt/e2e-timeout
Branch: plan/coachhelm-remediation
Merge base: 7363daf6a

Pre-flight: fixed 6x `supabase db remote query` -> `supabase db query`.
DECISION: implementers write migrations but DO NOT apply to prod. All prod
applies deferred to one owner approval gate after the final review.

Task 1: WITHDRAWN AND REPLACED. Original specified a prod DELETE of the
  0%-accuracy calibration buckets, justified by "Task 2 would load them".
  FALSE — bootstrapFromDb (confidence-calibrator.ts:218) already filters
  rows by prediction_type, and Task 2 passes 'score_to_par', so the stale
  rows are unreachable. Destructive migration reverted (bac83fd85 ->
  revert). Task 1 is now a regression test pinning that type filter.
  Flagged by the harness security check; premise verified false in source.
