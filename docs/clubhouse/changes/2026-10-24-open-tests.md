# 2026-10-24 — Open tests: Reduce Motion fades (CH-1608) and the filtered empties

## 2026-10-24 — CH-1608 gets its own test and the decision-2 wording; the filtered empties are pinned

```text
Design package: none (Clubhouse A+ Round 1, S3 item 5)
PR/commit:      agent/aplus-s3
Contract IDs:   CH-1608, CH-5302, CH-11303, CH-09302, CH-13331
Actions:        none
Data impact:    none
Held items:     a second, unfiltered CH-5302 on the desktop Rounds tab (PlayerStage.tsx:26 or RoundTrend.tsx:52, S2's files)
```

### Changed

- lib/__tests__/reduced-motion.test.tsx (new), CH-1608:
  - `useChMotionMode` and `useChReducedMotion` across the OS setting and
    Animations: full with neither, a fade under Reduce Motion, instant with
    Animations off whatever the OS says.
  - `chFade` is the quick beat (180ms) and 0 when off, and matches
    `--ch-dur-vt-fade` and the Reduce Motion page crossfade in shell.css.
  - `chMotionModeNow` reads `<html data-motion="off">` before the media query.
- The CH-1608 catalog row says what decision 2 decided (under Reduce Motion
  pages and sheets fade; Animations off is instant). It points at the new test,
  not at settings.test › CH-8608, which only checks the stored switch.
- The five filtered empties from 2026-10-23 are asserted as filtered
  (`data-ch-state="filtered"`): Rounds search CH-11303, Qualifiers CH-09302,
  What's new CH-13331, and the Stats player window CH-5302 on desktop and phone
  (with its "Try This season…" line). The `empty-honest` test that entry
  cites does not exist.

### Why

- These were the open tests named in Round 1. CH-1608's row said "every
  transition is instant", which decision 2 changed for the OS setting.

### Verification

- reduced-motion.test (3), rounds.test › CH-11303, qualifiers.test › CH-09302,
  whats-new.test › CH-13331, stats-player.test › CH-5302 (desktop and phone).
