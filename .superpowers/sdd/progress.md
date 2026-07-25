# CoachHelm remediation — SDD progress ledger
Plan: docs/superpowers/plans/2026-07-24-coachhelm-remediation.md
Worktree: /Users/ricknini/Downloads/helmv3-wt/e2e-timeout
Branch: plan/coachhelm-remediation
Merge base: 7363daf6a

Pre-flight: fixed 6x `supabase db remote query` -> `supabase db query`.
DECISION: implementers write migrations but DO NOT apply to prod. All prod
applies deferred to one owner approval gate after the final review.

