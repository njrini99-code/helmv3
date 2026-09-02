# Command plan — day shift 2026-08-19

Commander: main session. Three workers, disjoint lanes, zero shared writes.

## Verified state at 13:30 EDT (measured, not recalled)

- `main` = 89c287161, 2 commits AHEAD of origin (unpushed).
- `overnight/remediation-2026-08-18` = 18 commits ahead of main, NOT merged.
- **4 security migrations written, 0 applied** (confirmed: ledger query returned 0).
- Golf invariant: 351 rounds / 24,526 shots / 6,228 holes / 101 reviews / 95 players.

## What V2 left open (everything else is done and committed)

1. The 4 migrations are unapplied — the highest-value blocked item in the program.
2. Wave J2: 82 overlapping RLS policy groups — NOT STARTED.
3. Wave J1: 18 REVIEW + 12 MEDIUM privileged RPCs — never individually read.
4. Wave L1/L2: Playwright workers experiment; duplicate `all` job name.
5. Wave I4/O3: clean-room local rebuild — BLOCKED, no Docker. Stays blocked.
6. The 18-commit branch is not merged; 2 commits unpushed.

## Lanes

| Lane | Worker | Writes to | Must NOT touch |
|---|---|---|---|
| A — apply 3 self-contained migrations | worker-db-apply | production DB only | repo files, main, migration 050000 |
| B — Wave J RLS + privileged RPC audit | worker-db-audit | NOTHING (read-only) | any mutation at all |
| C — Wave L CI honesty | worker-ci | own external worktree | main, production |

Commander retains: main, the branch merge, pushes, CI verdicts, and migration 050000
(it flips `golf_players.user_id` nullable → 59 typed sites; needs its own sequence).

## Prime directive

Golf round/shot/hole data is never deleted. Re-measure the five counts before and
after every database action. **A decrease is an incident: stop and report immediately.**

## Evidence standard

Nine instruments failed in the flattering direction last night. Therefore:
- `file:line` or a SQL result. "I checked" is not evidence.
- Use an instrument that COULD show the opposite result.
- State what you did NOT verify.
