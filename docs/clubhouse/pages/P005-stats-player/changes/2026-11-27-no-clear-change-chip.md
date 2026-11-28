# P005 — Changelog

## 2026-11-27 — "No clear change" is the chip, the figure follows it

```text
Design package: none; Nick's ask (27 Nov 2026), carried from the team Scoring average card (P004)
PR/commit: branch clubhouse-depth-contrast (local, not pushed)
Contract IDs: none changed
Actions: none changed
Data impact: none
Held items: real device screenshots (this environment can't run a browser)
```

### Changed

- The Scoring feature card and the Scoring detail's hero use the shared
  `ShsChangeChip`: inside its standard error the pill says "No clear change"
  in neutral ink and the signed figure follows in plain text ("−0.9 vs
  previous 10"). A clear change is as before, arrow and tone in the pill.

### Why

- The team card and the player card show the same change the same way. A
  boxed "−0.9" beside "No clear change" read as a result and its denial.

### Verification

- `src/clubhouse/screens/stats/__tests__/shs-change-chip.test.tsx`.
