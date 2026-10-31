# 2026-10-31 — Stats (player): steady navigation order

## 2026-10-31 — Data correctness pass

```text
Design package: none (data audit against Guilford, Shenandoah and UNCW, owner
                2026-10-31: "literally everything needs to be checked for
                correctness")
PR/commit:      #2428 (agent/clubhouse-data-truth)
Contract IDs:   none new
Actions:        none new
Data impact:    reads only
Held items:     none
```

### Changed

- Player navigation sorts ties by id, so next and previous never skip or repeat
  a player.
