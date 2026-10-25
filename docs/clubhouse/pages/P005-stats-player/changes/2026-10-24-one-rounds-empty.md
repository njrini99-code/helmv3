# 2026-10-24 — One "No rounds in this window" (Clubhouse A+ S2b)

## 2026-10-24 — Scoring form and score trend use the filtered empty (CH-5302)

```text
Design package: none (Clubhouse A+ follow-up found by S3)
PR/commit:      agent/aplus-s2b
Contract IDs:   CH-5302
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- A window with no rounds says the same thing everywhere it is said: "No
  rounds in this window." with "Try This season to see every round posted
  since August.", as the filtered empty. The desktop Overview's scoring form
  (`PlayerStage`) and the score trend (`RoundTrend`) drew a bare CH-5302 with
  no body and no filtered state, which also showed beside the Rounds tab's
  own while the tabs crossfaded.

### Why

- One state, one look: CH-5302 is the filtered empty (2026-10-23).

### Tests

- `stats-player.test.tsx`: CH-5302 is drawn once on Overview and on Rounds,
  filtered, with its body.
- `stats-visuals-trend.test.tsx`: a score trend with no rounds is the filtered
  CH-5302; strokes gained keeps CH-5309.
