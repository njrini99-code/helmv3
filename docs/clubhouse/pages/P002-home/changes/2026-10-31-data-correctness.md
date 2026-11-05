# 2026-10-31 — Home: last round and the team line

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

- The player peek's last round is the newest scored round of any length (course,
  day, holes when under 18); a figure the page did not load is not drawn, a
  missing one reads a dash.
- The subline never says "The team is on track" while an active player has no
  18-hole round this season; it names them (two or fewer) or counts them.
- Coach replies-missing keeps today's all-day event while players can still
  reply.
