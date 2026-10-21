# INC-2026-10-20 — a practice start reused an empty tournament shell and failed with 55000

- Feature: `golf_round_lifecycle`
- Status: FIXED on branch (agent/health-20261021-0009), not yet merged or deployed
- Risk: R2 — a round start failed with "Failed to save round"; no data was
  written or lost (the trigger refused the write)
- Fingerprints: `c449552f` (server, `savePartialRound.updateExisting`, x2),
  `9a6618a3` (client "Round start failed: server_rejected", same second, same
  tee); Sentry JAVASCRIPT-NEXTJS-1CY / -1CZ
- First and last seen: 2026-10-20 21:41Z, one player

## What was wrong

The player had an unfinished tournament round with no hole or shot rows (an
empty shell) at a course for that date, then started a PRACTICE round at the
same course and date from New Round. `savePartialRound`'s no-id branch
matches an in-progress round on player + course + date + qualifier context,
not on `round_type`, and reuses the match when it is an empty shell. The
reuse UPDATE strips `player_id`, `team_id`, `qualifier_id` and
`qualifier_round_number`, but it carried `round_type: 'practice'`. The
lifecycle trigger (`20260830120000_reclassify_owns_its_own_integrity.sql`)
refuses any direct change to an unfinished round's
player/team/round_type/qualifier identity with SQLSTATE 55000, so the start
failed. Production evidence: the round row is `tournament`, its first hole
row was written at 22:08Z (after the failure), and the client sent
`roundType: practice` for the same course and tee.

## Fix

`src/app/golf/actions/round-partial.ts`: the candidate lookup now reads
`round_type`, and a candidate of a different type is never reused. With
`startIntent` (persistRoundStart) the mismatch returns `in_progress_exists`,
so the player gets the existing Resume / Discard / Start a new round prompt;
without it (autosave with a lost id) the save inserts its own round and
leaves the other one alone. Keeping the shell's type instead was rejected: it
would silently turn the player's practice round into a tournament round.

The trigger is unchanged (R3).

Regression test: `src/app/golf/actions/__tests__/golf-partial-round-type-mismatch.test.ts`
(its fake enforces the trigger's round_type rule; 3 of 4 fail on the parent
commit with "Failed to save round", all pass on the fix). Replay:
`replay/manifests/round-start-retypes-empty-shell-2026-10-20.yml`.

## Close

Resolve `c449552f` and `9a6618a3` once the fix has been live 24h with zero
occurrences.
