# 2026-11-12 — coachhelm

## 2026-11-12 — The Team spot card's bars scale to the card's own figures

```text
Design package: none (owner's preview walk, 11 Nov 2026)
PR/commit:      agent/preview-fixes-ui
Contract IDs:   AC-SPOT-03 reworded below (the full length is the card's largest figure, floored at the design's)
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- On staging, the Approach card drew Ethan −4.4, Owen −4.2, Cole −3.6 and Dylan −2.0 as the
  same full bar: the scale stopped at a loss of 1.30 (the fixture's size) and clamped beyond.
  The full length is now the card's largest loss (and largest gain), team average included,
  never less than the design's 1.30 (0.25). The team-average mark uses the same scale.

### Verification

- `team/__tests__/spot-scale.test.tsx` (new): the floor holds for fixture-sized figures; staging's
  four Approach players draw four different lengths, the worst full. Team suite: 77 passed.
- Dev server, `/clubhouse-preview/coachhelm-team` at 1920: losses unchanged on the fixture;
  the two gains (+0.3, +0.5), which were both clamped full, now differ. No page errors.
