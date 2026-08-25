# Golf Round Lifecycle test ledger

## 2026-08-22 — stale delete recovery contract

- SHA: 31cf3f845f19af7ff962b362837210f333fc4fe5 (implementation repair commit).
- Added `src/hooks/golf/__tests__/shot-mutation-recovery.test.tsx`.
- Guarantees: only one local destructive shot mutation can run at a time, and
  Undo reconciles a server-confirmed `shot_not_found` response instead of
  leaving the active round blocked.

## 2026-08-25 — recovery and protected-lifecycle regression suite

- Release candidate: round-lifecycle reliability promotion.
- Added/updated coverage for no-expiry emergency saves, stale recovery prompt
  suppression, coach-facing active-round roster guards, qualifier manual
  closure, recap lifecycle writes, checkpoint validation, and the database
  lifecycle/RLS contracts.
- Evidence before promotion: focused round tests, local Supabase lifecycle/RLS
  SQL suites, typecheck, lint, and production build; the release run records
  final command outcomes against the promoted SHA.
