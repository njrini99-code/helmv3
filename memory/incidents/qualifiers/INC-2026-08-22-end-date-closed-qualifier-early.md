# INC-2026-08-22 — qualifier closed before its final local day

- Feature: `qualifiers`
- Status: production data repaired; permanent manual-close-only code deployed
  and verified in production (`dpl_Cb4MZWPLPfZ5EDAMJcG3Pgg1zggQ`).
- Risk: R1 — active competition workflow blocked for entered players.
- First seen: 2026-08-22
- Affected workflow: players beginning later rounds of an active multi-round qualifier.

## User impact

An active three-round qualifier was marked `completed` while every entered
player still had one or more rounds remaining. Players could no longer begin
their next qualifier round.

## Root cause and invariant

The former lifecycle reconciler treated `golf_qualifiers.end_date` as an
automatic player lockout. Before the first repair, it also parsed that
date-only value as UTC midnight, closing an Eastern Time qualifier during the
preceding local evening.

A qualifier may automatically transition only from `upcoming` to
`in_progress` when the first player submits a round. Its dates and entrant
progress are schedule/reporting information, never a player lockout; only a
coach can complete it manually.

## Repair

- Restored the affected qualifier to `in_progress` after verifying that all
  entrants had rounds remaining.
- Reopened both affected incomplete qualifiers after verifying entrants still
  had rounds remaining.
- Removed automatic completion from the lifecycle entirely, including the
  page-view lifecycle reconciliation path.
- Added a regression test proving no automatic completion transition exists.
- The 2026-08-23 Shenandoah incident exposed a separate creation-write gap:
  its description declared four or five rounds while the persisted cap was
  one. The live record was corrected to five after validating that intent; the
  permanent repair writes `num_rounds` atomically at creation rather than
  relying on a best-effort second update. The production database now also
  rejects invalid caps and any cap reduction below a recorded round.

## Verification

- Live data after recovery: both affected qualifiers are `in_progress`.
- The permanent lifecycle code has no automatic `completed` write; completion
  remains an authorized coach action.
- `src/lib/golf/__tests__/qualifier-lifecycle.test.ts`
- `src/app/golf/actions/__tests__/create-qualifier-round-count.test.ts`
- `npm run typecheck`
