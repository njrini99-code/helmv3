# 2026-11-15 — stats (team)

## 2026-11-15 — The round-day average key drops a needless overflow: visible (no visible change)

```text
Design package: none (tooling; no visible change)
PR/commit:      claude/project-thread-u8yw0k
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `stats-redesign.css`: `.ch-shs-mean-key svg` no longer sets `overflow: visible`. Its 1-unit dashed line sits at the middle of a 16×2 drawing, so it was never outside it.

### Why

- The Clubhouse CSS ratchet (`npm run clubhouse:css`) failed on `main`'s own
  tree from 13 Nov, which kept the presentation check red before its browser
  gate could run. The ratchet counts `overflow: visible` on SVGs and may only
  fall, so the rule is removed at the source instead of raising the record.

### Verification

- W (Playwright WebKit, iPhone 17 Pro preset, reduced motion, light and dark):
  element screenshots of every `.ch-ball` on `coachhelm-ask`,
  `coachhelm-ask-v2` and the quick chat, and of `.ch-shs-mean-key` on
  `stats`, before and after: 10 of 10 identical to the pixel. The computed
  `overflow` of both SVGs is now `hidden` in the served CSS.
- `npm run clubhouse:css`: 0 findings (EXIT 0).
