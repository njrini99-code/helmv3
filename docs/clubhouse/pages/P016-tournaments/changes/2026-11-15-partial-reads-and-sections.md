# P016 Tournaments — 2026-11-15

## 2026-11-15 — Partial reads said in place, contained sections

```text
Design package: none (Nov 15 gap pass, GAP-PASS-FINDINGS.md, GAP-S-08, GAP-S-10,
GAP-S-15, GAP-S-24)
PR/commit:      claude/project-thread-pryzf0
Contract IDs:   160690 (CH-16294), 160691 (CH-16295); CH-16304 row updated
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- History: when the roster or season profiles don't load, it says "Player
  names didn’t load" with Try again above the trend (CH-16295, GAP-S-08); the
  results below are unaffected.
- The route loading draws the view the address names (CH-16401, GAP-S-15).
- The live round (team line, lineup, individuals, field), the lineup builder
  (playing, alternate and individuals, roster) and History (trend, every event)
  are contained sections (CH-16294, GAP-S-10).
- An event that isn't here says the one not-found line, "This event isn’t
  here", with Back to Tournaments (CH-16304, GAP-S-24).

### Why

- GAP-S-08: names silently fell back and nothing said why.
- GAP-S-10: one crash blanked the page.

### Verification

- `tournaments-history.test.tsx` (CH-16295),
  `tournaments-live-section-boundaries.test.tsx`
  (CH-16294), `tournaments-wired.test.tsx` (CH-16304), the per-view
  `loading.tsx` files (CH-16401).
