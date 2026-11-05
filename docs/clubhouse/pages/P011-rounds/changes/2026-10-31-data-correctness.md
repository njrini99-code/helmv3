# 2026-10-31 — Rounds: library, review and recovery

## 2026-10-31 — Data correctness pass

```text
Design package: none (data audit against Guilford, Shenandoah and UNCW, owner
                2026-10-31: "literally everything needs to be checked for
                correctness")
PR/commit:      #2428 (agent/clubhouse-data-truth)
Contract IDs:   none new
Actions:        none new
Data impact:    reads only; golf_round_discards read by the recovery paths
Held items:     none
```

### Changed

- The library's full-round group leaves out uncountable rounds; review putts
  read "—" when none were recorded.
- Recovery never offers a round discarded on any device (golf_round_discards,
  20261031141000).
