# CURRENT PRIORITIES

> Worked strictly in order. Do not start P3 while any P0 or P1 is open.
> A priority marked **in progress** with no corresponding commit has STALLED —
> restart it.

## Now
| # | Priority | Item | Owner | State |
|---|---|---|---|---|
| 1 | P0 | Establish product truth (10-worker recon) | opus | 🔄 in progress |

## Blocked on recon
These cannot start until recon lands, because doing them blind would mean
rewriting them once the truth is known:

| Priority | Item | Why it waits |
|---|---|---|
| P0 | Recruiting sunset flag architecture | Must know the ~151 reference sites and whether an existing flag system should be extended |
| P0 | Player↔Athlete identity model | Determines whether Lift Lab integration is wiring or unification |
| P0 | Seed production-safety guard | Must confirm existing `--confirm` guards are sufficient before any seed runs |
| P1 | Implementation team fan-out | Requires strict non-overlapping file ownership, which requires the route/ownership map |
