# 2026-10-31 — Stats (team): pooled SG floor and honest failures

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

- Team SG pool uses the per-player floor; a failed round-cache read is empty,
  never zeros.
- Team phone copy: "Mean of N days" and "No clear change across these round
  days."; bests oldest first.
