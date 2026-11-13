# 2026-11-12 — rounds

## 2026-11-12 — Shot entry: "Recovery / layup" replaces "Blocked or punch out"

```text
Design package: none (owner request, preview walk: Pebble Beach, hole 1)
PR/commit:      agent/recovery-layup-shot (local)
Contract IDs:   CH-11961 (unchanged)
Actions:        none
Data impact:    none (same golf_shots.lie_after_recovery = true)
Held items:     20261023170000 (database strokes gained reads the tag)
```

### Changed

- After a tee shot into the rough or an 'other' lie, "Next shot from
  there?" offers Clear shot and Recovery / layup. Fairway's shot entry asks
  the same, from one shared list.
- The line under the question says "Recovery / layup only if you couldn’t
  go at the green", so a strategic layup from a clean lie stays a clear
  shot. The receipt reads "Saved: a recovery or layup".
- Recovery / layup saves the same `true` the old label did, and strokes
  gained prices it the same way: the next shot starts on Broadie's recovery
  curve. Rounds saved before the rename read unchanged.

### Follow-up

- A layup tagged this way can be picked as the hole's approach (shot 2,
  180 to 60 yards from the rough), which shows as a 60-yard approach
  proximity. The fix needs the database cache's approach figures to change
  with it.
