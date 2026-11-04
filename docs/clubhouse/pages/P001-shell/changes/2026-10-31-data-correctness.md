# 2026-10-31 — Shell: next event, discard and reasons

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

- Next event keeps today's all-day event (stored at UTC midnight) and reads its
  date unzoned.
- Discard from the Dock: a refusal refreshes the page and shows the server's
  reason; offline says so.
- A round discarded on any device is not offered back by the recovery scan.
