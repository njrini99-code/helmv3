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

## 2026-08-25 — atomic snapshot integrity regression

- Status: uncommitted local reliability repair; not deployed.
- Added the atomic snapshot integrity suite in `supabase/tests/rls/`.
- Guarantees: both atomic RPCs reject an unmatched shot-group/hole pair before
  replacing data; a rejected partial save keeps its durable shot, and a
  rejected submit keeps the round in progress with its durable hole and shot.

## 2026-08-25 — failed submission/checkpoint durability

- Status: uncommitted local reliability repair; not deployed.
- Added regression coverage for a SQL-returned submit RPC failure and a
  fallback hole-upsert failure against an existing in-progress round.
- Guarantees: neither condition issues a destructive delete. A committed
  submit is reconciled by read-back; an uncommitted one remains recoverable,
  and every prior checkpoint remains visible in Continue Round.
