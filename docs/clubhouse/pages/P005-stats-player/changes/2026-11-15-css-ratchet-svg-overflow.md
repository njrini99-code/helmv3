# 2026-11-15 — stats (player)

## 2026-11-15 — Shared stats stylesheet: one team-chart rule (no change here)

```text
Design package: none (tooling; no visible change)
PR/commit:      claude/project-thread-u8yw0k
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Nothing on player stats. `stats-redesign.css` is mapped to this page too; the
  one rule changed, `.ch-shs-mean-key svg`, draws under the team chart only (see
  P004's fragment of the same date).

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
