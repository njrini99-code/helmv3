# 2026-10-31 — Qualifiers: team, squad and mixed rounds

## 2026-10-31 — Data correctness pass

```text
Design package: none (data audit against Guilford, Shenandoah and UNCW, owner
                2026-10-31: "literally everything needs to be checked for
                correctness")
PR/commit:      #2428 (agent/clubhouse-data-truth)
Contract IDs:   none new (CH-09909 is in the catalog)
Actions:        none new
Data impact:    reads only
Held items:     none
```

### Changed

- A qualifier round is filed under the qualifier's team, not the player's newest
  membership.
- Confirm squad sends the board's own order and refuses when the standings
  changed; stale top-score rows are cleared.
- The create form cannot submit twice.
- CH-09909 (coach): a round whose cards mix 9 and 18 holes is named on the
  leaderboard (owner, 2026-10-31: a 9-hole round counts as its round).
